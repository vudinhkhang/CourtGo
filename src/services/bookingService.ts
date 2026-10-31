import { issueEquipment, reserveBookingEquipment, returnBookingEquipment, quantity } from './inventoryService.js';
import crypto from 'node:crypto';
import { DatabaseClient, DbExecutor, getDb } from '../db/client.js';
import {
  expireOverdueHolds,
  getCenterInfo,
  resolveSlotPriceFromRules,
} from './courtService.js';
import { SessionContext, UserRecord, MemberTier, getMemberDiscountRate } from './authService.js';
import {
  formatSlotRange,
  formatVnd,
  getServerNow,
  isValidDateString,
  vietnamSlotToUtcDate,
} from '../utils/time.js';
import { AppError } from '../utils/errors.js';
import { paymentGateway, WebhookPayloadInput } from '../integrations/paymentGateway.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface BookingRecord {
  ticket_id?: string | null;
  is_ticket_component?: boolean;
  payment_group_code?: string | null;
  id: string;
  booking_code: string;
  idempotency_key: string | null;
  user_id: string;
  court_id: string;
  booking_date: string;
  start_hour: number;
  end_hour: number;
  slot_start_at: string | Date;
  slot_end_at: string | Date;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  notes: string | null;
  quoted_price_vnd: number;
  service_fee_vnd: number;
  discount_amount_vnd?: number;
  coupon_code_snapshot?: string | null;
  member_discount_vnd?: number;
  total_amount_vnd: number;
  pricing_label_snapshot: string;
  court_name_snapshot: string;
  policy_version_snapshot: string;
  cancel_min_hours_snapshot: number;
  refund_rate_pct_snapshot: number;
  booking_status: 'HOLD' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'LATE_PAID_CONFLICT';
  refund_status:
    | 'NONE'
    | 'NOT_APPLICABLE'
    | 'PENDING'
    | 'PROCESSING'
    | 'REFUNDED'
    | 'FAILED_RETRYABLE'
    | 'MANUAL_REVIEW';
  hold_expires_at: string | Date;
  confirmed_at: string | Date | null;
  checked_in_at: string | Date | null;
  checked_in_by: string | null;
  completed_at: string | Date | null;
  completed_by: string | null;
  expired_at: string | Date | null;
  cancelled_at: string | Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  refundable_amount_vnd: number;
  equipment_rented_summary?: string | null;
  equipment_deposit_vnd?: number;
  deposit_refunded?: boolean;
  deposit_refunded_at?: string | Date | null;
  deposit_refunded_by?: string | null;
  counter_note?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface CancellationEvaluation {
  canCancel: boolean;
  reasonVi: string;
  refundAmountVnd: number;
  hoursRemaining: number;
  policySummaryVi: string;
  /** Đơn đã thanh toán nhưng còn dưới mốc hủy trực tuyến: khách phải đến quầy để nhân viên xét hoàn tiền. */
  requiresCounter?: boolean;
}

function generateBookingCode(dateStr: string): string {
  const compactDate = dateStr.replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CG-${compactDate}-${randomSuffix}`;
}

export async function createOrReuseBookingHoldInTx(
  input: {
    user: UserRecord;
    courtId: string;
    bookingDate: string;
    startHour: number;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    idempotencyKey?: string;
  },
  tx: DbExecutor
): Promise<{ booking: BookingRecord; reusedExistingHold: boolean }> {
  const bookingDate = (input.bookingDate || '').trim();
  const startHour = Number(input.startHour);

  if (!isValidDateString(bookingDate) || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new AppError({
      code: 'INVALID_SLOT_PARAMETERS',
      statusCode: 400,
      publicMessage: 'Ngày đặt hoặc khung giờ đã chọn không hợp lệ. Bạn vui lòng chọn lại trên lịch sân.',
    });
  }

  const contactName = (input.contactName || input.user.full_name || '').trim();
  const contactPhone = (input.contactPhone || input.user.phone || '').trim();
  const contactEmail = (input.contactEmail || input.user.email || '').trim();
  const notes = (input.notes || '').trim() || null;
  const cleanIdempotencyKey = (input.idempotencyKey || '').trim() || null;

  if (!contactName || !contactPhone) {
    throw new AppError({
      code: 'MISSING_CONTACT_INFO',
      statusCode: 400,
      publicMessage: 'Vui lòng cung cấp họ tên và số điện thoại người nhận sân.',
    });
  }

  const now = getServerNow();
  const center = await getCenterInfo(tx);

  const courtRes = await tx.query<{
    id: string;
    code: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    open_hour: number;
    close_hour: number;
    base_price_vnd: number;
  }>(`SELECT id, code, name, status, open_hour, close_hour, base_price_vnd FROM courts WHERE id = $1`, [
    input.courtId,
  ]);

  if (courtRes.rows.length === 0) {
    throw new AppError({
      code: 'COURT_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Sân cầu lông bạn chọn không tồn tại.',
    });
  }

  const court = courtRes.rows[0];
  if (court.status !== 'ACTIVE') {
    throw new AppError({
      code: 'COURT_INACTIVE',
      statusCode: 409,
      publicMessage: `${court.name} hiện đang tạm ngưng phục vụ. Bạn chọn sân khác nhé.`,
    });
  }

  if (startHour < court.open_hour || startHour >= court.close_hour) {
    throw new AppError({
      code: 'OUTSIDE_OPENING_HOURS',
      statusCode: 400,
      publicMessage: `Khung giờ ${formatSlotRange(startHour)} nằm ngoài giờ hoạt động của sân (${court.open_hour}:00 – ${court.close_hour}:00).`,
    });
  }

  const slotStartUtc = vietnamSlotToUtcDate(bookingDate, startHour);
  const slotEndUtc = vietnamSlotToUtcDate(bookingDate, startHour + 1);

  if (slotStartUtc.getTime() <= now.getTime()) {
    throw new AppError({
      code: 'SLOT_IN_PAST',
      statusCode: 409,
      publicMessage: 'Khung giờ này đã qua thời điểm bắt đầu. Bạn vui lòng chọn khung giờ tiếp theo nhé.',
    });
  }

  // Kiểm tra lịch khóa bảo trì hoặc lịch cố định tháng
  const blockRes = await tx.query<{ reason: string; block_type?: string }>(
    `SELECT reason, block_type FROM court_blocks
     WHERE court_id = $1 AND block_date = $2 AND start_hour = $3 AND is_active = TRUE`,
    [court.id, bookingDate, startHour]
  );
  if (blockRes.rows.length > 0) {
    const isFixed = blockRes.rows[0].block_type === 'FIXED_MONTHLY';
    throw new AppError({
      code: isFixed ? 'SLOT_BOOKED_FIXED' : 'SLOT_BLOCKED_MAINTENANCE',
      statusCode: 409,
      publicMessage: isFixed
        ? `Khung giờ này đã được đặt theo lịch cố định tháng. Bạn vui lòng chọn khung giờ khác.`
        : `Khung giờ này đang tạm khóa bảo trì (${blockRes.rows[0].reason}). Bạn chọn giờ khác nhé.`,
    });
  }

  // Kiểm tra nếu idempotency_key đã được tạo trước đó bởi chính người dùng
  if (cleanIdempotencyKey) {
    const idemRes = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE idempotency_key = $1 AND user_id = $2`,
      [cleanIdempotencyKey, input.user.id]
    );
    if (idemRes.rows.length > 0) {
      const existingIdem = idemRes.rows[0];
      if (
        existingIdem.booking_status === 'HOLD' &&
        new Date(existingIdem.hold_expires_at).getTime() > now.getTime()
      ) {
        return { booking: existingIdem, reusedExistingHold: true };
      }
    }
  }

  // Kiểm tra xem khung giờ đã có đơn HOLD hoặc CONFIRMED nào chưa
  const existingSlotRes = await tx.query<BookingRecord>(
    `SELECT * FROM bookings
     WHERE court_id = $1
       AND booking_date = $2
       AND start_hour = $3
       AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
    [court.id, bookingDate, startHour]
  );

  if (existingSlotRes.rows.length > 0) {
    const existing = existingSlotRes.rows[0];
    // Nếu chính khách hàng này đang giữ chỗ khung giờ đó (mở nhiều tab / gửi lại form),
    // trả về nguyên đơn giữ chỗ hiện có và KHÔNG kéo dài hạn giữ chỗ!
    if (
      existing.user_id === input.user.id &&
      existing.booking_status === 'HOLD' &&
      new Date(existing.hold_expires_at).getTime() > now.getTime()
    ) {
      return { booking: existing, reusedExistingHold: true };
    }

    throw new AppError({
      code: 'SLOT_UNAVAILABLE',
      statusCode: 409,
      publicMessage: 'Khung giờ này vừa có người đặt. Bạn chọn giờ khác nhé.',
    });
  }

  // Giới hạn số lượt giữ chỗ đang hoạt động trên một tài khoản
  const activeHoldsCountRes = await tx.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM bookings
     WHERE user_id = $1
       AND booking_status = 'HOLD'
       AND hold_expires_at > $2`,
    [input.user.id, now.toISOString()]
  );
  const activeHoldsCount = Number(activeHoldsCountRes.rows[0]?.cnt || '0');
  if (activeHoldsCount >= center.max_active_holds_per_user) {
    throw new AppError({
      code: 'MAX_ACTIVE_HOLDS_EXCEEDED',
      statusCode: 429,
      publicMessage: `Bạn đang giữ tối đa ${center.max_active_holds_per_user} khung giờ chờ thanh toán. Vui lòng hoàn tất hoặc hủy đơn đang giữ trước khi đặt thêm.`,
    });
  }

  // Tính giá chính xác từ bảng quy tắc giá trên máy chủ
  const rulesRes = await tx.query<{
    day_type: 'WEEKDAY' | 'WEEKEND' | 'ALL';
    start_hour: number;
    end_hour: number;
    price_vnd: number;
    label: string;
  }>(
    `SELECT day_type, start_hour, end_hour, price_vnd, label
     FROM pricing_rules
     WHERE court_id = $1 AND is_active = TRUE
     ORDER BY start_hour ASC`,
    [court.id]
  );

  const { priceVnd, pricingLabel } = resolveSlotPriceFromRules(
    rulesRes.rows,
    court.base_price_vnd,
    bookingDate,
    startHour
  );

  const bookingId = `bkg-${crypto.randomUUID()}`;
  let bookingCode = generateBookingCode(bookingDate);
  const codeDup = await tx.query<{ id: string }>(`SELECT id FROM bookings WHERE booking_code = $1`, [bookingCode]);
  if (codeDup.rows.length > 0) {
    bookingCode = `${bookingCode}-${crypto.randomBytes(1).toString('hex').toUpperCase()}`;
  }

  const holdExpiresAt = new Date(now.getTime() + center.hold_duration_seconds * 1000);

  await tx.query(
    `INSERT INTO bookings (
      id, booking_code, idempotency_key, user_id, court_id,
      booking_date, start_hour, end_hour, slot_start_at, slot_end_at,
      contact_name, contact_phone, contact_email, notes,
      quoted_price_vnd, service_fee_vnd, total_amount_vnd,
      pricing_label_snapshot, court_name_snapshot,
      policy_version_snapshot, cancel_min_hours_snapshot, refund_rate_pct_snapshot,
      booking_status, payment_status, refund_status,
      hold_expires_at, refundable_amount_vnd, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, 0, $15,
      $16, $17,
      $18, $19, 100,
      'HOLD', 'UNPAID', 'NONE',
      $20, 0, $21, $21
    )`,
    [
      bookingId,
      bookingCode,
      cleanIdempotencyKey,
      input.user.id,
      court.id,
      bookingDate,
      startHour,
      startHour + 1,
      slotStartUtc.toISOString(),
      slotEndUtc.toISOString(),
      contactName,
      contactPhone,
      contactEmail,
      notes,
      priceVnd,
      pricingLabel,
      court.name,
      center.cancellation_policy_version,
      center.cancellation_min_hours,
      holdExpiresAt.toISOString(),
      now.toISOString(),
    ]
  );

  await tx.query(
    `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
     VALUES ($1, $2, 'HOLD_CREATED', NULL, 'HOLD', $3, 'CUSTOMER', $4, $5)`,
    [
      `evt-${crypto.randomUUID()}`,
      bookingId,
      input.user.id,
      `Tạo giữ chỗ 5 phút cho ${court.name} (${formatSlotRange(startHour)} ngày ${bookingDate}) với giá cam kết ${formatVnd(priceVnd)}.`,
      now.toISOString(),
    ]
  );

  const insertedRes = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
  return { booking: insertedRes.rows[0], reusedExistingHold: false };
}

/**
 * Tạo lượt giữ chỗ (HOLD) hoặc trả về lượt giữ chỗ hiện có của chính người dùng:
 * - Chống đặt trùng bằng giao dịch cơ sở dữ liệu + ràng buộc duy nhất idx_bookings_active_slot.
 * - Không kéo dài thời gian giữ chỗ khi tải lại trang, mở nhiều tab hoặc gửi lại yêu cầu.
 * - Không nhận giá từ trình duyệt; tự tính và lưu snapshot giá + chính sách tại thời điểm tạo.
 */
