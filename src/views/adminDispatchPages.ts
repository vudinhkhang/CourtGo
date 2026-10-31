import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { BookingRecord } from '../services/bookingService.js';
import {
  formatSlotRange,
  formatVnd,
  formatVietnamDateDisplay,
  formatVietnamDateTimeDisplay,
  getServerNow,
} from '../utils/time.js';
import { inlineIcon } from './icons.js';

export function renderCounterDispatchStationPage(data: {
  session: SessionContext;
  booking: BookingRecord;
  events: Array<{
    id: string;
    event_type: string;
    message_vi: string;
    actor_role: string;
    created_at: string | Date;
  }>;
}): string {
  const { session, booking, events } = data;
  const csrfToken = session.csrfToken;
  const dateDisplay = formatVietnamDateDisplay(booking.booking_date);
  const now = getServerNow();

  // Đánh giá thời gian ca chơi
  const startTime = new Date(booking.slot_start_at).getTime();
  const endTime = new Date(booking.slot_end_at).getTime();
  const nowTime = now.getTime();

  let timeAlertHtml = '';
  if (booking.booking_status === 'COMPLETED') {
    timeAlertHtml = `
      <div style="background:#f1f5f9; border-left:4px solid #64748b; padding:12px 18px; border-radius:0 10px 10px 0; color:#334155; font-size:14px; font-weight:600;">
         Ca chơi này đã hoàn tất và sân đã được giải phóng.
      </div>
    `;
  } else if (nowTime < startTime) {
    const minutesLeft = Math.round((startTime - nowTime) / (60 * 1000));
    timeAlertHtml = `
      <div style="background:#eff6ff; border-left:4px solid #0052ff; padding:12px 18px; border-radius:0 10px 10px 0; color:#1e40af; font-size:14px; font-weight:600;">
        ⏳ Ca chơi sắp diễn ra (còn khoảng ${minutesLeft} phút nữa). Hãy chuẩn bị sân cho khách.
      </div>
    `;
  } else if (nowTime >= startTime && nowTime <= endTime) {
    const minutesEnd = Math.round((endTime - nowTime) / (60 * 1000));
    timeAlertHtml = `
      <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:12px 18px; border-radius:0 10px 10px 0; color:#15803d; font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px;">
        <span style="width:10px; height:10px; border-radius:50%; background:#16a34a; display:inline-block; animation:pulse 2s infinite;"></span>
        <span> Ca chơi đang trong khung giờ thi đấu (còn ${minutesEnd} phút nữa hết giờ).</span>
      </div>
    `;
  } else {
    timeAlertHtml = `
      <div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:12px 18px; border-radius:0 10px 10px 0; color:#b45309; font-size:14px; font-weight:600;">
         Ca chơi này đã quá khung giờ kết thúc niêm yết (${escapeHtml(formatSlotRange(booking.start_hour, booking.end_hour))}). Vui lòng kiểm tra và hoàn tất ca chơi.
      </div>
    `;
  }

  const depositVnd = booking.equipment_deposit_vnd || 0;
  const isDepositRefunded = booking.deposit_refunded;

  return `
    <div style="max-width: 1040px; margin: 0 auto 48px auto;">
      <!-- Thanh điều hướng quay lại -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
        <a href="/quan-tri/don-dat?search=${encodeURIComponent(booking.booking_code)}" class="btn-text" style="font-size:14px; font-weight:600;">
          ${inlineIcon('back', 16)}
          <span>Quay lại Quản lý đơn đặt sân</span>
        </a>
        <div style="display:flex; gap:8px;">
          <a href="/don-dat/${encodeURIComponent(booking.booking_code)}" target="_blank" class="btn-pill-outline" style="font-size:12.5px; padding:6px 14px;">
             Xem vé khách hàng
          </a>
        </div>
      </div>

      <!-- Header trạm soát vé & điều phối quầy -->
      <div class="flat-panel" style="background:#ffffff; color:#243142; border-radius:18px; padding:28px 32px; margin-bottom: 24px; border:1px solid rgba(0, 82, 255, 0.4); box-shadow:none;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(0,82,255,0.3); border:1px solid rgba(0,82,255,0.6); padding:4px 12px; border-radius:999px; font-size:12px; font-weight:500; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:10px;">
              <span> Nhận sân (COUNTER DISPATCH)</span>
            </div>
            <h1 style="font-size: 26px; font-weight: 600; color: #243142; letter-spacing: -0.01em; margin: 0 0 6px 0;">
              Đơn ${escapeHtml(booking.booking_code)}
            </h1>
            <div style="font-size: 14.5px; color: rgba(255,255,255,0.85);">
              Sân: <strong style="color:#243142;">${escapeHtml(booking.court_name_snapshot)}</strong> · Ca: <strong style="color:#60a5fa;">${escapeHtml(formatSlotRange(booking.start_hour, booking.end_hour))}</strong> · Ngày: <strong>${escapeHtml(dateDisplay)}</strong>
            </div>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 12px; color: rgba(255,255,255,0.7); text-transform:uppercase; font-weight:600;">Trạng thái vận hành hiện tại</div>
            <div style="margin-top:4px;">
              ${
                booking.booking_status === 'CONFIRMED'
                  ? `<span class="badge badge-success" style="font-size:13px; padding:6px 14px; background:#10b981; color:#243142;"> CHỜ NHẬN SÂN (CONFIRMED)</span>`
                  : booking.booking_status === 'CHECKED_IN'
                    ? `<span class="badge badge-primary" style="font-size:13px; padding:6px 14px; background:#0052ff; color:#243142;"> ĐÃ NHẬN SÂN (CHECKED_IN)</span>`
                    : booking.booking_status === 'COMPLETED'
                      ? `<span class="badge" style="font-size:13px; padding:6px 14px; background:#64748b; color:#243142;"> ĐÃ HOÀN TẤT (COMPLETED)</span>`
                      : `<span class="badge" style="font-size:13px; padding:6px 14px;">${escapeHtml(booking.booking_status)}</span>`
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Thẻ cảnh báo tiến trình thời gian ca chơi -->
      <div style="margin-bottom: 24px;">
        ${timeAlertHtml}
      </div>

      <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: start;" class="counter-grid">
        <!-- CỘT TRÁI: HỒ SƠ KHÁCH HÀNG & CÁC THAO TÁC ĐIỀU PHỐI -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Khối thông tin khách hàng nhận sân -->
          <section class="flat-panel">
            <h2 style="font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 16px; display:flex; align-items:center; gap:8px;">
              <span></span>
              <span>Thông Tin Khách Hàng Nhận Sân</span>
            </h2>

            <div class="grid-2" style="margin-bottom: 16px;">
              <div>
                <div class="caption-text">Họ và tên khách hàng</div>
                <div style="font-size:17px; font-weight:500; color:#0f172a; margin-top:2px;">
                  ${escapeHtml(booking.contact_name)}
                </div>
              </div>
              <div>
                <div class="caption-text">Số điện thoại liên hệ</div>
                <div style="font-size:17px; font-weight:500; color:#0052ff; margin-top:2px; display:flex; align-items:center; gap:10px;">
                  <span class="num">${escapeHtml(booking.contact_phone)}</span>
                  <a href="tel:${escapeHtml(booking.contact_phone)}" class="btn-pill-dark" style="padding:4px 10px; font-size:12px; background:#10b981; border:none;" title="Gọi điện thoại cho khách">
                     Gọi ngay
                  </a>
                </div>
              </div>
            </div>

            <div class="grid-2" style="border-top:1px solid #f1f5f9; padding-top:14px;">
              <div>
                <div class="caption-text">Email</div>
                <div style="font-size:14px; color:#475569;">${escapeHtml(booking.contact_email)}</div>
              </div>
              <div>
                <div class="caption-text">Tiền thuê sân (Đã thanh toán)</div>
                <div class="num" style="font-size:16px; font-weight:600; color:#10b981;">
                   ${escapeHtml(formatVnd(booking.total_amount_vnd))}
                </div>
              </div>
            </div>
          </section>

          <!-- Khối thao tác 1 chạm: Nhận sân & Đóng ca chơi -->
          <section class="flat-panel" style="border:1.5px solid #0052ff; background:#ffffff;">
            <h2 style="font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
              <span></span>
              <span>Hành Động Soát Vé 1 Chạm</span>
            </h2>
            <p style="font-size:13px; color:#64748b; margin-bottom:16px;">
              Chuyển đổi trạng thái nhanh theo quy trình đón tiếp khách tại sân.
            </p>

            <div style="display:flex; flex-direction:column; gap:12px;">
              ${
                booking.booking_status === 'CONFIRMED'
                  ? `
                    <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(booking.booking_code)}/thao-tac">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                      <input type="hidden" name="action" value="CHECK_IN" />
                      <button type="submit" class="btn-pill-dark" style="width:100%; background:#10b981; color:#243142; font-size:16px; font-weight:600; padding:14px; border:none; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 14px rgba(16,185,129,0.3);">
                        <span></span>
                        <span>Xác nhận nhận sân</span>
                      </button>
                    </form>
                  `
                  : booking.booking_status === 'CHECKED_IN'
                    ? `
                      <div style="padding:12px 16px; background:#eff6ff; border-radius:10px; border:1px solid #bfdbfe; font-size:14px; color:#1e40af; margin-bottom:6px; font-weight:600;">
                         Khách đã nhận sân lúc ${booking.checked_in_at ? escapeHtml(formatVietnamDateTimeDisplay(booking.checked_in_at)) : 'N/A'}.
                      </div>
                      <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(booking.booking_code)}/thao-tac" onsubmit="return confirm('Xác nhận khách đã chơi xong và giải phóng sân?');">
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                        <input type="hidden" name="action" value="COMPLETE" />
                        <button type="submit" class="btn-pill-dark" style="width:100%; background:#0f172a; color:#243142; font-size:15px; font-weight:500; padding:13px; border:none; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:8px;">
                          <span></span>
                          <span>HOÀN TẤT CA CHƠI &amp; GIẢI PHÓNG SÂN</span>
                        </button>
                      </form>
                    `
                    : `
                      <div style="padding:12px 16px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0; font-size:14px; color:#475569; font-weight:600;">
                        Đơn đặt sân đã ở trạng thái kết thúc (${escapeHtml(booking.booking_status)}).
                      </div>
                    `
              }
            </div>
          </section>

          <!-- Khối ghi chú điều phối của nhân viên tại quầy -->
          <section class="flat-panel">
            <h2 style="font-size: 16px; font-weight: 500; color: #0f172a; margin-bottom: 10px;">
               Ghi Chú Vận Hành Tại Quầy
            </h2>
            <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(booking.booking_code)}/thao-tac">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <input type="hidden" name="action" value="SAVE_NOTE" />
              <div class="form-group" style="margin-bottom:12px;">
                <textarea name="counterNote" rows="3" class="text-input" style="width:100%; resize:vertical; font-family:inherit;" placeholder="Ghi chú nhân viên (vd: Khách đổi sang sân 4 theo yêu cầu, khách mượn thêm 1 rổ bóng...)...">${escapeHtml(booking.counter_note || '')}</textarea>
              </div>
              <button type="submit" class="btn-pill-outline" style="font-size:13px; padding:6px 16px;">
                 Lưu ghi chú
              </button>
            </form>
          </section>

          <!-- Lối tắt Đổi sân nhanh & POS Bán thêm nước/phụ kiện -->
          <section class="flat-panel" style="background:#f8fafc; border:1px dashed #cbd5e1;">
            <h2 style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 6px;">
               Nghiệp Vụ Mở Rộng Tại Quầy (POS &amp; Đổi Sân)
            </h2>
            <p style="font-size:12.5px; color:#64748b; margin-bottom:12px;">
              Khách muốn mua thêm nước uống, cầu lẻ hoặc đổi sang sân trống khác cùng giờ?
            </p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <a
                href="/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(booking.booking_date)}&hour=${booking.start_hour}#pos-addon-section"
                class="btn-pill-dark"
                style="font-size:12.5px; padding:7px 14px;"
              >
                 Bán thêm Nước / Phụ kiện (POS)
              </a>
              <a
                href="/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(booking.booking_date)}&hour=${booking.start_hour}"
                class="btn-pill-outline"
                style="font-size:12.5px; padding:7px 14px;"
              >
                 Đổi sân trên Sơ đồ 18 Sân
              </a>
            </div>
          </section>
        </div>

        <!-- CỘT PHẢI: QUẢN LÝ DỤNG CỤ THUÊ, TIỀN CỌC & NHẬT KÝ SỰ KIỆN -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Panel Quản lý Dụng cụ thuê & Tiền cọc thiết bị -->
          <section class="flat-panel" style="border:1.5px solid #f59e0b; background:#fffcf5;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <h2 style="font-size: 16px; font-weight: 600; color: #92400e; margin:0; display:flex; align-items:center; gap:8px;">
                <span></span>
                <span>Dụng cụ &amp; tiền cọc</span>
              </h2>
              ${
                depositVnd > 0
                  ? isDepositRefunded
                    ? `<span class="badge badge-success" style="font-size:11.5px;"> ĐÃ HOÀN CỌC</span>`
                    : `<span class="badge badge-warning" style="font-size:11.5px; background:#fef3c7; color:#92400e;">ĐANG GIỮ CỌC</span>`
                  : `<span class="badge" style="font-size:11.5px;">CHƯA CÓ CỌC</span>`
              }
            </div>

            <!-- Tình trạng cọc hiện tại -->
            <div style="background:#ffffff; border:1px solid #fef3c7; border-radius:12px; padding:14px; margin-bottom:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:13px; color:#78350f;">Tiền cọc thiết bị:</span>
                <span class="num" style="font-size:18px; font-weight:600; color:#b45309;">${escapeHtml(formatVnd(depositVnd))}</span>
              </div>
              <div style="font-size:13px; color:#475569;">
                Dụng cụ mượn: <strong>${escapeHtml(booking.equipment_rented_summary || 'Chưa ghi nhận')}</strong>
              </div>

              ${
                depositVnd > 0 && !isDepositRefunded
                  ? `
                    <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #fde68a;">
                      <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(booking.booking_code)}/thao-tac" onsubmit="return confirm('Xác nhận đã nhận lại đầy đủ dụng cụ và hoàn tiền cọc ${formatVnd(depositVnd)} cho khách?');">
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                        <input type="hidden" name="action" value="REFUND_DEPOSIT" />
                        <button type="submit" class="btn-pill-dark" style="width:100%; background:#10b981; color:#243142; font-size:13.5px; font-weight:500; padding:9px; border:none; border-radius:8px;">
                           Đã nhận lại đồ &amp; Hoàn cọc cho khách
                        </button>
                      </form>
                    </div>
                  `
                  : depositVnd > 0 && isDepositRefunded
                    ? `
                      <div style="margin-top:10px; font-size:12px; color:#15803d; font-weight:600;">
                         Đã hoàn cọc lúc: ${booking.deposit_refunded_at ? escapeHtml(formatVietnamDateTimeDisplay(booking.deposit_refunded_at)) : 'Đã tất toán'}
                      </div>
                    `
                    : ''
              }
            </div>

            <!-- Form cập nhật dụng cụ bàn giao & nhận cọc -->
            <details style="background:#ffffff; border:1px solid #fed7aa; border-radius:10px; padding:12px 14px;">
              <summary style="font-size:13.5px; font-weight:500; color:#9a3412; cursor:pointer;">
                 Cập nhật bàn giao dụng cụ &amp; nhận cọc mới
              </summary>
              <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(booking.booking_code)}/thao-tac" style="margin-top:12px;">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                <input type="hidden" name="action" value="HANDOVER_EQUIPMENT" />

                <div class="form-group" style="margin-bottom:10px;">
                  <label class="form-label" style="font-size:12.5px;">Dụng cụ bàn giao</label>
                  <input type="text" name="equipmentRentedSummary" readonly value="${escapeHtml(booking.equipment_rented_summary || '')}" placeholder="Vd: 2 Vợt Pro Yonex, 1 Đôi giày size 42" class="text-input" style="font-size:13px; padding:8px 10px;" />
                </div>

                <div class="form-group" style="margin-bottom:12px;">
                  <label class="form-label" style="font-size:12.5px;">Tiền cọc giữ tại quầy (VNĐ)</label>
                  <input type="number" step="10000" min="0" name="equipmentDepositVnd" readonly value="${depositVnd}" class="text-input" style="font-size:13px; padding:8px 10px;" />
                </div>

                <button type="submit" class="btn-pill-dark" style="font-size:13px; padding:7px 16px; background:#d97706; border:none;">
                  Cập nhật dụng cụ &amp; cọc
                </button>
              </form>
            </details>
          </section>

          <!-- Dòng thời gian lịch sử thao tác -->
          <section class="flat-panel">
            <h2 style="font-size: 16px; font-weight: 500; color: #0f172a; margin-bottom: 12px; display:flex; align-items:center; gap:8px;">
              <span></span>
              <span>Nhật Ký Thao Tác Đơn</span>
            </h2>

            <ul class="timeline-list" style="max-height: 380px; overflow-y: auto;">
              ${events
                .map(
                  (ev) => `
                <li class="timeline-item">
                  <div class="caption-text num">${escapeHtml(formatVietnamDateTimeDisplay(ev.created_at))}</div>
                  <div class="body-sm" style="font-weight:500; margin-top:2px; font-size:13px;">${escapeHtml(ev.message_vi)}</div>
                </li>
              `
                )
                .join('')}
            </ul>
          </section>
        </div>
      </div>
    </div>
  `;
}
