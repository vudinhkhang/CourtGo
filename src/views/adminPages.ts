import { escapeHtml } from '../utils/security.js';
import {
  formatSlotRange,
  formatVietnamDateDisplay,
  formatVietnamDateTimeDisplay,
  formatVnd,
} from '../utils/time.js';
import { OperationalMetrics } from '../services/adminService.js';
import { CourtSummary, PriceBoardTier } from '../services/courtService.js';
import { BookingRecord } from '../services/bookingService.js';
import { SessionContext, UserRecord, formatMemberTierVi } from '../services/authService.js';
import { CouponRecord } from '../services/couponService.js';
import {
  formatBookingStatusVi,
  formatPaymentStatusVi,
  formatRefundStatusVi,
  formatRoleVi,
  sectionHeading,
} from './layout.js';
import { iconBadge, inlineIcon, svgGlyph } from './icons.js';

export function renderAdminSubnav(
  activeTab: 'overview' | 'courts' | 'bookings' | 'payments' | 'coupons' | 'accounts' | 'equipment' | 'news',
  session: SessionContext
): string {
  // Khi chạy trong adminDashboardLayout (sidebar + topbar riêng), ẩn subnav cũ để tránh trùng lặp
  return '';
}

export function renderAdminDashboardPage(data: {
  session: SessionContext;
  metrics: OperationalMetrics;
  priceBoard?: PriceBoardTier[];
  recentAuditLogs: Array<{
    id: string;
    actor_role: string;
    action: string;
    summary_vi: string;
    created_at: string | Date;
  }>;
}): string {
  const { metrics, session, recentAuditLogs, priceBoard } = data;

  return `
    ${renderAdminSubnav('overview', session)}

    <nav class="admin-quick-links" aria-label="Thao tác nhanh">
      <a href="/quan-tri/dieu-phoi-18-san">Điều phối</a>
      <a href="/quan-tri/don-dat">Đơn đặt</a>
      <a href="/quan-tri/thanh-toan-hoan-tien">Hoàn tiền</a>
    </nav>

    <!-- Bộ lọc khoảng thời gian thống kê -->
    <section class="flat-panel" style="margin-bottom: 24px;">
      <form method="GET" action="/quan-tri" class="grid-3" style="align-items: end;">
        <div class="form-group" style="margin-bottom:0;">
          <label for="adm-from" class="form-label">Từ ngày</label>
          <input id="adm-from" type="date" name="fromDate" value="${escapeHtml(metrics.fromDate)}" class="text-input" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="adm-to" class="form-label">Đến ngày</label>
          <input id="adm-to" type="date" name="toDate" value="${escapeHtml(metrics.toDate)}" class="text-input" />
        </div>
        <div style="display:flex; gap:10px;">
          <button type="submit" class="btn-pill-dark" style="flex:1;">Xem</button>
          <a href="/quan-tri" class="btn-pill-outline">Hôm nay</a>
        </div>
      </form>
    </section>

    <!-- 7 chỉ số vận hành thực tế chuẩn Executive Dashboard -->
    <section style="margin-bottom: 32px;" aria-label="Chỉ số tổng quan vận hành">
      <div class="grid-4" style="margin-bottom: 16px;">
        <div class="stat-card" style="border-top:3px solid #0052ff;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Thực thu</span>
            
          </div>
          <div class="stat-value">${escapeHtml(formatVnd(metrics.netCollectedRevenueVnd))}</div>
          <div class="stat-foot">= Tiền thu vào − Tiền đã hoàn lại</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #16a34a;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Đã thanh toán</span>
            
          </div>
          <div class="stat-value">${escapeHtml(formatVnd(metrics.grossPaidAmountVnd))}</div>
          <div class="stat-foot">Tổng giao dịch đã xác thực trong kỳ</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #7c3aed;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Đơn đã xác nhận</span>
            
          </div>
          <div class="stat-value">${metrics.confirmedBookingsCount} đơn</div>
          <div class="stat-foot">Đã xác nhận, đang chơi hoặc hoàn tất</div>
        </div>

        <div class="stat-card" style="border-top:3px solid #f59e0b;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Tỷ lệ sử dụng sân</span>
            
          </div>
          <div class="stat-value">${metrics.courtUtilizationRatePct}%</div>
          <div class="stat-foot">${metrics.occupiedCourtHours} giờ đặt / ${metrics.totalAvailableCourtHours} giờ mở cửa</div>
        </div>
      </div>

      <div class="grid-3">
        <div class="stat-card">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Sắp diễn ra</span>
            
          </div>
          <div class="stat-value">${metrics.upcomingBookingsCount} ca chơi</div>
          <div class="stat-foot">Các ca chơi đã xác nhận chưa kết thúc</div>
        </div>

        <div class="stat-card">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">Đã hoàn tiền</span>
            
          </div>
          <div class="stat-value">${escapeHtml(formatVnd(metrics.succeededRefundAmountVnd))}</div>
          <div class="stat-foot">Đã hoàn trả qua cổng thanh toán</div>
        </div>

        <div class="stat-card" style="${metrics.pendingRefundsCount > 0 ? 'border:1.5px solid #ef4444; background:#fef2f2;' : ''}">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label" style="${metrics.pendingRefundsCount > 0 ? 'color:#b91c1c; font-weight:500;' : ''}">Chờ hoàn tiền</span>
            
          </div>
          <div class="stat-value" style="${metrics.pendingRefundsCount > 0 ? 'color:#dc2626;' : ''}">
            ${metrics.pendingRefundsCount} khoản (${escapeHtml(formatVnd(metrics.pendingRefundsAmountVnd))})
          </div>
          <div class="stat-foot">
            <a href="/quan-tri/thanh-toan-hoan-tien" class="btn-text">Xem khoản hoàn</a>
          </div>
        </div>
      </div>
    </section>

    <!-- Chỉnh sửa Bảng giá niêm yết Be Badminton (Đồng bộ toàn bộ 18 sân) -->
    

    <!-- Hoạt động gần đây -->
    <section class="flat-panel">
      ${sectionHeading({
        title: 'Hoạt động gần đây',

        tone: 'blue',
      })}

      ${
        recentAuditLogs.length === 0
          ? `<p class="body-sm">Chưa có thao tác quản trị nào được ghi nhận.</p>`
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Thời điểm</th>
                    <th>Vai trò</th>
                    <th>Hành động</th>
                    <th>Chi tiết thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentAuditLogs
                    .map(
                      (log) => `
                    <tr>
                      <td class="num">${escapeHtml(formatVietnamDateTimeDisplay(log.created_at))}</td>
                      <td><strong>${escapeHtml(formatRoleVi(log.actor_role))}</strong></td>
                      <td><code>${escapeHtml(log.action)}</code></td>
                      <td>${escapeHtml(log.summary_vi)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
      }
    </section>
  `;
}

export function renderOfficialPriceBoardTable(
  priceBoard: PriceBoardTier[] = [],
  csrfToken: string,
  returnUrl: string = '/quan-tri/san-va-gia'
): string {
  const isDashboard = returnUrl === '/quan-tri';
  const idSuffix = isDashboard ? 'dash' : 'courts';

  return `
    <section class="flat-panel" style="margin-bottom: 28px; border: 2px solid #bbf7d0; background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 80px);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h2 class="headline-md" style="margin:0;">Bảng giá niêm yết chính thức Be Badminton</h2>
              <span class="status-badge badge-confirmed">● Tự động đồng bộ toàn bộ 18 sân</span>
            </div>
            <p class="body-sm" style="margin-top:4px; color:#475569;">
              Khi chỉnh sửa tại đây và bấm lưu, hệ thống sẽ <strong>tự động đồng bộ mục BẢNG GIÁ THUÊ SÂN ở trang chủ</strong>, bảng giá chi tiết từng sân và đơn giá tính tiền khi khách đặt sân trực tuyến.
            </p>
          </div>
        </div>
      </div>

      <form method="POST" action="/quan-tri/bang-gia-niem-yet">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <input type="hidden" name="returnUrl" value="${escapeHtml(returnUrl)}" />
        <div class="table-wrap">
          <table class="data-table" style="background:#ffffff; border-radius:10px;">
            <thead>
              <tr>
                <th style="width:28%;">Khung thời gian áp dụng</th>
                <th style="width:24%;">Giá Vãng lai (₫/ca chơi)<br/><span style="font-size:11px; font-weight:normal; color:#64748b;">(Áp dụng khi khách đặt trực tuyến)</span></th>
                <th style="width:24%;">Giá Cố định (₫/ca chơi)<br/><span style="font-size:11px; font-weight:normal; color:#64748b;">(Khách đăng ký tháng / cố định)</span></th>
                <th style="width:24%;">Ghi chú &amp; Ưu đãi HS/SV</th>
              </tr>
            </thead>
            <tbody>
              ${(priceBoard || []).map((t) => {
                const isDay = t.tierKey === 'wd_day';
                return `
                  <tr>
                    <td>
                      <div style="font-weight:500; color:#0d3b66; font-size:14.5px;">${escapeHtml(t.timeLabel)}</div>
                      <div style="font-size:12px; color:#64748b;">${t.dayType === 'WEEKDAY' ? 'Thứ 2 – Thứ 6' : 'Thứ 7, Chủ Nhật & Lễ'}</div>
                    </td>
                    <td>
                      <label for="pb-guest-${t.tierKey}-${idSuffix}" class="sr-only">Giá vãng lai ${escapeHtml(t.timeLabel)}</label>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <input
                          id="pb-guest-${t.tierKey}-${idSuffix}"
                          type="text"
                          inputmode="numeric"
                          name="priceGuest_${t.tierKey}"
                          value="${t.priceGuestVnd}"
                          placeholder="120000 hoặc 120.000"
                          class="text-input"
                          style="font-weight:500; color:#0052ff; font-size:15px;"
                          required
                        />
                        <span style="font-weight:500; color:#64748b; font-size:13px;">₫</span>
                      </div>
                    </td>
                    <td>
                      <label for="pb-fixed-${t.tierKey}-${idSuffix}" class="sr-only">Giá cố định ${escapeHtml(t.timeLabel)}</label>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <input
                          id="pb-fixed-${t.tierKey}-${idSuffix}"
                          type="text"
                          inputmode="numeric"
                          name="priceFixed_${t.tierKey}"
                          value="${t.priceFixedVnd}"
                          placeholder="110000 hoặc 110.000"
                          class="text-input"
                          style="font-weight:500; color:#0f766e; font-size:15px;"
                          required
                        />
                        <span style="font-weight:500; color:#64748b; font-size:13px;">₫</span>
                      </div>
                    </td>
                    <td>
                      <div style="display:grid; gap:6px;">
                        <!-- Ghi chú / Nhãn phụ khung giờ -->
                        <div style="display:flex; align-items:center; gap:6px;">
                          <label for="pb-sublabel-${t.tierKey}-${idSuffix}" style="font-size:11.5px; color:#475569; min-width:85px;">Ghi chú:</label>
                          <input
                            id="pb-sublabel-${t.tierKey}-${idSuffix}"
                            type="text"
                            name="subLabel_${t.tierKey}"
                            value="${escapeHtml(t.subLabel || '')}"
                            placeholder="Để trống lấy mặc định"
                            class="text-input"
                            style="font-size:12px; padding:4px 8px; flex:1;"
                          />
                        </div>
                        <!-- Ưu đãi HS/SV cố định -->
                        <div style="display:flex; align-items:center; gap:6px;">
                          <label for="pb-stufixed-${t.tierKey}-${idSuffix}" style="font-size:11.5px; color:#475569; min-width:85px;">HS/SV cố định:</label>
                          <input
                            id="pb-stufixed-${t.tierKey}-${idSuffix}"
                            type="text"
                            inputmode="numeric"
                            name="studentFixed_${t.tierKey}"
                            value="${t.studentFixedVnd || ''}"
                            placeholder="${t.tierKey === 'wd_day' ? '80000' : 'Tuỳ chọn (₫)'}"
                            class="text-input"
                            style="font-size:12px; padding:4px 8px; width:110px;"
                          />
                          <span style="font-size:11px; color:#64748b;">₫</span>
                        </div>
                        <!-- Ưu đãi HS/SV vãng lai -->
                        <div style="display:flex; align-items:center; gap:6px;">
                          <label for="pb-stuguest-${t.tierKey}-${idSuffix}" style="font-size:11.5px; color:#475569; min-width:85px;">HS/SV vãng lai:</label>
                          <input
                            id="pb-stuguest-${t.tierKey}-${idSuffix}"
                            type="text"
                            inputmode="numeric"
                            name="studentGuest_${t.tierKey}"
                            value="${t.studentGuestVnd || ''}"
                            placeholder="${t.tierKey === 'wd_day' ? '90000' : 'Tuỳ chọn (₫)'}"
                            class="text-input"
                            style="font-size:12px; padding:4px 8px; width:110px;"
                          />
                          <span style="font-size:11px; color:#64748b;">₫</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:12px; align-items:center; flex-wrap:wrap;">
          <span style="font-size:13px; color:#64748b;">Đơn giá lưu sẽ áp dụng ngay cho toàn bộ 18 sân và hiển thị trên bảng giá trang chủ. Chấp nhận dạng số hoặc có dấu chấm (ví dụ: 120.000).</span>
          <button type="submit" class="btn-pill-primary" style="padding:10px 22px; font-weight:500;">
            ${inlineIcon('check', 18)} Cập nhật &amp; Đồng bộ bảng giá toàn hệ thống
          </button>
        </div>
      </form>
    </section>
  `;
}

export function renderAdminCourtsAndPricingPage(data: {
  session: SessionContext;
  courts: CourtSummary[];
  priceBoard?: PriceBoardTier[];
  activeBlocks: Array<{
    id: string;
    court_id: string;
    court_name: string;
    block_date: string;
    start_hour: number;
    end_hour: number;
    reason: string;
    created_at: string | Date;
  }>;
  selectedDate: string;
}): string {
  const csrfToken = data.session.csrfToken;

  return `
    ${renderAdminSubnav('courts', data.session)}

    <!-- Bảng giá niêm yết chính thức & Áp dụng đồng bộ cho toàn bộ 18 sân Be Badminton -->
    ${renderOfficialPriceBoardTable(data.priceBoard, csrfToken, '/quan-tri/san-va-gia')}

    <div class="grid-2" style="margin-bottom: 28px;">
      <!-- Khóa lịch bảo trì với lý do -->
      <section class="flat-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
          
          <h2 class="headline-md">Khóa lịch bảo trì theo khung giờ</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 16px;">
          Hệ thống tự động kiểm tra và từ chối khóa lịch nếu khung giờ đó đang có khách giữ chỗ hoặc đã đặt xác nhận.
        </p>
        <form method="POST" action="/quan-tri/khoa-lich">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <div class="grid-2">
            <div class="form-group">
              <label for="blk-court" class="form-label">Chọn sân</label>
              <select id="blk-court" name="courtId" class="network-select" required>
                ${data.courts.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="blk-date" class="form-label">Ngày bảo trì</label>
              <input id="blk-date" type="date" name="blockDate" value="${escapeHtml(data.selectedDate)}" class="text-input" required />
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label for="blk-hour" class="form-label">Khung giờ (60 phút)</label>
              <select id="blk-hour" name="startHour" class="network-select" required>
                ${Array.from({ length: 19 }, (_, i) => i + 5)
                  .map((h) => `<option value="${h}">${escapeHtml(formatSlotRange(h))}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="blk-reason" class="form-label">Lý do bảo trì *</label>
              <input id="blk-reason" type="text" name="reason" placeholder="Ví dụ: Căng lại lưới và vệ sinh mặt thảm" class="text-input" required />
            </div>
          </div>
          <button type="submit" class="btn-pill-danger">Khóa khung giờ này</button>
        </form>

        ${
          data.activeBlocks.length > 0
            ? `
              <div style="margin-top:20px; border-top:1px solid var(--hairline-soft); padding-top:14px;">
                <h3 class="headline-sm" style="margin-bottom:10px;">Các khung giờ đang khóa bảo trì (${data.activeBlocks.length})</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Sân</th>
                      <th>Ngày &amp; Giờ</th>
                      <th>Lý do</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.activeBlocks
                      .map(
                        (bl) => `
                      <tr>
                        <td><strong>${escapeHtml(bl.court_name)}</strong></td>
                        <td class="num">${escapeHtml(formatVietnamDateDisplay(bl.block_date))} · ${escapeHtml(formatSlotRange(bl.start_hour))}</td>
                        <td>${escapeHtml(bl.reason)}</td>
                        <td>
                          <form method="POST" action="/quan-tri/mo-khoa-lich" style="margin:0;">
                            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                            <input type="hidden" name="blockId" value="${escapeHtml(bl.id)}" />
                            <button type="submit" class="btn-pill-outline" style="padding:6px 12px; min-height:34px; font-size:12px;">Mở lại sân</button>
                          </form>
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            : ''
        }
      </section>

      <!-- Thiết lập quy tắc giá theo sân, ngày trong tuần và giờ chơi -->
      <section class="flat-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
          
          <h2 class="headline-md">Giá theo khung giờ</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 16px;">
          Thay đổi giá chỉ áp dụng cho các đơn tạo mới; không làm thay đổi số tiền của các đơn đã giữ chỗ hoặc đã xác nhận.
        </p>
        <form method="POST" action="/quan-tri/quy-tac-gia">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <div class="grid-2">
            <div class="form-group">
              <label for="pr-court" class="form-label">Sân áp dụng</label>
              <select id="pr-court" name="courtId" class="network-select" required>
                <option value="ALL"> Tất cả 18 sân (Toàn bộ Be Badminton)</option>
                ${data.courts.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="pr-day" class="form-label">Nhóm ngày trong tuần</label>
              <select id="pr-day" name="dayType" class="network-select" required>
                <option value="WEEKDAY">Thứ 2 – Thứ 6 (Ngày thường)</option>
                <option value="WEEKEND">Thứ 7 &amp; Chủ Nhật (Cuối tuần)</option>
                <option value="ALL">Tất cả các ngày</option>
              </select>
            </div>
          </div>
          <div class="grid-3">
            <div class="form-group">
              <label for="pr-start" class="form-label">Từ giờ (05..23)</label>
              <input id="pr-start" type="number" min="5" max="23" name="startHour" value="17" class="text-input" required />
            </div>
            <div class="form-group">
              <label for="pr-end" class="form-label">Đến giờ (06..24)</label>
              <input id="pr-end" type="number" min="6" max="24" name="endHour" value="22" class="text-input" required />
            </div>
            <div class="form-group">
              <label for="pr-price" class="form-label">Đơn giá (₫ / 60 phút)</label>
              <input id="pr-price" type="number" step="5000" min="10000" name="priceVnd" value="140000" class="text-input" required />
            </div>
          </div>
          <div class="form-group">
            <label for="pr-label" class="form-label">Nhãn mô tả khung giá *</label>
            <input id="pr-label" type="text" name="label" value="Thứ 2 – Thứ 6: Giờ vàng (17:00 – 22:00) · Cố định: 130.000 ₫" class="text-input" required />
          </div>
          <button type="submit" class="btn-pill-dark">Lưu quy tắc giá</button>
        </form>
      </section>
    </div>

    <!-- Quản lý danh sách sân & Thêm sân mới -->
    <section class="flat-panel" style="margin-bottom: 28px;">
      ${sectionHeading({
        title: `Quản lý các sân hiện có (${data.courts.length} sân)`,

        tone: 'blue',
      })}

      <div class="grid-2">
        ${data.courts
          .map(
            (c) => `
          <form method="POST" action="/quan-tri/san/${encodeURIComponent(c.id)}/cap-nhat" class="soft-panel" onsubmit="syncCourtImagesBeforeSubmit('${escapeHtml(c.id)}')">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong class="num">Mã sân: ${escapeHtml(c.code)}</strong>
              <span class="status-badge ${c.status === 'ACTIVE' ? 'badge-confirmed' : 'badge-neutral'}">
                ${c.status === 'ACTIVE' ? '● Đang hoạt động' : ' Ngừng hoạt động'}
              </span>
            </div>
            <div class="form-group">
              <label class="form-label">Tên sân</label>
              <input type="text" name="name" value="${escapeHtml(c.name)}" class="text-input" required />
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Phân loại sân</label>
                <input type="text" name="courtType" value="${escapeHtml(c.court_type)}" class="text-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Giá cơ sở (₫/60p)</label>
                <input type="number" name="basePriceVnd" value="${c.base_price_vnd}" class="text-input" required />
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Mặt thảm</label>
                <input type="text" name="surfaceDesc" value="${escapeHtml(c.surface_desc)}" class="text-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Trạng thái phục vụ</label>
                <select name="status" class="network-select">
                  <option value="ACTIVE" ${c.status === 'ACTIVE' ? 'selected' : ''}>Đang hoạt động</option>
                  <option value="INACTIVE" ${c.status === 'INACTIVE' ? 'selected' : ''}>Ngừng hoạt động</option>
                </select>
              </div>
            </div>
            <input type="hidden" name="lightingDesc" value="${escapeHtml(c.lighting_desc)}" />
            <input type="hidden" name="description" value="${escapeHtml(c.description)}" />
            <input type="hidden" name="usageNotes" value="${escapeHtml(c.usage_notes)}" />
            <div class="form-group">
              <label class="form-label">Tiện ích (phân cách bằng dấu phẩy)</label>
              <input type="text" name="amenitiesCsv" value="${escapeHtml(c.amenities.join(', '))}" class="text-input" />
            </div>

            <!-- Quản lý hình ảnh riêng của sân: Tải ảnh từ máy tính, dùng nhiều ảnh & xóa ảnh trực tiếp -->
            <div class="form-group" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                <div>
                  <label class="form-label" style="margin-bottom:2px; font-weight:600; font-size:13.5px; color:#0f172a;">
                    Ảnh sân <span id="court-images-count-${escapeHtml(c.id)}" style="color:#0052ff; font-weight:500;">(${(c.images || []).length} ảnh)</span>
                  </label>
                  <div style="font-size:12px; color:#64748b;">JPG, PNG, WebP · Tối đa 10 MB/ảnh · Ảnh được lưu ngay khi tải lên</div>
                </div>

                <div>
                  <input
                    type="file"
                    id="court-file-${escapeHtml(c.id)}"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    multiple
                    style="display:none;"
                    onchange="handleCourtImageFiles(event, '${escapeHtml(c.id)}')"
                  />
                  <button
                    type="button"
                    class="btn-pill-dark"
                    style="background:#0052ff; color:#fff; font-size:12px; font-weight:500; padding:6px 14px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;"
                    onclick="document.getElementById('court-file-${escapeHtml(c.id)}').click()"
                  >
                    Tải ảnh lên
                  </button>
                </div>
              </div>

              <!-- Lưới xem trước các ảnh của sân kèm nút XÓA ảnh (không hiển thị mô tả ảnh) -->
              <div id="court-images-grid-${escapeHtml(c.id)}" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:10px; margin-bottom:12px;">
                ${(c.images && c.images.length > 0)
                  ? c.images.map((img, i) => `
                    <div class="court-img-card" style="position:relative; background:#fff; border:1.5px solid ${i === 0 ? '#0052ff' : '#cbd5e1'}; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); height:96px;">
                      <img src="${escapeHtml(img.url)}" alt="Ảnh sân" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='/public/assets/icons/home-circle-gold.svg'" />
                      <span style="position:absolute; top:5px; left:5px; background:${i === 0 ? '#0052ff' : 'rgba(15,23,42,0.8)'}; color:#fff; font-size:10px; font-weight:600; padding:2px 7px; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.3);">
                        ${i === 0 ? 'Ảnh chính' : `#${i + 1}`}
                      </span>
                      <button
                        type="button"
                        title="Xóa ảnh này"
                        style="position:absolute; top:5px; right:5px; width:22px; height:22px; background:#ef4444; color:#fff; border:none; border-radius:50%; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 4px rgba(0,0,0,0.4);"
                        onclick="removeCourtImage('${escapeHtml(c.id)}', ${i})"
                      >
                        
                      </button>
                    </div>
                  `).join('')
                  : `<div style="grid-column: 1 / -1; padding:16px; text-align:center; color:#94a3b8; font-size:12.5px; border:1px dashed #cbd5e1; border-radius:8px;">Chưa có ảnh nào. Bấm "Tải ảnh lên" để chọn ảnh từ máy tính.</div>`
                }
              </div>

              <!-- Thanh trạng thái tải lên -->
              <div id="court-upload-status-${escapeHtml(c.id)}" style="font-size:12px; font-weight:600; margin-bottom:8px; display:none;"></div>

              <!-- Dữ liệu JSON gửi lên server -->
              <input
                type="hidden"
                id="court-images-json-${escapeHtml(c.id)}"
                name="imagesJson"
                value="${escapeHtml(JSON.stringify(c.images || []))}"
              />
              <textarea
                id="court-images-text-${escapeHtml(c.id)}"
                name="imageUrlsText"
                style="display:none;"
              >${(c.images || []).map(img => img.url).join('\n')}</textarea>
            </div>

            <button type="submit" class="btn-pill-dark">Cập nhật ${escapeHtml(c.code)}</button>
          </form>
        `
          )
          .join('')}
      </div>
    </section>

    <script src="/public/js/admin-court-images.js" defer></script>
  `;
}

export interface FixedBookingRequestRecord {
  id: string;
  request_code: string;
  user_id: string | null;
  customer_name: string | null;
  contact_phone: string;
  fixed_days: string;
  fixed_hour: string;
  fixed_court: string;
  status: 'NEW' | 'CONTACTED' | 'CONFIRMED' | 'CANCELLED';
  admin_note: string | null;
  handled_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export function renderAdminBookingsPage(data: {
  session: SessionContext;
  bookings: BookingRecord[];
  fixedRequests?: FixedBookingRequestRecord[];
  courts: Array<{ id: string; name: string }>;
  filters: {
    search: string;
    courtId: string;
    date: string;
    status: string;
  };
}): string {
  const csrfToken = data.session.csrfToken;
  const fixedList = data.fixedRequests || [];
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  return `
    ${renderAdminSubnav('bookings', data.session)}

    <div class="order-list-page">
    <nav class="order-shortcuts" aria-label="Lọc nhanh đơn đặt"><a href="/quan-tri/don-dat?date=${todayIso}">Đơn hôm nay</a><a href="/quan-tri/don-dat?date=${todayIso}&status=CONFIRMED">Chờ nhận sân</a><a href="#yeu-cau-co-dinh-thang">Lịch cố định tháng</a></nav>
    <section class="order-quick-entry"><div class="order-section-head"><h2>Nhận sân tại quầy</h2><a href="/quan-tri/quet-qr">Quét vé QR</a></div>
      <form method="POST" action="/quan-tri/don-dat/check-in-nhanh" class="order-quick-form">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <label for="quick-checkin">Mã đơn hoặc số điện thoại<input id="quick-checkin" name="bookingCodeOrPhone" required class="text-input" placeholder="CG-… hoặc số điện thoại" /></label><button type="submit" class="btn-pill-dark">Xác nhận nhận sân</button>
      </form></section>

    <section class="flat-panel" style="margin-bottom: 24px;">
      <form method="GET" action="/quan-tri/don-dat" class="grid-4" style="align-items: end;">
        <div class="form-group" style="margin-bottom:0;">
          <label for="ab-q" class="form-label">Mã đơn, tên hoặc điện thoại</label>
          <input id="ab-q" type="text" name="search" value="${escapeHtml(data.filters.search)}" placeholder="CG-... hoặc 090..." class="text-input" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="ab-court" class="form-label">Sân cầu lông</label>
          <select id="ab-court" name="courtId" class="network-select">
            <option value="">Tất cả các sân</option>
            ${data.courts
              .map(
                (c) =>
                  `<option value="${escapeHtml(c.id)}" ${data.filters.courtId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="ab-date" class="form-label">Ngày chơi</label>
          <input id="ab-date" type="date" name="date" value="${escapeHtml(data.filters.date)}" class="text-input" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="ab-status" class="form-label">Trạng thái đơn</label>
          <select id="ab-status" name="status" class="network-select">
            <option value="">Tất cả trạng thái</option>
            <option value="HOLD" ${data.filters.status === 'HOLD' ? 'selected' : ''}>Đang giữ chỗ</option>
            <option value="CONFIRMED" ${data.filters.status === 'CONFIRMED' ? 'selected' : ''}>Đã xác nhận</option>
            <option value="CHECKED_IN" ${data.filters.status === 'CHECKED_IN' ? 'selected' : ''}>Đã nhận sân</option>
            <option value="COMPLETED" ${data.filters.status === 'COMPLETED' ? 'selected' : ''}>Đã hoàn tất</option>
            <option value="CANCELLED" ${data.filters.status === 'CANCELLED' ? 'selected' : ''}>Đã hủy</option>
            <option value="EXPIRED" ${data.filters.status === 'EXPIRED' ? 'selected' : ''}>Hết hạn giữ chỗ</option>
          </select>
        </div>
        <div class="order-filter-actions">
          <button type="submit" class="btn-pill-dark">${inlineIcon('search', 16)}<span>Lọc đơn</span></button>
          <a href="/quan-tri/don-dat" class="btn-pill-outline">Xóa bộ lọc</a>
        </div>
      </form>
    </section>

    <section class="flat-panel">
      <h2 class="order-results-title">Đơn đặt <span class="order-muted">(${data.bookings.length})</span></h2>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Sân &amp; Khung giờ</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${data.bookings.length === 0 ? '<tr><td colspan="6">Không có đơn phù hợp. Hãy thử ngày hoặc trạng thái khác.</td></tr>' : data.bookings
              .map((b) => {
                const bStat = formatBookingStatusVi(b.booking_status);
                const pStat = formatPaymentStatusVi(b.payment_status);
                const rStat = formatRefundStatusVi(b.refund_status);

                return `
                <tr>
                  <td data-label="Mã đơn">
                    <a href="/quan-tri/don-dat/${encodeURIComponent(b.booking_code)}" class="num" style="font-weight:500; color:#0052ff;">${escapeHtml(b.booking_code)}</a>
                    <div class="caption-text">${escapeHtml(formatVietnamDateTimeDisplay(b.created_at))}</div>
                  </td>
                  <td data-label="Khách hàng">
                    <strong>${escapeHtml(b.contact_name)}</strong>
                    <div class="body-sm num">${escapeHtml(b.contact_phone)}</div>
                  </td>
                  <td data-label="Lịch chơi">
                    <strong>${escapeHtml(b.court_name_snapshot)}</strong>
                    <div class="body-sm num">${escapeHtml(formatSlotRange(b.start_hour, b.end_hour))} · ${escapeHtml(formatVietnamDateDisplay(b.booking_date))}</div>
                  </td>
                  <td data-label="Tổng tiền"><strong class="num">${escapeHtml(formatVnd(b.total_amount_vnd))}</strong></td>
                  <td data-label="Trạng thái">
                    <div><span class="status-badge ${bStat.cssClass}">${escapeHtml(bStat.label)}</span></div>
                    <div style="margin-top:4px;"><span class="status-badge ${pStat.cssClass}">${escapeHtml(pStat.label)}</span></div>
                    ${
                      b.refund_status !== 'NONE' && b.refund_status !== 'NOT_APPLICABLE'
                        ? `<div style="margin-top:4px;"><span class="status-badge ${rStat.cssClass}">HT: ${escapeHtml(rStat.label)}</span></div>`
                        : ''
                    }
                  </td>
                  <td data-label="Thao tác">
                    ${
                      b.booking_status === 'CONFIRMED' && b.payment_status === 'PAID'
                        ? `
                          <form method="POST" action="/quan-tri/don-dat/${encodeURIComponent(b.booking_code)}/trang-thai" style="margin:0;">
                            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                            <input type="hidden" name="targetStatus" value="CHECKED_IN" />
                            <button type="submit" class="btn-pill-dark" style="padding:7px 14px; min-height:36px; font-size:13px;">Nhận sân</button>
                          </form>
                        `
                        : b.booking_status === 'CHECKED_IN'
                          ? `
                            <form method="POST" action="/quan-tri/don-dat/${encodeURIComponent(b.booking_code)}/trang-thai" style="margin:0;">
                              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                              <input type="hidden" name="targetStatus" value="COMPLETED" />
                              <button type="submit" class="btn-pill-outline" style="padding:7px 14px; min-height:36px; font-size:13px;">Hoàn tất ca chơi</button>
                            </form>
                          `
                          : `<a href="/quan-tri/don-dat/${encodeURIComponent(b.booking_code)}" class="btn-text" style="font-size:13px; font-weight:600;">Chi tiết</a>`
                    }
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Danh sách Yêu cầu Đặt lịch Cố định Tháng (fixed_booking_requests) -->
    <section id="yeu-cau-co-dinh-thang" class="flat-panel" style="margin-top:24px;">
      <h2>Lịch cố định tháng <span class="order-muted">(${fixedList.length})</span></h2><p class="order-muted">Liên hệ khách để xác nhận lịch trước khi cập nhật trạng thái.</p>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã yêu cầu</th>
              <th>Khách hàng &amp; SĐT/Zalo</th>
              <th>Lịch cố định đăng ký</th>
              <th>Trạng thái xử lý</th>
              <th>Cập nhật &amp; Ghi chú quản trị</th>
            </tr>
          </thead>
          <tbody>
            ${
              fixedList.length === 0
                ? `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">Chưa có yêu cầu đặt sân cố định tháng nào.</td></tr>`
                : fixedList
                    .map((req) => {
                      const statusMeta =
                        req.status === 'CONFIRMED'
                          ? { label: ' Đã chốt lịch cố định', css: 'badge-confirmed' }
                          : req.status === 'CONTACTED'
                            ? { label: '◔ Đã liên hệ tư vấn', css: 'badge-live' }
                            : req.status === 'CANCELLED'
                              ? { label: ' Đã hủy / Từ chối', css: 'badge-cancelled' }
                              : { label: '● Mới gửi yêu cầu', css: 'badge-live' };
                      return `
                        <tr>
                          <td data-label="Mã yêu cầu">
                            <strong class="num" style="color:#0f6938;">${escapeHtml(req.request_code)}</strong>
                            <div class="caption-text num">${escapeHtml(formatVietnamDateTimeDisplay(req.created_at))}</div>
                          </td>
                          <td data-label="Khách hàng">
                            <strong>${escapeHtml(req.customer_name || 'Khách đặt cố định')}</strong>
                            <div class="body-sm num" style="font-weight:500; color:#0d3b66;">${escapeHtml(req.contact_phone)}</div>
                          </td>
                          <td data-label="Lịch đăng ký">
                            <div><strong>${escapeHtml(req.fixed_days)}</strong></div>
                            <div class="body-sm">${escapeHtml(req.fixed_hour)} · <strong>${escapeHtml(req.fixed_court)}</strong></div>
                          </td>
                          <td data-label="Trạng thái">
                            <span class="status-badge ${statusMeta.css}">${statusMeta.label}</span>
                            ${req.admin_note ? `<div class="caption-text" style="margin-top:4px;">Ghi chú: ${escapeHtml(req.admin_note)}</div>` : ''}
                          </td>
                          <td data-label="Cập nhật">
                            <form method="POST" action="/quan-tri/co-dinh-thang/${encodeURIComponent(req.id)}/trang-thai" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0;">
                              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                              <select name="status" class="network-select" style="width:auto; min-width:140px; padding:6px 10px; font-size:12.5px;">
                                <option value="NEW" ${req.status === 'NEW' ? 'selected' : ''}>Mới gửi</option>
                                <option value="CONTACTED" ${req.status === 'CONTACTED' ? 'selected' : ''}>Đã liên hệ</option>
                                <option value="CONFIRMED" ${req.status === 'CONFIRMED' ? 'selected' : ''}>Đã chốt lịch</option>
                                <option value="CANCELLED" ${req.status === 'CANCELLED' ? 'selected' : ''}>Đã hủy</option>
                              </select>
                              <input type="text" name="adminNote" value="${escapeHtml(req.admin_note || '')}" placeholder="Ghi chú xếp sân..." class="text-input" style="width:160px; padding:6px 10px; font-size:12.5px;" />
                              <button type="submit" class="btn-pill-dark" style="padding:6px 12px; min-height:34px; font-size:12.5px;">Lưu</button>
                              <a href="/quan-tri/co-dinh-thang/${encodeURIComponent(req.id)}" class="btn-pill-outline" style="padding:6px 12px; min-height:34px; font-size:12.5px; text-decoration:none; display:inline-flex; align-items:center;">Xếp sân &amp; Chốt lịch</a>
                            </form>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
    </div>
  `;
}

export function renderAdminPaymentsAndRefundsPage(data: {
  session: SessionContext;
  refunds: Array<{
    id: string;
    booking_id: string;
    booking_code: string;
    payment_attempt_id: string;
    merchant_txn_ref: string;
    provider_txn_no: string | null;
    refund_code: string;
    amount_vnd: number;
    reason_type: string;
    reason_note: string;
    status: string;
    provider_refund_id: string | null;
    attempt_count: number;
    last_error_code: string | null;
    last_error_message: string | null;
    completed_at: string | Date | null;
    created_at: string | Date;
    destination_bank_name?: string | null;
    destination_bank_code?: string | null;
    destination_account_no?: string | null;
    destination_account_name?: string | null;
    sender_bank_name?: string | null;
    sender_bank_code?: string | null;
    sender_account_no?: string | null;
    sender_account_name?: string | null;
    is_manual_refund?: boolean;
    manual_txn_ref?: string | null;
    manual_refund_note?: string | null;
    manual_refunded_at?: string | Date | null;
    manual_refunded_by_name?: string | null;
  }>;
  payments: Array<{
    id: string;
    booking_code: string;
    provider: string;
    merchant_txn_ref: string;
    provider_txn_no: string | null;
    amount_vnd: number;
    status: string;
    signature_verified: boolean;
    paid_at: string | Date | null;
    created_at: string | Date;
    sender_bank_name?: string | null;
    sender_bank_code?: string | null;
    sender_account_no?: string | null;
    sender_account_name?: string | null;
  }>;
}): string {
  const csrfToken = data.session.csrfToken;

  return `
    ${renderAdminSubnav('payments', data.session)}

    <section class="flat-panel" style="margin-bottom: 28px;">
      ${sectionHeading({
        title: `Quản lý & đối soát hoàn tiền (${data.refunds.length})`,
        subtitle:
          'Số tiền hoàn được cố định từ giao dịch gốc đã xác thực. Tuân thủ nghiêm ngặt quy định phòng chống rửa tiền (AML): Tiền hoàn BẮT BUỘC chuyển trả về đúng tài khoản ngân hàng nguồn của người gửi, tuyệt đối không hoàn sang số tài khoản khác hoặc tiền mặt khi đã thanh toán chuyển khoản.',
        tone: 'orange',
      })}

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã hoàn / Đơn</th>
              <th>Tài khoản nhận hoàn (AML)</th>
              <th>Giao dịch gốc</th>
              <th>Số tiền hoàn</th>
              <th>Trạng thái đối soát</th>
              <th>Thao tác an toàn &amp; Hoàn thủ công</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.refunds.length === 0
                ? `<tr><td colspan="6">Chưa có yêu cầu hoàn tiền nào phát sinh.</td></tr>`
                : data.refunds
                    .map((r) => {
                      const canRetry = r.status !== 'SUCCEEDED';
                      const statusLabel =
                        r.status === 'SUCCEEDED'
                          ? ' Thành công'
                          : r.status === 'FAILED_DEFINITE'
                            ? '! Cần kiểm tra / Đối soát'
                            : r.status === 'UNKNOWN_NEEDS_RECONCILE'
                              ? '? Chưa rõ kết quả — Cần đối soát'
                              : '◔ Đang chờ / Thử lại';

                      const bankName = r.destination_bank_name || r.sender_bank_name || 'MB Bank (Quân Đội)';
                      const accNo = r.destination_account_no || r.sender_account_no || '0987654321';
                      const accName = r.destination_account_name || r.sender_account_name || 'NGUYEN VAN A';

                      return `
                      <tr>
                        <td>
                          <strong class="num">${escapeHtml(r.refund_code)}</strong>
                          <div class="body-sm">Đơn: <a href="/don-dat/${encodeURIComponent(r.booking_code)}" style="font-weight:500;">${escapeHtml(r.booking_code)}</a></div>
                        </td>
                        <td>
                          <div style="font-weight:700; color:var(--ink);">${escapeHtml(bankName)}</div>
                          <div>STK: <code style="font-weight:700; color:#1d4ed8; font-size:12.5px;">${escapeHtml(accNo)}</code></div>
                          <div class="caption-text" style="font-weight:600; text-transform:uppercase;">${escapeHtml(accName)}</div>
                          <span style="display:inline-block; margin-top:3px; font-size:10.5px; font-weight:700; color:#047857; background:#d1fae5; border:1px solid #6ee7b7; padding:1px 6px; border-radius:4px;">AML: Hoàn đúng nguồn</span>
                        </td>
                        <td>
                          <div><code>${escapeHtml(r.merchant_txn_ref)}</code></div>
                          ${r.provider_refund_id ? `<div class="caption-text">Mã hoàn cổng: ${escapeHtml(r.provider_refund_id)}</div>` : ''}
                        </td>
                        <td><strong class="num">${escapeHtml(formatVnd(r.amount_vnd))}</strong><div class="caption-text">Số lần thử: ${r.attempt_count}</div></td>
                        <td>
                          <span class="status-badge ${r.status === 'SUCCEEDED' ? 'badge-confirmed' : 'badge-live'}">${escapeHtml(statusLabel)}</span>
                          ${
                            r.last_error_code || r.last_error_message
                              ? `<div class="body-sm" style="color:var(--down); margin-top:4px;"><strong>${escapeHtml(r.last_error_code || 'ERROR')}:</strong> ${escapeHtml(r.last_error_message || '')}</div>`
                              : ''
                          }
                        </td>
                        <td>
                          ${
                            canRetry
                              ? `
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                  <form method="POST" action="/quan-tri/hoan-tien/${encodeURIComponent(r.id)}/thu-lai" style="margin:0;">
                                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                    <button type="submit" class="btn-pill-dark" style="width:100%; padding:6px 10px; min-height:30px; font-size:11.5px;">
                                      Đối soát cổng tự động
                                    </button>
                                  </form>

                                  <details style="font-size:11.5px; margin-top:2px;">
                                    <summary style="cursor:pointer; color:#2563eb; font-weight:600; padding:2px 0;">
                                      Hoàn tiền thủ công (AML) ▾
                                    </summary>
                                    <form method="POST" action="/quan-tri/hoan-tien/${encodeURIComponent(r.id)}/hoan-thu-cong" style="margin-top:6px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px; width:220px;">
                                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                      <div style="margin-bottom:6px;">
                                        <label style="display:block; font-size:10.5px; font-weight:600; color:#475569; margin-bottom:2px;">Mã GD ngân hàng / UNC:</label>
                                        <input type="text" name="manualTxnRef" placeholder="VD: FT261031..." required style="width:100%; height:26px; padding:2px 6px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; font-family:monospace;" />
                                      </div>
                                      <div style="margin-bottom:6px;">
                                        <label style="display:block; font-size:10.5px; font-weight:600; color:#475569; margin-bottom:2px;">Ghi chú đối soát AML:</label>
                                        <input type="text" name="manualRefundNote" value="Đã chuyển hoàn đúng tài khoản nguồn" style="width:100%; height:26px; padding:2px 6px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;" />
                                      </div>
                                      <button type="submit" class="btn-pill-outline" style="width:100%; padding:4px 6px; font-size:11px; background:#059669; color:#fff; border-color:#059669; font-weight:600;">
                                        Xác nhận đã chuyển hoàn
                                      </button>
                                    </form>
                                  </details>
                                </div>
                              `
                              : r.is_manual_refund
                                ? `
                                  <span class="status-badge badge-confirmed" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">✓ Hoàn tiền thủ công</span>
                                  <div class="caption-text" style="margin-top:4px;">Mã GD NH: <strong>${escapeHtml(r.manual_txn_ref || '—')}</strong></div>
                                  ${r.manual_refunded_by_name ? `<div class="caption-text">Bởi: ${escapeHtml(r.manual_refunded_by_name)}</div>` : ''}
                                  <div class="caption-text">${escapeHtml(formatVietnamDateTimeDisplay(r.manual_refunded_at || r.completed_at))}</div>
                                `
                                : `<span class="caption-text">Đã hoàn tất qua Cổng lúc ${escapeHtml(formatVietnamDateTimeDisplay(r.completed_at))}</span>`
                          }
                        </td>
                      </tr>
                    `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="flat-panel">
      ${sectionHeading({
        title: `Lịch sử giao dịch thanh toán gốc (${data.payments.length})`,
        subtitle: 'Lưu trữ tài khoản nguồn thanh toán phục vụ đối soát, hoàn tiền thủ công và phòng chống rửa tiền (AML).',
        tone: 'green',
      })}

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã tham chiếu (Merchant Ref)</th>
              <th>Mã đơn</th>
              <th>Tài khoản nguồn (AML)</th>
              <th>Nhà cung cấp</th>
              <th>Mã GD Cổng</th>
              <th>Số tiền</th>
              <th>Chữ ký số</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.payments.length === 0
                ? `<tr><td colspan="8">Chưa có giao dịch thanh toán nào.</td></tr>`
                : data.payments
                    .map(
                      (p) => `
                    <tr>
                      <td><code>${escapeHtml(p.merchant_txn_ref)}</code><div class="caption-text">${escapeHtml(formatVietnamDateTimeDisplay(p.created_at))}</div></td>
                      <td><a href="/don-dat/${encodeURIComponent(p.booking_code)}" class="num" style="font-weight:500;">${escapeHtml(p.booking_code)}</a></td>
                      <td>
                        ${
                          p.sender_account_no
                            ? `
                              <div style="font-weight:700; color:var(--ink); font-size:12px;">${escapeHtml(p.sender_bank_name || p.sender_bank_code || 'MB Bank')}</div>
                              <div>STK: <code style="color:#1d4ed8; font-weight:700; font-size:12px;">${escapeHtml(p.sender_account_no)}</code></div>
                              <div class="caption-text" style="font-weight:600; text-transform:uppercase;">${escapeHtml(p.sender_account_name || 'NGUYEN VAN A')}</div>
                            `
                            : `<span class="caption-text">—</span>`
                        }
                      </td>
                      <td>${escapeHtml(p.provider)}</td>
                      <td class="num">${escapeHtml(p.provider_txn_no || '—')}</td>
                      <td><strong class="num">${escapeHtml(formatVnd(p.amount_vnd))}</strong></td>
                      <td>${p.signature_verified ? ' Hợp lệ' : 'Chờ xác thực'}</td>
                      <td><strong>${escapeHtml(p.status === 'SUCCEEDED' ? 'Thành công' : p.status === 'LATE_SUCCEEDED' ? 'Thanh toán trễ (Đã chuyển hoàn)' : p.status === 'FAILED' ? 'Thất bại' : 'Đang chờ')}</strong></td>
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

export function renderAdminCouponsPage(data: {
  coupons: CouponRecord[];
  statusFilter: string;
  session: SessionContext;
  successMessage?: string;
  errorMessage?: string;
}): string {
  const { coupons, statusFilter, session, successMessage, errorMessage } = data;
  const csrfToken = session.csrfToken;

  const totalCoupons = coupons.length;
  const activeCoupons = coupons.filter((c) => c.status === 'ACTIVE').length;
  const inactiveCoupons = coupons.filter((c) => c.status === 'INACTIVE').length;
  const totalUses = coupons.reduce((sum, c) => sum + (c.used_count || 0), 0);

  const filteredCoupons =
    statusFilter === 'ACTIVE'
      ? coupons.filter((c) => c.status === 'ACTIVE')
      : statusFilter === 'INACTIVE'
        ? coupons.filter((c) => c.status === 'INACTIVE')
        : coupons;

  return `
    ${renderAdminSubnav('coupons', session)}

    ${sectionHeading({
      level: 'h2',
      title: 'Mã ưu đãi',
      subtitle: 'Tạo mã ưu đãi, cấu hình mức giảm %, giảm tiền cố định, thời hạn và quản lý lượt sử dụng.',

      tone: 'green',
    })}

    ${
      successMessage
        ? `<div class="breaking-band" style="background:#ecfdf5; border-color:#a7f3d0; color:#065f46; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:8px;">
              
              <strong>${escapeHtml(successMessage)}</strong>
            </div>
          </div>`
        : ''
    }

    ${
      errorMessage
        ? `<div class="breaking-band" style="background:#fef2f2; border-color:#fecaca; color:#991b1b; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:8px;">
              
              <strong>${escapeHtml(errorMessage)}</strong>
            </div>
          </div>`
        : ''
    }

    <!-- Thống kê tổng quan Coupon -->
    <div class="grid-4" style="margin-bottom: 28px;">
      <div class="feature-card">
        <div class="caption-text">Tổng số mã Coupon</div>
        <div class="num" style="font-size:28px; font-weight:500; margin-top:4px;">${totalCoupons}</div>
        <div class="body-sm" style="color:var(--muted); margin-top:2px;">Tất cả chương trình đã tạo</div>
      </div>
      <div class="feature-card">
        <div class="caption-text">Đang kích hoạt (ACTIVE)</div>
        <div class="num" style="font-size:28px; font-weight:500; color:#0f6938; margin-top:4px;">${activeCoupons}</div>
        <div class="body-sm" style="color:var(--muted); margin-top:2px;">Khách có thể dùng ngay</div>
      </div>
      <div class="feature-card">
        <div class="caption-text">Đang tạm ngưng</div>
        <div class="num" style="font-size:28px; font-weight:500; color:#dc2626; margin-top:4px;">${inactiveCoupons}</div>
        <div class="body-sm" style="color:var(--muted); margin-top:2px;">Tạm thời vô hiệu hóa</div>
      </div>
      <div class="feature-card">
        <div class="caption-text">Tổng lượt đã sử dụng</div>
        <div class="num" style="font-size:28px; font-weight:500; color:#0052ff; margin-top:4px;">${totalUses}</div>
        <div class="body-sm" style="color:var(--muted); margin-top:2px;">Lượt đặt sân áp mã thành công</div>
      </div>
    </div>

    <!-- Khối tạo Coupon mới đầy đủ tính năng -->
    <section class="flat-panel" style="margin-bottom: 32px;" aria-labelledby="create-coupon-heading">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        
        <div>
          <h3 id="create-coupon-heading" class="headline-md" style="margin:0;">Tạo mã ưu đãi</h3>
          <p class="caption-text" style="margin:2px 0 0 0;">Thiết lập mã giảm giá theo % hoặc theo số tiền cố định</p>
        </div>
      </div>

      <form method="POST" action="/quan-tri/khuyen-mai/tao-moi" id="form-create-coupon">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

        <div class="grid-3" style="gap:16px; margin-bottom:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-code" class="form-label">Mã Coupon * (viết liền không dấu)</label>
            <input
              type="text"
              id="cp-new-code"
              name="code"
              class="text-input"
              placeholder="Ví dụ: CHAOMUNG2026, BEBADMINTON10..."
              style="text-transform:uppercase; font-weight:500;"
              required
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-title" class="form-label">Tên chương trình ưu đãi *</label>
            <input
              type="text"
              id="cp-new-title"
              name="title"
              class="text-input"
              placeholder="Ví dụ: Giảm 10% cho hội viên mới"
              required
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-type" class="form-label">Hình thức giảm giá *</label>
            <select id="cp-new-type" name="discountType" class="network-select" required>
              <option value="PERCENT">Giảm theo phần trăm (%)</option>
              <option value="FIXED">Giảm số tiền cố định (VNĐ)</option>
            </select>
          </div>
        </div>

        <div class="grid-4" style="gap:16px; margin-bottom:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-value" class="form-label">Mức giảm giá * (% hoặc VNĐ)</label>
            <input
              type="number"
              id="cp-new-value"
              name="discountValue"
              class="text-input"
              placeholder="Ví dụ: 10 (nếu là %) hoặc 20000 (nếu là VNĐ)"
              min="1"
              step="any"
              required
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-max" class="form-label">Giảm tối đa (VNĐ) — (cho %)</label>
            <input
              type="number"
              id="cp-new-max"
              name="maxDiscountAmountVnd"
              class="text-input"
              placeholder="Ví dụ: 50000 (để trống nếu không giới hạn)"
              min="0"
              step="1000"
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-min-order" class="form-label">Đơn tối thiểu (VNĐ)</label>
            <input
              type="number"
              id="cp-new-min-order"
              name="minOrderAmountVnd"
              class="text-input"
              placeholder="Ví dụ: 100000 (0 = không yêu cầu)"
              min="0"
              step="1000"
              value="0"
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-limit" class="form-label">Giới hạn tổng lượt dùng</label>
            <input
              type="number"
              id="cp-new-limit"
              name="usageLimit"
              class="text-input"
              placeholder="Ví dụ: 100 (để trống = vô hạn)"
              min="1"
            />
          </div>
        </div>

        <div class="grid-3" style="gap:16px; margin-bottom:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-from" class="form-label">Thời gian bắt đầu có hiệu lực</label>
            <input
              type="datetime-local"
              id="cp-new-from"
              name="validFrom"
              class="text-input"
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-until" class="form-label">Thời gian kết thúc (Hết hạn)</label>
            <input
              type="datetime-local"
              id="cp-new-until"
              name="validUntil"
              class="text-input"
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-status" class="form-label">Trạng thái ban đầu *</label>
            <select id="cp-new-status" name="status" class="network-select">
              <option value="ACTIVE" selected>Kích hoạt ngay (ACTIVE)</option>
              <option value="INACTIVE">Tạm ngưng (INACTIVE)</option>
            </select>
          </div>
        </div>

        <div class="grid-2" style="gap:16px; margin-bottom:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-user-limit" class="form-label">Giới hạn sử dụng cho mỗi tài khoản *</label>
            <select id="cp-new-user-limit" name="maxUsesPerUser" class="network-select">
              <option value="1" selected> Mỗi tài khoản chỉ được dùng 1 lần</option>
              <option value=""> Dùng nhiều lần (Không giới hạn trên mỗi tài khoản)</option>
              <option value="2"> Tối đa 2 lần / 1 tài khoản</option>
              <option value="3"> Tối đa 3 lần / 1 tài khoản</option>
              <option value="5"> Tối đa 5 lần / 1 tài khoản</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="cp-new-public-suggested" class="form-label">Hiển thị ở mục "Voucher gợi ý cho bạn" *</label>
            <select id="cp-new-public-suggested" name="isPublicSuggested" class="network-select">
              <option value="1" selected> Có hiển thị ở "Voucher gợi ý cho bạn" (Công khai)</option>
              <option value="0"> Không hiển thị gợi ý (Mã ẩn / Chỉ nhập tay)</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:18px;">
          <label for="cp-new-desc" class="form-label">Mô tả chi tiết / Ghi chú điều kiện áp dụng</label>
          <textarea
            id="cp-new-desc"
            name="description"
            class="text-input"
            rows="2"
            placeholder="Ví dụ: Áp dụng cho mọi khung giờ trong tuần, trừ các giải đấu đặc biệt..."
          ></textarea>
        </div>

        <button type="submit" class="btn-pill-primary" style="padding:10px 24px; min-height:42px;">
          ${inlineIcon('plus', 16)}
          <span>Lưu &amp; Kích hoạt mã Coupon mới</span>
        </button>
      </form>
    </section>

    <!-- Danh sách các mã Coupon hiện hành -->
    <section aria-labelledby="coupon-list-heading">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
        <h3 id="coupon-list-heading" class="headline-md" style="margin:0;">
          Danh sách Coupon trong hệ thống (${filteredCoupons.length})
        </h3>

        <form method="GET" action="/quan-tri/khuyen-mai" style="display:flex; gap:10px; align-items:center;">
          <label for="coupon-filter-status" class="sr-only">Lọc theo trạng thái</label>
          <select id="coupon-filter-status" name="status" class="network-select" style="min-height:36px; padding:4px 30px 4px 10px; font-size:13px;" onchange="this.form.submit()">
            <option value="" ${statusFilter === '' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="ACTIVE" ${statusFilter === 'ACTIVE' ? 'selected' : ''}>Đang kích hoạt (ACTIVE)</option>
            <option value="INACTIVE" ${statusFilter === 'INACTIVE' ? 'selected' : ''}>Đang tạm ngưng (INACTIVE)</option>
          </select>
          <noscript><button type="submit" class="btn-pill-dark" style="padding:6px 12px; font-size:12px;">Lọc</button></noscript>
        </form>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã Coupon &amp; Tên chương trình</th>
              <th>Mức giảm</th>
              <th>Đơn tối thiểu</th>
              <th>Lượt đã dùng</th>
              <th>Thời hạn hiệu lực</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredCoupons.length === 0
                ? `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">Chưa có mã giảm giá nào phù hợp với bộ lọc.</td></tr>`
                : filteredCoupons
                    .map((c) => {
                      const isExpired = c.valid_until && new Date(c.valid_until).getTime() < Date.now();
                      const isLimitReached = c.usage_limit !== null && c.used_count >= c.usage_limit;
                      return `
                        <tr>
                          <td>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                              <span style="font-family:var(--font-sans); font-weight:600; font-size:15px; color:#0d3b66; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px; letter-spacing:0.5px;">
                                ${escapeHtml(c.code)}
                              </span>
                              ${
                                c.is_public_suggested !== false
                                  ? `<span style="font-size:11px; font-weight:500; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 6px; border-radius:999px;"> Gợi ý công khai</span>`
                                  : `<span style="font-size:11px; font-weight:500; color:#475569; background:#f1f5f9; border:1px solid #cbd5e1; padding:2px 6px; border-radius:999px;"> Mã ẩn (Nhập tay)</span>`
                              }
                            </div>
                            <div style="font-weight:600; font-size:13px; margin-top:4px; color:#1e293b;">
                              ${escapeHtml(c.title)}
                            </div>
                            ${c.description ? `<div class="caption-text">${escapeHtml(c.description)}</div>` : ''}
                          </td>
                          <td>
                            ${
                              c.discount_type === 'PERCENT'
                                ? `<strong class="num" style="font-size:15px; color:#0f6938;">Giảm ${c.discount_value}%</strong>
                                   ${c.max_discount_amount_vnd ? `<div class="caption-text">Tối đa ${escapeHtml(formatVnd(c.max_discount_amount_vnd))}</div>` : '<div class="caption-text">Không giới hạn trần</div>'}`
                                : `<strong class="num" style="font-size:15px; color:#0f6938;">Giảm ${escapeHtml(formatVnd(c.discount_value))}</strong>`
                            }
                          </td>
                          <td>
                            ${
                              c.min_order_amount_vnd > 0
                                ? `<strong class="num">${escapeHtml(formatVnd(c.min_order_amount_vnd))}</strong>`
                                : `<span class="caption-text">Không yêu cầu</span>`
                            }
                          </td>
                          <td>
                            <strong class="num" style="font-size:14px;">${c.used_count}</strong>
                            <span class="caption-text"> / ${c.usage_limit !== null ? c.usage_limit : '∞'}</span>
                            <div class="caption-text" style="margin-top:2px;">
                              ${
                                c.max_uses_per_user
                                  ? c.max_uses_per_user === 1
                                    ? ' 1 lần/tài khoản'
                                    : ` Tối đa ${c.max_uses_per_user} lần/TK`
                                  : ' Nhiều lần/tài khoản'
                              }
                            </div>
                            ${isLimitReached ? `<div style="font-size:11px; color:#dc2626; font-weight:500;">Hết lượt</div>` : ''}
                          </td>
                          <td>
                            <div style="font-size:12px;">
                              Từ: ${escapeHtml(formatVietnamDateDisplay(c.valid_from))}
                            </div>
                            <div style="font-size:12px; margin-top:2px;">
                              ${
                                c.valid_until
                                  ? `Đến: ${escapeHtml(formatVietnamDateDisplay(c.valid_until))}`
                                  : '<span style="color:#64748b;">Vô thời hạn</span>'
                              }
                            </div>
                            ${isExpired ? `<div style="font-size:11px; color:#dc2626; font-weight:500; margin-top:2px;">Đã hết hạn</div>` : ''}
                          </td>
                          <td>
                            <span class="status-badge ${c.status === 'ACTIVE' && !isExpired && !isLimitReached ? 'badge-confirmed' : 'badge-neutral'}">
                              ${c.status === 'ACTIVE' && !isExpired && !isLimitReached ? '● Đang kích hoạt' : ' Tạm ngưng'}
                            </span>
                          </td>
                          <td>
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                              <form method="POST" action="/quan-tri/khuyen-mai/${encodeURIComponent(c.id)}/trang-thai" style="margin:0;">
                                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                <button
                                  type="submit"
                                  class="${c.status === 'ACTIVE' ? 'btn-pill-outline' : 'btn-pill-dark'}"
                                  style="padding:5px 10px; min-height:32px; font-size:12px;"
                                >
                                  ${c.status === 'ACTIVE' ? 'Tạm ngưng' : 'Kích hoạt lại'}
                                </button>
                              </form>

                              <form method="POST" action="/quan-tri/khuyen-mai/${encodeURIComponent(c.id)}/xoa" style="margin:0;" onsubmit="return confirm('Bạn có chắc muốn xóa mã coupon ${escapeHtml(c.code)}?');">
                                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                <button
                                  type="submit"
                                  class="btn-pill-danger"
                                  style="padding:5px 10px; min-height:32px; font-size:12px;"
                                  title="Xóa mã giảm giá"
                                >
                                  Xóa
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}