export async function createOrReuseBookingHold(
  input: {
    user: UserRecord;
    courtId: string;
    bookingDate: string;
    startHour: number;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    idempotencyKey?: string;
  },
  db: DatabaseClient = getDb()
): Promise<{ booking: BookingRecord; reusedExistingHold: boolean }> {
  try {
    return await db.withTransaction(async (tx) => {
      await expireOverdueHolds(tx);
      return await createOrReuseBookingHoldInTx(input, tx);
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    // Bắt lỗi vi phạm ràng buộc duy nhất PostgreSQL (SQLSTATE 23505) khi hai yêu cầu đồng thời chạm mặt
    if (err?.code === '23505' || /unique|duplicate key/i.test(String(err?.message || ''))) {
      throw new AppError({
        code: 'SLOT_UNAVAILABLE',
        statusCode: 409,
        publicMessage: 'Khung giờ này vừa có người đặt. Bạn chọn giờ khác nhé.',
      });
    }
    throw err;
  }
}

/**
 * Tạo giữ chỗ đồng thời nhiều khung giờ / nhiều sân (Combo Batch Booking) trong CÙNG MỘT TRANSACTION.
 * Nếu bất kỳ sân nào trong combo đã bị người khác đặt hoặc vượt giới hạn giữ chỗ, toàn bộ combo sẽ
 * tự động rollback (không để lại đơn giữ chỗ mồ côi).
 */
/**
 * Kiểm tra tính liền kề của các khung giờ đặt gộp (Combo).
 * Điều kiện hợp lệ:
 * 1. Phải cùng một ngày chơi (bookingDate).
 * 2. Các startHour sau khi lọc trùng và sắp xếp tăng dần phải liên tiếp nhau (h[i+1] === h[i] + 1).
 */
export function validateConsecutiveSlots(
  slots: Array<{ courtId: string; bookingDate: string; startHour: number }>
): { valid: boolean; reason?: string } {
  if (!slots || slots.length <= 1) return { valid: true };

  const firstDate = String(slots[0].bookingDate || '').trim();
  for (let i = 1; i < slots.length; i++) {
    const curDate = String(slots[i].bookingDate || '').trim();
    if (curDate !== firstDate) {
      return {
        valid: false,
        reason:
          'Hệ thống chỉ hỗ trợ đặt gộp các khung giờ trong cùng một ngày. Với các ngày chơi khác nhau, bạn vui lòng đặt từng đơn riêng biệt để thuận tiện quét mã QR nhận sân tại quầy.',
      };
    }
  }

  const uniqueHours = Array.from(new Set(slots.map((s) => Number(s.startHour)))).sort((a, b) => a - b);
  for (let i = 0; i < uniqueHours.length - 1; i++) {
    if (uniqueHours[i + 1] !== uniqueHours[i] + 1) {
      return {
        valid: false,
        reason:
          'Để đảm bảo việc quét mã QR và nhận sân tại quầy diễn ra thuận lợi trong 1 lần, hệ thống chỉ hỗ trợ đặt gộp các khung giờ liền kề nhau liên tục (ví dụ: 17:00 – 19:00). Đối với các ca chơi cách quãng (như sáng và tối), bạn vui lòng đặt thành từng đơn riêng biệt nhé.',
      };
    }
  }

  return { valid: true };
}

export async function createBatchBookingHolds(
  input: { user: UserRecord; slots: Array<{courtId:string;bookingDate:string;startHour:number}>; idempotencyKey?:string },
  db: DatabaseClient = getDb()
): Promise<{primaryBooking:BookingRecord;allBookings:BookingRecord[]}> {
  if(input.slots?.length===1) {
    const single=await createOrReuseBookingHold({user:input.user,...input.slots[0],idempotencyKey:input.idempotencyKey},db);
    return {primaryBooking:single.booking,allBookings:[single.booking]};
  }
  const service=await import('./multiTicketService.js');
  const normalized=service.normalizeCartSlots(input.slots);
  // Stable replay key for legacy forms; explicit cart submissions carry their own key.
  const key=input.idempotencyKey || 'legacy-'+crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const result=await service.createCartCheckout(input.user,normalized,key,db);
  return {primaryBooking:result.tickets[0],allBookings:result.tickets};
}

export async function getBookingForViewer(
  bookingCodeOrId: string,
  viewer: UserRecord,
  db: DatabaseClient = getDb()
): Promise<{
  booking: BookingRecord;
  events: Array<{
    id: string;
    event_type: string;
    message_vi: string;
    actor_role: string;
    created_at: string | Date;
  }>;
  paymentAttempts: Array<{
    id: string;
    provider: string;
    merchant_txn_ref: string;
    provider_txn_no: string | null;
    amount_vnd: number;
    status: string;
    paid_at: string | Date | null;
    created_at: string | Date;
  }>;
  refunds: Array<{
    id: string;
    refund_code: string;
    amount_vnd: number;
    status: string;
    reason_note: string;
    completed_at: string | Date | null;
    created_at: string | Date;
  }>;
  cancellationEval: CancellationEvaluation;
}> {
  await expireOverdueHolds(db);

  const res = await db.query<BookingRecord>(
    `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1`,
    [bookingCodeOrId]
  );

  if (res.rows.length === 0) {
    throw new AppError({
      code: 'BOOKING_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy đơn đặt sân theo mã đã yêu cầu.',
    });
  }

  const booking = res.rows[0];
  if(booking.ticket_id) booking.payment_group_code=await (await import('./multiTicketService.js')).groupCodeForBooking(booking.booking_code,db);
  if (viewer.role === 'CUSTOMER' && booking.user_id !== viewer.id) {
    throw new AppError({
      code: 'FORBIDDEN_NOT_OWNER',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền xem hoặc thao tác trên đơn đặt sân của tài khoản khác.',
    });
  }

  const eventsRes = await db.query<{
    id: string;
    event_type: string;
    message_vi: string;
    actor_role: string;
    created_at: string | Date;
  }>(`SELECT id, event_type, message_vi, actor_role, created_at FROM booking_events WHERE booking_id = $1 ORDER BY created_at ASC`, [
    booking.id,
  ]);

  const attemptsRes = await db.query<{
    id: string;
    provider: string;
    merchant_txn_ref: string;
    provider_txn_no: string | null;
    amount_vnd: number;
    status: string;
    paid_at: string | Date | null;
    created_at: string | Date;
  }>(
    `SELECT id, provider, merchant_txn_ref, provider_txn_no, allocated_vnd AS amount_vnd, status, paid_at, created_at
     FROM (SELECT pa.*, CASE WHEN pa.payment_group_id IS NULL THEN pa.amount_vnd ELSE t.paid_amount_vnd END AS allocated_vnd
       FROM payment_attempts pa LEFT JOIN booking_tickets t ON t.payment_group_id=pa.payment_group_id AND t.primary_booking_id=$1
       WHERE (pa.payment_group_id IS NULL AND pa.booking_id=$1) OR t.primary_booking_id=$1) pa ORDER BY created_at DESC`,
    [booking.id]
  );

  const refundsRes = await db.query<{
    id: string;
    refund_code: string;
    amount_vnd: number;
    status: string;
    reason_note: string;
    completed_at: string | Date | null;
    created_at: string | Date;
    destination_bank_name?: string | null;
    destination_account_no?: string | null;
    destination_account_name?: string | null;
    is_manual_refund?: boolean;
    manual_txn_ref?: string | null;
  }>(
    `SELECT id, refund_code, amount_vnd, status, reason_note, completed_at, created_at,
            destination_bank_name, destination_account_no, destination_account_name, is_manual_refund, manual_txn_ref
     FROM refunds WHERE booking_id = $1 ORDER BY created_at DESC`,
    [booking.id]
  );

  const cancellationEval = evaluateBookingCancellation(booking, attemptsRes.rows);

  return {
    booking,
    events: eventsRes.rows,
    paymentAttempts: attemptsRes.rows,
    refunds: refundsRes.rows,
    cancellationEval,
  };
}

export function evaluateBookingCancellation(
  booking: BookingRecord,
  paymentAttempts: Array<{ amount_vnd: number; status: string }>
): CancellationEvaluation {
  const now = getServerNow();
  const slotStartMs = new Date(booking.slot_start_at).getTime();
  const diffMs = slotStartMs - now.getTime();
  const hoursRemaining = Number((diffMs / (3600 * 1000)).toFixed(2));
  const minHours = booking.cancel_min_hours_snapshot ?? 12;
  const policySummaryVi = `Hủy trước tối thiểu ${minHours} giờ so với giờ bắt đầu chơi (bao gồm đúng mốc ${minHours} giờ) được hoàn 100% số tiền đã thanh toán.`;

  if (booking.booking_status === 'CANCELLED') {
    return {
      canCancel: false,
      reasonVi: 'Đơn đặt sân này đã được hủy trước đó.',
      refundAmountVnd: booking.refundable_amount_vnd,
      hoursRemaining,
      policySummaryVi,
    };
  }

  if (booking.booking_status === 'EXPIRED') {
    return {
      canCancel: false,
      reasonVi: 'Đơn đặt sân đã hết thời hạn giữ chỗ 5 phút.',
      refundAmountVnd: booking.refundable_amount_vnd,
      hoursRemaining,
      policySummaryVi,
    };
  }

  if (booking.booking_status === 'CHECKED_IN' || booking.booking_status === 'COMPLETED') {
    return {
      canCancel: false,
      reasonVi: 'Đơn đặt sân đã nhận sân hoặc đã hoàn tất sử dụng nên không thể hủy.',
      refundAmountVnd: 0,
      hoursRemaining,
      policySummaryVi,
    };
  }

  if (booking.booking_status === 'HOLD') {
    if (new Date(booking.hold_expires_at).getTime() <= now.getTime()) {
      return {
        canCancel: false,
        reasonVi: 'Thời gian giữ chỗ đã hết hạn.',
        refundAmountVnd: 0,
        hoursRemaining,
        policySummaryVi,
      };
    }
    return {
      canCancel: true,
      reasonVi: 'Đơn đang giữ chỗ và chưa thanh toán. Bạn có thể hủy ngay để giải phóng sân và không phát sinh hoàn tiền.',
      refundAmountVnd: 0,
      hoursRemaining,
      policySummaryVi,
    };
  }

  // Đơn CONFIRMED
  const minRequiredMs = minHours * 3600 * 1000;
  if (diffMs < minRequiredMs) {
    return {
      canCancel: false,
      reasonVi: `Còn dưới ${minHours} giờ trước giờ chơi nên không hủy trực tuyến được. Vui lòng đến quầy và đưa mã QR cho nhân viên để được xét hoàn tiền.`,
      refundAmountVnd: 0,
      hoursRemaining,
      policySummaryVi,
      requiresCounter: diffMs > 0,
    };
  }

  const verifiedPaid = paymentAttempts.find((a) => a.status === 'SUCCEEDED');
  const refundAmountVnd = verifiedPaid ? verifiedPaid.amount_vnd : booking.total_amount_vnd;

  return {
    canCancel: true,
    reasonVi: `Đơn còn đủ tối thiểu ${minHours} giờ trước giờ chơi. Bạn sẽ được hoàn 100% số tiền đã thanh toán (${formatVnd(refundAmountVnd)}).`,
    refundAmountVnd,
    hoursRemaining,
    policySummaryVi,
  };
}

/**
 * Cập nhật thông tin liên hệ trên trang Checkout (không được thay đổi giá hay kéo dài hạn giữ chỗ).
 */
export async function updateCheckoutContact(
  bookingCode: string,
  user: UserRecord,
  input: { contactName: string; contactPhone: string; contactEmail: string; notes?: string },
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  await expireOverdueHolds(db);
  const res = await db.query<BookingRecord>(`SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE`, [bookingCode]);
  if (res.rows.length === 0) {
    throw new AppError({
      code: 'BOOKING_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy đơn giữ chỗ.',
    });
  }
  const booking = res.rows[0];
  if (booking.user_id !== user.id) {
    throw new AppError({
      code: 'FORBIDDEN_NOT_OWNER',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền chỉnh sửa đơn đặt sân của người khác.',
    });
  }
  if (booking.booking_status !== 'HOLD') {
    throw new AppError({
      code: 'BOOKING_NOT_IN_HOLD',
      statusCode: 409,
      publicMessage: 'Đơn đặt sân không còn ở trạng thái giữ chỗ chờ thanh toán.',
    });
  }

  const contactName = (input.contactName || '').trim();
  const contactPhone = (input.contactPhone || '').trim();
  const contactEmail = (input.contactEmail || '').trim();
  if (contactName.length < 2 || !/^[0-9+\s.-]{9,15}$/.test(contactPhone)) {
    throw new AppError({
      code: 'INVALID_CONTACT_INFO',
      statusCode: 400,
      publicMessage: 'Vui lòng nhập đầy đủ họ tên và số điện thoại hợp lệ (9–15 chữ số).',
    });
  }

  await db.query(
    `UPDATE bookings
     SET contact_name = $1, contact_phone = $2, contact_email = $3, notes = $4, updated_at = $5
     WHERE id = $6`,
    [
      contactName,
      contactPhone,
      contactEmail || user.email,
      (input.notes || '').trim() || null,
      getServerNow().toISOString(),
      booking.id,
    ]
  );

  const updated = await db.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
  return updated.rows[0];
}

/**
 * Máy chủ tạo yêu cầu thanh toán từ giá và đơn đã lưu trong DB:
 * - Không nhận số tiền từ trình duyệt.
 * - Không kéo dài thời gian giữ chỗ khi tải lại trang hoặc tạo lại yêu cầu thanh toán.
 */
export async function initiatePaymentForBooking(
  bookingCode: string,
  user: UserRecord,
  contactOverride?: {
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    addons?: Array<{equipmentId:string;quantity:number}>;
    serviceFeeVnd?: number;
    selectedAddonsSummary?: string;
    couponCode?: string;
    discountAmountVnd?: number;
  },
  db: DatabaseClient = getDb()
): Promise<{
  booking: BookingRecord;
  merchantTxnRef: string;
  checkoutUrl: string;
  amountVnd: number;
}> {
  await expireOverdueHolds(db);
  const now = getServerNow();

  return await db.withTransaction(async (tx) => {
    const res = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE booking_code = $1`, [bookingCode]);
    if (res.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân cần thanh toán.',
      });
    }

    let booking = res.rows[0];
    if (booking.ticket_id) throw new AppError({code:'GROUP_CHECKOUT_REQUIRED',statusCode:409,publicMessage:'Vui lòng thanh toán các vé tại trang nhóm thanh toán.'});
    if (booking.user_id !== user.id) {
      throw new AppError({
        code: 'FORBIDDEN_NOT_OWNER',
        statusCode: 403,
        publicMessage: 'Bạn không có quyền thanh toán đơn của tài khoản khác.',
      });
    }

    if (booking.booking_status === 'CONFIRMED' || booking.payment_status === 'PAID') {
      throw new AppError({
        code: 'ALREADY_PAID',
        statusCode: 409,
        publicMessage: 'Đơn đặt sân này đã được thanh toán và xác nhận thành công.',
      });
    }

    if (booking.booking_status !== 'HOLD' || new Date(booking.hold_expires_at).getTime() <= now.getTime()) {
      throw new AppError({
        code: 'HOLD_EXPIRED',
        statusCode: 409,
        publicMessage: 'Thời gian giữ chỗ 5 phút cho đơn này đã hết hạn. Bạn vui lòng chọn lại khung giờ khác nhé.',
      });
    }

    if (contactOverride?.addons) {
      const reservation = await reserveBookingEquipment(tx,booking.id,contactOverride.addons);
      contactOverride = {...contactOverride, serviceFeeVnd:reservation.fee,selectedAddonsSummary:reservation.summary};
    }
    const couponCode = contactOverride?.couponCode ? contactOverride.couponCode.trim().toUpperCase() : null;
    const discountVnd = Math.max(0, Math.round(contactOverride?.discountAmountVnd || 0));

    const userRowRes = await tx.query<{ member_tier: MemberTier }>(
      `SELECT member_tier FROM users WHERE id = $1`,
      [user.id]
    );
    const activeTier = userRowRes.rows[0]?.member_tier || user.member_tier || 'BRONZE';
    const memberDiscountRate = getMemberDiscountRate(activeTier);
    const memberDiscountVnd = Math.round(booking.quoted_price_vnd * memberDiscountRate);
    const totalDiscountVnd = discountVnd + memberDiscountVnd;

    if (contactOverride?.contactName && contactOverride?.contactPhone) {
      const cName = contactOverride.contactName.trim();
      const cPhone = contactOverride.contactPhone.trim();
      const cEmail = (contactOverride.contactEmail || booking.contact_email).trim();
      let cNotes = (contactOverride.notes ?? booking.notes ?? '').trim() || null;
      if (contactOverride.selectedAddonsSummary && (!cNotes || !cNotes.includes(contactOverride.selectedAddonsSummary))) {
        cNotes = (cNotes ? cNotes + ' | ' : '') + contactOverride.selectedAddonsSummary;
      }
      const sFee = contactOverride.serviceFeeVnd !== undefined && contactOverride.serviceFeeVnd >= 0
        ? Math.round(contactOverride.serviceFeeVnd)
        : booking.service_fee_vnd;
      const tAmount = Math.max(1000, booking.quoted_price_vnd + sFee - totalDiscountVnd);

      await tx.query(
        `UPDATE bookings
         SET contact_name = $1, contact_phone = $2, contact_email = $3, notes = $4,
             service_fee_vnd = $5, discount_amount_vnd = $6, coupon_code_snapshot = $7,
             member_discount_vnd = $8, total_amount_vnd = $9, updated_at = $10
         WHERE id = $11`,
        [cName, cPhone, cEmail, cNotes, sFee, discountVnd, couponCode, memberDiscountVnd, tAmount, now.toISOString(), booking.id]
      );
      booking = {
        ...booking,
        contact_name: cName,
        contact_phone: cPhone,
        contact_email: cEmail,
        notes: cNotes,
        service_fee_vnd: sFee,
        discount_amount_vnd: discountVnd,
        coupon_code_snapshot: couponCode,
        member_discount_vnd: memberDiscountVnd,
        total_amount_vnd: tAmount,
      };
    } else if (
      contactOverride?.serviceFeeVnd !== undefined ||
      totalDiscountVnd > 0 ||
      booking.coupon_code_snapshot ||
      booking.discount_amount_vnd
    ) {
      const sFee = contactOverride?.serviceFeeVnd !== undefined && contactOverride.serviceFeeVnd >= 0
        ? Math.round(contactOverride.serviceFeeVnd)
        : booking.service_fee_vnd;
      const tAmount = Math.max(1000, booking.quoted_price_vnd + sFee - totalDiscountVnd);
      let cNotes = booking.notes || '';
      if (contactOverride?.selectedAddonsSummary && (!cNotes || !cNotes.includes(contactOverride.selectedAddonsSummary))) {
        cNotes = (cNotes ? cNotes + ' | ' : '') + contactOverride.selectedAddonsSummary;
      }
      await tx.query(
        `UPDATE bookings
         SET service_fee_vnd = $1, discount_amount_vnd = $2, coupon_code_snapshot = $3,
             member_discount_vnd = $4, total_amount_vnd = $5, notes = $6, updated_at = $7
         WHERE id = $8`,
        [sFee, discountVnd, couponCode, memberDiscountVnd, tAmount, cNotes.trim() || null, now.toISOString(), booking.id]
      );
      booking = {
        ...booking,
        service_fee_vnd: sFee,
        discount_amount_vnd: discountVnd,
        coupon_code_snapshot: couponCode,
        member_discount_vnd: memberDiscountVnd,
        total_amount_vnd: tAmount,
        notes: cNotes.trim() || null,
      };
    }

    // Nếu là đơn chính của combo nhiều sân -> đồng bộ thông tin liên hệ và thời hạn giữ chỗ cho các đơn phụ
    const companionHoldMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
    if (companionHoldMatch && companionHoldMatch[1]) {
      const companionIds = companionHoldMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
      for (const compId of companionIds) {
        await tx.query(
          `UPDATE bookings
           SET contact_name = $1, contact_phone = $2, contact_email = $3,
               hold_expires_at = $4, updated_at = $5
           WHERE id = $6 AND booking_status = 'HOLD'`,
          [
            booking.contact_name,
            booking.contact_phone,
            booking.contact_email,
            booking.hold_expires_at,
            now.toISOString(),
            compId,
          ]
        );
      }
    }

    // Kiểm tra xem có lần tạo thanh toán đang chờ (CREATED) còn hiệu lực và khớp số tiền không
    const existingAttemptRes = await tx.query<{
      id: string;
      merchant_txn_ref: string;
      checkout_url: string;
      amount_vnd: number;
      status: string;
    }>(
      `SELECT id, merchant_txn_ref, checkout_url, amount_vnd, status
       FROM payment_attempts
       WHERE booking_id = $1 AND status = 'CREATED'
       ORDER BY created_at DESC LIMIT 1`,
      [booking.id]
    );

    if (existingAttemptRes.rows.length > 0 && existingAttemptRes.rows[0].amount_vnd === booking.total_amount_vnd) {
      const existing = existingAttemptRes.rows[0];
      return {
        booking,
        merchantTxnRef: existing.merchant_txn_ref,
        checkoutUrl: existing.checkout_url,
        amountVnd: existing.amount_vnd,
      };
    }

    const attemptId = `pay-${crypto.randomUUID()}`;
    const merchantTxnRef = `TXN-${booking.booking_code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const returnUrl = `${config.appBaseUrl}/thanh-toan/ket-qua?bookingCode=${encodeURIComponent(booking.booking_code)}&txnRef=${encodeURIComponent(merchantTxnRef)}`;

    const holdExpiresDate = new Date(booking.hold_expires_at);
    const gatewayReq = paymentGateway.createPaymentUrl({
      merchantTxnRef,
      bookingCode: booking.booking_code,
      amountVnd: booking.total_amount_vnd,
      currency: 'VND',
      expiresAt: holdExpiresDate,
      returnUrl,
    });

    await tx.query(
      `INSERT INTO payment_attempts (
        id, booking_id, provider, merchant_txn_ref, amount_vnd, currency,
        status, checkout_url, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'VND', 'CREATED', $6, $7, $8, $8)`,
      [
        attemptId,
        booking.id,
        gatewayReq.provider,
        merchantTxnRef,
        booking.total_amount_vnd,
        gatewayReq.checkoutUrl,
        holdExpiresDate.toISOString(),
        now.toISOString(),
      ]
    );

    await tx.query(`UPDATE bookings SET payment_status = 'PENDING', updated_at = $1 WHERE id = $2`, [
      now.toISOString(),
      booking.id,
    ]);

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'PAYMENT_INITIATED', 'UNPAID', 'PENDING', $3, 'CUSTOMER', $4, $5)`,
      [
        `evt-${crypto.randomUUID()}`,
        booking.id,
        user.id,
        `Khởi tạo giao dịch thanh toán ${merchantTxnRef} với số tiền ${formatVnd(booking.total_amount_vnd)}.`,
        now.toISOString(),
      ]
    );

    return {
      booking: { ...booking, payment_status: 'PENDING' },
      merchantTxnRef,
      checkoutUrl: gatewayReq.checkoutUrl,
      amountVnd: booking.total_amount_vnd,
    };
  });
}

/**
 * Xử lý thông báo kết quả thanh toán từ cổng thanh toán (IPN / Webhook):
 * - Xác minh chữ ký HMAC-SHA512, mã giao dịch, số tiền, loại tiền VND và đơn liên quan.
 * - Chống xử lý lặp (idempotent) và xử lý thông báo đến chậm / sai thứ tự.
 * - Nếu tiền về sau khi đơn giữ chỗ đã hết hạn hoặc sân không còn khả dụng:
 *   TUYỆT ĐỐI KHÔNG khôi phục đơn hoặc chiếm chỗ của khách khác;
 *   ghi nhận LATE_PAID_CONFLICT, tự động tạo yêu cầu hoàn tiền 100% và thông báo rõ cho khách.
 */
export async function processPaymentWebhook(
  payload: WebhookPayloadInput,
  db: DatabaseClient = getDb()
): Promise<{
  outcome:
    | 'CONFIRMED'
    | 'LATE_PAID_QUEUED_REFUND'
    | 'PAYMENT_FAILED'
    | 'DUPLICATE_IGNORED'
    | 'OUT_OF_ORDER_IGNORED';
  bookingCode: string;
}> {
  const groupResult = await (await import('./multiTicketService.js')).processGroupWebhook(payload, db);
  if (groupResult) return groupResult;
  if (!paymentGateway.verifyWebhookPayload(payload)) {
    logger.warn('WEBHOOK_INVALID_SIGNATURE', 'Từ chối thông báo thanh toán do chữ ký không hợp lệ', {
      merchantTxnRef: payload.merchantTxnRef,
    });
    throw new AppError({
      code: 'INVALID_WEBHOOK_SIGNATURE',
      statusCode: 400,
      publicMessage: 'Chữ ký xác thực thông báo thanh toán không hợp lệ.',
    });
  }

  if (payload.currency !== 'VND') {
    throw new AppError({
      code: 'INVALID_WEBHOOK_CURRENCY',
      statusCode: 400,
      publicMessage: 'Loại tiền tệ giao dịch không hợp lệ (chỉ chấp nhận VND).',
    });
  }

  const now = getServerNow();

  return await db.withTransaction(async (tx) => {
    const attemptRes = await tx.query<{
      id: string;
      booking_id: string;
      provider: string;
      merchant_txn_ref: string;
      amount_vnd: number;
      status: string;
    }>(`SELECT id, booking_id, provider, merchant_txn_ref, amount_vnd, status FROM payment_attempts WHERE merchant_txn_ref = $1`, [
      payload.merchantTxnRef,
    ]);

    if (attemptRes.rows.length === 0) {
      throw new AppError({
        code: 'PAYMENT_ATTEMPT_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy mã giao dịch thanh toán tương ứng.',
      });
    }

    const attempt = attemptRes.rows[0];
    if (Number(payload.amountVnd) !== attempt.amount_vnd) {
      logger.error('WEBHOOK_AMOUNT_MISMATCH', 'Số tiền thông báo không khớp với số tiền của đơn', {
        merchantTxnRef: payload.merchantTxnRef,
        expected: attempt.amount_vnd,
        received: payload.amountVnd,
      });
      throw new AppError({
        code: 'PAYMENT_AMOUNT_MISMATCH',
        statusCode: 400,
        publicMessage: 'Số tiền giao dịch không khớp với đơn đặt sân.',
      });
    }

    const bookingRes = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [attempt.booking_id]);
    if (bookingRes.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân liên kết với giao dịch.',
      });
    }
    const booking = bookingRes.rows[0];

    const eventKey = `${attempt.provider}:${payload.merchantTxnRef}:${payload.providerTxnNo}:${payload.responseCode}`;
    const existingWebhook = await tx.query<{ processing_outcome: string }>(
      `SELECT processing_outcome FROM provider_webhook_events WHERE event_key = $1`,
      [eventKey]
    );
    if (existingWebhook.rows.length > 0) {
      return {
        outcome: 'DUPLICATE_IGNORED',
        bookingCode: booking.booking_code,
      };
    }

    // Trường hợp thanh toán thành công (responseCode === '00')
    if (payload.responseCode === '00') {
      // Nếu đơn đã PAID hoặc LATE_PAID_CONFLICT trước đó -> chống xử lý lặp
      if (booking.payment_status === 'PAID' || booking.payment_status === 'LATE_PAID_CONFLICT') {
        await tx.query(
          `INSERT INTO provider_webhook_events (id, provider, event_key, merchant_txn_ref, provider_txn_no, signature_valid, payload_json, processing_outcome, processed_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'DUPLICATE_IGNORED', $7)`,
          [
            `wh-${crypto.randomUUID()}`,
            attempt.provider,
            eventKey,
            payload.merchantTxnRef,
            payload.providerTxnNo,
            JSON.stringify(payload),
            now.toISOString(),
          ]
        );
        return { outcome: 'DUPLICATE_IGNORED', bookingCode: booking.booking_code };
      }

      const holdStillValid =
        booking.booking_status === 'HOLD' && new Date(booking.hold_expires_at).getTime() > now.getTime();

      if (holdStillValid) {
        await tx.query(
          `UPDATE payment_attempts
           SET status = 'SUCCEEDED',
               provider_txn_no = $1,
               signature_verified = TRUE,
               paid_at = $2,
               raw_webhook_summary = $3,
               sender_bank_name = COALESCE($4, sender_bank_name),
               sender_bank_code = COALESCE($5, sender_bank_code),
               sender_account_no = COALESCE($6, sender_account_no),
               sender_account_name = COALESCE($7, sender_account_name),
               updated_at = $2
           WHERE id = $8`,
          [
            payload.providerTxnNo,
            now.toISOString(),
            JSON.stringify(payload),
            payload.senderBankName || null,
            payload.senderBankCode || null,
            payload.senderAccountNo || null,
            payload.senderAccountName || null,
            attempt.id,
          ]
        );

        await tx.query(
          `UPDATE bookings
           SET booking_status = 'CONFIRMED',
               payment_status = 'PAID',
               confirmed_at = $1,
               updated_at = $1
           WHERE id = $2`,
          [now.toISOString(), booking.id]
        );

        // Chỉ trừ lượt dùng Coupon (increment used_count) khi đơn đặt sân thực sự thanh toán thành công
        if (booking.coupon_code_snapshot && booking.coupon_code_snapshot.trim() !== '') {
          await tx.query(
            `UPDATE coupons
             SET used_count = used_count + 1, updated_at = $1
             WHERE code = $2`,
            [now.toISOString(), booking.coupon_code_snapshot.trim()]
          );
        }

        await tx.query(
          `UPDATE users
           SET total_spent_vnd = total_spent_vnd + $1,
               member_tier = CASE
                 WHEN total_spent_vnd + $1 >= 3000000 THEN 'GOLD'
                 WHEN total_spent_vnd + $1 >= 1000000 THEN 'SILVER'
                 ELSE member_tier
               END,
               updated_at = $2
           WHERE id = $3`,
          [booking.total_amount_vnd, now.toISOString(), booking.user_id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'PAYMENT_CONFIRMED', 'HOLD', 'CONFIRMED', 'SYSTEM', $3, $4)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            `Đã xác nhận thanh toán ${formatVnd(attempt.amount_vnd)} (Mã GD: ${payload.providerTxnNo}). Đặt sân thành công.`,
            now.toISOString(),
          ]
        );

        await tx.query(
          `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
           VALUES ($1, $2, $3, 'BOOKING_CONFIRMED', $4, $5, 'QUEUED', $6)`,
          [
            `ntf-${crypto.randomUUID()}`,
            booking.user_id,
            booking.id,
            `Đặt sân thành công — Mã đơn ${booking.booking_code}`,
            `Sân ${booking.court_name_snapshot} khung giờ ${formatSlotRange(booking.start_hour)} ngày ${booking.booking_date} đã được xác nhận. Tổng thanh toán: ${formatVnd(attempt.amount_vnd)}.`,
            now.toISOString(),
          ]
        );

        await tx.query(
          `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
           VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)
           ON CONFLICT (dedup_key) DO NOTHING`,
          [
            `job-${crypto.randomUUID()}`,
            `email-confirmed-${booking.id}`,
            JSON.stringify({
              to: booking.contact_email,
              subject: `Xác nhận đặt sân thành công — Mã đơn ${booking.booking_code}`,
              bodyText: `Xin chào ${booking.contact_name},\n\nĐơn đặt sân ${booking.booking_code} (${booking.court_name_snapshot}, ${formatSlotRange(booking.start_hour)} ngày ${booking.booking_date}) đã được thanh toán thành công ${formatVnd(attempt.amount_vnd)}.`,
              category: 'BOOKING_CONFIRMED',
              bookingId: booking.id,
            }),
            now.toISOString(),
          ]
        );

        // Xác nhận và hoàn tất toàn bộ các đơn phụ (companions) trong cùng combo đặt 2 sân trở lên
        const companionMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
        if (companionMatch && companionMatch[1]) {
          const companionIds = companionMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
          for (const compId of companionIds) {
            const compRes = await tx.query<BookingRecord>(
              `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
              [compId]
            );
            if (compRes.rows.length === 0) continue;
            const comp = compRes.rows[0];

            // Cập nhật trạng thái thành CONFIRMED và PAID
            await tx.query(
              `UPDATE bookings
               SET booking_status = 'CONFIRMED',
                   payment_status = 'PAID',
                   confirmed_at = $1,
                   contact_name = $2,
                   contact_phone = $3,
                   contact_email = $4,
                   updated_at = $1
               WHERE id = $5`,
              [now.toISOString(), booking.contact_name, booking.contact_phone, booking.contact_email, comp.id]
            );

            // Ghi nhận sự kiện thanh toán cho đơn phụ
            await tx.query(
              `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, created_at)
               VALUES ($1, $2, 'PAYMENT_CONFIRMED', 'HOLD', 'CONFIRMED', 'SYSTEM', $3, $4)`,
              [
                `evt-${crypto.randomUUID()}`,
                comp.id,
                `Đã xác nhận thanh toán theo combo đơn chính ${booking.booking_code} (Mã GD: ${payload.providerTxnNo}). Đặt sân thành công.`,
                now.toISOString(),
              ]
            );

            // Tạo thông báo cho đơn phụ
            await tx.query(
              `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
               VALUES ($1, $2, $3, 'BOOKING_CONFIRMED', $4, $5, 'QUEUED', $6)`,
              [
                `ntf-${crypto.randomUUID()}`,
                comp.user_id,
                comp.id,
                `Đặt sân thành công — Mã đơn ${comp.booking_code}`,
                `Sân ${comp.court_name_snapshot} khung giờ ${formatSlotRange(comp.start_hour)} ngày ${comp.booking_date} đã được xác nhận (thanh toán cùng combo đơn chính ${booking.booking_code}).`,
                now.toISOString(),
              ]
            );

            // Tạo tác vụ gửi email xác nhận cho đơn phụ
            await tx.query(
              `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
               VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)
               ON CONFLICT (dedup_key) DO NOTHING`,
              [
                `job-${crypto.randomUUID()}`,
                `email-confirmed-${comp.id}`,
                JSON.stringify({
                  to: comp.contact_email || booking.contact_email,
                  subject: `Xác nhận đặt sân thành công — Mã đơn ${comp.booking_code}`,
                  bodyText: `Xin chào ${comp.contact_name || booking.contact_name},\n\nĐơn đặt sân ${comp.booking_code} (${comp.court_name_snapshot}, ${formatSlotRange(comp.start_hour)} ngày ${comp.booking_date}) đã được thanh toán và xác nhận thành công theo combo đơn chính ${booking.booking_code}.`,
                  category: 'BOOKING_CONFIRMED',
                  bookingId: comp.id,
                }),
                now.toISOString(),
              ]
            );
          }
        }

        await tx.query(
          `INSERT INTO provider_webhook_events (id, provider, event_key, merchant_txn_ref, provider_txn_no, signature_valid, payload_json, processing_outcome, processed_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'CONFIRMED', $7)`,
          [
            `wh-${crypto.randomUUID()}`,
            attempt.provider,
            eventKey,
            payload.merchantTxnRef,
            payload.providerTxnNo,
            JSON.stringify(payload),
            now.toISOString(),
          ]
        );

        return { outcome: 'CONFIRMED', bookingCode: booking.booking_code };
      }

      // Tiền thanh toán thành công đến SAU KHI đơn giữ chỗ đã hết hạn hoặc đã hủy!
      // Tuyệt đối KHÔNG khôi phục đơn hay chiếm chỗ của khách khác;
      // Ghi nhận giao dịch và tự động đưa vào quy trình hoàn tiền 100%.
      const nextBookingStatus = booking.booking_status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED';

      await tx.query(
        `UPDATE payment_attempts
         SET status = 'LATE_SUCCEEDED',
             provider_txn_no = $1,
             signature_verified = TRUE,
             paid_at = $2,
             raw_webhook_summary = $3,
             sender_bank_name = COALESCE($4, sender_bank_name),
             sender_bank_code = COALESCE($5, sender_bank_code),
             sender_account_no = COALESCE($6, sender_account_no),
             sender_account_name = COALESCE($7, sender_account_name),
             updated_at = $2
         WHERE id = $8`,
        [
          payload.providerTxnNo,
          now.toISOString(),
          JSON.stringify(payload),
          payload.senderBankName || null,
          payload.senderBankCode || null,
          payload.senderAccountNo || null,
          payload.senderAccountName || null,
          attempt.id,
        ]
      );

      await tx.query(
        `UPDATE bookings
         SET booking_status = $1,
             payment_status = 'LATE_PAID_CONFLICT',
             refund_status = 'PENDING',
             refundable_amount_vnd = $2,
             expired_at = COALESCE(expired_at, $3),
             updated_at = $3
         WHERE id = $4`,
        [nextBookingStatus, attempt.amount_vnd, now.toISOString(), booking.id]
      );

      const refundId = `rfd-${crypto.randomUUID()}`;
      const refundCode = `RF-${booking.booking_code}`;

      await tx.query(
        `INSERT INTO refunds (
          id, booking_id, payment_attempt_id, refund_code, amount_vnd,
          reason_type, reason_note, status, attempt_count,
          destination_bank_name, destination_bank_code, destination_account_no, destination_account_name,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'LATE_PAYMENT_EXPIRED_HOLD', $6, 'PENDING', 0, $7, $8, $9, $10, $11, $11)
        ON CONFLICT (payment_attempt_id, booking_id) DO NOTHING`,
        [
          refundId,
          booking.id,
          attempt.id,
          refundCode,
          attempt.amount_vnd,
          'Khoản thanh toán đến sau khi thời gian giữ chỗ 5 phút đã hết hạn.',
          payload.senderBankName || null,
          payload.senderBankCode || null,
          payload.senderAccountNo || null,
          payload.senderAccountName || null,
          now.toISOString(),
        ]
      );

      await tx.query(
        `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
         VALUES ($1, 'PROCESS_REFUND', $2, $3, 'PENDING', $4, $4, $4)
         ON CONFLICT (dedup_key) DO NOTHING`,
        [
          `job-${crypto.randomUUID()}`,
          `refund-${attempt.id}`,
          JSON.stringify({ bookingId: booking.id, refundId, paymentAttemptId: attempt.id }),
          now.toISOString(),
        ]
      );

      await tx.query(
        `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, created_at)
         VALUES ($1, $2, 'LATE_PAYMENT_REFUND_QUEUED', $3, $4, 'SYSTEM', $5, $6)`,
        [
          `evt-${crypto.randomUUID()}`,
          booking.id,
          booking.booking_status,
          nextBookingStatus,
          `Khoản thanh toán ${formatVnd(attempt.amount_vnd)} đến sau khi hết hạn giữ chỗ. Đơn không được khôi phục để bảo vệ lịch sân; hệ thống đang tự động hoàn trả 100% số tiền.`,
          now.toISOString(),
        ]
      );

      await tx.query(
        `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
         VALUES ($1, $2, $3, 'LATE_PAYMENT_REFUND', $4, $5, 'QUEUED', $6)`,
        [
          `ntf-${crypto.randomUUID()}`,
          booking.user_id,
          booking.id,
          `Thanh toán đến sau khi hết hạn giữ chỗ — Đang hoàn ${formatVnd(attempt.amount_vnd)}`,
          `Chúng tôi nhận được khoản thanh toán ${formatVnd(attempt.amount_vnd)} cho đơn ${booking.booking_code} sau khi thời gian giữ chỗ 5 phút đã kết thúc. Hệ thống đã tự động lập lệnh hoàn lại 100% số tiền này cho bạn.`,
          now.toISOString(),
        ]
      );

      await tx.query(
        `INSERT INTO provider_webhook_events (id, provider, event_key, merchant_txn_ref, provider_txn_no, signature_valid, payload_json, processing_outcome, processed_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'LATE_PAID_QUEUED_REFUND', $7)`,
        [
          `wh-${crypto.randomUUID()}`,
          attempt.provider,
          eventKey,
          payload.merchantTxnRef,
          payload.providerTxnNo,
          JSON.stringify(payload),
          now.toISOString(),
        ]
      );

      return { outcome: 'LATE_PAID_QUEUED_REFUND', bookingCode: booking.booking_code };
    }

    // Trường hợp thanh toán thất bại (responseCode !== '00')
    // Nếu đơn đã được thanh toán thành công từ một giao dịch khác (webhook thất bại đến trễ sai thứ tự), bỏ qua!
    if (
      booking.payment_status === 'PAID' ||
      booking.payment_status === 'LATE_PAID_CONFLICT' ||
      booking.booking_status === 'CONFIRMED'
    ) {
      await tx.query(
        `INSERT INTO provider_webhook_events (id, provider, event_key, merchant_txn_ref, provider_txn_no, signature_valid, payload_json, processing_outcome, processed_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'OUT_OF_ORDER_IGNORED', $7)`,
        [
          `wh-${crypto.randomUUID()}`,
          attempt.provider,
          eventKey,
          payload.merchantTxnRef,
          payload.providerTxnNo,
          JSON.stringify(payload),
          now.toISOString(),
        ]
      );
      return { outcome: 'OUT_OF_ORDER_IGNORED', bookingCode: booking.booking_code };
    }

    await tx.query(
      `UPDATE payment_attempts
       SET status = 'FAILED',
           provider_txn_no = $1,
           signature_verified = TRUE,
           failure_reason = $2,
           raw_webhook_summary = $3,
           updated_at = $4
       WHERE id = $5`,
      [
        payload.providerTxnNo,
        `Mã phản hồi cổng thanh toán: ${payload.responseCode}`,
        JSON.stringify(payload),
        now.toISOString(),
        attempt.id,
      ]
    );

    await tx.query(`UPDATE bookings SET payment_status = 'FAILED', updated_at = $1 WHERE id = $2`, [
      now.toISOString(),
      booking.id,
    ]);

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'PAYMENT_FAILED', 'PENDING', 'FAILED', 'SYSTEM', 'Giao dịch thanh toán không thành công hoặc đã bị hủy tại cổng thanh toán. Bạn có thể chọn thanh toán lại nếu còn thời gian giữ chỗ.', $3)`,
      [`evt-${crypto.randomUUID()}`, booking.id, now.toISOString()]
    );

    await tx.query(
      `INSERT INTO provider_webhook_events (id, provider, event_key, merchant_txn_ref, provider_txn_no, signature_valid, payload_json, processing_outcome, processed_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'PAYMENT_FAILED', $7)`,
      [
        `wh-${crypto.randomUUID()}`,
        attempt.provider,
        eventKey,
        payload.merchantTxnRef,
        payload.providerTxnNo,
        JSON.stringify(payload),
        now.toISOString(),
      ]
    );

    return { outcome: 'PAYMENT_FAILED', bookingCode: booking.booking_code };
  });
}

/**
 * Khách hàng xác nhận hủy đặt sân:
 * - Kiểm tra quyền sở hữu đơn tại máy chủ.
 * - Kiểm tra lại điều kiện mốc 12 giờ ngay tại thời điểm xác nhận.
 * - Tính số tiền hoàn từ giao dịch thanh toán đã xác thực trong DB.
 * - Ghi nhận hủy, giải phóng sân ngay lập tức và tạo tác vụ hoàn tiền bền vững (background_jobs)
 *   mà KHÔNG gọi dịch vụ bên ngoài trong giao dịch cơ sở dữ liệu.
 */
export async function cancelBookingByCustomer(
  bookingCodeOrId: string,
  user: UserRecord,
  reasonInput: string,
  db: DatabaseClient = getDb()
): Promise<{
  booking: BookingRecord;
  refundQueued: boolean;
  refundAmountVnd: number;
}> {
  await expireOverdueHolds(db);
  const now = getServerNow();
  const reason = (reasonInput || 'Khách hàng chủ động hủy lịch đặt').trim();

  return await db.withTransaction(async (tx) => {
    const res = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1 FOR UPDATE`,
      [bookingCodeOrId]
    );
    if (res.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân cần hủy.',
      });
    }

    const booking = res.rows[0];
    if (booking.user_id !== user.id) {
      throw new AppError({
        code: 'FORBIDDEN_NOT_OWNER',
        statusCode: 403,
        publicMessage: 'Bạn không có quyền hủy đơn đặt sân của tài khoản khác.',
      });
    }

    // Nếu đây là đơn phụ trong combo -> chuyển hướng ủy quyền hủy cho đơn chính để hủy toàn bộ combo đồng bộ
    const primaryLinkMatch = booking.notes?.match(/BATCH_PRIMARY:\[(.*?)\]/);
    if (primaryLinkMatch && primaryLinkMatch[1]) {
      return await cancelBookingByCustomer(primaryLinkMatch[1], user, reason, db);
    }

    const attemptsRes = await tx.query<{
      id: string;
      amount_vnd: number;
      status: string;
      sender_bank_code?: string | null;
      sender_bank_name?: string | null;
      sender_account_no?: string | null;
      sender_account_name?: string | null;
    }>(`SELECT id, allocated_vnd AS amount_vnd, status, sender_bank_code, sender_bank_name, sender_account_no, sender_account_name FROM (SELECT pa.*, CASE WHEN pa.payment_group_id IS NULL THEN pa.amount_vnd ELSE t.paid_amount_vnd END AS allocated_vnd
       FROM payment_attempts pa LEFT JOIN booking_tickets t ON t.payment_group_id=pa.payment_group_id AND t.primary_booking_id=$1
       WHERE (pa.payment_group_id IS NULL AND pa.booking_id=$1) OR t.primary_booking_id=$1) pa ORDER BY created_at DESC`, [
      booking.id,
    ]);

    const evalResult = evaluateBookingCancellation(booking, attemptsRes.rows);
    if (!evalResult.canCancel) {
      throw new AppError({
        code: 'CANCELLATION_NOT_ALLOWED',
        statusCode: 409,
        publicMessage: evalResult.reasonVi,
      });
    }

    // Trường hợp 1: Đơn đang giữ chỗ (HOLD) chưa thanh toán
    if (booking.booking_status === 'HOLD') {
      await tx.query(
        `UPDATE bookings
         SET booking_status = 'CANCELLED',
             refund_status = 'NOT_APPLICABLE',
             refundable_amount_vnd = 0,
             cancelled_at = $1,
             cancelled_by = $2,
             cancel_reason = $3,
             updated_at = $1
         WHERE id = $4`,
        [now.toISOString(), user.id, reason, booking.id]
      );

      await tx.query(
        `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
         VALUES ($1, $2, 'BOOKING_CANCELLED_UNPAID', 'HOLD', 'CANCELLED', $3, 'CUSTOMER', $4, $5)`,
        [
          `evt-${crypto.randomUUID()}`,
          booking.id,
          user.id,
          `Khách hàng hủy lượt giữ chỗ chưa thanh toán. Lý do: ${reason}. Không phát sinh hoàn tiền.`,
          now.toISOString(),
        ]
      );

      // Nếu là đơn chính combo -> hủy đồng thời các đơn phụ đang ở trạng thái HOLD
      const companionMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
      if (companionMatch && companionMatch[1]) {
        const companionIds = companionMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
        for (const compId of companionIds) {
          await tx.query(
            `UPDATE bookings
             SET booking_status = 'CANCELLED',
                 refund_status = 'NOT_APPLICABLE',
                 refundable_amount_vnd = 0,
                 cancelled_at = $1,
                 cancelled_by = $2,
                 cancel_reason = $3,
                 updated_at = $1
             WHERE id = $4 AND booking_status = 'HOLD'`,
            [now.toISOString(), user.id, reason, compId]
          );
          await tx.query(
            `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
             VALUES ($1, $2, 'BOOKING_CANCELLED_UNPAID', 'HOLD', 'CANCELLED', $3, 'CUSTOMER', $4, $5)`,
            [
              `evt-${crypto.randomUUID()}`,
              compId,
              user.id,
              `Đơn phụ được hủy tự động theo lượt hủy combo của đơn chính ${booking.booking_code}.`,
              now.toISOString(),
            ]
          );
        }
      }

      const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
      return {
        booking: updated.rows[0],
        refundQueued: false,
        refundAmountVnd: 0,
      };
    }

    // Trường hợp 2: Đơn đã xác nhận (CONFIRMED) và đủ điều kiện hoàn tiền 100% (>= 12 giờ)
    const verifiedPayment = attemptsRes.rows.find((a) => a.status === 'SUCCEEDED');
    if (!verifiedPayment) {
      throw new AppError({
        code: 'VERIFIED_PAYMENT_NOT_FOUND',
        statusCode: 409,
        publicMessage: 'Không tìm thấy giao dịch thanh toán đã xác thực để tính khoản hoàn. Bộ phận hỗ trợ sẽ kiểm tra.',
      });
    }

    const refundAmountVnd = verifiedPayment.amount_vnd;
    const refundId = `rfd-${crypto.randomUUID()}`;
    const refundCode = `RF-${booking.booking_code}`;

    await tx.query(
      `UPDATE bookings
       SET booking_status = 'CANCELLED',
           refund_status = 'PENDING',
           refundable_amount_vnd = $1,
           cancelled_at = $2,
           cancelled_by = $3,
           cancel_reason = $4,
           updated_at = $2
       WHERE id = $5`,
      [refundAmountVnd, now.toISOString(), user.id, reason, booking.id]
    );

    await tx.query(
      `INSERT INTO refunds (
        id, booking_id, payment_attempt_id, refund_code, amount_vnd,
        reason_type, reason_note, status, attempt_count, requested_by,
        destination_bank_code, destination_bank_name, destination_account_no, destination_account_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'CUSTOMER_CANCEL', $6, 'PENDING', 0, $7, $8, $9, $10, $11, $12, $12)`,
      [
        refundId,
        booking.id,
        verifiedPayment.id,
        refundCode,
        refundAmountVnd,
        reason,
        user.id,
        verifiedPayment.sender_bank_code || null,
        verifiedPayment.sender_bank_name || null,
        verifiedPayment.sender_account_no || null,
        verifiedPayment.sender_account_name || null,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
       VALUES ($1, 'PROCESS_REFUND', $2, $3, 'PENDING', $4, $4, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `job-${crypto.randomUUID()}`,
        `refund-${booking.id}-${verifiedPayment.id}`,
        JSON.stringify({ bookingId: booking.id, refundId, paymentAttemptId: verifiedPayment.id }),
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'BOOKING_CANCELLED_REFUND_PENDING', 'CONFIRMED', 'CANCELLED', $3, 'CUSTOMER', $4, $5)`,
      [
        `evt-${crypto.randomUUID()}`,
        booking.id,
        user.id,
        `Đơn đã được hủy hợp lệ (trước giờ chơi ${evalResult.hoursRemaining} giờ). Đã giải phóng sân và đưa khoản hoàn ${formatVnd(refundAmountVnd)} vào hàng đợi xử lý.`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
       VALUES ($1, $2, $3, 'BOOKING_CANCELLED', $4, $5, 'QUEUED', $6)`,
      [
        `ntf-${crypto.randomUUID()}`,
        user.id,
        booking.id,
        `Đơn ${booking.booking_code} đã được hủy — Đang xử lý hoàn ${formatVnd(refundAmountVnd)}`,
        `Đơn đã được hủy. Chúng tôi đang xử lý khoản hoàn ${formatVnd(refundAmountVnd)} về phương thức thanh toán ban đầu của bạn.`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
       VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `job-${crypto.randomUUID()}`,
        `email-cancelled-${booking.id}`,
        JSON.stringify({
          to: booking.contact_email,
          subject: `Xác nhận hủy đặt sân — Mã đơn ${booking.booking_code}`,
          bodyText: `Xin chào ${booking.contact_name},\n\nĐơn ${booking.booking_code} đã được hủy. Chúng tôi đang xử lý khoản hoàn ${formatVnd(refundAmountVnd)}.`,
          category: 'BOOKING_CANCELLED',
          bookingId: booking.id,
        }),
        now.toISOString(),
      ]
    );

    // Nếu là đơn chính combo -> hủy đồng thời các đơn phụ đã xác nhận
    const companionMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
    if (companionMatch && companionMatch[1]) {
      const companionIds = companionMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
      for (const compId of companionIds) {
        await tx.query(
          `UPDATE bookings
           SET booking_status = 'CANCELLED',
               refund_status = 'NOT_APPLICABLE',
               refundable_amount_vnd = 0,
               cancelled_at = $1,
               cancelled_by = $2,
               cancel_reason = $3,
               updated_at = $1
           WHERE id = $4 AND booking_status IN ('CONFIRMED', 'HOLD')`,
          [now.toISOString(), user.id, reason, compId]
        );
        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'BOOKING_CANCELLED', 'CONFIRMED', 'CANCELLED', $3, 'CUSTOMER', $4, $5)`,
          [
            `evt-${crypto.randomUUID()}`,
            compId,
            user.id,
            `Đơn phụ được hủy tự động theo đơn combo chính ${booking.booking_code}. Tiền hoàn được xử lý chung qua đơn chính.`,
            now.toISOString(),
          ]
        );
      }
    }

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return {
      booking: updated.rows[0],
      refundQueued: true,
      refundAmountVnd,
    };
  });
}

/**
 * Nhân sự trung tâm / Quản trị viên ghi nhận khách đến (CHECKED_IN) hoặc hoàn tất sử dụng (COMPLETED):
 * - Không cho phép chuyển trạng thái tùy ý.
 * - Chỉ cho phép: CONFIRMED -> CHECKED_IN và CHECKED_IN -> COMPLETED.
 * - Ghi nhận người thao tác và thời điểm trong bảng bookings, booking_events và admin_audit_logs.
 */
export async function adminTransitionBookingStatus(
  actor: SessionContext,
  bookingCodeOrId: string,
  targetStatus: 'CHECKED_IN' | 'COMPLETED',
  note?: string,
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền cập nhật trạng thái vận hành đơn đặt sân.',
    });
  }

  const now = getServerNow();
  return await db.withTransaction(async (tx) => {
    const res = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1`,
      [bookingCodeOrId]
    );
    if (res.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân.',
      });
    }
    const booking = res.rows[0];

    if (targetStatus === 'CHECKED_IN') {
      assertTicketCheckInWindow(booking);
      if (booking.booking_status !== 'CONFIRMED' || booking.payment_status !== 'PAID') {
        throw new AppError({
          code: 'INVALID_STATE_TRANSITION',
          statusCode: 409,
          publicMessage: `Chỉ có thể ghi nhận khách đến (Check-in) đối với đơn đã xác nhận và đã thanh toán. Trạng thái hiện tại: ${booking.booking_status}.`,
        });
      }

      await tx.query(
        `UPDATE bookings
         SET booking_status = 'CHECKED_IN',
             checked_in_at = $1,
             checked_in_by = $2,
             updated_at = $1
         WHERE id = $3`,
        [now.toISOString(), actor.user.id, booking.id]
      );

      await tx.query(
        `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
         VALUES ($1, $2, 'CUSTOMER_CHECKED_IN', 'CONFIRMED', 'CHECKED_IN', $3, $4, $5, $6)`,
        [
          `evt-${crypto.randomUUID()}`,
          booking.id,
          actor.user.id,
          actor.user.role,
          `Nhân sự ${actor.user.full_name} ghi nhận khách đã đến nhận sân.${note ? ` Ghi chú: ${note}` : ''}`,
          now.toISOString(),
        ]
      );

      // Đồng bộ check-in cho các đơn phụ trong combo
      const companionCheckinMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
      if (companionCheckinMatch && companionCheckinMatch[1]) {
        const companionIds = companionCheckinMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
        for (const compId of companionIds) {
          await tx.query(
            `UPDATE bookings
             SET booking_status = 'CHECKED_IN',
                 checked_in_at = $1,
                 checked_in_by = $2,
                 updated_at = $1
             WHERE id = $3 AND booking_status = 'CONFIRMED'`,
            [now.toISOString(), actor.user.id, compId]
          );
          await tx.query(
            `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
             VALUES ($1, $2, 'CUSTOMER_CHECKED_IN', 'CONFIRMED', 'CHECKED_IN', $3, $4, $5, $6)`,
            [
              `evt-${crypto.randomUUID()}`,
              compId,
              actor.user.id,
              actor.user.role,
              `Ghi nhận khách nhận sân đồng bộ theo đơn combo chính ${booking.booking_code}.`,
              now.toISOString(),
            ]
          );
        }
      }
    } else if (targetStatus === 'COMPLETED') {
      if (booking.booking_status !== 'CHECKED_IN') {
        throw new AppError({
          code: 'INVALID_STATE_TRANSITION',
          statusCode: 409,
          publicMessage: `Chỉ có thể hoàn tất sử dụng đối với đơn đã ghi nhận khách đến nhận sân (CHECKED_IN). Trạng thái hiện tại: ${booking.booking_status}.`,
        });
      }

      await tx.query(
        `UPDATE bookings
         SET booking_status = 'COMPLETED',
             completed_at = $1,
             completed_by = $2,
             updated_at = $1
         WHERE id = $3`,
        [now.toISOString(), actor.user.id, booking.id]
      );

      await tx.query(
        `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
         VALUES ($1, $2, 'BOOKING_COMPLETED', 'CHECKED_IN', 'COMPLETED', $3, $4, $5, $6)`,
        [
          `evt-${crypto.randomUUID()}`,
          booking.id,
          actor.user.id,
          actor.user.role,
          `Nhân sự ${actor.user.full_name} xác nhận khách đã hoàn tất giờ chơi và bàn giao sân.`,
          now.toISOString(),
        ]
      );

      // Đồng bộ hoàn tất cho các đơn phụ trong combo
      const companionCompleteMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
      if (companionCompleteMatch && companionCompleteMatch[1]) {
        const companionIds = companionCompleteMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
        for (const compId of companionIds) {
          await tx.query(
            `UPDATE bookings
             SET booking_status = 'COMPLETED',
                 completed_at = $1,
                 completed_by = $2,
                 updated_at = $1
             WHERE id = $3 AND booking_status = 'CHECKED_IN'`,
            [now.toISOString(), actor.user.id, compId]
          );
          await tx.query(
            `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
             VALUES ($1, $2, 'BOOKING_COMPLETED', 'CHECKED_IN', 'COMPLETED', $3, $4, $5, $6)`,
            [
              `evt-${crypto.randomUUID()}`,
              compId,
              actor.user.id,
              actor.user.role,
              `Xác nhận hoàn tất ca chơi đồng bộ theo đơn combo chính ${booking.booking_code}.`,
              now.toISOString(),
            ]
          );
        }
      }
    } else {
      throw new AppError({
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 400,
        publicMessage: 'Trạng thái chuyển tiếp không được phép.',
      });
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, 'BOOKING', $5, $6, $7, $8, $9)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        `TRANSITION_BOOKING_${targetStatus}`,
        booking.id,
        `Chuyển trạng thái đơn ${booking.booking_code} từ ${booking.booking_status} sang ${targetStatus}`,
        JSON.stringify({ booking_status: booking.booking_status }),
        JSON.stringify({ booking_status: targetStatus, note }),
        now.toISOString(),
      ]
    );

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return updated.rows[0];
  });
}

