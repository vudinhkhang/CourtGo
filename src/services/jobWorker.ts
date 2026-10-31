import crypto from 'node:crypto';
import { DatabaseClient, getDb } from '../db/client.js';
import { paymentGateway } from '../integrations/paymentGateway.js';
import { deliverTransactionalEmail } from '../integrations/emailService.js';
import { expireOverdueHolds } from './courtService.js';
import { formatVnd, getServerNow } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { SessionContext } from './authService.js';
import { AppError } from '../utils/errors.js';

export interface BackgroundJobRecord {
  id: string;
  job_type: 'PROCESS_REFUND' | 'SEND_EMAIL' | 'EXPIRE_HOLDS';
  dedup_key: string;
  payload_json: any;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'DEAD_LETTER';
  attempts: number;
  max_attempts: number;
  next_run_at: string | Date;
  locked_at: string | Date | null;
  locked_by: string | null;
  last_error: string | null;
}

/**
 * Khôi phục các tác vụ nền bị kẹt ở trạng thái RUNNING khi tiến trình dừng đột ngột và khởi động lại.
 */
export async function recoverInterruptedJobs(
  db: DatabaseClient = getDb(),
  forceAllRunning = false
): Promise<number> {
  const now = getServerNow();
  const staleThreshold = new Date(now.getTime() - 60 * 1000).toISOString();

  const res = forceAllRunning
    ? await db.query<{ id: string }>(
        `UPDATE background_jobs
         SET status = 'FAILED_RETRYABLE',
             locked_at = NULL,
             locked_by = NULL,
             next_run_at = $1,
             updated_at = $1
         WHERE status = 'RUNNING'
         RETURNING id`,
        [now.toISOString()]
      )
    : await db.query<{ id: string }>(
        `UPDATE background_jobs
         SET status = 'FAILED_RETRYABLE',
             locked_at = NULL,
             locked_by = NULL,
             next_run_at = $1,
             updated_at = $1
         WHERE status = 'RUNNING' AND locked_at <= $2
         RETURNING id`,
        [now.toISOString(), staleThreshold]
      );

  if (res.rows.length > 0) {
    logger.info('JOBS_RECOVERED', `Đã khôi phục ${res.rows.length} tác vụ nền bị gián đoạn để xử lý tiếp.`);
  }
  return res.rows.length;
}

/**
 * Xử lý một yêu cầu hoàn tiền đơn lẻ bên ngoài giao dịch cơ sở dữ liệu kéo dài:
 * - Bắt buộc đối soát (reconcile) với cổng thanh toán trước nếu đã từng thử trước đó hoặc chưa rõ kết quả.
 * - Chống hoàn tiền trùng lặp tuyệt đối.
 * - Hoàn tiền lỗi không làm đơn có hiệu lực trở lại hoặc chiếm lại sân.
 */
