import { escapeHtml } from '../utils/security.js';
import {
  formatSlotRange,
  formatVietnamDateDisplay,
  formatVietnamDateTimeDisplay,
  formatVnd,
} from '../utils/time.js';
import { SessionContext } from '../services/authService.js';
import { EquipmentItem } from '../services/equipmentService.js';
import {
  CustomerReviewRecord,
  DetailedRevenueBreakdown,
  LiveCourtsMonitorSummary,
  OperationalMetrics,
  ShiftHandoverRecord,
  StaffAuditLogEntry,
} from '../services/adminService.js';
import { formatRoleVi, sectionHeading } from './layout.js';
import { iconBadge } from './icons.js';

/**
 * 1. MÀN HÌNH TRỰC QUAN 18 SÂN THỜI GIAN THỰC + WALK-IN POS + BÁN LẺ NƯỚC/PHỤ KIỆN + ĐỔI SÂN NHANH
 */
export function renderAdminLiveCourtMonitorPage(data: {
  session: SessionContext;
  monitor: LiveCourtsMonitorSummary;
  equipmentItems: EquipmentItem[];
  preselectCourtId?: string;
}): string {
  const { session, monitor, equipmentItems, preselectCourtId } = data;
  const csrfToken = session.csrfToken;
  const availableCourts = monitor.courts.filter((c) => c.slotStatus === 'AVAILABLE');
  const activeBookingsOnSlot = monitor.courts.filter(
    (c) => c.booking && (c.slotStatus === 'CONFIRMED' || c.slotStatus === 'CHECKED_IN')
  );

  const hourButtons: string[] = [];
  for (let h = 5; h <= 23; h++) {
    const isSel = h === monitor.selectedHour;
    const isNow = h === monitor.currentVietnamHour;
    hourButtons.push(`
      <a
        href="/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(monitor.dateStr)}&hour=${h}"
        style="padding:7px 12px; border-radius:8px; font-size:12.5px; font-weight:500; border:1px solid ${
          isSel ? '#0052ff' : isNow ? '#10b981' : '#e2e8f0'
        }; background:${isSel ? '#0052ff' : isNow ? '#ecfdf5' : '#ffffff'}; color:${
          isSel ? '#ffffff' : isNow ? '#065f46' : '#334155'
        }; text-decoration:none; white-space:nowrap;"
      >
        ${String(h).padStart(2, '0')}:00${isNow ? ' ●' : ''}
      </a>
    `);
  }

  return `
    ${sectionHeading({
      level: 'h2',
      title: 'Điều phối',
      subtitle: `Theo dõi sân, tạo đơn tại quầy và chuyển sân.`,

      tone: 'blue',
    })}

    <!-- Thanh chọn Ngày & Khung giờ điều phối -->
    <section class="flat-panel" style="margin-bottom: 20px; padding: 16px 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:14px;">
        <form method="GET" action="/quan-tri/dieu-phoi-18-san" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <label for="live-date" style="font-size:13px; font-weight:500; color:#334155;">Ngày trực sân:</label>
          <input
            type="date"
            id="live-date"
            name="date"
            value="${escapeHtml(monitor.dateStr)}"
            class="text-input"
            style="width:auto; min-height:38px; padding:6px 12px;"
            onchange="this.form.submit()"
          />
          <input type="hidden" name="hour" value="${monitor.selectedHour}" />
          <button type="submit" class="btn-pill-dark" style="min-height:38px; padding:6px 14px; font-size:13px;">Xem</button>
          <a href="/quan-tri/dieu-phoi-18-san" class="btn-pill-outline" style="min-height:38px; padding:6px 14px; font-size:13px;">Về giờ hiện tại</a>
        </form>

        <!-- Thống kê nhanh 18 sân trong khung giờ đang chọn -->
        <div style="display:flex; gap:10px; flex-wrap:wrap; font-size:12.5px; font-weight:500;">
          <span style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; padding:5px 12px; border-radius:999px;">
             Trống: ${monitor.counts.available} sân
          </span>
          <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:5px 12px; border-radius:999px;">
             Đang thi đấu: ${monitor.counts.playing} sân
          </span>
          <span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:5px 12px; border-radius:999px;">
             Chờ nhận sân: ${monitor.counts.waitingCheckIn} sân
          </span>
          <span style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:5px 12px; border-radius:999px;">
             Đã hoàn tất: ${monitor.counts.completed}
          </span>
          <span style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:5px 12px; border-radius:999px;">
             Bảo trì: ${monitor.counts.blocked}
          </span>
        </div>
      </div>

      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;">
        ${hourButtons.join('')}
      </div>
    </section>

    <!-- LƯỚI TRỰC QUAN 18 SÂN (LIVE COURT GRID) -->
    <section style="margin-bottom: 28px;" aria-label="Sơ đồ trạng thái 18 sân">
      <div class="monitor-grid">
        ${monitor.courts
          .map((item) => {
            const b = item.booking;
            let borderCol = '#10b981';
            let headerBg = '#ecfdf5';
            let headerColor = '#065f46';
            let statusBadge = 'Trống';

            if (item.slotStatus === 'CHECKED_IN') {
              borderCol = '#0052ff';
              headerBg = '#eff6ff';
              headerColor = '#1e40af';
              statusBadge = `Đang chơi${item.remainingMinutes !== null ? ` (Còn ~${item.remainingMinutes}p)` : ''}`;
            } else if (item.slotStatus === 'CONFIRMED') {
              borderCol = item.isLateCheckIn ? '#ea580c' : '#f59e0b';
              headerBg = item.isLateCheckIn ? '#fff7ed' : '#fffbeb';
              headerColor = item.isLateCheckIn ? '#9a3412' : '#92400e';
              statusBadge = item.isLateCheckIn ? 'Chưa nhận sân · trễ giờ' : 'Chờ nhận sân';
            } else if (item.slotStatus === 'COMPLETED') {
              borderCol = '#94a3b8';
              headerBg = '#f1f5f9';
              headerColor = '#475569';
              statusBadge = 'Hoàn tất';
            } else if (item.slotStatus === 'BLOCKED') {
              borderCol = '#ef4444';
              headerBg = '#fef2f2';
              headerColor = '#991b1b';
              statusBadge = 'Bảo trì';
            }

            return `
              <div class="flat-panel monitor-card" style="padding:0; overflow:hidden; border:1px solid #dce3eb; border-left:3px solid ${borderCol}; border-radius:7px; display:flex; flex-direction:column; justify-content:space-between; background:#ffffff;">
                <div>
                  <div class="monitor-card-head">
                    <strong style="font-size:15px; font-weight:600;">${escapeHtml(item.courtName)}</strong>
                    <span class="monitor-state" style="color:${headerColor};background:${headerBg}">${statusBadge}</span>
                  </div>

                  <div style="padding:14px;">
                    ${
                      item.slotStatus === 'AVAILABLE'
                        ? `
                          <div style="font-size:13px; color:#475569; margin-bottom:12px;">
                            ${escapeHtml(formatSlotRange(monitor.selectedHour))}
                          </div>
                        `
                        : item.slotStatus === 'BLOCKED'
                          ? `
                            <div style="font-size:13px; color:#991b1b; font-weight:600; margin-bottom:8px;">
                              Lý do: ${escapeHtml(item.blockReason || 'Đang bảo trì kỹ thuật')}
                            </div>
                          `
                          : b
                            ? `
                              <div style="margin-bottom:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                  <a href="/quan-tri/soat-ve/${encodeURIComponent(b.booking_code)}" style="font-weight:600; font-size:14px; color:#0052ff; text-decoration:underline;">
                                    ${escapeHtml(b.booking_code)}
                                  </a>
                                  <span class="num" style="font-size:13px; font-weight:500; color:#0f6938;">
                                    ${escapeHtml(formatVnd(b.total_amount_vnd))}
                                  </span>
                                </div>
                                <div style="font-size:13.5px; font-weight:500; color:#0f172a; margin-top:4px;">
                                   ${escapeHtml(b.contact_name)} · <span class="num">${escapeHtml(b.contact_phone)}</span>
                                </div>
                                ${
                                  b.equipment_rented_summary
                                    ? `<div style="font-size:12px; color:#b45309; background:#fffbeb; padding:4px 8px; border-radius:6px; margin-top:6px;">
                                         ${escapeHtml(b.equipment_rented_summary)}
                                      </div>`
                                    : ''
                                }
                                ${
                                  (b.equipment_deposit_vnd || 0) > 0
                                    ? `<div style="font-size:11.5px; font-weight:500; margin-top:4px; color:${b.deposit_refunded ? '#059669' : '#dc2626'};">
                                        ${b.deposit_refunded ? ' Đã hoàn cọc' : ` Cọc giữ tại quầy: ${escapeHtml(formatVnd(b.equipment_deposit_vnd || 0))}`}
                                      </div>`
                                    : ''
                                }
                              </div>
                            `
                            : ''
                    }
                  </div>
                </div>

                <!-- Các nút hành động trực tiếp trên từng ô sân -->
                <div style="padding:10px 14px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; gap:6px; flex-wrap:wrap;">
                  ${
                    item.slotStatus === 'AVAILABLE'
                      ? `
                        <a
                          href="#walkin-pos-section"
                          onclick="var sel=document.getElementById('walkin-court-select'); if(sel){sel.value='${escapeHtml(item.courtId)}'; document.getElementById('walkin-contact-name').focus();}"
                          class="btn-pill-dark"
                          style="width:100%; justify-content:center; min-height:34px; padding:6px 12px; font-size:12.5px;"
                        >
                           Đặt tại quầy
                        </a>
                      `
                      : b
                        ? `
                          <a
                            href="/quan-tri/soat-ve/${encodeURIComponent(b.booking_code)}"
                            class="btn-pill-dark"
                            style="flex:1; justify-content:center; min-height:32px; padding:5px 10px; font-size:12px;"
                          >
                             Trạm Soát Vé
                          </a>
                          ${
                            item.slotStatus === 'CONFIRMED'
                              ? `
                                <form method="POST" action="/quan-tri/soat-ve/${encodeURIComponent(b.booking_code)}/thao-tac" style="margin:0; flex:1;">
                                  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                  <input type="hidden" name="action" value="CHECK_IN" />
                                  <button type="submit" class="btn-pill-primary" style="width:100%; justify-content:center; min-height:32px; padding:5px 10px; font-size:12px;">
                                     Nhận sân
                                  </button>
                                </form>
                              `
                              : item.slotStatus === 'CHECKED_IN'
                                ? `
                                  <a
                                    href="#pos-addon-section"
                                    onclick="var bSel=document.getElementById('pos-booking-select'); if(bSel){bSel.value='${escapeHtml(b.booking_code)}';}"
                                    class="btn-pill-outline"
                                    style="flex:1; justify-content:center; min-height:32px; padding:5px 10px; font-size:12px;"
                                  >
                                     Thêm dịch vụ
                                  </a>
                                `
                                : ''
                          }
                        `
                        : `<a href="/quan-tri/san-va-gia" class="btn-pill-outline" style="width:100%; justify-content:center; min-height:32px; font-size:12px;">Quản lý khóa sân</a>`
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </section>

    <!-- 3 KHỐI NGHIỆP VỤ QUẦY LỄ TÂN: WALK-IN POS | BÁN LẺ NƯỚC & PHỤ KIỆN | ĐỔI SÂN NHANH -->
    <div class="grid-2" style="gap: 24px; align-items: start;">
      <!-- KHỐI 1: ĐẶT SÂN TRỰC TIẾP TẠI QUẦY CHO KHÁCH VÃNG LAI (WALK-IN POS) -->
      <section id="walkin-pos-section" class="flat-panel" style="border-top: 4px solid #0052ff;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          
          <div>
            <h3 class="headline-md" style="margin:0;">Đặt sân tại quầy</h3>
            <p class="caption-text">Thu tiền mặt hoặc quét QR tại quầy — Nhận sân ngay không cần chờ 5 phút</p>
          </div>
        </div>

        <form method="POST" action="/quan-tri/dieu-phoi-18-san/dat-nhanh-tai-quay">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <input type="hidden" name="bookingDate" value="${escapeHtml(monitor.dateStr)}" />

          <div class="grid-2" style="gap:12px; margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-court-select" class="form-label">Chọn Sân trống *</label>
              <select id="walkin-court-select" name="courtId" class="network-select" required>
                ${
                  availableCourts.length === 0
                    ? `<option value="">-- Hết sân trống khung ${formatSlotRange(monitor.selectedHour)} --</option>`
                    : availableCourts
                        .map(
                          (c) =>
                            `<option value="${escapeHtml(c.courtId)}" ${preselectCourtId === c.courtId ? 'selected' : ''}>${escapeHtml(c.courtName)} (Đang trống)</option>`
                        )
                        .join('')
                }
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-hour-select" class="form-label">Khung giờ chơi *</label>
              <select id="walkin-hour-select" name="startHour" class="network-select" required>
                ${Array.from({ length: 19 }, (_, idx) => idx + 5)
                  .map(
                    (h) =>
                      `<option value="${h}" ${h === monitor.selectedHour ? 'selected' : ''}>${formatSlotRange(h)} (${monitor.dateStr})</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>

          <div class="grid-2" style="gap:12px; margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-contact-name" class="form-label">Tên khách vãng lai *</label>
              <input
                type="text"
                id="walkin-contact-name"
                name="contactName"
                class="text-input"
                placeholder="Ví dụ: Anh Minh (Khách lẻ)"
                value="Khách vãng lai tại quầy"
                required
              />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-contact-phone" class="form-label">Số điện thoại *</label>
              <input
                type="tel"
                id="walkin-contact-phone"
                name="contactPhone"
                class="text-input"
                placeholder="Ví dụ: 0908123456"
                value="0908000111"
                required
              />
            </div>
          </div>

          <div class="grid-2" style="gap:12px; margin-bottom:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-pay-method" class="form-label">Hình thức thu tiền tại quầy *</label>
              <select id="walkin-pay-method" name="paymentMethod" class="network-select">
                <option value="CASH_COUNTER" selected> Thu Tiền mặt tại quầy</option>
                <option value="QR_COUNTER"> Chuyển khoản VietQR tại quầy</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label for="walkin-auto-checkin" class="form-label">Trạng thái nhận sân *</label>
              <select id="walkin-auto-checkin" name="autoCheckIn" class="network-select">
                <option value="1" selected> Nhận sân vào đánh ngay (CHECKED_IN)</option>
                <option value="0"> Giữ đơn Đã thanh toán chờ khách tới (CONFIRMED)</option>
              </select>
            </div>
          </div>

          <button type="submit" class="btn-pill-primary" style="width:100%; justify-content:center;">
             Tạo đơn &amp; ghi nhận thu tiền
          </button>
        </form>
      </section>

      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- KHỐI 2: BÁN LẺ NƯỚC UỐNG & PHỤ KIỆN CỘNG VÀO ĐƠN ĐANG CHƠI (POS ADD-ON) -->
        <section id="pos-addon-section" class="flat-panel" style="border-top: 4px solid #10b981;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            
            <div>
              <h3 class="headline-md" style="margin:0;">Thêm dịch vụ vào đơn</h3>
              <p class="caption-text">Cộng nhanh nước giải khát, ống cầu, vợt/giày vào đơn khách đang chơi</p>
            </div>
          </div>

          <form method="POST" action="/quan-tri/dieu-phoi-18-san/ban-them-phu-kien">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <input type="hidden" name="returnDate" value="${escapeHtml(monitor.dateStr)}" />
            <input type="hidden" name="returnHour" value="${monitor.selectedHour}" />

            <div class="form-group" style="margin-bottom:12px;">
              <label for="pos-booking-select" class="form-label">Mã đơn khách đang chơi / sắp nhận sân *</label>
              <input
                type="text"
                id="pos-booking-select"
                name="bookingCode"
                list="active-slot-bookings-list"
                class="text-input"
                placeholder="Nhập hoặc chọn mã đơn (VD: CG-...)"
                value="${activeBookingsOnSlot[0]?.booking?.booking_code || ''}"
                required
              />
              <datalist id="active-slot-bookings-list">
                ${activeBookingsOnSlot
                  .map(
                    (it) =>
                      `<option value="${escapeHtml(it.booking!.booking_code)}">${escapeHtml(it.courtName)} — ${escapeHtml(it.booking!.contact_name)}</option>`
                  )
                  .join('')}
              </datalist>
            </div>

            <div class="grid-2" style="gap:12px; margin-bottom:14px;">
              <div class="form-group" style="margin-bottom:0;">
                <label for="pos-eq-id" class="form-label">Chọn Nước uống / Phụ kiện *</label>
                <select id="pos-eq-id" name="equipmentId" class="network-select" required>
                  ${equipmentItems
                    .map(
                      (eq) =>
                        `<option value="${escapeHtml(eq.id)}" ${eq.stockStatus!=='AVAILABLE'?'disabled':''}>${escapeHtml(eq.name)} (${eq.stockStatus==='AVAILABLE'?'còn '+eq.stockQuantity:'hết hàng / tạm ngưng'}) — ${escapeHtml(formatVnd(eq.priceVnd))}/${escapeHtml(eq.unit)}${eq.depositVnd > 0 ? ` (Cọc ${formatVnd(eq.depositVnd)})` : ''}</option>`
                    )
                    .join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom:0;">
                <label for="pos-eq-qty" class="form-label">Số lượng *</label>
                <input type="number" id="pos-eq-qty" name="quantity" class="text-input" value="1" min="1" max="30" required />
              </div>
            </div>

            <button type="submit" class="btn-pill-dark" style="width:100%; justify-content:center;">
               Thêm vào đơn &amp; thu tiền
            </button>
          </form>
        </section>

        <!-- KHỐI 3: ĐỔI SÂN NHANH 1-CLICK (QUICK COURT TRANSFER) -->
        <section class="flat-panel" style="border-top: 4px solid #f59e0b;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            
            <div>
              <h3 class="headline-md" style="margin:0;">Chuyển sân</h3>
              <p class="caption-text">Chuyển khách sang sân trống khác cùng khung giờ chỉ với 1 click</p>
            </div>
          </div>

          <form method="POST" action="/quan-tri/dieu-phoi-18-san/chuyen-san">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <input type="hidden" name="returnDate" value="${escapeHtml(monitor.dateStr)}" />
            <input type="hidden" name="returnHour" value="${monitor.selectedHour}" />

            <div class="grid-2" style="gap:12px; margin-bottom:12px;">
              <div class="form-group" style="margin-bottom:0;">
                <label for="transfer-booking-code" class="form-label">Mã đơn cần đổi sân *</label>
                <input
                  type="text"
                  id="transfer-booking-code"
                  name="bookingCode"
                  list="active-slot-bookings-list"
                  class="text-input"
                  placeholder="Nhập mã đơn (VD: CG-...)"
                  value="${activeBookingsOnSlot[0]?.booking?.booking_code || ''}"
                  required
                />
              </div>

              <div class="form-group" style="margin-bottom:0;">
                <label for="transfer-target-court" class="form-label">Chuyển sang Sân trống *</label>
                <select id="transfer-target-court" name="targetCourtId" class="network-select" required>
                  ${
                    availableCourts.length === 0
                      ? `<option value="">-- Không còn sân trống khung giờ này --</option>`
                      : availableCourts
                          .map((c) => `<option value="${escapeHtml(c.courtId)}">${escapeHtml(c.courtName)} (Đang trống)</option>`)
                          .join('')
                  }
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label for="transfer-reason" class="form-label">Lý do đổi sân</label>
              <input
                type="text"
                id="transfer-reason"
                name="reason"
                class="text-input"
                value="Khách yêu cầu đổi sang sân thoáng hơn tại quầy"
              />
            </div>

            <button type="submit" class="btn-pill-outline" style="width:100%; justify-content:center;">
               Chuyển sân
            </button>
          </form>
        </section>
      </div>
    </div>
  `;
}

/**
 * 2. BÁO CÁO DOANH THU CHUYÊN SÂU, BIÊN BẢN CHỐT CA NHÂN SỰ & XUẤT EXCEL/CSV + AUDIT LOG
 */
export function renderAdminReportsAndShiftPage(data: {
  session: SessionContext;
  metrics: OperationalMetrics;
  breakdown: DetailedRevenueBreakdown;
  handovers: ShiftHandoverRecord[];
  auditLogs: StaffAuditLogEntry[];
  roleFilter?: string;
  actionFilter?: string;
}): string {
  const { session, metrics, breakdown, handovers, auditLogs, roleFilter = '', actionFilter = '' } = data;
  const csrfToken = session.csrfToken;
  const isAdmin = session.user.role === 'ADMIN';

  return `
    ${sectionHeading({
      level: 'h2',
      title: 'Báo cáo & chốt ca',
      subtitle: 'Doanh thu, bàn giao ca và lịch sử thao tác.',

      tone: 'blue',
    })}

    <!-- Bộ lọc kỳ báo cáo + Nút Xuất Báo cáo Kế toán Excel/CSV -->
    <section class="flat-panel" style="margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:16px;">
        <form method="GET" action="/quan-tri/bao-cao-chot-ca" style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="rep-from" class="form-label">Từ ngày</label>
            <input id="rep-from" type="date" name="fromDate" value="${escapeHtml(breakdown.fromDate)}" class="text-input" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label for="rep-to" class="form-label">Đến ngày</label>
            <input id="rep-to" type="date" name="toDate" value="${escapeHtml(breakdown.toDate)}" class="text-input" />
          </div>
          <button type="submit" class="btn-pill-dark">Lọc báo cáo</button>
          <a href="/quan-tri/bao-cao-chot-ca" class="btn-pill-outline">Hôm nay</a>
        </form>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <a
            href="/quan-tri/xuat-bao-cao/don-dat.csv?fromDate=${encodeURIComponent(breakdown.fromDate)}&toDate=${encodeURIComponent(breakdown.toDate)}"
            class="btn-pill-primary"
            style="display:inline-flex; align-items:center; gap:8px;"
          >
            <span> Xuất Báo cáo Kế toán (.CSV / Excel)</span>
          </a>
        </div>
      </div>
    </section>

    <!-- PHÂN RÃ DOANH THU CHUYÊN SÂU (REVENUE BREAKDOWN) -->
    <section style="margin-bottom: 28px;" aria-label="Phân rã doanh thu chi tiết">
      <div class="grid-4" style="margin-bottom: 16px;">
        <div class="stat-card" style="border-top:3px solid #0052ff;">
          <div class="stat-label">Doanh thu Tiền sân thuần</div>
          <div class="stat-value" style="color:#0052ff;">${escapeHtml(formatVnd(breakdown.courtRentalRevenueVnd))}</div>
          <div class="stat-foot">${metrics.confirmedBookingsCount} đơn đặt sân hợp lệ</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #10b981;">
          <div class="stat-label">Doanh thu Dụng cụ &amp; Nước uống</div>
          <div class="stat-value" style="color:#059669;">${escapeHtml(formatVnd(breakdown.equipmentAndPosRevenueVnd))}</div>
          <div class="stat-foot">Thuê vợt, giày, cầu &amp; POS tại quầy</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #f59e0b;">
          <div class="stat-label">Tổng Chiết khấu Coupon &amp; VIP</div>
          <div class="stat-value" style="color:#d97706;">-${escapeHtml(formatVnd(breakdown.totalDiscountVnd))}</div>
          <div class="stat-foot">Ưu đãi giảm giá cho khách hàng</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #7c3aed;">
          <div class="stat-label">Quỹ Tiền Cọc Dụng Cụ Tại Quầy</div>
          <div class="stat-value" style="color:#7c3aed;">${escapeHtml(formatVnd(breakdown.depositHoldingVnd))}</div>
          <div class="stat-foot">Đã hoàn trả: ${escapeHtml(formatVnd(breakdown.depositRefundedVnd))}</div>
        </div>
      </div>

      <div class="grid-3">
        <div class="stat-card">
          <div class="stat-label">Thu trực tiếp Walk-in tại quầy</div>
          <div class="stat-value">${escapeHtml(formatVnd(breakdown.walkInPosCollectedVnd))}</div>
          <div class="stat-foot">${breakdown.totalWalkInCount} đơn khách vãng lai tại quầy</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Thanh toán Đặt lịch Online</div>
          <div class="stat-value">${escapeHtml(formatVnd(breakdown.onlinePaidVnd))}</div>
          <div class="stat-foot">Qua cổng QR / Ngân hàng / Ví điện tử</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Tổng lượt Khách đã Check-in</div>
          <div class="stat-value">${breakdown.totalCheckInCount} ca</div>
          <div class="stat-foot">Đã có mặt nhận sân thi đấu</div>
        </div>
      </div>
    </section>

    <!-- BÀN GIAO & CHỐT CA NHÂN SỰ (SHIFT HANDOVER) + HIỆU SUẤT NHÂN SỰ -->
    <div class="grid-2" style="gap: 24px; margin-bottom: 28px; align-items: start;">
      <!-- Form Lập biên bản bàn giao ca -->
      <section class="flat-panel" style="border-top: 4px solid #0052ff;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          
          <div>
            <h3 class="headline-md" style="margin:0;">Bàn giao ca</h3>
            <p class="caption-text">Nhân sự trực quầy chốt số tiền mặt thực đếm tại két cuối ca</p>
          </div>
        </div>

        <form method="POST" action="/quan-tri/bao-cao-chot-ca/luu-ca">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

          <div class="grid-2" style="gap:12px; margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="shf-date" class="form-label">Ngày trực ca *</label>
              <input type="date" id="shf-date" name="shiftDate" value="${escapeHtml(breakdown.toDate)}" class="text-input" required />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label for="shf-name" class="form-label">Ca làm việc *</label>
              <select id="shf-name" name="shiftName" class="network-select">
                <option value="CA_SANG_05_12"> Ca Sáng (05:00 – 12:00)</option>
                <option value="CA_CHIEU_12_18"> Ca Chiều (12:00 – 18:00)</option>
                <option value="CA_TOI_18_24"> Ca Tối (18:00 – 24:00)</option>
                <option value="CA_NGAY"> Toàn bộ Ca Ngày</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label for="shf-cash" class="form-label">Số tiền mặt thực đếm tại két bàn giao (VNĐ) *</label>
            <input
              type="number"
              id="shf-cash"
              name="cashInDrawerVnd"
              class="text-input"
              min="0"
              step="1000"
              value="${breakdown.walkInPosCollectedVnd + breakdown.depositHoldingVnd}"
              required
            />
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="shf-note" class="form-label">Ghi chú bàn giao ca (Tình trạng vợt thuê, ống cầu, quỹ tiền lẻ...)</label>
            <textarea
              id="shf-note"
              name="handoverNote"
              class="text-input"
              rows="2"
              placeholder="Ví dụ: Đã kiểm đủ 12 cây vợt Yonex, bàn giao két tiền mặt đầy đủ cho ca sau..."
            ></textarea>
          </div>

          <button type="submit" class="btn-pill-primary" style="width:100%; justify-content:center;">
             Nộp Biên bản Chốt ca &amp; Lưu Đối soát
          </button>
        </form>
      </section>

      <!-- Bảng Thống kê hiệu suất Nhân sự vận hành -->
      <section class="flat-panel">
        <h3 class="headline-md" style="margin-bottom:12px;">Hoạt động nhân viên</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Vai trò</th>
                <th>Lượt Check-in</th>
                <th>Hoàn cọc</th>
                <th>Tổng thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${breakdown.staffPerformance
                .map(
                  (sp) => `
                  <tr>
                    <td><strong>${escapeHtml(sp.fullName)}</strong></td>
                    <td><span class="status-badge ${sp.role === 'ADMIN' ? 'badge-confirmed' : 'badge-neutral'}">${escapeHtml(formatRoleVi(sp.role))}</span></td>
                    <td class="num"><strong>${sp.checkInCount}</strong> ca</td>
                    <td class="num">${sp.depositRefundedCount} lượt</td>
                    <td class="num">${sp.auditActionCount} thao tác</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- DANH SÁCH BIÊN BẢN BÀN GIAO CA ĐÃ NỘP -->
    <section class="flat-panel" style="margin-bottom: 28px;">
      <h3 class="headline-md" style="margin-bottom:14px;">Lịch sử bàn giao (${handovers.length})</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ngày &amp; Ca trực</th>
              <th>Nhân sự bàn giao</th>
              <th>Check-in</th>
              <th>Thu Walk-in &amp; POS</th>
              <th>Cọc đang giữ</th>
              <th>Tiền mặt tại két</th>
              <th>Ghi chú bàn giao</th>
              <th>Trạng thái</th>
              ${isAdmin ? '<th>Duyệt két</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${
              handovers.length === 0
                ? `<tr><td colspan="${isAdmin ? 9 : 8}" style="text-align:center; padding:24px; color:var(--muted);">Chưa có biên bản bàn giao ca nào.</td></tr>`
                : handovers
                    .map(
                      (h) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(formatVietnamDateDisplay(h.shift_date))}</strong>
                          <div class="caption-text">${escapeHtml(h.shift_name)}</div>
                        </td>
                        <td><strong>${escapeHtml(h.staff_name_snapshot)}</strong></td>
                        <td class="num">${h.total_checkin_count} ca</td>
                        <td class="num">${escapeHtml(formatVnd(h.walkin_collected_vnd + h.pos_addon_collected_vnd))}</td>
                        <td class="num">${escapeHtml(formatVnd(h.deposit_holding_vnd))}</td>
                        <td class="num" style="font-weight:600; color:#0f6938;">${escapeHtml(formatVnd(h.cash_in_drawer_vnd))}</td>
                        <td>${escapeHtml(h.handover_note || '—')}</td>
                        <td>
                          <span class="status-badge ${h.status === 'VERIFIED' ? 'badge-confirmed' : 'badge-hold'}">
                            ${h.status === 'VERIFIED' ? ' Admin đã duyệt' : '● Chờ đối soát'}
                          </span>
                        </td>
                        ${
                          isAdmin
                            ? `<td>
                                ${
                                  h.status === 'SUBMITTED'
                                    ? `<form method="POST" action="/quan-tri/bao-cao-chot-ca/${encodeURIComponent(h.id)}/duyet" style="margin:0;">
                                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                        <button type="submit" class="btn-pill-dark" style="padding:5px 10px; min-height:30px; font-size:12px;">Duyệt ca</button>
                                      </form>`
                                    : `<span class="caption-text">Đã duyệt</span>`
                                }
                              </td>`
                            : ''
                        }
                      </tr>
                    `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>

    <!-- NHẬT KÝ HOẠT ĐỘNG NHÂN SỰ (STAFF AUDIT LOGS) -->
    <section class="flat-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h3 class="headline-md" style="margin:0;">Nhật ký thao tác</h3>
          <p class="caption-text">Ghi vết minh bạch mọi thao tác soát vé, thu tiền Walk-in, đổi sân, hoàn cọc và cấu hình hệ thống</p>
        </div>

        <form method="GET" action="/quan-tri/bao-cao-chot-ca" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="hidden" name="fromDate" value="${escapeHtml(breakdown.fromDate)}" />
          <input type="hidden" name="toDate" value="${escapeHtml(breakdown.toDate)}" />
          <select name="role" class="network-select" style="width:auto; min-height:36px; padding:4px 28px 4px 10px; font-size:13px;">
            <option value="" ${roleFilter === '' ? 'selected' : ''}>Mọi vai trò</option>
            <option value="STAFF" ${roleFilter === 'STAFF' ? 'selected' : ''}>Nhân sự (STAFF)</option>
            <option value="ADMIN" ${roleFilter === 'ADMIN' ? 'selected' : ''}>Quản trị viên (ADMIN)</option>
          </select>
          <input
            type="text"
            name="actionKeyword"
            value="${escapeHtml(actionFilter)}"
            placeholder="Tìm mã đơn / thao tác..."
            class="text-input"
            style="width:180px; min-height:36px; padding:4px 10px; font-size:13px;"
          />
          <button type="submit" class="btn-pill-outline" style="min-height:36px; padding:4px 12px; font-size:12.5px;">Lọc nhật ký</button>
        </form>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Người thực hiện</th>
              <th>Vai trò</th>
              <th>Mã hành động</th>
              <th>Chi tiết thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${
              auditLogs.length === 0
                ? `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted);">Không có bản ghi nhật ký nào khớp bộ lọc.</td></tr>`
                : auditLogs
                    .map(
                      (log) => `
                      <tr>
                        <td class="num" style="white-space:nowrap;">${escapeHtml(formatVietnamDateTimeDisplay(log.created_at))}</td>
                        <td><strong>${escapeHtml(log.actor_name)}</strong></td>
                        <td><span class="status-badge ${log.actor_role === 'ADMIN' ? 'badge-confirmed' : 'badge-neutral'}">${escapeHtml(formatRoleVi(log.actor_role))}</span></td>
                        <td><code>${escapeHtml(log.action)}</code></td>
                        <td>${escapeHtml(log.summary_vi)}</td>
                      </tr>
                    `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/**
 * 3. QUẢN LÝ & PHẢN HỒI ĐÁNH GIÁ KHÁCH HÀNG (CUSTOMER REVIEWS MODERATION — DÀNH CHO ADMIN)
 */
export function renderAdminReviewsPage(data: {
  session: SessionContext;
  reviews: CustomerReviewRecord[];
}): string {
  const { session, reviews } = data;
  const csrfToken = session.csrfToken;

  return `
    ${sectionHeading({
      level: 'h2',
      title: 'Đánh giá khách hàng',
      subtitle: 'Duyệt hiển thị và trả lời đánh giá.',

      tone: 'yellow',
    })}

    <div class="grid-2" style="gap: 24px; margin-bottom: 28px; align-items: start;">
      <!-- Thêm đánh giá tiêu biểu mới -->
      <section class="flat-panel" style="border-top: 4px solid #0052ff;">
        <h3 class="headline-md" style="margin-bottom:12px;">Thêm đánh giá</h3>
        <form method="POST" action="/quan-tri/danh-gia/tao-moi">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

          <div class="grid-2" style="gap:12px; margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="rev-author" class="form-label">Tên khách hàng / Vợt thủ *</label>
              <input type="text" id="rev-author" name="authorName" class="text-input" placeholder="Ví dụ: Huỳnh Quốc Huy" required />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label for="rev-rating" class="form-label">Số sao đánh giá *</label>
              <select id="rev-rating" name="rating" class="network-select">
                <option value="5" selected> (5 sao - Tuyệt vời)</option>
                <option value="4"> (4 sao - Tốt)</option>
                <option value="3"> (3 sao - Khá)</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label for="rev-comment" class="form-label">Nội dung nhận xét *</label>
            <textarea
              id="rev-comment"
              name="commentText"
              class="text-input"
              rows="2"
              placeholder="Ví dụ: Thảm sân mới độ bám cực tốt, trần cao 13m đánh cầu không bị chạm trần, nhân viên hỗ trợ nhiệt tình!"
              required
            ></textarea>
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="rev-reply" class="form-label">Phản hồi từ Ban Quản Lý Sân Be Badminton (Tùy chọn)</label>
            <textarea
              id="rev-reply"
              name="ownerReply"
              class="text-input"
              rows="2"
              placeholder="Ví dụ: Cảm ơn bạn đã tin tưởng lựa chọn Be Badminton Gò Vấp! Hẹn gặp lại bạn ở những trận cầu tiếp theo."
            ></textarea>
          </div>

          <button type="submit" class="btn-pill-primary" style="width:100%; justify-content:center;">
             Lưu &amp; Hiển thị Đánh giá lên Trang chủ
          </button>
        </form>
      </section>

      <!-- Thống kê nhanh Đánh giá -->
      <section class="flat-panel">
        <h3 class="headline-md" style="margin-bottom:12px;">Đánh giá đang hiển thị</h3>
        <div class="grid-2" style="gap:14px;">
          <div class="stat-card">
            <div class="stat-label">Tổng số đánh giá quản lý</div>
            <div class="stat-value">${reviews.length}</div>
            <div class="stat-foot">Đồng bộ cùng Google Maps</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Đang hiển thị Trang chủ</div>
            <div class="stat-value" style="color:#059669;">${reviews.filter((r) => r.is_visible).length}</div>
            <div class="stat-foot">Đã phản hồi: ${reviews.filter((r) => r.owner_reply).length} đánh giá</div>
          </div>
        </div>
      </section>
    </div>

    <!-- Danh sách đánh giá & Form phản hồi -->
    <section class="flat-panel">
      <h3 class="headline-md" style="margin-bottom:16px;">Danh sách đánh giá (${reviews.length})</h3>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${reviews
          .map(
            (r) => `
            <div style="border:1px solid #e2e8f0; border-radius:14px; padding:18px; background:${r.is_visible ? '#ffffff' : '#f8fafc'};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                <div>
                  <strong style="font-size:15px; color:#0f172a;">${escapeHtml(r.author_name)}</strong>
                  <span style="color:#f59e0b; font-weight:600; margin-left:8px;">${''.repeat(r.rating)}${''.repeat(5 - r.rating)}</span>
                  <span class="status-badge ${r.is_visible ? 'badge-confirmed' : 'badge-neutral'}" style="margin-left:8px;">
                    ${r.is_visible ? '● Đang hiện ngoài Trang chủ' : ' Đang ẩn'}
                  </span>
                </div>

                <div style="display:flex; gap:8px;">
                  <form method="POST" action="/quan-tri/danh-gia/${encodeURIComponent(r.id)}/an-hien" style="margin:0;">
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit" class="btn-pill-outline" style="padding:5px 12px; min-height:32px; font-size:12px;">
                      ${r.is_visible ? 'Ẩn khỏi trang chủ' : 'Hiện lên trang chủ'}
                    </button>
                  </form>
                  <form method="POST" action="/quan-tri/danh-gia/${encodeURIComponent(r.id)}/xoa" style="margin:0;" onsubmit="return confirm('Xóa đánh giá này?');">
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit" class="btn-pill-danger" style="padding:5px 12px; min-height:32px; font-size:12px;">
                      Xóa
                    </button>
                  </form>
                </div>
              </div>

              <blockquote style="font-size:14px; color:#1e293b; background:#f8fafc; padding:10px 14px; border-left:3px solid #0052ff; border-radius:0 8px 8px 0; margin:0 0 12px 0;">
                "${escapeHtml(r.comment_text)}"
              </blockquote>

              <form method="POST" action="/quan-tri/danh-gia/${encodeURIComponent(r.id)}/phan-hoi" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                <input
                  type="text"
                  name="ownerReply"
                  value="${escapeHtml(r.owner_reply || '')}"
                  placeholder="Nhập phản hồi chính thức từ Ban Quản Lý Sân Be Badminton..."
                  class="text-input"
                  style="flex:1; min-width:260px; min-height:38px; padding:6px 12px; font-size:13px;"
                />
                <button type="submit" class="btn-pill-dark" style="min-height:38px; padding:6px 16px; font-size:12.5px;">
                   Lưu phản hồi chủ sân
                </button>
              </form>
            </div>
          `
          )
          .join('')}
      </div>
    </section>
  `;
}