/**
 * 1. ĐẶT SÂN TRỰC TIẾP TẠI QUẦY CHO KHÁCH VÃNG LAI (WALK-IN POS BOOKING)
 * Dành cho Nhân sự (STAFF) & Quản trị viên (ADMIN).
 * Bỏ qua bước chờ giữ chỗ 5 phút, thu tiền tại quầy (Tiền mặt / VietQR) và chuyển thẳng sang CHECKED_IN hoặc CONFIRMED.
 */
export async function createWalkInCounterBooking(
  actor: SessionContext,
  input: {
    courtId: string;
    bookingDate: string;
    startHour: number;
    contactName: string;
    contactPhone: string;
    paymentMethod?: 'CASH_COUNTER' | 'QR_COUNTER';
    autoCheckIn?: boolean;
    counterNote?: string;
    posAddons?: Array<{ id: string; quantity: number }>;
  },
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ nhân sự vận hành hoặc quản trị viên mới có quyền tạo đơn Walk-in tại quầy.',
    });
  }

  await expireOverdueHolds(db);

  const bookingDate = (input.bookingDate || '').trim();
  const startHour = Number(input.startHour);
  const contactName = (input.contactName || 'Khách vãng lai tại quầy').trim();
  const contactPhone = (input.contactPhone || '0900000000').trim();
  const paymentMethod = input.paymentMethod === 'QR_COUNTER' ? 'QR_COUNTER' : 'CASH_COUNTER';
  const autoCheckIn = input.autoCheckIn !== false;

  if (!isValidDateString(bookingDate) || !Number.isInteger(startHour) || startHour < 5 || startHour >= 24) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      publicMessage: 'Ngày đặt sân hoặc khung giờ (05:00 – 24:00) không hợp lệ.',
    });
  }

  const now = getServerNow();
  const slotStartAt = vietnamSlotToUtcDate(bookingDate, startHour);
  const slotEndAt = vietnamSlotToUtcDate(bookingDate, startHour + 1);

  return await db.withTransaction(async (tx) => {
    const center = await getCenterInfo(tx);
    const courtRes = await tx.query<{
      id: string;
      name: string;
      status: string;
      open_hour: number;
      close_hour: number;
      base_price_vnd: number;
    }>(`SELECT id, name, status, open_hour, close_hour, base_price_vnd FROM courts WHERE id = $1 LIMIT 1`, [
      input.courtId,
    ]);

    if (courtRes.rows.length === 0 || courtRes.rows[0].status !== 'ACTIVE') {
      throw new AppError({
        code: 'COURT_UNAVAILABLE',
        statusCode: 400,
        publicMessage: 'Sân được chọn không tồn tại hoặc đang tạm ngưng hoạt động.',
      });
    }
    const court = courtRes.rows[0];

    // Kiểm tra khóa bảo trì
    const blockCheck = await tx.query(
      `SELECT id, reason FROM court_blocks WHERE court_id = $1 AND block_date = $2 AND start_hour = $3 AND is_active = TRUE LIMIT 1`,
      [court.id, bookingDate, startHour]
    );
    if (blockCheck.rows.length > 0) {
      throw new AppError({
        code: 'SLOT_BLOCKED',
        statusCode: 409,
        publicMessage: `Sân ${court.name} khung giờ ${formatSlotRange(startHour)} đang khóa bảo trì (${blockCheck.rows[0].reason}).`,
      });
    }

    // Kiểm tra trùng đơn đặt
    const conflictCheck = await tx.query<{ booking_code: string }>(
      `SELECT booking_code FROM bookings
       WHERE court_id = $1 AND booking_date = $2 AND start_hour = $3
         AND (booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
              OR (booking_status = 'HOLD' AND hold_expires_at > $4))
       LIMIT 1`,
      [court.id, bookingDate, startHour, now.toISOString()]
    );
    if (conflictCheck.rows.length > 0) {
      throw new AppError({
        code: 'SLOT_ALREADY_TAKEN',
        statusCode: 409,
        publicMessage: `Sân ${court.name} khung giờ ${formatSlotRange(startHour)} đã có khách đặt (Mã đơn: ${conflictCheck.rows[0].booking_code}).`,
      });
    }

    // Tính giá sân theo khung giờ
    const rulesRes = await tx.query<{
      day_type: 'WEEKDAY' | 'WEEKEND' | 'ALL';
      start_hour: number;
      end_hour: number;
      price_vnd: number;
      label: string;
    }>(`SELECT day_type, start_hour, end_hour, price_vnd, label FROM pricing_rules WHERE court_id = $1 AND is_active = TRUE`, [
      court.id,
    ]);
    const pricing = resolveSlotPriceFromRules(rulesRes.rows, court.base_price_vnd, bookingDate, startHour);

    const bookingId = `bkg-${crypto.randomUUID()}`;
    // Tính tiền nước uống / phụ kiện mua kèm tại quầy (nếu có)
    let serviceFeeVnd = 0;
    let depositVnd = 0;
    const summaryParts: string[] = [];

    if (input.posAddons && input.posAddons.length > 0) {
      for (const addon of input.posAddons) {
        const qty = quantity(addon.quantity);
        if (qty <= 0) continue;
        const eqRes = await tx.query<{
          id: string;
          name: string;
          price_vnd: number;
          unit: string;
          deposit_vnd: number;
        }>(`SELECT id, name, price_vnd, unit, deposit_vnd FROM equipment_services WHERE id = $1 LIMIT 1`, [addon.id]);
        if (!eqRes.rows.length) throw new AppError({code:'ITEM_NOT_FOUND',statusCode:404,publicMessage:'Không tìm thấy dụng cụ.'});
      if (eqRes.rows.length > 0) {
          const item = await issueEquipment(tx, addon.id, qty, bookingId, !autoCheckIn);
          serviceFeeVnd += item.price_vnd * qty;
          depositVnd += (item.deposit_vnd || 0) * qty;
          summaryParts.push(`${item.name} (x${qty})`);
        }
      }
    }

    const totalAmountVnd = pricing.priceVnd + serviceFeeVnd;
    const bookingCode = generateBookingCode(bookingDate);
    const initialStatus = autoCheckIn ? 'CHECKED_IN' : 'CONFIRMED';
    const equipSummary = summaryParts.length > 0 ? summaryParts.join(', ') : null;

    await tx.query(
      `INSERT INTO bookings (
        id, booking_code, user_id, court_id, booking_date, start_hour, end_hour,
        slot_start_at, slot_end_at, contact_name, contact_phone, contact_email, notes,
        quoted_price_vnd, service_fee_vnd, discount_amount_vnd, total_amount_vnd,
        pricing_label_snapshot, court_name_snapshot, policy_version_snapshot,
        cancel_min_hours_snapshot, refund_rate_pct_snapshot,
        booking_status, payment_status, refund_status,
        hold_expires_at, confirmed_at, checked_in_at, checked_in_by,
        equipment_rented_summary, equipment_deposit_vnd, counter_note,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, 0, $16,
        $17, $18, $19,
        $20, 100,
        $21, 'PAID', 'NONE',
        $22, $22, $23, $24,
        $25, $26, $27,
        $22, $22
      )`,
      [
        bookingId,
        bookingCode,
        actor.user.id,
        court.id,
        bookingDate,
        startHour,
        startHour + 1,
        slotStartAt.toISOString(),
        slotEndAt.toISOString(),
        contactName,
        contactPhone,
        actor.user.email,
        `Đặt trực tiếp tại quầy (Walk-in POS - ${paymentMethod === 'QR_COUNTER' ? 'Chuyển khoản QR tại quầy' : 'Tiền mặt tại quầy'})`,
        pricing.priceVnd,
        serviceFeeVnd,
        totalAmountVnd,
        pricing.pricingLabel,
        court.name,
        center.cancellation_policy_version,
        center.cancellation_min_hours,
        initialStatus,
        now.toISOString(),
        autoCheckIn ? now.toISOString() : null,
        autoCheckIn ? actor.user.id : null,
        equipSummary,
        depositVnd,
        input.counterNote || `Khách vãng lai Walk-in (${paymentMethod === 'QR_COUNTER' ? 'CK QR' : 'Tiền mặt'})`,
      ]
    );

    // Tạo bản ghi thanh toán thành công tại quầy để đồng bộ báo cáo doanh thu
    const txnRef = `POS-${bookingCode}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await tx.query(
      `INSERT INTO payment_attempts (
        id, booking_id, provider, merchant_txn_ref, provider_txn_no, amount_vnd,
        status, checkout_url, signature_verified, paid_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'SUCCEEDED', '/quan-tri/dieu-phoi-18-san', TRUE, $7, $7, $7, $7)`,
      [
        `pay-${crypto.randomUUID()}`,
        bookingId,
        paymentMethod,
        txnRef,
        `COUNTER-${Date.now()}`,
        totalAmountVnd,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'WALKIN_POS_CREATED', NULL, $3, $4, $5, $6, $7)`,
      [
        `evt-${crypto.randomUUID()}`,
        bookingId,
        initialStatus,
        actor.user.id,
        actor.user.role,
        `Nhân sự ${actor.user.full_name} tạo đơn khách vãng lai tại quầy (${paymentMethod === 'QR_COUNTER' ? 'Chuyển khoản QR' : 'Tiền mặt'}: ${formatVnd(totalAmountVnd)}).`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'WALKIN_POS_BOOKING', 'BOOKING', $4, $5, NULL, $6, $7)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        bookingId,
        `Tạo đơn Walk-in tại quầy ${bookingCode} (${court.name}, ${formatSlotRange(startHour)} ngày ${bookingDate}) — Thu ${formatVnd(totalAmountVnd)}`,
        JSON.stringify({ bookingCode, courtName: court.name, totalAmountVnd, paymentMethod }),
        now.toISOString(),
      ]
    );

    const created = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    return created.rows[0];
  });
}

