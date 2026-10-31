import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  bodyText: string;
  category: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'REFUND_UPDATE';
  dedupKey: string;
}

export interface SentEmailRecord extends EmailMessage {
  sentAt: string;
  deliveryMode: 'log_outbox' | 'smtp_webhook';
}

const outboxMemory: SentEmailRecord[] = [];

export function getOutboxEmailsForInspection(): SentEmailRecord[] {
  return [...outboxMemory];
}

export function clearOutboxEmailsForTesting(): void {
  outboxMemory.length = 0;
}

/**
 * Dịch vụ gửi email giao dịch.
 * Lưu ý theo yêu cầu:
 * - Không báo là "Đã gửi qua SMTP thực tế" nếu chưa cấu hình dịch vụ thực tế.
 * - Khi chạy ở chế độ log_outbox (sandbox/dev), ghi nhận vào hộp thư phát triển để kiểm tra
 *   và trả về trạng thái tương ứng.
 */
export async function deliverTransactionalEmail(msg: EmailMessage): Promise<{
  delivered: boolean;
  statusLabel: 'SENT' | 'NOT_CONFIGURED';
}> {
  if (config.emailMode === 'smtp_webhook' && config.smtpWebhookUrl) {
    // Gửi tới dịch vụ email thực tế nếu được cấu hình
    const res = await fetch(config.smtpWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.smtpApiKey ? { Authorization: `Bearer ${config.smtpApiKey}` } : {}),
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: msg.to,
        subject: msg.subject,
        text: msg.bodyText,
      }),
    });
    if (!res.ok) {
      throw new Error(`Dịch vụ email trả về mã trạng thái ${res.status}`);
    }
    outboxMemory.unshift({
      ...msg,
      sentAt: new Date().toISOString(),
      deliveryMode: 'smtp_webhook',
    });
    return { delivered: true, statusLabel: 'SENT' };
  }

  // Chế độ hộp thư nội bộ phát triển (chưa kết nối nhà cung cấp SMTP bên ngoài)
  outboxMemory.unshift({
    ...msg,
    sentAt: new Date().toISOString(),
    deliveryMode: 'log_outbox',
  });
  logger.info('EMAIL_OUTBOX_RECORDED', `Đã lưu email [${msg.category}] vào hộp thư kiểm thử`, {
    to: msg.to,
    subject: msg.subject,
    dedupKey: msg.dedupKey,
  });

  return { delivered: false, statusLabel: 'NOT_CONFIGURED' };
}