export async function executeRefundJobTask(
  refundId: string,
  db: DatabaseClient = getDb()
): Promise<{
  finalRefundStatus: 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_DEFINITE' | 'UNKNOWN_NEEDS_RECONCILE';
  errorMessage?: string;
}> {
  const now = getServerNow();

  const refundRes = await db.query<{
    id: string;
    booking_id: string;
    payment_attempt_id: string;
    refund_code: string;
    amount_vnd: number;
    reason_note: string;
    status: string;
    attempt_count: number;
    provider_refund_id: string | null;
    merchant_txn_ref: string;
    provider_txn_no: string | null;
    booking_code: string;
    user_id: string;
    contact_email: string;
    contact_name: string;
  }>(
    `SELECT r.id, r.booking_id, r.payment_attempt_id, r.refund_code, r.amount_vnd, r.reason_note,
            r.status, r.attempt_count, r.provider_refund_id,
            pa.merchant_txn_ref, pa.provider_txn_no,
            b.booking_code, b.user_id, b.contact_email, b.contact_name
     FROM refunds r
     JOIN payment_attempts pa ON pa.id = r.payment_attempt_id
     JOIN bookings b ON b.id = r.booking_id
     WHERE r.id = $1 OR (r.payment_attempt_id = $1 AND pa.payment_group_id IS NULL)`,
    [refundId]
  );

  if (refundRes.rows.length === 0) {
    return { finalRefundStatus: 'FAILED_DEFINITE', errorMessage: 'Không tìm thấy bản ghi yêu cầu hoàn tiền.' };
  }

  const rfd = refundRes.rows[0];
  if (rfd.status === 'SUCCEEDED') {
    return { finalRefundStatus: 'SUCCEEDED' };
  }

  // Bước 1: Nếu đã từng gọi cổng thanh toán (attempt_count > 0) hoặc đang ở trạng thái UNKNOWN_NEEDS_RECONCILE,
  // BẮT BUỘC đối soát trước khi gửi lại giao dịch có nguy cơ trùng!
  if (rfd.attempt_count > 0 || rfd.status === 'UNKNOWN_NEEDS_RECONCILE') {
    const rec = await paymentGateway.reconcileRefund({
      merchantTxnRef: rfd.merchant_txn_ref,
      refundCode: rfd.refund_code,
    });

    if (rec.found && rec.status === 'SUCCEEDED') {
      await markRefundSucceededInDb(rfd, rec.providerRefundId, true, db);
      return { finalRefundStatus: 'SUCCEEDED' };
    }

    if (!rec.found && rec.status === 'GATEWAY_UNAVAILABLE') {
      await db.query(
        `UPDATE refunds
         SET status = 'UNKNOWN_NEEDS_RECONCILE',
             last_error_code = 'RECONCILE_UNAVAILABLE',
             last_error_message = $1,
             updated_at = $2
         WHERE id = $3`,
        [rec.errorMessage, now.toISOString(), rfd.id]
      );
      return {
        finalRefundStatus: 'UNKNOWN_NEEDS_RECONCILE',
        errorMessage: rec.errorMessage,
      };
    }
  }

  // Bước 2: Đánh dấu đang xử lý (giao dịch ngắn) trước khi gọi nhà cung cấp bên ngoài
  await db.query(
    `UPDATE refunds SET status = 'PROCESSING', attempt_count = attempt_count + 1, updated_at = $1 WHERE id = $2`,
    [now.toISOString(), rfd.id]
  );
  await db.query(`UPDATE bookings SET refund_status = 'PROCESSING', updated_at = $1 WHERE id = $2`, [
    now.toISOString(),
    rfd.booking_id,
  ]);

  // Bước 3: Gọi cổng thanh toán bên ngoài (KHÔNG nằm trong giao dịch cơ sở dữ liệu)
  const providerOutcome = await paymentGateway.executeRefund({
    merchantTxnRef: rfd.merchant_txn_ref,
    providerTxnNo: rfd.provider_txn_no || rfd.merchant_txn_ref,
    refundCode: rfd.refund_code,
    amountVnd: rfd.amount_vnd,
    reason: rfd.reason_note,
  });

  if (providerOutcome.outcome === 'SUCCEEDED') {
    await markRefundSucceededInDb(rfd, providerOutcome.providerRefundId, false, db);
    return { finalRefundStatus: 'SUCCEEDED' };
  }

  if (providerOutcome.outcome === 'UNKNOWN_NEEDS_RECONCILE') {
    const finishNow = getServerNow();
    await db.query(
      `UPDATE refunds
       SET status = 'UNKNOWN_NEEDS_RECONCILE',
           last_error_code = $1,
           last_error_message = $2,
           updated_at = $3
       WHERE id = $4`,
      [providerOutcome.errorCode, providerOutcome.errorMessage, finishNow.toISOString(), rfd.id]
    );
    await db.query(`UPDATE bookings SET refund_status = 'PROCESSING', updated_at = $1 WHERE id = $2`, [
      finishNow.toISOString(),
      rfd.booking_id,
    ]);
    return {
      finalRefundStatus: 'UNKNOWN_NEEDS_RECONCILE',
      errorMessage: providerOutcome.errorMessage,
    };
  }

  if (providerOutcome.outcome === 'FAILED_RETRYABLE') {
    const finishNow = getServerNow();
    await db.query(
      `UPDATE refunds
       SET status = 'FAILED_RETRYABLE',
           last_error_code = $1,
           last_error_message = $2,
           updated_at = $3
       WHERE id = $4`,
      [providerOutcome.errorCode, providerOutcome.errorMessage, finishNow.toISOString(), rfd.id]
    );
    await db.query(`UPDATE bookings SET refund_status = 'FAILED_RETRYABLE', updated_at = $1 WHERE id = $2`, [
      finishNow.toISOString(),
      rfd.booking_id,
    ]);
    return {
      finalRefundStatus: 'FAILED_RETRYABLE',
      errorMessage: providerOutcome.errorMessage,
    };
  }

  // FAILED_DEFINITE -> chuyển sang cần bộ phận hỗ trợ kiểm tra
  await markRefundNeedsSupportInDb(rfd, providerOutcome.errorCode, providerOutcome.errorMessage, db);
  return {
    finalRefundStatus: 'FAILED_DEFINITE',
    errorMessage: providerOutcome.errorMessage,
  };
}