/**
 * 2. ĐỔI SÂN NHANH (QUICK COURT TRANSFER)
 * Cho phép Nhân sự / Admin chuyển một đơn đang CONFIRMED hoặc CHECKED_IN sang một sân khác đang trống cùng khung giờ.
 */
export async function transferBookingCourt(
  actor: SessionContext,
  bookingCodeOrId: string,
  targetCourtId: string,
  reason: string = 'Điều phối đổi sân theo yêu cầu tại quầy',
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ nhân sự vận hành hoặc quản trị viên mới có quyền đổi sân.',
    });
  }

  const now = getServerNow();

  return await db.withTransaction(async (tx) => {
    const bkgRes = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1`,
      [bookingCodeOrId]
    );
    if (bkgRes.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân cần chuyển.',
      });
    }
    const booking = bkgRes.rows[0];

    if (booking.booking_status !== 'CONFIRMED' && booking.booking_status !== 'CHECKED_IN') {
      throw new AppError({
        code: 'INVALID_STATE',
        statusCode: 409,
        publicMessage: `Chỉ có thể đổi sân cho đơn đang ở trạng thái Đã xác nhận hoặc Đang thi đấu. Trạng thái hiện tại: ${booking.booking_status}.`,
      });
    }

    if (booking.court_id === targetCourtId) {
      return booking;
    }

    const courtRes = await tx.query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM courts WHERE id = $1 LIMIT 1`,
      [targetCourtId]
    );
    if (courtRes.rows.length === 0 || courtRes.rows[0].status !== 'ACTIVE') {
      throw new AppError({
        code: 'COURT_UNAVAILABLE',
        statusCode: 400,
        publicMessage: 'Sân chuyển đến không tồn tại hoặc đang ngưng hoạt động.',
      });
    }
    const targetCourt = courtRes.rows[0];

    // Kiểm tra sân đích có bị khóa bảo trì không
    const blockCheck = await tx.query(
      `SELECT id, reason FROM court_blocks WHERE court_id = $1 AND block_date = $2 AND start_hour = $3 AND is_active = TRUE LIMIT 1`,
      [targetCourt.id, booking.booking_date, booking.start_hour]
    );
    if (blockCheck.rows.length > 0) {
      throw new AppError({
        code: 'SLOT_BLOCKED',
        statusCode: 409,
        publicMessage: `Không thể chuyển sang ${targetCourt.name} vì sân đang khóa bảo trì (${blockCheck.rows[0].reason}).`,
      });
    }

    if (booking.ticket_id) {
      const conflicts=await tx.query(`SELECT id FROM bookings WHERE court_id=$1 AND booking_date=$2 AND start_hour >= $3 AND start_hour < $4 AND ticket_id IS DISTINCT FROM $5
        AND (booking_status IN ('CONFIRMED','CHECKED_IN','COMPLETED') OR (booking_status='HOLD' AND hold_expires_at>$6))
        UNION ALL SELECT id FROM court_blocks WHERE court_id=$1 AND block_date=$2 AND start_hour >= $3 AND start_hour < $4 AND is_active=TRUE`,
        [targetCourt.id,booking.booking_date,booking.start_hour,booking.end_hour,booking.ticket_id,now.toISOString()]);
      if(conflicts.rows.length) throw new AppError({code:'SLOT_ALREADY_TAKEN',statusCode:409,publicMessage:'Sân đích không trống đủ toàn bộ ca chơi.'});
    }

    // Kiểm tra sân đích có đơn khác chiếm chỗ không
    const conflictCheck = await tx.query<{ booking_code: string }>(
      `SELECT booking_code FROM bookings
       WHERE court_id = $1 AND booking_date = $2 AND start_hour = $3 AND id <> $4
         AND (booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
              OR (booking_status = 'HOLD' AND hold_expires_at > $5))
       LIMIT 1`,
      [targetCourt.id, booking.booking_date, booking.start_hour, booking.id, now.toISOString()]
    );
    if (conflictCheck.rows.length > 0) {
      throw new AppError({
        code: 'SLOT_ALREADY_TAKEN',
        statusCode: 409,
        publicMessage: `Không thể chuyển sang ${targetCourt.name} vì đã có đơn ${conflictCheck.rows[0].booking_code} trong cùng khung giờ.`,
      });
    }

    const oldCourtName = booking.court_name_snapshot;
    await tx.query(
      `UPDATE bookings
       SET court_id = $1,
           court_name_snapshot = $2,
           updated_at = $3
       WHERE id = $4`,
      [targetCourt.id, targetCourt.name, now.toISOString(), booking.id]
    );

    const cleanReason = (reason || 'Điều phối tại quầy').trim();
    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'COURT_TRANSFERRED', $3, $3, $4, $5, $6, $7)`,
      [
        `evt-${crypto.randomUUID()}`,
        booking.id,
        booking.booking_status,
        actor.user.id,
        actor.user.role,
        `Nhân sự ${actor.user.full_name} đã chuyển sân từ [${oldCourtName}] sang [${targetCourt.name}]. Lý do: ${cleanReason}.`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'COURT_TRANSFER', 'BOOKING', $4, $5, $6, $7, $8)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        booking.id,
        `Chuyển sân đơn ${booking.booking_code}: ${oldCourtName} → ${targetCourt.name} (${cleanReason})`,
        JSON.stringify({ court_id: booking.court_id, court_name: oldCourtName }),
        JSON.stringify({ court_id: targetCourt.id, court_name: targetCourt.name, reason: cleanReason }),
        now.toISOString(),
      ]
    );

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return updated.rows[0];
  });
}

/**
 * 3. BÁN LẺ NƯỚC UỐNG & PHỤ KIỆN TẠI QUẦY CỘNG VÀO ĐƠN ĐANG CHƠI (COUNTER POS ADD-ONS)
 * Tự động cộng dồn tiền dịch vụ, tổng thanh toán, tiền cọc dụng cụ và tạo giao dịch POS bổ sung.
 */
export async function addCounterPosItemsToBooking(
  actor: SessionContext,
  bookingCodeOrId: string,
  items: Array<{ equipmentId: string; quantity: number }>,
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ nhân sự vận hành hoặc quản trị viên mới có quyền thêm dịch vụ tại quầy.',
    });
  }

  const validItems = items || [];
  for (const item of validItems) quantity(item.quantity);
  if (validItems.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      publicMessage: 'Vui lòng chọn ít nhất 1 món nước uống hoặc dụng cụ với số lượng lớn hơn 0.',
    });
  }

  const now = getServerNow();

  return await db.withTransaction(async (tx) => {
    const bkgRes = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1`,
      [bookingCodeOrId]
    );
    if (bkgRes.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân.',
      });
    }
    const booking = bkgRes.rows[0];
    if (!['CONFIRMED','CHECKED_IN'].includes(booking.booking_status)) throw new AppError({code:'INVALID_STATE',statusCode:409,publicMessage:'Chỉ thêm dụng cụ vào đơn đã xác nhận hoặc đang chơi.'});
    let addedFeeVnd = 0;
    let addedDepositVnd = 0;
    const addedLabels: string[] = [];

    for (const entry of validItems) {
      const qty = quantity(entry.quantity);
      const eqRes = await tx.query<{
        id: string;
        name: string;
        price_vnd: number;
        unit: string;
        deposit_vnd: number;
      }>(`SELECT id, name, price_vnd, unit, deposit_vnd FROM equipment_services WHERE id = $1 LIMIT 1`, [
        entry.equipmentId,
      ]);

      if (eqRes.rows.length > 0) {
        const eq = await issueEquipment(tx,entry.equipmentId,qty,booking.id,booking.booking_status!=='CHECKED_IN');
        addedFeeVnd += eq.price_vnd * qty;
        addedDepositVnd += (eq.deposit_vnd || 0) * qty;
        addedLabels.push(`${eq.name} (x${qty})`);
      }
    }

    if (addedLabels.length === 0) {
      throw new AppError({
        code: 'ITEM_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy sản phẩm/dịch vụ đã chọn.',
      });
    }

    const newServiceFee = (booking.service_fee_vnd || 0) + addedFeeVnd;
    const newTotalAmount = (booking.total_amount_vnd || 0) + addedFeeVnd;
    const newDeposit = (booking.equipment_deposit_vnd || 0) + addedDepositVnd;
    const addedText = addedLabels.join(', ');
    const newEquipSummary = booking.equipment_rented_summary
      ? `${booking.equipment_rented_summary} + ${addedText}`
      : addedText;

    await tx.query(
      `UPDATE bookings
       SET service_fee_vnd = $1,
           total_amount_vnd = $2,
           equipment_rented_summary = $3,
           equipment_deposit_vnd = $4,
           deposit_refunded = CASE WHEN $5 > 0 THEN FALSE ELSE deposit_refunded END,
           updated_at = $6
       WHERE id = $7`,
      [newServiceFee, newTotalAmount, newEquipSummary, newDeposit, addedDepositVnd, now.toISOString(), booking.id]
    );

    if (addedFeeVnd > 0) {
      const txnRef = `ADDON-${booking.booking_code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      await tx.query(
        `INSERT INTO payment_attempts (
          id, booking_id, provider, merchant_txn_ref, provider_txn_no, amount_vnd,
          status, checkout_url, signature_verified, paid_at, expires_at, created_at, updated_at
        ) VALUES ($1, $2, 'POS_ADDON', $3, $4, $5, 'SUCCEEDED', '/quan-tri/dieu-phoi-18-san', TRUE, $6, $6, $6, $6)`,
        [
          `pay-${crypto.randomUUID()}`,
          booking.id,
          txnRef,
          `POS-ADDON-${Date.now()}`,
          addedFeeVnd,
          now.toISOString(),
        ]
      );
    }

    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'POS_ADDON_ADDED', $3, $3, $4, $5, $6, $7)`,
      [
        `evt-${crypto.randomUUID()}`,
        booking.id,
        booking.booking_status,
        actor.user.id,
        actor.user.role,
        `Nhân sự ${actor.user.full_name} thêm món tại quầy: [${addedText}] (+${formatVnd(addedFeeVnd)}${addedDepositVnd > 0 ? `, cọc +${formatVnd(addedDepositVnd)}` : ''}).`,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'POS_ADDON_SALE', 'BOOKING', $4, $5, $6, $7, $8)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        booking.id,
        `Bán thêm tại quầy cho đơn ${booking.booking_code}: ${addedText} (+${formatVnd(addedFeeVnd)})`,
        JSON.stringify({ service_fee_vnd: booking.service_fee_vnd, total_amount_vnd: booking.total_amount_vnd }),
        JSON.stringify({ service_fee_vnd: newServiceFee, total_amount_vnd: newTotalAmount, added: addedText }),
        now.toISOString(),
      ]
    );

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return updated.rows[0];
  });
}

