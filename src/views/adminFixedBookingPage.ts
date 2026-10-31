import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import {
  FixedBookingRequestRecord,
  formatWeekdays,
  parseWeekdays,
  WEEKDAY_LABELS,
  defaultFixedEndDate,
} from '../services/fixedScheduleService.js';
import {
  formatSlotRange,
  formatVietnamDateDisplay,
  formatVietnamDateTimeDisplay,
  getServerNow,
  toVietnamDateString,
} from '../utils/time.js';
import { inlineIcon } from './icons.js';

export function renderAdminFixedBookingDetailPage(data: {
  session: SessionContext;
  request: FixedBookingRequestRecord;
  courts: Array<{ id: string; name: string }>;
  lockedBlocks?: Array<{ block_date: string; start_hour: number }>;
}): string {
  const { session, request: req, courts, lockedBlocks = [] } = data;
  const csrfToken = session.csrfToken;
  const today = toVietnamDateString(getServerNow());
  const startDateVal = req.start_date || today;
  const endDateVal = req.end_date || defaultFixedEndDate(startDateVal);
  const selectedDays = req.weekdays ? parseWeekdays(req.weekdays) : [1, 3, 5];
  const startHourVal = req.start_hour !== null && req.start_hour !== undefined ? req.start_hour : 18;
  const durationVal = req.duration_hours || 2;
  const isConfirmed = req.status === 'CONFIRMED';

  const statusBadge =
    req.status === 'CONFIRMED'
      ? `<span class="badge badge-confirmed" style="font-size:13px; padding:5px 12px;">Đã chốt lịch cố định</span>`
      : req.status === 'CONTACTED'
        ? `<span class="badge badge-live" style="font-size:13px; padding:5px 12px;">Đã liên hệ tư vấn</span>`
        : req.status === 'CANCELLED'
          ? `<span class="badge badge-cancelled" style="font-size:13px; padding:5px 12px;">Đã hủy / Từ chối</span>`
          : `<span class="badge" style="font-size:13px; padding:5px 12px; background:#eff6ff; color:#1e40af;">Mới gửi yêu cầu</span>`;

  return `
    <div style="max-width: 980px; margin: 0 auto 48px auto;">
      <div style="margin-bottom: 20px;">
        <a href="/quan-tri/don-dat#yeu-cau-co-dinh-thang" class="btn-text" style="font-size:14px; font-weight:600;">
          ${inlineIcon('back', 16)}
          <span>Quay lại Danh sách yêu cầu cố định tháng</span>
        </a>
      </div>

      <div class="flat-panel" style="padding: 24px 28px; margin-bottom: 24px; border-radius: var(--r-lg); border:1px solid var(--hairline);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-size:12px; font-weight:500; color:#0f6938; text-transform:uppercase; letter-spacing:0.04em;">
              Yêu cầu đặt lịch cố định tháng
            </div>
            <h1 style="font-size: 24px; font-weight: 600; color: #0f172a; margin: 2px 0 6px 0;">
              ${escapeHtml(req.request_code)}
            </h1>
            <div style="font-size: 14px; color: #64748b;">
              Khách hàng: <strong style="color:#0f172a;">${escapeHtml(req.customer_name || 'Khách đặt cố định')}</strong> · SĐT/Zalo: <strong style="color:#0052ff;">${escapeHtml(req.contact_phone)}</strong>
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: start;">
        <!-- CỘT TRÁI: FORM CHỐT LỊCH & KHÓA SÂN -->
        <div style="display:flex; flex-direction:column; gap:20px;">
          <section class="flat-panel" style="padding: 22px 24px; border-radius: var(--r-lg); border: 1.5px solid #0f6938; background: #ffffff;">
            <h2 style="font-size: 17px; font-weight: 500; color: #0f6938; margin: 0 0 8px 0;">
              Xếp sân &amp; Chốt lịch cố định (Khóa full lịch sân)
            </h2>
            <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
              Khi chốt lịch, hệ thống sẽ tự động khóa toàn bộ các khung giờ này trên lịch thi đấu để khách vãng lai không thể đặt trùng.
            </p>

            <form method="POST" action="/quan-tri/co-dinh-thang/${encodeURIComponent(req.id)}/chot">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
                <!-- Chọn sân -->
                <div class="form-group" style="margin-bottom:0; grid-column: 1 / -1;">
                  <label for="f-court-id" class="form-label" style="font-weight:600;">Chọn sân thi đấu *</label>
                  <select id="f-court-id" name="courtId" class="network-select" required>
                    ${courts
                      .map(
                        (c) =>
                          `<option value="${escapeHtml(c.id)}" ${req.court_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
                      )
                      .join('')}
                  </select>
                </div>

                <!-- Chọn thứ -->
                <div class="form-group" style="margin-bottom:0; grid-column: 1 / -1;">
                  <label class="form-label" style="font-weight:600; margin-bottom:6px; display:block;">Thứ cố định hàng tuần *</label>
                  <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${[1, 2, 3, 4, 5, 6, 7].map((d) => `
                      <label style="display:inline-flex; align-items:center; gap:6px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; font-weight:600;">
                        <input type="checkbox" name="weekdays" value="${d}" ${selectedDays.includes(d) ? 'checked' : ''} style="accent-color:#0f6938;" />
                        <span>${WEEKDAY_LABELS[d]}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <!-- Giờ bắt đầu -->
                <div class="form-group" style="margin-bottom:0;">
                  <label for="f-start-hour" class="form-label" style="font-weight:600;">Giờ bắt đầu *</label>
                  <select id="f-start-hour" name="startHour" class="network-select" required>
                    ${Array.from({ length: 19 }, (_, i) => i + 5).map((h) => `
                      <option value="${h}" ${startHourVal === h ? 'selected' : ''}>${escapeHtml(formatSlotRange(h))}</option>
                    `).join('')}
                  </select>
                </div>

                <!-- Số giờ -->
                <div class="form-group" style="margin-bottom:0;">
                  <label for="f-duration" class="form-label" style="font-weight:600;">Thời lượng mỗi ca *</label>
                  <select id="f-duration" name="durationHours" class="network-select">
                    <option value="1" ${durationVal === 1 ? 'selected' : ''}>1 giờ</option>
                    <option value="2" ${durationVal === 2 ? 'selected' : ''}>2 giờ</option>
                    <option value="3" ${durationVal === 3 ? 'selected' : ''}>3 giờ</option>
                    <option value="4" ${durationVal === 4 ? 'selected' : ''}>4 giờ</option>
                  </select>
                </div>

                <!-- Từ ngày -->
                <div class="form-group" style="margin-bottom:0;">
                  <label for="f-start-date" class="form-label" style="font-weight:600;">Từ ngày *</label>
                  <input id="f-start-date" type="date" name="startDate" value="${escapeHtml(startDateVal)}" class="text-input" required />
                </div>

                <!-- Đến ngày -->
                <div class="form-group" style="margin-bottom:0;">
                  <label for="f-end-date" class="form-label" style="font-weight:600;">Đến ngày (Mặc định 4 tuần) *</label>
                  <input id="f-end-date" type="date" name="endDate" value="${escapeHtml(endDateVal)}" class="text-input" required />
                </div>

                <!-- Bỏ qua khung giờ trùng -->
                <div class="form-group" style="margin-bottom:0; grid-column: 1 / -1;">
                  <label style="display:inline-flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                    <input type="checkbox" name="skipConflicts" value="1" checked style="accent-color:#0f6938;" />
                    <span>Bỏ qua các ô khung giờ đã có người đặt trước đó (không ghi đè ô đã có khách)</span>
                  </label>
                </div>

                <!-- Ghi chú quản trị -->
                <div class="form-group" style="margin-bottom:0; grid-column: 1 / -1;">
                  <label for="f-admin-note" class="form-label">Ghi chú quản lý</label>
                  <input id="f-admin-note" type="text" name="adminNote" value="${escapeHtml(req.admin_note || '')}" placeholder="Ghi chú thêm..." class="text-input" />
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid #dee1e6; padding-top:14px;">
                <button type="submit" class="btn-pill-dark" style="background:#0f6938; padding:9px 20px; font-size:13.5px; border:none;">
                   Chốt lịch &amp; Khóa full lịch sân
                </button>
              </div>
            </form>

            ${
              isConfirmed
                ? `
                  <div style="margin-top:20px; padding-top:16px; border-top:1px dashed #cbd5e1; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="font-size:13px; color:#0f6938; font-weight:600;">
                      Đang khóa ${req.locked_slot_count || lockedBlocks.length} khung giờ cố định trên hệ thống.
                    </div>
                    <form method="POST" action="/quan-tri/co-dinh-thang/${encodeURIComponent(req.id)}/huy-chot" onsubmit="return confirm('Xác nhận hủy chốt lịch và mở lại các khung giờ tương lai cho khách vãng lai?');" style="margin:0;">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                      <button type="submit" class="btn-pill-danger" style="font-size:12.5px; padding:6px 14px;">
                        Hủy chốt lịch &amp; Mở lại sân
                      </button>
                    </form>
                  </div>
                `
                : ''
            }
          </section>
        </div>

        <!-- CỘT PHẢI: NGUYÊN VĂN YÊU CẦU CỦA KHÁCH -->
        <div style="display:flex; flex-direction:column; gap:20px;">
          <section class="flat-panel" style="padding: 20px; border-radius: var(--r-lg); border:1px solid var(--hairline);">
            <h2 style="font-size: 15px; font-weight: 500; color: #0f172a; margin-bottom: 12px;">
              Thông tin đăng ký ban đầu của khách
            </h2>
            <div style="display:flex; flex-direction:column; gap:10px; font-size:13.5px;">
              <div>
                <span class="caption-text">Khung thứ đăng ký:</span>
                <div style="font-weight:600; color:#0f172a; margin-top:1px;">${escapeHtml(req.fixed_days)}</div>
              </div>
              <div>
                <span class="caption-text">Khung giờ đăng ký:</span>
                <div style="font-weight:600; color:#0f172a; margin-top:1px;">${escapeHtml(req.fixed_hour)}</div>
              </div>
              <div>
                <span class="caption-text">Sân mong muốn:</span>
                <div style="font-weight:600; color:#0f172a; margin-top:1px;">${escapeHtml(req.fixed_court)}</div>
              </div>
              <div>
                <span class="caption-text">Thời điểm gửi yêu cầu:</span>
                <div style="color:#64748b; margin-top:1px;">${escapeHtml(formatVietnamDateTimeDisplay(req.created_at))}</div>
              </div>
            </div>
          </section>

          <!-- Đổi trạng thái tư vấn -->
          <section class="flat-panel" style="padding: 18px 20px; border-radius: var(--r-lg); border:1px solid var(--hairline);">
            <h2 style="font-size: 15px; font-weight: 500; color: #0f172a; margin-bottom: 10px;">
              Cập nhật trạng thái liên hệ
            </h2>
            <form method="POST" action="/quan-tri/co-dinh-thang/${encodeURIComponent(req.id)}/trang-thai">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <div class="form-group" style="margin-bottom:10px;">
                <select name="status" class="network-select" style="font-size:13px; padding:7px 10px;">
                  <option value="NEW" ${req.status === 'NEW' ? 'selected' : ''}>Mới gửi</option>
                  <option value="CONTACTED" ${req.status === 'CONTACTED' ? 'selected' : ''}>Đã liên hệ tư vấn</option>
                  <option value="CONFIRMED" ${req.status === 'CONFIRMED' ? 'selected' : ''}>Đã chốt lịch</option>
                  <option value="CANCELLED" ${req.status === 'CANCELLED' ? 'selected' : ''}>Đã hủy / Từ chối</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <input type="text" name="adminNote" value="${escapeHtml(req.admin_note || '')}" placeholder="Ghi chú trao đổi..." class="text-input" style="font-size:13px; padding:7px 10px;" />
              </div>
              <button type="submit" class="btn-pill-dark" style="font-size:12.5px; padding:6px 14px;">
                Lưu trạng thái
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  `;
}