async function markRefundSucceededInDb(
  rfd: {
    id: string;
    booking_id: string;
    refund_code: string;
    amount_vnd: number;
    booking_code: string;
    user_id: string;
    contact_email: string;
    contact_name: string;
  },
  providerRefundId: string,
  viaReconcile: boolean,
  db: DatabaseClient
): Promise<void> {
  const now = getServerNow();
  await db.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE refunds
       SET status = 'SUCCEEDED',
           provider_refund_id = $1,
           reconciled_at = CASE WHEN $2 THEN $3::timestamptz ELSE reconciled_at END,
           completed_at = $3,
           last_error_code = NULL,
           last_error_message = NULL,
           updated_at = $3
       WHERE id = $4`,
      [providerRefundId, viaReconcile, now.toISOString(), rfd.id]
    );

    await tx.query(
      `UPDATE bookings
       SET refund_status = 'REFUNDED',
           updated_at = $1
       WHERE id = $2`,
      [now.toISOString(), rfd.booking_id]
    );

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, internal_detail, created_at)
       VALUES ($1, $2, 'REFUND_SUCCEEDED', 'PROCESSING', 'REFUNDED', 'SYSTEM', $3, $4, $5)`,
      [
        `evt-${crypto.randomUUID()}`,
        rfd.booking_id,
        `Hoàn tiền thành công ${formatVnd(rfd.amount_vnd)} (Mã hoàn: ${rfd.refund_code}).`,
        JSON.stringify({ providerRefundId, viaReconcile }),
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
       VALUES ($1, $2, $3, 'REFUND_SUCCEEDED', $4, $5, 'QUEUED', $6)`,
      [
        `ntf-${crypto.randomUUID()}`,
        rfd.user_id,
        rfd.booking_id,
        `Đã hoàn tiền ${formatVnd(rfd.amount_vnd)} cho đơn ${rfd.booking_code}`,
        `Khoản hoàn ${formatVnd(rfd.amount_vnd)} của đơn ${rfd.booking_code} đã được cổng thanh toán xác nhận hoàn trả thành công.`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
       VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `job-${crypto.randomUUID()}`,
        `email-refund-done-${rfd.id}`,
        JSON.stringify({
          to: rfd.contact_email,
          subject: `Hoàn tiền thành công — Mã đơn ${rfd.booking_code}`,
          bodyText: `Xin chào ${rfd.contact_name},\n\nKhoản hoàn ${formatVnd(rfd.amount_vnd)} cho đơn ${rfd.booking_code} đã được xử lý hoàn tất.`,
          category: 'REFUND_UPDATE',
          bookingId: rfd.booking_id,
        }),
        now.toISOString(),
      ]
    );
  });
}

async function markRefundNeedsSupportInDb(
  rfd: {
    id: string;
    booking_id: string;
    refund_code: string;
    amount_vnd: number;
    booking_code: string;
    user_id: string;
  },
  errorCode: string,
  errorMessage: string,
  db: DatabaseClient
): Promise<void> {
  const now = getServerNow();
  await db.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE refunds
       SET status = 'FAILED_DEFINITE',
           last_error_code = $1,
           last_error_message = $2,
           updated_at = $3
       WHERE id = $4`,
      [errorCode, errorMessage, now.toISOString(), rfd.id]
    );

    await tx.query(`UPDATE bookings SET refund_status = 'MANUAL_REVIEW', updated_at = $1 WHERE id = $2`, [
      now.toISOString(),
      rfd.booking_id,
    ]);

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, internal_detail, created_at)
       VALUES ($1, $2, 'REFUND_NEEDS_SUPPORT', 'PROCESSING', 'MANUAL_REVIEW', 'SYSTEM', $3, $4, $5)`,
      [
        `evt-${crypto.randomUUID()}`,
        rfd.booking_id,
        'Chưa thể hoàn tiền. Bộ phận hỗ trợ đang kiểm tra.',
        JSON.stringify({ errorCode, errorMessage }),
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
       VALUES ($1, $2, $3, 'REFUND_DELAYED', $4, $5, 'NOT_CONFIGURED', $6)`,
      [
        `ntf-${crypto.randomUUID()}`,
        rfd.user_id,
        rfd.booking_id,
        `Cập nhật hoàn tiền đơn ${rfd.booking_code}`,
        'Chưa thể hoàn tiền. Bộ phận hỗ trợ đang kiểm tra và đối soát giao dịch của bạn.',
        now.toISOString(),
      ]
    );
  });
}