export interface CounterDispatchInput {
  action: 'CHECK_IN' | 'HANDOVER_EQUIPMENT' | 'REFUND_DEPOSIT' | 'COMPLETE' | 'SAVE_NOTE';
  equipmentRentedSummary?: string;
  equipmentDepositVnd?: number;
  counterNote?: string;
}

/**
 * Trạm điều phối soát vé tại quầy (Counter Dispatch Station):
 * Cho phép nhân viên trực tiếp xác nhận khách nhận sân, bàn giao dụng cụ,
 * thu cọc, hoàn trả cọc thiết bị và đóng ca chơi khi khách ra về.
 */
export async function counterDispatchBookingOperation(
  actor: SessionContext,
  bookingCodeOrId: string,
  input: CounterDispatchInput,
  db: DatabaseClient = getDb()
): Promise<BookingRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền điều phối vận hành đơn đặt sân tại quầy.',
    });
  }

  const now = getServerNow();

  return await db.withTransaction(async (tx) => {
    const res = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1`,
      [bookingCodeOrId]
    );

    if (res.rows.length === 0) {
      throw new AppError({
        code: 'BOOKING_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy đơn đặt sân tương ứng với mã yêu cầu.',
      });
    }

    const booking = res.rows[0];

    switch (input.action) {
      case 'CHECK_IN': {
        assertTicketCheckInWindow(booking);
        if (booking.booking_status !== 'CONFIRMED' || booking.payment_status !== 'PAID') {
          throw new AppError({
            code: 'INVALID_STATE_TRANSITION',
            statusCode: 409,
            publicMessage: `Chỉ có thể ghi nhận khách nhận sân đối với đơn Đã xác nhận & Đã thanh toán. Trạng thái hiện tại: ${booking.booking_status}.`,
          });
        }

        await tx.query(
          `UPDATE bookings
           SET booking_status = 'CHECKED_IN',
               checked_in_at = $1,
               checked_in_by = $2,
               counter_note = COALESCE($3, counter_note),
               updated_at = $1
           WHERE id = $4`,
          [now.toISOString(), actor.user.id, input.counterNote || null, booking.id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'CUSTOMER_CHECKED_IN', 'CONFIRMED', 'CHECKED_IN', $3, $4, $5, $6)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            actor.user.id,
            actor.user.role,
            `Nhân sự ${actor.user.full_name} xác nhận khách đã có mặt và nhận sân qua mã QR.${input.counterNote ? ` Ghi chú: ${input.counterNote}` : ''}`,
            now.toISOString(),
          ]
        );
        break;
      }

      case 'HANDOVER_EQUIPMENT': {
        assertTicketCheckInWindow(booking);
        if (!['CONFIRMED','CHECKED_IN'].includes(booking.booking_status)) throw new AppError({code:'INVALID_STATE',statusCode:409,publicMessage:'Đơn chưa sẵn sàng bàn giao dụng cụ.'});
        await tx.query("UPDATE equipment_movements SET state='ISSUED' WHERE booking_id=$1 AND state='RESERVED'",[booking.id]);
        const tracked = await tx.query("SELECT id FROM equipment_movements WHERE booking_id=$1 AND state='ISSUED' LIMIT 1",[booking.id]);
        if(!tracked.rows.length && !input.equipmentRentedSummary && !booking.equipment_rented_summary) {
          throw new AppError({code:'NO_EQUIPMENT',statusCode:409,publicMessage:'Hãy chọn dụng cụ và số lượng tại POS trước khi bàn giao để trừ đúng tồn kho.'});
        }
        const summary = input.equipmentRentedSummary !== undefined ? input.equipmentRentedSummary : (booking.equipment_rented_summary || '');
        const depositVnd = input.equipmentDepositVnd !== undefined ? input.equipmentDepositVnd : (booking.equipment_deposit_vnd || 0);

        await tx.query(
          `UPDATE bookings
           SET equipment_rented_summary = $1,
               equipment_deposit_vnd = $2,
               deposit_refunded = FALSE,
               deposit_refunded_at = NULL,
               deposit_refunded_by = NULL,
               updated_at = $3
           WHERE id = $4`,
          [summary, depositVnd, now.toISOString(), booking.id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'EQUIPMENT_HANDED_OVER', $3, $3, $4, $5, $6, $7)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            booking.booking_status,
            actor.user.id,
            actor.user.role,
            `Nhân sự ${actor.user.full_name} đã bàn giao dụng cụ thuê: [${summary || 'Không liệt kê'}]. Tiền cọc giữ tại quầy: ${depositVnd.toLocaleString('vi-VN')} ₫.`,
            now.toISOString(),
          ]
        );
        break;
      }

      case 'REFUND_DEPOSIT': {
        await returnBookingEquipment(tx,booking.id);
        const currentDeposit = booking.equipment_deposit_vnd || 0;

        await tx.query(
          `UPDATE bookings
           SET deposit_refunded = TRUE,
               deposit_refunded_at = $1,
               deposit_refunded_by = $2,
               updated_at = $1
           WHERE id = $3`,
          [now.toISOString(), actor.user.id, booking.id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'EQUIPMENT_DEPOSIT_REFUNDED', $3, $3, $4, $5, $6, $7)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            booking.booking_status,
            actor.user.id,
            actor.user.role,
            `Nhân sự ${actor.user.full_name} đã kiểm tra dụng cụ nguyên vẹn và hoàn cọc ${currentDeposit.toLocaleString('vi-VN')} ₫ cho khách hàng.`,
            now.toISOString(),
          ]
        );
        break;
      }

      case 'COMPLETE': {
        if (booking.booking_status !== 'CHECKED_IN') {
          throw new AppError({
            code: 'INVALID_STATE_TRANSITION',
            statusCode: 409,
            publicMessage: `Chỉ có thể hoàn tất ca chơi đối với đơn đã nhận sân (CHECKED_IN). Trạng thái hiện tại: ${booking.booking_status}.`,
          });
        }

        await tx.query(
          `UPDATE bookings
           SET booking_status = 'COMPLETED',
               completed_at = $1,
               completed_by = $2,
               updated_at = $1
           WHERE id = $3`,
          [now.toISOString(), actor.user.id, booking.id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'BOOKING_COMPLETED', 'CHECKED_IN', 'COMPLETED', $3, $4, $5, $6)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            actor.user.id,
            actor.user.role,
            `Nhân sự ${actor.user.full_name} xác nhận khách đã thi đấu xong, bàn giao sân và hoàn tất ca chơi.`,
            now.toISOString(),
          ]
        );
        break;
      }

      case 'SAVE_NOTE': {
        const note = (input.counterNote || '').trim();

        await tx.query(
          `UPDATE bookings
           SET counter_note = $1,
               updated_at = $2
           WHERE id = $3`,
          [note, now.toISOString(), booking.id]
        );

        await tx.query(
          `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
           VALUES ($1, $2, 'COUNTER_NOTE_SAVED', $3, $3, $4, $5, $6, $7)`,
          [
            `evt-${crypto.randomUUID()}`,
            booking.id,
            booking.booking_status,
            actor.user.id,
            actor.user.role,
            `Nhân sự ${actor.user.full_name} cập nhật ghi chú điều phối: "${note}".`,
            now.toISOString(),
          ]
        );
        break;
      }

      default:
        throw new AppError({
          code: 'INVALID_ACTION',
          statusCode: 400,
          publicMessage: 'Hành động điều phối không hợp lệ.',
        });
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, 'BOOKING', $5, $6, $7, $8, $9)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        `COUNTER_DISPATCH_${input.action}`,
        booking.id,
        `Điều phối quầy thao tác ${input.action} cho đơn ${booking.booking_code}`,
        JSON.stringify({ booking_status: booking.booking_status, equipment_deposit_vnd: booking.equipment_deposit_vnd }),
        JSON.stringify(input),
        now.toISOString(),
      ]
    );

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return updated.rows[0];
  });
}

export const COUNTER_REFUND_RATES = [100, 70, 50, 30, 0] as const;
export type CounterRefundRate = (typeof COUNTER_REFUND_RATES)[number];
export type CounterRefundMethod = 'ORIGINAL_METHOD' | 'CASH';

/** Giao dịch thu tại quầy (tiền mặt / CK QR tại quầy) không thể hoàn ngược qua cổng thanh toán trực tuyến. */
export function isCounterCollectedPayment(attempt: { provider: string; merchant_txn_ref: string }): boolean {
  return attempt.merchant_txn_ref.startsWith('POS-') || attempt.provider === 'CASH_COUNTER' || attempt.provider === 'QR_COUNTER';
}

/**
 * Nhân viên hủy đơn tại quầy và hoàn tiền theo mức % (dùng cho trường hợp khách đến quầy, kể cả khi đã quá mốc hủy trực tuyến).
 * - Chỉ áp dụng cho đơn CONFIRMED + PAID (chưa nhận sân).
 * - ORIGINAL_METHOD: đưa vào hàng đợi PROCESS_REFUND, tiền trả về phương thức thanh toán gốc qua cổng.
 * - CASH: nhân viên chi tiền mặt ngay, khoản hoàn ghi nhận SUCCEEDED lập tức.
 */
export async function counterCancelAndRefund(
  actor: SessionContext,
  bookingCodeOrId: string,
  input: { ratePct: number; reason: string; method: CounterRefundMethod },
  db: DatabaseClient = getDb()
): Promise<{ booking: BookingRecord; refundAmountVnd: number; refundCode: string | null }> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Bạn không có quyền hủy và hoàn tiền tại quầy.' });
  }
  const ratePct = Number(input.ratePct);
  if (!(COUNTER_REFUND_RATES as readonly number[]).includes(ratePct)) {
    throw new AppError({ code: 'INVALID_REFUND_RATE', statusCode: 400, publicMessage: 'Mức hoàn tiền không hợp lệ.' });
  }
  const reason = (input.reason || '').trim();
  if (reason.length < 5) {
    throw new AppError({ code: 'REFUND_REASON_REQUIRED', statusCode: 400, publicMessage: 'Vui lòng nhập lý do hoàn tiền (tối thiểu 5 ký tự).' });
  }
  const method: CounterRefundMethod = input.method === 'CASH' ? 'CASH' : 'ORIGINAL_METHOD';
  const now = getServerNow();
  const nowIso = now.toISOString();

  return await db.withTransaction(async (tx) => {
    const res = await tx.query<BookingRecord>(
      `SELECT * FROM bookings WHERE id = COALESCE((SELECT t.primary_booking_id FROM bookings x JOIN booking_tickets t ON t.id=x.ticket_id WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1), (SELECT x.id FROM bookings x WHERE x.booking_code=$1 OR x.id=$1 LIMIT 1)) LIMIT 1 FOR UPDATE`,
      [bookingCodeOrId]
    );
    if (res.rows.length === 0) {
      throw new AppError({ code: 'BOOKING_NOT_FOUND', statusCode: 404, publicMessage: 'Không tìm thấy đơn đặt sân.' });
    }
    let booking = res.rows[0];

    // Đơn phụ trong combo -> thao tác trên đơn chính (nơi ghi nhận thanh toán)
    const primaryLinkMatch = booking.notes?.match(/BATCH_PRIMARY:\[(.*?)\]/);
    if (primaryLinkMatch && primaryLinkMatch[1]) {
      const primaryRes = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [primaryLinkMatch[1]]);
      if (primaryRes.rows[0]) booking = primaryRes.rows[0];
    }

    if (booking.booking_status !== 'CONFIRMED' || booking.payment_status !== 'PAID') {
      throw new AppError({
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 409,
        publicMessage: 'Chỉ hủy và hoàn tiền tại quầy cho đơn đã thanh toán và chưa nhận sân.',
      });
    }

    const attemptsRes = await tx.query<{ id: string; amount_vnd: number; status: string; provider: string; merchant_txn_ref: string; sender_bank_code?: string | null; sender_bank_name?: string | null; sender_account_no?: string | null; sender_account_name?: string | null }>(
      `SELECT id, allocated_vnd AS amount_vnd, status, provider, merchant_txn_ref, sender_bank_code, sender_bank_name, sender_account_no, sender_account_name FROM (SELECT pa.*, CASE WHEN pa.payment_group_id IS NULL THEN pa.amount_vnd ELSE t.paid_amount_vnd END AS allocated_vnd
       FROM payment_attempts pa LEFT JOIN booking_tickets t ON t.payment_group_id=pa.payment_group_id AND t.primary_booking_id=$1
       WHERE (pa.payment_group_id IS NULL AND pa.booking_id=$1) OR t.primary_booking_id=$1) pa ORDER BY created_at DESC`,
      [booking.id]
    );
    const verifiedPayment = attemptsRes.rows.find((a) => a.status === 'SUCCEEDED');
    const refundAmountVnd = verifiedPayment ? Math.round((verifiedPayment.amount_vnd * ratePct) / 100) : 0;

    if (refundAmountVnd > 0 && !verifiedPayment) {
      throw new AppError({ code: 'VERIFIED_PAYMENT_NOT_FOUND', statusCode: 409, publicMessage: 'Không tìm thấy giao dịch thanh toán đã xác thực của đơn.' });
    }
    if (refundAmountVnd > 0 && method === 'ORIGINAL_METHOD' && verifiedPayment && isCounterCollectedPayment(verifiedPayment)) {
      throw new AppError({
        code: 'REFUND_METHOD_NOT_SUPPORTED',
        statusCode: 409,
        publicMessage: 'Đơn này thu tiền tại quầy nên chỉ hoàn được bằng tiền mặt.',
      });
    }

    const methodLabel = method === 'CASH' ? 'tiền mặt tại quầy' : 'phương thức thanh toán gốc';
    const refundId = `rfd-${crypto.randomUUID()}`;
    const refundCode = refundAmountVnd > 0 ? `RF-${booking.booking_code}` : null;
    const bookingRefundStatus = refundAmountVnd === 0 ? 'NOT_APPLICABLE' : method === 'CASH' ? 'REFUNDED' : 'PENDING';

    await tx.query(
      `UPDATE bookings
       SET booking_status = 'CANCELLED',
           refund_status = $1,
           refundable_amount_vnd = $2,
           cancelled_at = $3,
           cancelled_by = $4,
           cancel_reason = $5,
           updated_at = $3
       WHERE id = $6`,
      [bookingRefundStatus, refundAmountVnd, nowIso, actor.user.id, `Hủy tại quầy: ${reason}`, booking.id]
    );

    if (refundAmountVnd > 0 && verifiedPayment && refundCode) {
      await tx.query(
        `INSERT INTO refunds (
          id, booking_id, payment_attempt_id, refund_code, amount_vnd, reason_type, reason_note, status,
          provider_refund_id, attempt_count, completed_at, requested_by, refund_method, refund_rate_pct,
          destination_bank_code, destination_bank_name, destination_account_no, destination_account_name,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'COUNTER_REFUND', $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)`,
        [
          refundId,
          booking.id,
          verifiedPayment.id,
          refundCode,
          refundAmountVnd,
          reason,
          method === 'CASH' ? 'SUCCEEDED' : 'PENDING',
          method === 'CASH' ? `CASH-${refundCode}` : null,
          method === 'CASH' ? nowIso : null,
          actor.user.id,
          method,
          ratePct,
          verifiedPayment.sender_bank_code || null,
          verifiedPayment.sender_bank_name || null,
          verifiedPayment.sender_account_no || null,
          verifiedPayment.sender_account_name || null,
          nowIso,
        ]
      );

      if (method === 'ORIGINAL_METHOD') {
        await tx.query(
          `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
           VALUES ($1, 'PROCESS_REFUND', $2, $3, 'PENDING', $4, $4, $4)
           ON CONFLICT (dedup_key) DO NOTHING`,
          [
            `job-${crypto.randomUUID()}`,
            `refund-${booking.id}-${verifiedPayment.id}`,
            JSON.stringify({ bookingId: booking.id, refundId, paymentAttemptId: verifiedPayment.id }),
            nowIso,
          ]
        );
      }
    }

    const eventMsg =
      refundAmountVnd > 0
        ? `Nhân sự ${actor.user.full_name} hủy đơn tại quầy, hoàn ${ratePct}% (${formatVnd(refundAmountVnd)}) qua ${methodLabel}. Lý do: ${reason}`
        : `Nhân sự ${actor.user.full_name} hủy đơn tại quầy, không hoàn tiền. Lý do: ${reason}`;
    await tx.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'BOOKING_CANCELLED_AT_COUNTER', 'CONFIRMED', 'CANCELLED', $3, $4, $5, $6)`,
      [`evt-${crypto.randomUUID()}`, booking.id, actor.user.id, actor.user.role, eventMsg, nowIso]
    );

    await tx.query(
      `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
       VALUES ($1, $2, $3, 'BOOKING_CANCELLED', $4, $5, 'QUEUED', $6)`,
      [
        `ntf-${crypto.randomUUID()}`,
        booking.user_id,
        booking.id,
        `Đơn ${booking.booking_code} đã được hủy tại quầy`,
        refundAmountVnd > 0
          ? method === 'CASH'
            ? `Bạn đã nhận lại ${formatVnd(refundAmountVnd)} bằng tiền mặt tại quầy.`
            : `Khoản hoàn ${formatVnd(refundAmountVnd)} đang được xử lý về phương thức thanh toán ban đầu của bạn.`
          : 'Đơn đã được hủy theo thỏa thuận tại quầy, không phát sinh hoàn tiền.',
        nowIso,
      ]
    );

    // Hủy đồng thời các đơn phụ trong combo
    const companionMatch = booking.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
    if (companionMatch && companionMatch[1]) {
      const companionIds = companionMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
      for (const compId of companionIds) {
        const upd = await tx.query(
          `UPDATE bookings
           SET booking_status = 'CANCELLED', refund_status = 'NOT_APPLICABLE', refundable_amount_vnd = 0,
               cancelled_at = $1, cancelled_by = $2, cancel_reason = $3, updated_at = $1
           WHERE id = $4 AND booking_status IN ('CONFIRMED', 'HOLD')
           RETURNING id`,
          [nowIso, actor.user.id, `Hủy tại quầy theo đơn chính ${booking.booking_code}`, compId]
        );
        if (upd.rows.length > 0) {
          await tx.query(
            `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_user_id, actor_role, message_vi, created_at)
             VALUES ($1, $2, 'BOOKING_CANCELLED_AT_COUNTER', 'CONFIRMED', 'CANCELLED', $3, $4, $5, $6)`,
            [
              `evt-${crypto.randomUUID()}`,
              compId,
              actor.user.id,
              actor.user.role,
              `Đơn phụ được hủy tại quầy theo đơn chính ${booking.booking_code}. Tiền hoàn xử lý qua đơn chính.`,
              nowIso,
            ]
          );
        }
      }
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'COUNTER_CANCEL_REFUND', 'BOOKING', $4, $5, $6, $7, $8)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        booking.id,
        `Hủy tại quầy đơn ${booking.booking_code}: hoàn ${ratePct}% = ${formatVnd(refundAmountVnd)} (${methodLabel})`,
        JSON.stringify({ booking_status: booking.booking_status, payment_status: booking.payment_status }),
        JSON.stringify({ ratePct, method, reason, refundAmountVnd }),
        nowIso,
      ]
    );

    const updated = await tx.query<BookingRecord>(`SELECT * FROM bookings WHERE id = $1`, [booking.id]);
    return { booking: updated.rows[0], refundAmountVnd, refundCode };
  });
}

export function assertTicketCheckInWindow(booking: BookingRecord): void {
  if (!booking.ticket_id) return; // Existing issued tickets retain their original operating policy.
  const now = getServerNow().getTime();
  if (now < new Date(booking.slot_start_at).getTime()-30*60*1000 || now >= new Date(booking.slot_end_at).getTime())
    throw new AppError({code:'OUTSIDE_CHECK_IN_WINDOW',statusCode:409,publicMessage:'Vé chỉ được nhận sân từ 30 phút trước giờ bắt đầu đến trước giờ kết thúc ca.'});
}
