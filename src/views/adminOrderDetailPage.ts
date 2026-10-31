import { orderStatus, orderSchedule, orderContact, orderPayment, orderHistory } from './orderPresentation.js';
import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { BookingRecord, COUNTER_REFUND_RATES } from '../services/bookingService.js';
import {
  formatVnd,
  formatVietnamDateTimeDisplay,
  getServerNow,
} from '../utils/time.js';
import { inlineIcon } from './icons.js';
import { canPrintBookingTicket } from './bookingTicket.js';

export function renderAdminOrderDetailPage(data: {
  session: SessionContext;
  booking: BookingRecord;
  events: Array<{
    id: string;
    event_type: string;
    message_vi: string;
    actor_role: string;
    created_at: string | Date;
  }>;
  verifiedPaidAmountVnd?: number;
}): string {
  const { session, booking, events } = data;
  const code = encodeURIComponent(booking.booking_code);
  const csrf = `<input type="hidden" name="_csrf" value="${escapeHtml(session.csrfToken)}" />`;
  const actionUrl = `/quan-tri/soat-ve/${code}/thao-tac`;
  const deposit = booking.equipment_deposit_vnd || 0;
  const paidBase = data.verifiedPaidAmountVnd ?? booking.total_amount_vnd;
  const canRefund = booking.booking_status === 'CONFIRMED' && booking.payment_status === 'PAID';
  const active = ['CONFIRMED', 'CHECKED_IN'].includes(booking.booking_status);
  const now = getServerNow().getTime();
  const withinWindow=!booking.ticket_id || (now>=new Date(booking.slot_start_at).getTime()-1800000 && now<new Date(booking.slot_end_at).getTime());
  const notice = !withinWindow && booking.booking_status==='CONFIRMED' ? 'Vé chỉ được nhận sân từ 30 phút trước giờ bắt đầu đến trước giờ kết thúc ca.' : booking.booking_status === 'CANCELLED'
    ? `Đơn đã hủy. ${booking.cancel_reason || ''}`
    : booking.booking_status === 'COMPLETED' ? 'Ca chơi đã hoàn tất.'
    : active && now > new Date(booking.slot_end_at).getTime() ? 'Đã qua giờ chơi. Kiểm tra tình trạng sân trước khi hoàn tất đơn.'
    : booking.booking_status === 'CHECKED_IN' && booking.checked_in_at ? `Khách nhận sân lúc ${formatVietnamDateTimeDisplay(booking.checked_in_at)}.` : '';
  return `<div class="order-page">
    <a class="order-back" href="/quan-tri/don-dat">${inlineIcon('back',16)} Danh sách đơn đặt</a>
    <header class="order-header"><div><p class="order-muted">Chi tiết đơn</p><h1>${escapeHtml(booking.booking_code)}</h1></div>
      <div class="order-actions">${orderStatus(booking)}${canPrintBookingTicket(booking) ? `<a class="btn-pill-outline" href="/don-dat/${code}/in-ve" target="_blank" rel="noopener">In vé</a>` : ''}</div></header>
    ${notice ? `<p class="order-notice">${escapeHtml(notice)}</p>` : ''}
    <div class="order-grid"><div class="order-stack">
      ${orderSchedule(booking)}${orderContact(booking)}
      <section class="order-panel"><div class="order-section-head"><h2>Dụng cụ &amp; tiền cọc</h2>${deposit ? `<span class="order-muted">${booking.deposit_refunded ? 'Đã hoàn cọc' : 'Chưa hoàn cọc'}</span>` : ''}</div>
        <p>${escapeHtml(booking.equipment_rented_summary || 'Chưa ghi nhận dụng cụ thuê.')}</p>
        <dl class="order-totals"><div><dt>Cọc tại quầy</dt><dd>${escapeHtml(formatVnd(deposit))}</dd></div></dl>
        ${deposit > 0 && !booking.deposit_refunded ? `<form class="order-form" method="POST" action="${actionUrl}" onsubmit="return confirm('Xác nhận đã nhận lại dụng cụ và hoàn cọc cho khách?');">${csrf}<input type="hidden" name="action" value="REFUND_DEPOSIT" /><div class="order-actions"><button class="btn-pill-outline">Nhận lại dụng cụ &amp; hoàn cọc</button></div></form>` : ''}
        <details class="order-disclosure order-form"><summary>Cập nhật bàn giao</summary><form method="POST" action="${actionUrl}" class="order-form">${csrf}<input type="hidden" name="action" value="HANDOVER_EQUIPMENT" />
          <label for="handover-items">Dụng cụ bàn giao<input id="handover-items" name="equipmentRentedSummary" class="text-input" value="${escapeHtml(booking.equipment_rented_summary || '')}" placeholder="Ví dụ: 2 vợt, 1 đôi giày" /></label>
          <label for="handover-deposit">Tiền cọc (₫)<input id="handover-deposit" type="number" name="equipmentDepositVnd" min="0" step="10000" value="${deposit}" class="text-input" /></label>
          <div class="order-actions"><button class="btn-pill-outline">Lưu bàn giao</button></div></form></details>
      </section>
      <section class="order-panel"><h2>Ghi chú nội bộ</h2><form method="POST" action="${actionUrl}" class="order-form">${csrf}<input type="hidden" name="action" value="SAVE_NOTE" />
        <label class="sr-only" for="counter-note">Ghi chú nội bộ</label><textarea id="counter-note" name="counterNote" rows="3" class="text-input" placeholder="Nội dung cần lưu ý cho ca trực">${escapeHtml(booking.counter_note || '')}</textarea>
        <div class="order-actions"><button class="btn-pill-outline">Lưu ghi chú</button></div></form></section>
      ${orderHistory(events)}
    </div><aside class="order-stack">
      <section class="order-panel order-action-panel"><h2>Xử lý đơn</h2><div class="order-actions">
        ${booking.booking_status === 'CONFIRMED' && booking.payment_status === 'PAID' ? `<form method="POST" action="${actionUrl}">${csrf}<input type="hidden" name="action" value="CHECK_IN" /><button class="btn-pill-dark" ${withinWindow?'':'disabled'}>Xác nhận nhận sân</button></form>`
          : booking.booking_status === 'CHECKED_IN' ? `<form method="POST" action="${actionUrl}" onsubmit="return confirm('Xác nhận khách đã trả sân và kết thúc ca chơi?');">${csrf}<input type="hidden" name="action" value="COMPLETE" /><button class="btn-pill-dark">Hoàn tất ca chơi</button></form>`
          : '<p class="order-muted">Không có thao tác nhận hoặc trả sân ở trạng thái này.</p>'}
      </div><p class="order-muted order-address"><a href="/quan-tri/quet-qr">Quét vé khác</a></p></section>
      ${orderPayment(booking)}
      ${canRefund ? `<details class="order-panel order-disclosure"><summary>Hủy đơn &amp; hoàn tiền</summary><p class="order-muted">Chọn mức hoàn sau khi xác nhận lý do với khách.</p>
        <form method="POST" action="/quan-tri/don-dat/${code}/huy-hoan" class="order-form" onsubmit="return confirm('Xác nhận hủy đơn và thực hiện khoản hoàn đã chọn?');">${csrf}
          <fieldset><legend>Mức hoàn</legend><div class="order-radio-group order-refund-options">${COUNTER_REFUND_RATES.map(pct => `<label><input type="radio" name="ratePct" value="${pct}" ${pct===100?'checked':''} onchange="updateRefundAmt(${paidBase},${pct})" />${pct}%</label>`).join('')}</div></fieldset>
          <fieldset><legend>Hình thức hoàn</legend><div class="order-radio-group"><label><input type="radio" name="method" value="CASH" checked />Tiền mặt tại quầy</label><label><input type="radio" name="method" value="ORIGINAL_METHOD" />Phương thức thanh toán ban đầu</label></div></fieldset>
          <label for="refund-reason">Lý do hủy<input id="refund-reason" name="reason" class="text-input" required minlength="5" placeholder="Ít nhất 5 ký tự" /></label>
          <dl class="order-totals"><div><dt>Số tiền hoàn</dt><dd id="preview-refund-amt">${escapeHtml(formatVnd(paidBase))}</dd></div></dl>
          <button class="btn-pill-danger">Xác nhận hủy &amp; hoàn tiền</button></form></details>` : ''}
    </aside></div></div>
    <script>function updateRefundAmt(base,pct){var el=document.getElementById('preview-refund-amt');if(el)el.textContent=new Intl.NumberFormat('vi-VN').format(Math.round(base*pct/100))+' ₫';}</script>`;
}
