import { SessionContext, getMemberDiscountRate } from '../services/authService.js';
import { BookingRecord } from '../services/bookingService.js';
import { PaymentGroup } from '../services/multiTicketService.js';
import { EquipmentItem } from '../services/equipmentService.js';
import { CouponRecord } from '../services/couponService.js';
import { escapeHtml } from '../utils/security.js';
import { formatVnd, formatVietnamDateDisplay, formatSlotRange, getServerNow } from '../utils/time.js';
import { renderQrCodeSvg } from './sandboxGatewayPage.js';
import { config } from '../config/env.js';
import { orderStatus } from './orderPresentation.js';

export function renderCartPage(session: SessionContext | null): string {
  return `<section class="cart-page" data-cart-page>
    <header class="cart-heading"><div><p class="eyebrow">Chọn lịch chơi của bạn</p><h1>Giỏ vé đặt sân</h1><p>Thanh toán một lần. Mỗi sân, mỗi ca có vé nhận sân riêng.</p></div><a href="/#lich-san-nhanh" class="btn-pill-outline">Chọn thêm ca</a></header>
    <div id="cart-message" role="status" class="cart-message"></div>
    <div class="cart-selection-controls"><button type="button" id="cart-select-available" class="btn-text">Chọn tất cả vé còn trống</button><span id="cart-selection-summary" aria-live="polite">Chưa chọn vé</span></div>
    <div id="cart-items" class="cart-ticket-list"></div>
    <form method="POST" action="/gio-hang/thanh-toan" id="cart-checkout-form" class="cart-checkout-bar" data-authenticated="${!!session}">
      <input type="hidden" name="_csrf" value="${escapeHtml(session?.csrfToken||'')}"><input type="hidden" name="slots" id="cart-slots"><input type="hidden" name="idempotencyKey" id="cart-key">
      <div><span id="cart-ticket-count">Đang đọc giỏ…</span><strong id="cart-total" class="num"></strong><small>Chỉ giữ chỗ 5 phút cho các vé đã chọn.</small></div>
      <button class="btn-pill-dark" id="cart-checkout" type="submit" disabled>${session?'Tiếp tục thanh toán':'Đăng nhập để thanh toán'}</button>
    </form><noscript>Cần bật JavaScript để quản lý giỏ vé. Bạn vẫn có thể đặt từng ca chơi tại trang chi tiết sân.</noscript>
  </section>`;
}