/**
 * Thực thi một chu kỳ quét và chạy các tác vụ nền (hoàn tiền, gửi email, giải phóng giữ chỗ quá hạn).
 */
export async function processPendingBackgroundJobs(
  db: DatabaseClient = getDb(),
  options: { limit?: number; recoverStuck?: boolean } = {}
): Promise<{
  expiredHoldsCount: number;
  processedJobsCount: number;
}> {
  if (options.recoverStuck) {
    await recoverInterruptedJobs(db, true);
  } else {
    await recoverInterruptedJobs(db, false);
  }

  const expiredHoldsCount = await expireOverdueHolds(db);
  const now = getServerNow();
  const limit = options.limit ?? 20;

  const jobsRes = await db.query<BackgroundJobRecord>(
    `SELECT * FROM background_jobs
     WHERE status IN ('PENDING', 'FAILED_RETRYABLE')
       AND next_run_at <= $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [now.toISOString(), limit]
  );

  let processedJobsCount = 0;

  for (const job of jobsRes.rows) {
    const lockRes = await db.query<{ id: string }>(
      `UPDATE background_jobs
       SET status = 'RUNNING',
           locked_at = $1,
           locked_by = 'worker-main',
           updated_at = $1
       WHERE id = $2 AND status IN ('PENDING', 'FAILED_RETRYABLE')
       RETURNING id`,
      [now.toISOString(), job.id]
    );
    if (lockRes.rows.length === 0) continue;

    processedJobsCount += 1;
    const payload = typeof job.payload_json === 'string' ? JSON.parse(job.payload_json) : job.payload_json;

    try {
      if (job.job_type === 'PROCESS_REFUND') {
        const res = await executeRefundJobTask(payload.refundId || payload.paymentAttemptId, db);
        const afterTime = getServerNow();

        if (res.finalRefundStatus === 'SUCCEEDED') {
          await db.query(
            `UPDATE background_jobs
             SET status = 'SUCCEEDED',
                 attempts = attempts + 1,
                 completed_at = $1,
                 locked_at = NULL,
                 locked_by = NULL,
                 last_error = NULL,
                 updated_at = $1
             WHERE id = $2`,
            [afterTime.toISOString(), job.id]
          );
        } else if (
          res.finalRefundStatus === 'FAILED_RETRYABLE' ||
          res.finalRefundStatus === 'UNKNOWN_NEEDS_RECONCILE'
        ) {
          const nextAttempts = job.attempts + 1;
          if (nextAttempts >= job.max_attempts) {
            // Quá số lần thử tối đa -> chuyển sang DEAD_LETTER & báo bộ phận hỗ trợ kiểm tra
            const rfdRes = await db.query<{
              id: string;
              booking_id: string;
              refund_code: string;
              amount_vnd: number;
              booking_code: string;
              user_id: string;
            }>(
              `SELECT r.id, r.booking_id, r.refund_code, r.amount_vnd, b.booking_code, b.user_id
               FROM refunds r JOIN bookings b ON b.id = r.booking_id
               WHERE r.id = $1 OR (r.payment_attempt_id=$1 AND NOT EXISTS(SELECT 1 FROM payment_attempts pa WHERE pa.id=r.payment_attempt_id AND pa.payment_group_id IS NOT NULL))`,
              [payload.refundId || payload.paymentAttemptId]
            );
            if (rfdRes.rows.length > 0) {
              await markRefundNeedsSupportInDb(
                rfdRes.rows[0],
                'MAX_RETRIES_EXCEEDED',
                res.errorMessage || 'Quá số lần thử lại tự động.',
                db
              );
            }
            await db.query(
              `UPDATE background_jobs
               SET status = 'DEAD_LETTER',
                   attempts = $1,
                   locked_at = NULL,
                   locked_by = NULL,
                   last_error = $2,
                   updated_at = $3
               WHERE id = $4`,
              [nextAttempts, res.errorMessage || 'MAX_RETRIES_EXCEEDED', afterTime.toISOString(), job.id]
            );
          } else {
            const backoffMs = Math.min(30000, nextAttempts * 2000);
            const nextRunAt = new Date(afterTime.getTime() + backoffMs);
            await db.query(
              `UPDATE background_jobs
               SET status = 'FAILED_RETRYABLE',
                   attempts = $1,
                   next_run_at = $2,
                   locked_at = NULL,
                   locked_by = NULL,
                   last_error = $3,
                   updated_at = $4
               WHERE id = $5`,
              [
                nextAttempts,
                nextRunAt.toISOString(),
                res.errorMessage || res.finalRefundStatus,
                afterTime.toISOString(),
                job.id,
              ]
            );
          }
        } else {
          // FAILED_DEFINITE
          await db.query(
            `UPDATE background_jobs
             SET status = 'DEAD_LETTER',
                 attempts = attempts + 1,
                 locked_at = NULL,
                 locked_by = NULL,
                 last_error = $1,
                 updated_at = $2
             WHERE id = $3`,
            [res.errorMessage || 'FAILED_DEFINITE', afterTime.toISOString(), job.id]
          );
        }
      } else if (job.job_type === 'SEND_EMAIL') {
        const delivery = await deliverTransactionalEmail({
          to: payload.to,
          subject: payload.subject,
          bodyText: payload.bodyText,
          category: payload.category || 'BOOKING_CONFIRMED',
          dedupKey: job.dedup_key,
        });
        const afterTime = getServerNow();

        if (payload.bookingId) {
          await db.query(
            `UPDATE notifications
             SET email_delivery_status = $1,
                 email_sent_at = CASE WHEN $1 = 'SENT' THEN $2::timestamptz ELSE email_sent_at END
             WHERE booking_id = $3`,
            [delivery.statusLabel, afterTime.toISOString(), payload.bookingId]
          );
        }

        await db.query(
          `UPDATE background_jobs
           SET status = 'SUCCEEDED',
               attempts = attempts + 1,
               completed_at = $1,
               locked_at = NULL,
               locked_by = NULL,
               updated_at = $1
           WHERE id = $2`,
          [afterTime.toISOString(), job.id]
        );
      } else if (job.job_type === 'EXPIRE_HOLDS') {
        await expireOverdueHolds(db);
        const afterTime = getServerNow();
        await db.query(
          `UPDATE background_jobs
           SET status = 'SUCCEEDED',
               attempts = attempts + 1,
               completed_at = $1,
               locked_at = NULL,
               locked_by = NULL,
               updated_at = $1
           WHERE id = $2`,
          [afterTime.toISOString(), job.id]
        );
      }
    } catch (err: any) {
      const afterTime = getServerNow();
      const nextAttempts = job.attempts + 1;
      const errMsg = String(err?.message || err);
      logger.error('BACKGROUND_JOB_ERROR', `Lỗi khi xử lý tác vụ nền ${job.id} (${job.job_type})`, {
        jobId: job.id,
        error: errMsg,
      });

      await db.query(
        `UPDATE background_jobs
         SET status = $1,
             attempts = $2,
             next_run_at = $3,
             locked_at = NULL,
             locked_by = NULL,
             last_error = $4,
             updated_at = $5
         WHERE id = $6`,
        [
          nextAttempts >= job.max_attempts ? 'DEAD_LETTER' : 'FAILED_RETRYABLE',
          nextAttempts,
          new Date(afterTime.getTime() + 5000).toISOString(),
          errMsg,
          afterTime.toISOString(),
          job.id,
        ]
      );
    }
  }

  return { expiredHoldsCount, processedJobsCount };
}

/**
 * Công cụ quản trị đối soát và thử lại tác vụ hoàn tiền an toàn:
 * - Không cho phép tự ý sửa số tiền hay đánh dấu đã hoàn không có căn cứ giao dịch từ cổng thanh toán.
 * - Thực hiện đối soát với cổng thanh toán trước, nếu chưa hoàn thì thực thi lại lệnh hoàn qua cổng.
 */
export async function adminRetryOrReconcileRefund(
  actor: SessionContext,
  refundId: string,
  db: DatabaseClient = getDb()
): Promise<{ status: string; messageVi: string }> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền thực hiện đối soát và thử lại hoàn tiền.',
    });
  }

  const res = await db.query<{
    id: string;
    payment_attempt_id: string;
    refund_code: string;
    status: string;
    amount_vnd: number;
  }>(`SELECT id, payment_attempt_id, refund_code, status, amount_vnd FROM refunds WHERE id = $1`, [refundId]);

  if (res.rows.length === 0) {
    throw new AppError({
      code: 'REFUND_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy bản ghi hoàn tiền cần xử lý.',
    });
  }

  const rfd = res.rows[0];
  if (rfd.status === 'SUCCEEDED') {
    return {
      status: 'SUCCEEDED',
      messageVi: `Khoản hoàn ${rfd.refund_code} đã thành công trước đó, không cần gửi lại.`,
    };
  }

  const now = getServerNow();
  // Khôi phục trạng thái tác vụ nền tương ứng và thực thi đối soát + hoàn tiền
  await db.query(
    `UPDATE background_jobs
     SET status = 'PENDING',
         max_attempts = GREATEST(max_attempts, attempts + 2),
         next_run_at = $1,
         updated_at = $1
     WHERE dedup_key = $2`,
    [now.toISOString(), `refund-${rfd.payment_attempt_id}`]
  );

  const execRes = await executeRefundJobTask(refundId, db);
  if (execRes.finalRefundStatus === 'SUCCEEDED') {
    await db.query(
      `UPDATE background_jobs SET status = 'SUCCEEDED', completed_at = $1, updated_at = $1 WHERE dedup_key = $2`,
      [now.toISOString(), `refund-${rfd.payment_attempt_id}`]
    );
  }

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
    ) VALUES ($1, $2, $3, 'RETRY_RECONCILE_REFUND', 'REFUND', $4, $5, $6, $7)`,
    [
      `aud-${crypto.randomUUID()}`,
      actor.user.id,
      actor.user.role,
      rfd.id,
      `Thực hiện đối soát và thử lại hoàn tiền ${rfd.refund_code} (${formatVnd(rfd.amount_vnd)}) -> Kết quả: ${execRes.finalRefundStatus}`,
      JSON.stringify(execRes),
      now.toISOString(),
    ]
  );

  return {
    status: execRes.finalRefundStatus,
    messageVi:
      execRes.finalRefundStatus === 'SUCCEEDED'
        ? `Đã đối soát và hoàn tiền thành công cho mã ${rfd.refund_code}.`
        : `Kết quả thử lại ${rfd.refund_code}: ${execRes.finalRefundStatus} (${execRes.errorMessage || 'Đang chờ đối soát'}).`,
  };
}
