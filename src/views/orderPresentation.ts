import { BookingRecord } from '../services/bookingService.js';
import { escapeHtml } from '../utils/security.js';
import { formatSlotRange, formatVietnamDateDisplay, formatVietnamDateTimeDisplay, formatVnd } from '../utils/time.js';
import { formatBookingStatusVi, formatPaymentStatusVi, formatRefundStatusVi } from './layout.js';

export function orderStatus(booking: BookingRecord): string {
  const status = formatBookingStatusVi(booking.booking_status);
  return `<span class="order-status ${status.cssClass}">${escapeHtml(status.label)}</span>`;
}

export function orderSchedule(booking: BookingRecord): string {
  return `<section class="order-panel order-schedule"><h2>Lịch chơi</h2>
    <p class="order-court">${escapeHtml(booking.court_name_snapshot)}</p>
    <dl class="order-facts"><div><dt>Ngày chơi</dt><dd>${escapeHtml(formatVietnamDateDisplay(booking.booking_date))}</dd></div>
    <div><dt>Giờ chơi</dt><dd>${escapeHtml(formatSlotRange(booking.start_hour, booking.end_hour))}</dd></div></dl>
    <p class="order-muted order-address">Be Badminton · 262/1 Quang Trung, Gò Vấp</p></section>`;
}

export function orderContact(booking: BookingRecord): string {
  return `<section class="order-panel order-contact"><h2>Người nhận sân</h2><dl class="order-facts">
    <div><dt>Họ tên</dt><dd>${escapeHtml(booking.contact_name)}</dd></div>
    <div><dt>Điện thoại</dt><dd><a href="tel:${escapeHtml(booking.contact_phone)}">${escapeHtml(booking.contact_phone)}</a></dd></div>
    <div class="order-wide"><dt>Email</dt><dd>${escapeHtml(booking.contact_email || 'Chưa cung cấp')}</dd></div>
    ${booking.notes ? `<div class="order-wide"><dt>Ghi chú đặt sân</dt><dd>${escapeHtml(booking.notes)}</dd></div>` : ''}</dl></section>`;
}

export function orderPayment(booking: BookingRecord): string {
  const payment = formatPaymentStatusVi(booking.payment_status);
  const row = (label: string, value: number, discount = false) => `<div><dt>${label}</dt><dd>${discount ? '−' : ''}${escapeHtml(formatVnd(value))}</dd></div>`;
  return `${booking.payment_group_code ? `<p class="order-notice">Thanh toán cùng nhóm <a href="/thanh-toan/nhom/${encodeURIComponent(booking.payment_group_code)}">${escapeHtml(booking.payment_group_code)}</a> · Vé này được nhận sân và hủy riêng.</p>` : ''}<section class="order-panel order-payment"><div class="order-section-head"><h2>Thanh toán</h2><span class="order-muted">${escapeHtml(payment.label)}</span></div>
    <dl class="order-totals">${row('Tiền sân', booking.quoted_price_vnd)}
    ${booking.service_fee_vnd ? row('Dịch vụ', booking.service_fee_vnd) : ''}
    ${booking.member_discount_vnd ? row('Ưu đãi hội viên', booking.member_discount_vnd, true) : ''}
    ${booking.discount_amount_vnd ? row(`Mã ưu đãi${booking.coupon_code_snapshot ? ` · ${escapeHtml(booking.coupon_code_snapshot)}` : ''}`, booking.discount_amount_vnd, true) : ''}
    <div class="order-total"><dt>Tổng thanh toán</dt><dd>${escapeHtml(formatVnd(booking.total_amount_vnd))}</dd></div></dl>
    ${!['NONE', 'NOT_APPLICABLE'].includes(booking.refund_status) ? `<p class="order-notice">${escapeHtml(formatRefundStatusVi(booking.refund_status).label)} · ${escapeHtml(formatVnd(booking.refundable_amount_vnd))}<br><small style="color:#64748b; font-size:11px;">Hoàn trả về tài khoản nguồn thanh toán (tuân thủ quy định AML).</small></p>` : ''}
    </section>`;
}

export function orderHistory(events: Array<{ created_at: string | Date; message_vi: string }>): string {
  return `<section class="order-panel order-history-panel"><h2>Lịch sử đơn</h2><ol class="order-history">${events.map(event => `<li><time>${escapeHtml(formatVietnamDateTimeDisplay(event.created_at))}</time><p>${escapeHtml(event.message_vi)}</p></li>`).join('') || '<li>Chưa có cập nhật.</li>'}</ol></section>`;
}