export function renderGroupCheckout(
  group: PaymentGroup,
  tickets: BookingRecord[],
  session: SessionContext,
  equipment: EquipmentItem[],
  coupons: CouponRecord[] = []
): string {
  const expired = new Date(group.hold_expires_at).getTime() <= getServerNow().getTime();
  const paid = group.status === 'PAID';
  const pending = ['HOLD', 'PENDING'].includes(group.status) && !expired && tickets.every(b => b.booking_status === 'HOLD');
  const editable = pending && group.status === 'HOLD';
  const rate = getMemberDiscountRate(session.user.member_tier);
  const member = tickets.reduce((n, b) => n + Math.round(b.quoted_price_vnd * rate), 0);

  return `<section class="cart-page" data-payment-group="${escapeHtml(group.code)}" ${paid ? 'data-cart-paid="true"' : !pending ? 'data-reset-cart-key' : ''}>
    <header class="cart-heading">
      <div>
        <p class="eyebrow">${escapeHtml(group.code)}</p>
        <h1>${paid ? 'Vé đặt sân của bạn' : pending ? 'Thanh toán giỏ vé' : 'Thông tin nhóm thanh toán'}</h1>
        <p>${paid ? 'Mở đúng vé khi đến sân. Các vé nhận sân và hủy độc lập.' : pending ? 'Một giao dịch cho tất cả ca chơi đã chọn.' : 'Kiểm tra trạng thái từng vé bên dưới.'}</p>
      </div>
      <a href="/don-dat" class="btn-pill-outline">Đơn đặt của tôi</a>
    </header>

    ${pending ? `<p class="cart-deadline" role="timer" data-deadline="${new Date(group.hold_expires_at).toISOString()}">Đang giữ chỗ · <strong id="group-countdown"></strong></p>` : ''}
    ${!pending && !paid ? `<p class="cart-message">${group.status === 'LATE_PAID' ? 'Thanh toán đến sau hạn. Các khoản hoàn được theo dõi tại từng vé.' : 'Lượt giữ chỗ không còn hiệu lực. Các ca trong giỏ vẫn được giữ lại để bạn kiểm tra và đặt lại.'} <a href="/gio-hang">Trở về giỏ</a></p>` : ''}

    <form method="POST" action="/thanh-toan/nhom/${encodeURIComponent(group.code)}/khoi-tao" id="group-payment-form">
      <input type="hidden" name="_csrf" value="${escapeHtml(session.csrfToken)}">

      <div class="cart-ticket-list">${tickets.map((b, i) => `<article class="cart-ticket checkout-ticket ${paid ? 'is-paid' : ''}" data-ticket-code="${escapeHtml(b.booking_code)}" data-base="${b.quoted_price_vnd}" data-member="${Math.round(b.quoted_price_vnd * rate)}">
        <div class="ticket-index">${String(i + 1).padStart(2, '0')}</div>
        <div class="ticket-body">
          <div class="ticket-title">
            <h2>${escapeHtml(b.court_name_snapshot)}</h2>
            ${orderStatus(b)}
          </div>
          <p class="ticket-date">${escapeHtml(formatVietnamDateDisplay(b.booking_date))} <strong>${escapeHtml(formatSlotRange(b.start_hour, b.end_hour))}</strong></p>
          <p class="order-muted">Mã vé: <code>${escapeHtml(b.booking_code)}</code></p>

          ${editable ? `
            <details class="ticket-addons">
              <summary class="ticket-addons-summary">
                <span class="addons-summary-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  Đặt thêm đồ riêng cho vé này (vợt, cầu, nước, giày...)
                </span>
                <span class="ticket-addons-count-badge" data-ticket-addon-count="${escapeHtml(b.booking_code)}">Chưa chọn thêm</span>
              </summary>
              <div class="ticket-addon-list">
                ${equipment.filter(e => e.stockStatus === 'AVAILABLE' || e.stockQuantity > 0).map(e => `
                  <div class="ticket-addon-item">
                    <div class="addon-item-info">
                      <div class="addon-item-name">
                        <strong>${escapeHtml(e.name)}</strong>
                        ${e.badge ? `<span class="addon-badge">${escapeHtml(e.badge)}</span>` : ''}
                      </div>
                      <div class="addon-item-meta">
                        <span class="addon-price">${escapeHtml(formatVnd(e.priceVnd))} / ${escapeHtml(e.unit)}</span>
                        ${e.depositVnd ? `<span class="addon-deposit">· Cọc tại quầy ${escapeHtml(formatVnd(e.depositVnd))}</span>` : ''}
                      </div>
                    </div>
                    <div class="addon-stepper">
                      <button type="button" class="addon-step-btn addon-step-minus" data-action="minus" aria-label="Giảm 1">−</button>
                      <input
                        type="number"
                        class="addon-qty-input"
                        name="addon:${escapeHtml(b.booking_code)}:${escapeHtml(e.id)}"
                        value="0"
                        min="0"
                        max="${Math.max(1, e.stockQuantity)}"
                        step="1"
                        data-addon-price="${e.priceVnd}"
                        data-ticket-code="${escapeHtml(b.booking_code)}"
                        aria-label="Số lượng ${escapeHtml(e.name)} cho vé ${i + 1}"
                      />
                      <button type="button" class="addon-step-btn addon-step-plus" data-action="plus" aria-label="Tăng 1">+</button>
                    </div>
                  </div>
                `).join('') || '<p class="addon-empty-hint">Hiện chưa có dụng cụ khả dụng.</p>'}
              </div>
            </details>
          ` : `<a href="/don-dat/${encodeURIComponent(b.booking_code)}" class="btn-text">Chi tiết vé & hoàn tiền →</a>`}
        </div>

        <div class="ticket-money">
          <strong>${escapeHtml(formatVnd(b.total_amount_vnd))}</strong>
          ${b.discount_amount_vnd || b.member_discount_vnd ? `<small>Đã gồm ưu đãi ${escapeHtml(formatVnd((b.discount_amount_vnd || 0) + (b.member_discount_vnd || 0)))}</small>` : ''}
          ${paid && ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.booking_status) ? `
            <div class="ticket-qr-wrap">
              <div class="ticket-qr">${renderQrCodeSvg(`${config.appBaseUrl}/quan-tri/soat-ve/${b.booking_code}`, 136)}</div>
              <span class="ticket-qr-hint">Mã soát vé nhận sân</span>
              <a href="/don-dat/${encodeURIComponent(b.booking_code)}/in-ve" target="_blank" rel="noopener" class="ticket-print-link">In vé</a>
            </div>
          ` : ''}
        </div>
      </article>`).join('')}</div>

      ${editable ? `
        <div class="checkout-columns">
          <section class="checkout-contact">
            <h2>Người nhận sân</h2>
            <label>Họ và tên<input class="text-input" name="contactName" value="${escapeHtml(tickets[0].contact_name)}" required minlength="2" maxlength="150"></label>
            <label>Số điện thoại<input class="text-input" type="tel" name="contactPhone" value="${escapeHtml(tickets[0].contact_phone)}" required></label>
            <label>Email<input class="text-input" type="email" name="contactEmail" value="${escapeHtml(tickets[0].contact_email)}"></label>

            <!-- Cụm nhập mã ưu đãi: Nút áp dụng dạng button hiển thị chung một ô -->
            <div class="checkout-coupon-field-wrap">
              <label for="group-coupon" class="coupon-label">Mã ưu đãi</label>
              <div class="coupon-input-group">
                <input
                  type="text"
                  class="coupon-input"
                  name="couponCode"
                  id="group-coupon"
                  placeholder="Nhập mã ưu đãi..."
                  maxlength="80"
                  autocomplete="off"
                />
                <button type="button" class="btn-coupon-apply" id="group-apply-coupon">Áp dụng</button>
              </div>
              <p id="group-coupon-message" role="status" class="coupon-msg"></p>

              <!-- Mã ưu đãi công khai đang hiển thị bên dưới -->
              ${coupons && coupons.length > 0 ? `
                <div class="public-coupons-wrap">
                  <span class="public-coupons-title">Mã ưu đãi công khai có sẵn (Bấm để áp dụng):</span>
                  <div class="public-coupons-list">
                    ${coupons.map(cp => `
                      <button
                        type="button"
                        class="public-coupon-chip js-group-coupon-chip"
                        data-coupon-code="${escapeHtml(cp.code)}"
                        title="${escapeHtml(cp.description || cp.title)}"
                      >
                        <span class="coupon-chip-icon">🏷️</span>
                        <strong class="coupon-chip-code">${escapeHtml(cp.code)}</strong>
                        <span class="coupon-chip-desc">${cp.discount_type === 'PERCENT' ? `Giảm ${cp.discount_value}%` : `Giảm ${escapeHtml(formatVnd(cp.discount_value))}`}${cp.min_order_amount_vnd ? ` (từ ${Math.round(cp.min_order_amount_vnd / 1000)}k)` : ''}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </section>

          <aside class="checkout-summary" data-member-total="${member}" data-base-total="${tickets.reduce((n, b) => n + b.quoted_price_vnd, 0)}">
            <h2>Tổng thanh toán</h2>
            <dl>
              <div><dt>Tiền sân</dt><dd>${formatVnd(tickets.reduce((n, b) => n + b.quoted_price_vnd, 0))}</dd></div>
              <div><dt>Dịch vụ thêm</dt><dd id="group-service-total">0 ₫</dd></div>
              <div><dt>Ưu đãi hội viên</dt><dd>−${formatVnd(member)}</dd></div>
              <div><dt>Mã ưu đãi</dt><dd id="group-discount-total">0 ₫</dd></div>
              <div class="checkout-grand-total">
                <dt>${tickets.length} vé</dt>
                <dd id="group-total">${formatVnd(group.total_amount_vnd - member)}</dd>
              </div>
            </dl>
            <label>Phương thức
              <select name="paymentMethod" class="text-input">
                <option value="QR_PAY">Quét QR ngân hàng</option>
                <option value="ATM_CARD">Thẻ ngân hàng nội địa</option>
                <option value="INT_CARD">Thẻ quốc tế</option>
              </select>
            </label>
            <p>Mỗi vé được hủy riêng theo chính sách ghi trên vé. Hoàn phần tiền thực trả của vé, không tính lại ưu đãi vé khác.</p>
            <button type="submit" class="btn-pill-dark">Thanh toán ${tickets.length} vé</button>
            <a href="/gio-hang">Trở về giỏ</a>
          </aside>
        </div>
      ` : pending ? `
        <div class="checkout-summary">
          <h2>Tiếp tục thanh toán</h2>
          <p>Thông tin và ưu đãi đã chốt cho ${tickets.length} vé.</p>
          <strong class="num">${formatVnd(group.total_amount_vnd)}</strong>
          <button type="submit" class="btn-pill-dark">Mở lại cổng thanh toán</button>
        </div>
      ` : `
        <p class="group-receipt">Tổng giao dịch: <strong>${formatVnd(group.total_amount_vnd)}</strong> · ${tickets.length} vé</p>
      `}
    </form>
    ${paid ? `<script type="application/json" id="paid-cart-slots">${JSON.stringify(tickets.map(b => ({ courtId: b.court_id, date: b.booking_date, startHour: b.start_hour, endHour: b.end_hour }))).replace(/</g, '\\u003c')}</script>` : ''}
  </section>`;
}
