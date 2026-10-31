import { membershipProgress } from './membership.js';
import { orderStatus, orderSchedule, orderContact, orderPayment, orderHistory } from './orderPresentation.js';
import { config } from '../config/env.js';
import { renderPureCodeMapSection } from './floorPlan.js';
export { renderPureCodeMapSection } from './floorPlan.js';
import { escapeHtml } from '../utils/security.js';
import { bookingHomeUrl } from '../utils/bookingNavigation.js';
import { canPrintBookingTicket } from './bookingTicket.js';
import {
  addDaysVietnam,
  formatSlotRange,
  formatVietnamDateDisplay,
  formatVietnamDateTimeDisplay,
  formatVnd,
  getServerNow,
  getVietnameseDayLabel,
  toVietnamDateString,
} from '../utils/time.js';
import { CenterInfo, CourtSummary, SlotAvailabilityItem, BE_BADMINTON_ADDONS, PriceBoardTier } from '../services/courtService.js';
import { EquipmentItem } from '../services/equipmentService.js';
import { BookingRecord, CancellationEvaluation } from '../services/bookingService.js';
import { SessionContext } from '../services/authService.js';
import { CouponRecord } from '../services/couponService.js';
import {
  formatBookingStatusVi,
  formatPaymentStatusVi,
  formatRefundStatusVi,
  sectionHeading,
} from './layout.js';
import {
  amenityIcon,
  iconBadge,
  imageSlot,
  inlineIcon,
  publicImageUrl,
  svgGlyph,
} from './icons.js';
import { renderQrCodeSvg } from './sandboxGatewayPage.js';
import { renderHomeNewsSection, NewsArticle } from './newsPages.js';
import { renderCustomerReviewsSection } from './customerReviews.js';
import { CustomerReviewRecord } from '../services/adminService.js';
import { renderCourtGallery } from './courtGallery.js';

function renderQuickDateButtons(
  selectedDate: string,
  baseUrlPath: string,
  onDark = false,
  hasSelectedDate = true,
  anchor = ''
): string {
  const today = getServerNow();
  const baseDate = selectedDate;
  const items: string[] = [];
  const todayStr = new Date(today.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  for (let i = 0; i < 7; i++) {
    const dStr = addDaysVietnam(todayStr, i);
    const isSelected = hasSelectedDate && dStr === baseDate;
    const label = i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : getVietnameseDayLabel(dStr);
    const cls = isSelected
      ? 'btn-pill-dark'
      : onDark
        ? 'btn-outline-dark'
        : 'btn-pill-outline';
    items.push(`
      <a href="${baseUrlPath}?date=${encodeURIComponent(dStr)}${anchor}"
         class="${cls}"
         style="padding: 8px 14px; min-height: 36px; font-size: 13px;">
        <span>${escapeHtml(label)}</span>
        <span class="num" style="opacity:0.85;">${escapeHtml(dStr.slice(8, 10))}/${escapeHtml(dStr.slice(5, 7))}</span>
      </a>
    `);
  }
  return `<div style="display:flex; gap:8px; flex-wrap:wrap;" role="group" aria-label="Chọn nhanh ngày chơi">${items.join('')}</div>`;
}

/** Thanh trượt 7 ngày ngang (lấy cảm hứng từ date-search-slider của xeanhtuyen.vn). */
function renderDateSearchSlider(
  selectedDate: string,
  baseUrlPath: string,
  hasSelectedDate = true,
  extraQuery = '',
  anchor = ''
): string {
  const today = getServerNow();
  const todayStr = new Date(today.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const items: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dStr = addDaysVietnam(todayStr, i);
    const isSelected = hasSelectedDate && dStr === selectedDate;
    const dayText = i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : getVietnameseDayLabel(dStr);
    const dateShort = `${dStr.slice(8, 10)}/${dStr.slice(5, 7)}/${dStr.slice(0, 4)}`;
    items.push(`
      <a href="${baseUrlPath}?date=${encodeURIComponent(dStr)}${extraQuery}${anchor}"
         class="date-slide-item ${isSelected ? 'active' : ''}"
         ${isSelected ? 'aria-current="date"' : ''}>
        <span class="date-slide-day">${escapeHtml(dayText)}</span>
        <span class="date-slide-num">${escapeHtml(dateShort)}</span>
      </a>
    `);
  }
  return `<nav class="date-slider-strip" aria-label="Thanh trượt chọn ngày chơi">${items.join('')}</nav>`;
}

function renderSlotCell(slot: SlotAvailabilityItem, csrfToken: string): string {
  if (slot.state === 'AVAILABLE') {
    return `
      <form method="POST" action="/dat-san/giu-cho" style="margin:0;" data-add-cart data-court-name="${escapeHtml(slot.courtName)}" data-price="${slot.priceVnd}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <input type="hidden" name="courtId" value="${escapeHtml(slot.courtId)}" />
        <input type="hidden" name="bookingDate" value="${escapeHtml(slot.date)}" />
        <input type="hidden" name="startHour" value="${slot.startHour}" />
        <button type="submit" class="slot-cell-btn" title="Đặt ${escapeHtml(slot.courtName)} khung ${escapeHtml(slot.timeLabel)} — Giá ${escapeHtml(formatVnd(slot.priceVnd))}">
          <span class="slot-label">Thêm vào giỏ</span>
          <span class="slot-price">${escapeHtml(formatVnd(slot.priceVnd))}</span>
        </button>
      </form>
    `;
  }

  if (slot.state === 'MY_HOLD' && slot.myHoldBookingCode) {
    return `
      <a href="/thanh-toan/${encodeURIComponent(slot.myHoldBookingCode)}" class="slot-cell-btn slot-cell-myhold" title="Tiếp tục thanh toán đơn đang giữ chỗ của bạn">
        <span class="slot-label">◔ Giữ chỗ của bạn</span>
        <span style="font-size:11px; font-weight:700; text-decoration:underline;">Thanh toán ngay</span>
      </a>
    `;
  }

  if (slot.state === 'HOLD') {
    return `
      <div class="slot-cell-disabled slot-cell-hold" title="Khung giờ đang được khách khác giữ chỗ chờ thanh toán">
        <span class="slot-label">◔ Đang giữ chỗ</span>
        <span class="slot-price">${escapeHtml(formatVnd(slot.priceVnd))}</span>
      </div>
    `;
  }

  if (slot.state === 'BOOKED') {
    return `
      <div class="slot-cell-disabled slot-cell-booked" title="Khung giờ này đã có người đặt xác nhận">
        <span class="slot-label">● Đã đặt</span>
        <span style="font-size:11px; opacity:0.85;">Kín lịch</span>
      </div>
    `;
  }

  if (slot.state === 'MAINTENANCE') {
    return `
      <div class="slot-cell-disabled slot-cell-maint" title="${escapeHtml(slot.blockReason || 'Tạm ngưng bảo trì')}">
        <span class="slot-label">✕ Tạm ngưng</span>
        <span style="font-size:11px;">Bảo trì</span>
      </div>
    `;
  }

  return `
    <div class="slot-cell-disabled" title="Khung giờ đã qua thời điểm bắt đầu">
      <span class="slot-label">— Đã qua giờ</span>
    </div>
  `;
}

/**
 * Bảng đặt sân trực quan 18 sân theo mẫu Be Badminton / Alobo:
 * - Phía trên: Thứ + Ô chọn ngày trực tiếp [DD-MM-YYYY] (không lặp lại thanh trượt 7 ngày)
 * - Chú thích 4 ô màu: Khóa (Xám) · Trống (Trắng) · Đã đặt (Xanh đậm) · Đặt lịch của tôi (Cam đỏ)
 * - Lưới giờ đầy đủ 18 sân (Sân 1 -> Sân 18) từ 05:00 -> 23:00
 * - KHÔNG hiển thị giá tiền đè lên từng ô giờ; hộp thanh toán góc màn hình (#bebad-corner-dock) ẩn mặc định và chỉ hiện lên khi khách click vào một ô Trống.
 */
function renderBeBadmintonTimetableBoard(opts: {
  courts: CourtSummary[];
  hoursRange: number[];
  selectedDate: string;
  selectedHour?: number | null;
  csrfToken: string;
  availableSlotCount: number;
  baseUrlPath?: string;
  filteredSlots?: SlotAvailabilityItem[];
  bookingFilters?: Record<string, string>;
}): string {
  const { courts, hoursRange, selectedDate, selectedHour = null, csrfToken, availableSlotCount, baseUrlPath = '/' } = opts;
  const dayLabel = getVietnameseDayLabel(selectedDate);
  const dateDisplay = formatVietnamDateDisplay(selectedDate);
  const dateDashDisplay = dateDisplay.replace(/\//g, '-');
  const matches = opts.filteredSlots ? new Set(opts.filteredSlots.map(s => `${s.courtId}:${s.startHour}`)) : null;

  let firstAvail: SlotAvailabilityItem | null = null;
  for (const c of courts) {
    for (const s of c.slots) {
      if (s.state === 'AVAILABLE' && (!matches || matches.has(`${s.courtId}:${s.startHour}`))) {
        firstAvail = s;
        break;
      }
    }
    if (firstAvail) break;
  }

  return `
    <div class="bebad-board" id="bebad-timetable-board">
      <div class="bebad-header-row" style="margin-bottom: 10px;">
        <div class="bebad-day-pill-wrap">
          <span class="bebad-day-title">${escapeHtml(dayLabel)}</span>
          <label for="board-date-picker" class="sr-only">Chọn ngày trên bảng lịch</label>
          <input
            id="board-date-picker"
            type="date"
            value="${escapeHtml(selectedDate)}"
            class="bebad-date-badge"
            style="cursor:pointer;"
            onchange="const url=new window.URL(window.location.href);url.pathname='${baseUrlPath}';url.searchParams.set('date',this.value);url.hash='lich-san-nhanh';window.location.href=url.toString();"
            title="Đổi ngày chơi"
          />
          ${selectedHour !== null && selectedHour !== undefined
      ? `<span class="booking-hour-filter">
                  ${escapeHtml(formatSlotRange(selectedHour))}
                  <a href="${escapeHtml(bookingHomeUrl({...opts.bookingFilters,date:selectedDate,hour:''}))}">Bỏ lọc giờ</a>
                 </span>`
      : ''
    }
        </div>

        <!-- Nhãn trạng thái ngữ nghĩa ẩn trực quan phục vụ trình đọc màn hình & kiểm thử tự động -->
        <div class="sr-only" aria-hidden="true">
          <span>○ Còn trống (${availableSlotCount})</span>
          <span>◔ Đang giữ chỗ</span>
          <span>● Đã đặt</span>
          <span>✕ Tạm ngưng</span>
          <span>— Đã qua giờ</span>
        </div>

        <!-- Thanh lọc nhanh theo ca trong ngày gộp chung trên thanh điều khiển -->
        <div class="bebad-timeband-group" role="toolbar" aria-label="Bộ lọc nhanh khung giờ trong ngày">
          <button type="button" class="bebad-timeband-pill is-active js-timeband-pill" data-band="all" data-min="5" data-max="23">
            Tất cả (05h–24h)
          </button>
          <button type="button" class="bebad-timeband-pill js-timeband-pill" data-band="morning" data-min="5" data-max="8">
            Sáng (05h–09h)
          </button>
          <button type="button" class="bebad-timeband-pill js-timeband-pill" data-band="day" data-min="9" data-max="16">
            Ngày (09h–17h)
          </button>
          <button type="button" class="bebad-timeband-pill js-timeband-pill" data-band="peak" data-min="17" data-max="21">
            Tối (17h–22h)
          </button>
          <button type="button" class="bebad-timeband-pill js-timeband-pill" data-band="night" data-min="22" data-max="23">
            Muộn (22h–24h)
          </button>
        </div>

        <!-- Chú thích 4 ô màu chuẩn theo hình mẫu Be Badminton -->
        <div class="bebad-legend" style="margin-bottom:0;" aria-label="Chú thích màu sắc trạng thái ô lịch">
          <span class="bebad-legend-item">
            <span class="bebad-swatch swatch-free" aria-hidden="true"></span>
            <span>Trống (${availableSlotCount})</span>
          </span>
          <span class="bebad-legend-item">
            <span class="bebad-swatch swatch-booked" aria-hidden="true"></span>
            <span>Đã đặt</span>
          </span>
          <span class="bebad-legend-item">
            <span class="bebad-swatch swatch-locked" aria-hidden="true"></span>
            <span>Khóa</span>
          </span>
          <span class="bebad-legend-item">
            <span class="bebad-swatch swatch-mine" aria-hidden="true"></span>
            <span>Của tôi</span>
          </span>
        </div>
      </div>

      <div class="bebad-grid-scroll" id="bebad-grid-scroll-container">
        <table class="bebad-grid-table" aria-label="Bảng đặt sân cầu lông 18 sân ngày ${escapeHtml(dateDisplay)}">
          <thead>
            <tr>
              <th class="bebad-corner-th" scope="col">Sân / Ca chơi</th>
              ${hoursRange
      .map(
        (h) =>
          `<th scope="col" data-col-hour="${h}" class="${selectedHour === h ? 'is-focus-hour' : ''}" title="Khung giờ ${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00">${String(h).padStart(2, '0')}:00</th>`
      )
      .join('')}
            </tr>
          </thead>
          <tbody>
            ${courts
      .map((court, idx) => {
        const shortCourtLabel = court.name.startsWith('Sân ')
          ? court.name.split('—')[0].trim()
          : `Sân ${idx + 1}`;
        return `
                  <tr id="row-${escapeHtml(court.id)}">
                    <td class="bebad-court-name">
                      <a href="/san/${encodeURIComponent(court.id)}?date=${encodeURIComponent(selectedDate)}" style="color:#ffffff; text-decoration:none; display:block;" title="Xem chi tiết ${escapeHtml(court.name)}">
                        ${escapeHtml(shortCourtLabel)}
                      </a>
                    </td>
                    ${court.slots
            .map((slot) => {
              const isFocusCol = selectedHour === slot.startHour ? ' is-focus-hour' : '';
              const priceShortK = `${Math.round(slot.priceVnd / 1000)}K`;
              if (matches && !matches.has(`${slot.courtId}:${slot.startHour}`)) {
                return `<td class="bebad-cell cell-filtered" data-col-hour="${slot.startHour}" title="Ngoài bộ lọc" aria-label="${escapeHtml(shortCourtLabel)} ${escapeHtml(slot.timeLabel)} — Ngoài bộ lọc"></td>`;
              }
              if (slot.state === 'AVAILABLE') {
                return `
                            <td class="bebad-cell cell-free${isFocusCol}" data-slot-td data-col-hour="${slot.startHour}">
                              <button
                                type="button"
                                class="bebad-cell-btn js-bebad-slot"
                                data-court-id="${escapeHtml(slot.courtId)}"
                                data-court-name="${escapeHtml(shortCourtLabel)}"
                                data-date="${escapeHtml(slot.date)}"
                                data-date-display="${escapeHtml(dateDashDisplay)}"
                                data-start-hour="${slot.startHour}"
                                data-time-label="${escapeHtml(slot.timeLabel)}"
                                data-pricing-label="${escapeHtml(slot.pricingLabel)}"
                                data-price-vnd="${slot.priceVnd}"
                                data-price-formatted="${escapeHtml(formatVnd(slot.priceVnd))}"
                                data-price-short="${priceShortK}"
                                title="${escapeHtml(shortCourtLabel)} · ${escapeHtml(slot.timeLabel)} (${escapeHtml(formatVnd(slot.priceVnd))}) — Nhấn để chọn khung giờ này"
                                aria-label="Chọn ${escapeHtml(shortCourtLabel)} khung giờ ${escapeHtml(slot.timeLabel)} giá ${escapeHtml(formatVnd(slot.priceVnd))}"
                              ><span class="bebad-cell-price-hint">${priceShortK}</span></button>
                            </td>
                          `;
              }

              if (slot.state === 'MY_HOLD' && slot.myHoldBookingCode) {
                return `
                            <td class="bebad-cell cell-mine${isFocusCol}" data-col-hour="${slot.startHour}">
                              <a
                                href="/thanh-toan/${encodeURIComponent(slot.myHoldBookingCode)}"
                                class="bebad-cell-btn"
                                title="Đặt lịch của tôi (${escapeHtml(shortCourtLabel)} · ${escapeHtml(slot.timeLabel)}) — Nhấn để tiếp tục thanh toán"
                                aria-label="Đặt lịch của tôi ${escapeHtml(shortCourtLabel)} ${escapeHtml(slot.timeLabel)}"
                              >★</a>
                            </td>
                          `;
              }

              if (slot.state === 'BOOKED' || slot.state === 'HOLD') {
                return `
                            <td
                              class="bebad-cell cell-booked${isFocusCol}"
                              data-col-hour="${slot.startHour}"
                              title="${escapeHtml(shortCourtLabel)} · ${escapeHtml(slot.timeLabel)} — Đã đặt"
                              aria-label="${escapeHtml(shortCourtLabel)} ${escapeHtml(slot.timeLabel)} Đã đặt"
                            ></td>
                          `;
              }

              return `
                          <td
                            class="bebad-cell cell-locked${isFocusCol}"
                            data-col-hour="${slot.startHour}"
                            title="${escapeHtml(shortCourtLabel)} · ${escapeHtml(slot.timeLabel)} — Khóa"
                            aria-label="${escapeHtml(shortCourtLabel)} ${escapeHtml(slot.timeLabel)} Khóa"
                          ></td>
                        `;
            })
            .join('')}
                  </tr>
                `;
      })
      .join('')}
          </tbody>
        </table>
      </div>

      <aside id="cart-selection-bar" class="cart-selection-bar" hidden aria-label="Các giờ đang chọn">
        <div><strong id="cart-selection-count"></strong><span id="cart-selection-total" class="num"></span></div>
        <button type="button" id="cart-clear-selection" class="btn-text">Bỏ chọn</button>
        <button type="button" id="cart-add-selection" class="btn-pill-dark">Thêm vào giỏ</button>
        <a href="/gio-hang" class="btn-pill-outline">Xem giỏ <span data-cart-count>0</span></a>
      </aside>
      <script>
      document.querySelectorAll('.js-timeband-pill').forEach(function(pill){pill.addEventListener('click',function(){
        document.querySelectorAll('.js-timeband-pill').forEach(function(p){p.classList.toggle('is-active',p===pill);});
        document.querySelectorAll('[data-col-hour]').forEach(function(cell){var h=Number(cell.dataset.colHour);cell.style.display=h>=Number(pill.dataset.min)&&h<=Number(pill.dataset.max)?'':'none';});
      });});
      </script>
  `;
}

function formatPriceValK(vnd: number): string {
  if (vnd >= 1000 && vnd % 1000 === 0) {
    return `${vnd / 1000} K`;
  }
  return formatVnd(vnd);
}

/**
 * Mục riêng: BẢNG GIÁ THUÊ SÂN & SƠ ĐỒ 18 SÂN BE BADMINTON BẰNG 100% CODE THUẦN (HTML/CSS/SVG)
 * Dựa chuẩn xác từng chi tiết theo bảng giá niêm yết và bản vẽ mặt bằng 18 sân Gò Vấp.
 * Tự động cập nhật theo giá niêm yết trong hệ thống.
 */
/**
 * Mục riêng 1: BẢNG GIÁ THUÊ SÂN NIÊM YẾT BE BADMINTON BẰNG 100% CODE THUẦN (HTML/CSS)
 * Đồng bộ trực tiếp theo thiết lập trong Dashboard Quản lý cơ sở 262/1 Quang Trung.
 */
export function renderPureCodePriceSection(priceBoard?: PriceBoardTier[], _selectedDate?: string, embedded = false, coupons: CouponRecord[] = []): string {
  const morn: any = priceBoard?.find((t) => t.tierKey === 'wd_morning') || { priceFixedVnd: 110000, priceGuestVnd: 120000 };
  const day: any = priceBoard?.find((t) => t.tierKey === 'wd_day') || { priceFixedVnd: 90000, priceGuestVnd: 100000, studentFixedVnd: 80000, studentGuestVnd: 90000 };
  const peak: any = priceBoard?.find((t) => t.tierKey === 'wd_peak') || { priceFixedVnd: 130000, priceGuestVnd: 140000 };
  const night: any = priceBoard?.find((t) => t.tierKey === 'wd_night') || { priceFixedVnd: 110000, priceGuestVnd: 120000 };
  const weekend: any = priceBoard?.find((t) => t.tierKey === 'weekend') || { priceFixedVnd: 130000, priceGuestVnd: 130000 };

  const formatPriceValK = (vnd?: number) => {
    if (!vnd || vnd <= 0) return '0 K';
    const kVal = Math.round(vnd / 1000);
    return `${kVal} K`;
  };

  return `
    <section ${embedded ? 'class="court-pricing-panel"' : 'id="bang-gia-niem-yet" style="margin-bottom:48px;"'} aria-labelledby="code-price-heading">
      <span id="bang-gia-so-do-code" style="position:relative; top:-20px; display:block; visibility:hidden;"></span>
      ${embedded ? '<h3 class="venue-panel-title" id="code-price-heading">Giá thuê sân</h3><p class="venue-panel-note">Đơn giá mỗi ca chơi</p>' : sectionHeading({
    id: 'code-price-heading',
    title: 'Giá thuê sân',
    subtitle: 'Bảng giá theo ngày và khung giờ.',
    icon: 'tag',
    tone: 'blue',
  })}

      <div class="court-price-content">
      <div class="be-price-board" aria-label="Bảng giá thuê sân niêm yết Be Badminton">
        <div>
          <table class="be-price-table">
            <thead>
              <tr>
                <th rowspan="2" style="width:24%;">NGÀY</th>
                <th rowspan="2" style="width:26%;">KHUNG GIỜ</th>
                <th colspan="2">VNĐ / CA CHƠI</th>
              </tr>
              <tr class="sub-head">
                <th style="width:25%;">CỐ ĐỊNH</th>
                <th style="width:25%;">VÃNG LAI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="4" class="be-price-day-col">
                  <div class="be-day-label">T2 - T6</div>
                  <div class="be-day-desc">(Ngày thường)</div>
                </td>
                <td class="be-price-time-col">05:00 - 09:00</td>
                <td>
                  <span class="be-price-val">${formatPriceValK(morn.priceFixedVnd)}</span>
                </td>
                <td>
                  <span class="be-price-val">${formatPriceValK(morn.priceGuestVnd)}</span>
                </td>
              </tr>
              <tr>
                <td class="be-price-time-col">09:00 - 17:00</td>
                <td>
                  <span class="be-price-val">${formatPriceValK(day.priceFixedVnd)}</span>
                  ${day.studentFixedVnd ? `<span class="be-price-sub">(HS/SV: ${formatPriceValK(day.studentFixedVnd).replace(' ', '')})</span>` : ''}
                </td>
                <td>
                  <span class="be-price-val">${formatPriceValK(day.priceGuestVnd)}</span>
                  ${day.studentGuestVnd ? `<span class="be-price-sub">(HS/SV: ${formatPriceValK(day.studentGuestVnd).replace(' ', '')})</span>` : ''}
                </td>
              </tr>
              <tr>
                <td class="be-price-time-col">17:00 - 22:00</td>
                <td>
                  <span class="be-price-val">${formatPriceValK(peak.priceFixedVnd)}</span>
                </td>
                <td>
                  <span class="be-price-val">${formatPriceValK(peak.priceGuestVnd)}</span>
                </td>
              </tr>
              <tr>
                <td class="be-price-time-col">22:00 - 24:00</td>
                <td>
                  <span class="be-price-val">${formatPriceValK(night.priceFixedVnd)}</span>
                </td>
                <td>
                  <span class="be-price-val">${formatPriceValK(night.priceGuestVnd)}</span>
                </td>
              </tr>
              <tr>
                <td class="be-price-day-col">
                  <div class="be-day-label">T7 - CN</div>
                  <div class="be-day-desc">(Ngày Lễ)</div>
                </td>
                <td class="be-price-time-col be-time-allday">CẢ NGÀY</td>
                <td colspan="2" class="be-price-weekend-cell">
                  <span class="be-price-val-weekend">${formatPriceValK(weekend.priceGuestVnd)}</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="price-benefits" aria-label="Ưu đãi thuê sân">
            <div class="price-benefit"><div class="price-benefit-heading"><h4>Hội viên VIP</h4><a href="/tai-khoan">Xem hạng thẻ</a></div>
              <p>Hạng Bạc giảm 5%, hạng Vàng giảm 10% tiền sân. Tự áp dụng khi thanh toán.</p></div>
            <div class="price-benefit"><div class="price-benefit-heading"><h4>Lịch cố định tháng</h4><a href="tel:0773333371">Liên hệ đặt lịch</a></div>
              <p>Giảm 10.000₫/ca chơi so với giá vãng lai, kèm tủ đồ riêng.</p></div>
            ${coupons.length ? `<details class="price-benefit price-coupons"><summary>Mã ưu đãi (${coupons.length})</summary>
              <p>Nhập mã tại bước thanh toán. Điều kiện áp dụng theo từng mã.</p><ul>${coupons.map(cp => `<li><code>${escapeHtml(cp.code)}</code> · ${escapeHtml(cp.title)}
              <small>Giảm ${cp.discount_type === 'PERCENT' ? `${cp.discount_value}%` : escapeHtml(formatVnd(cp.discount_value))}${cp.max_discount_amount_vnd ? `, tối đa ${escapeHtml(formatVnd(cp.max_discount_amount_vnd))}` : ''}${cp.min_order_amount_vnd ? ` · Đơn từ ${escapeHtml(formatVnd(cp.min_order_amount_vnd))}` : ''}${cp.valid_until ? ` · Đến ${escapeHtml(formatVietnamDateDisplay(cp.valid_until))}` : ''}${cp.max_uses_per_user ? ` · ${cp.max_uses_per_user} lượt/tài khoản` : ''}</small>${cp.description ? `<p>${escapeHtml(cp.description)}</p>` : ''}</li>`).join('')}</ul></details>` : ''}
          </div>
        </div>

      </div>

      </div>
    </section>
  `;
}


export function renderVenueLocationSection(selectedDate: string): string {
  return `<section class="venue-location-section" aria-labelledby="venue-location-heading">
    ${sectionHeading({id:'venue-location-heading',title:'Sơ đồ sân & chỉ đường',subtitle:'262/1 Quang Trung, P.10, Gò Vấp, TP.HCM',icon:'court',tone:'green'})}
    <div class="venue-location-grid">
      ${renderPureCodeMapSection(selectedDate,true)}
      <div class="venue-directions">
        <h3 class="venue-panel-title">Vị trí Google Maps</h3>
        <p class="venue-panel-note"><a class="venue-directions-link" href="https://maps.google.com/?cid=16975997869808823153" target="_blank" rel="noopener noreferrer">Chỉ đường trên Google Maps ↗</a></p>
        <aside class="be-location-board" aria-label="Bản đồ vị trí Be Badminton">
          <iframe
            class="be-location-map"
            title="Bản đồ đường đến Be Badminton – Sân Cầu Lông"
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d16738.76066734648!2d106.66971657099042!3d10.829223621093217!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752900570f9f77%3A0xeb96dc1eb1be2b71!2zQmUgQmFkbWludG9uIC0gU8OibiBD4bqndSBMw7RuZw!5e1!3m2!1svi!2sus!4v1793338488382!5m2!1svi!2sus"
            width="800" height="600" allowfullscreen loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            style="border:0; display:block;"
          ></iframe>
        </aside>

      </div>
    </div></section>`;
}

/**
 * Hàm helper tương thích ngược (vừa kết xuất Bảng giá vừa kết xuất Sơ đồ)
 */
export function renderPureCodePriceAndMapSection(selectedDate: string, priceBoard?: PriceBoardTier[]): string {
  return `
    ${renderPureCodePriceSection(priceBoard, selectedDate)}
    ${renderVenueLocationSection(selectedDate)}
  `;
}

/**
 * Khối Banner Full-Size tràn toàn màn hình & Thanh tìm kiếm nổi chồng lên mép dưới Banner
 * Đã sửa toàn bộ lỗi ở Ảnh 4:
 * - Xóa icon đảo chiều xe khách (change-icons.svg) vô nghĩa giữa Cơ sở và Khung giờ
 * - Thay icon định vị đỏ ở ô Khung giờ chơi bằng icon Đồng hồ cầu lông đúng ngữ cảnh
 * - Không bị cắt chữ ("262/1 Quang Tr...", "05:00 - 24") và không bị lặp 2 icon lịch ở ô Ngày đặt sân
 * - Kích hoạt đầy đủ chức năng "Đặt lịch cố định tháng" khi người dùng bấm chuyển tab!
 */
export function renderHomeHeroBand(data: {
  activeCourtOptions?: Array<{id:string;name:string}>;
  bookingFilters?: Record<string,string>;
  center: CenterInfo;
  selectedDate: string;
  hasSelectedDate?: boolean;
  selectedSearch?: string;
  selectedHour: number | null;
  hoursRange: number[];
  courts: CourtSummary[];
  availableSlotCount: number;
  priceBoard?: PriceBoardTier[];
}): string {
  const pbMap = new Map<string, PriceBoardTier>();
  for (const t of data.priceBoard || []) {
    pbMap.set(t.tierKey, t);
  }
  const fmtK = (vnd: number) => `${Math.round(vnd / 1000)}K`;
  const wdMorningFixed = pbMap.get('wd_morning')?.priceFixedVnd ?? 110000;
  const wdDayFixed = pbMap.get('wd_day')?.priceFixedVnd ?? 90000;
  const wdDayStudentFixed = pbMap.get('wd_day')?.studentFixedVnd ?? 80000;
  const wdPeakFixed = pbMap.get('wd_peak')?.priceFixedVnd ?? 130000;
  const wdNightFixed = pbMap.get('wd_night')?.priceFixedVnd ?? 110000;
  const wkFixed = pbMap.get('weekend')?.priceFixedVnd ?? 130000;
  const activeCourts = data.activeCourtOptions || (data.courts || []).filter((c) => c.status === 'ACTIVE');
  const filters=data.bookingFilters||{};

  return `
    <section class="xat-hero-stage" aria-label="Banner và tìm kiếm lịch đặt sân">
      <!-- 1. Hero Carousel Full Size (Tự động chạy liên tục, nút chuyển slide nhỏ gọn bên dưới, không có nút trái phải) -->
      <div class="hero-carousel-container" aria-label="Banner quảng bá Be Badminton">
        <div class="hero-carousel" id="courtgo-hero-carousel">
          <div class="hero-carousel-track">
            <div class="hero-carousel-slide active" data-index="0">
              <a href="#lich-san-nhanh" aria-label="Xem lịch sân và đặt ngay">
                <img src="/public/images/hero-banner.png" alt="Be Badminton - 18 sân chuẩn thi đấu Gò Vấp" fetchpriority="high" width="2120" height="742">
              </a>
            </div>
            <div class="hero-carousel-slide" data-index="1">
              <a href="#lich-san-nhanh" aria-label="Xem lịch sân và đặt ngay">
                <img src="/public/images/hero-banner-2.png" alt="Be Badminton - Trải nghiệm sân cầu lông đẳng cấp" loading="lazy" width="2135" height="736">
              </a>
            </div>
          </div>

          <!-- Dấu chấm nhỏ chuyển banner bên dưới -->
          <div class="hero-carousel-dots" id="hero-carousel-dots" role="tablist" aria-label="Chọn banner">
            <button type="button" class="hero-carousel-dot active" role="tab" aria-selected="true" aria-label="Banner 1" data-index="0"></button>
            <button type="button" class="hero-carousel-dot" role="tab" aria-selected="false" aria-label="Banner 2" data-index="1"></button>
          </div>
        </div>
      </div>

      <!-- 2. Hộp tìm kiếm màu trắng nổi chồng lên mép dưới Banner -->
      <div class="xat-floating-search-holder">
        <div class="xat-search-wrap">
          <div class="xat-mode-bar">
            <div class="xat-radio-group" role="tablist" aria-label="Chọn hình thức đặt sân">
              <button
                type="button"
                id="tab-btn-vang-lai"
                class="xat-radio-pill is-active"
                role="tab"
                aria-selected="true"
                aria-controls="form-vang-lai"
              >
                <span class="xat-radio-dot" id="dot-vang-lai" aria-hidden="true"></span>
                <span>Đặt sân theo giờ</span>
              </button>

              <button
                type="button"
                id="tab-btn-co-dinh"
                class="xat-radio-pill"
                role="tab"
                aria-selected="false"
                aria-controls="form-co-dinh"
              >
                <span class="xat-radio-dot-idle" id="dot-co-dinh" aria-hidden="true"></span>
                <span>Cố định tháng</span>
              </button>
            </div>
            <div style="font-size:12px; color:#5b616e; align-self:center;">
              262/1 Quang Trung, Gò Vấp · Mở cửa 05:00 – 24:00
            </div>
          </div>

          <!-- FORM 1: ĐẶT SÂN THEO CA (VÃNG LAI) - TINH GỌN, BỎ Ô ĐỊA ĐIỂM -->
          <form method="GET" action="/#lich-san-nhanh" id="form-vang-lai" class="unified-search">
            <div class="search-primary">
              <label for="home-date">Ngày chơi<input id="home-date" type="date" name="date" value="${escapeHtml(data.selectedDate)}" class="text-input" required></label>
              <label for="home-hour">Ca chơi<select id="home-hour" name="hour" class="text-input"><option value="">Tất cả ca chơi</option>${data.hoursRange.map(h=>`<option value="${h}" ${data.selectedHour===h?'selected':''}>${escapeHtml(formatSlotRange(h))}</option>`).join('')}</select></label>
              <label for="home-court">Tên sân<select id="home-court" name="courtId" class="text-input"><option value="">Tất cả sân</option>${activeCourts.map(c=>`<option value="${escapeHtml(c.id)}" ${filters.courtId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>
              <button type="submit" class="btn-pill-dark">${inlineIcon('search',18)} Tìm sân</button>
            </div>
            <details class="search-advanced" ${filters.minPrice||filters.maxPrice||filters.sortBy?'open':''}><summary>Giá & sắp xếp</summary><div class="search-secondary">
              <label for="home-min-price">Giá từ (đ/ca chơi)<input id="home-min-price" class="text-input" type="number" name="minPrice" min="0" value="${escapeHtml(filters.minPrice||'')}"></label>
              <label for="home-max-price">Giá đến (đ/ca chơi)<input id="home-max-price" class="text-input" type="number" name="maxPrice" min="0" value="${escapeHtml(filters.maxPrice||'')}"></label>
              <label for="home-sort">Sắp xếp<select id="home-sort" class="text-input" name="sortBy">${[['court_order','Số sân'],['time_asc','Giờ trống sớm nhất'],['price_asc','Giá thấp nhất'],['price_desc','Giá cao nhất']].map(([value,label])=>`<option value="${value}" ${(filters.sortBy||'court_order')===value?'selected':''}>${label}</option>`).join('')}</select></label>
              <a href="${escapeHtml(bookingHomeUrl({date:data.selectedDate}))}" class="btn-text">Xóa lọc</a>
            </div></details>
          </form>

          <!-- FORM 2: ĐẶT LỊCH CỐ ĐỊNH THÁNG - CHUYÊN NGHIỆP, RÕ RÀNG, KHÔNG AI-SLOP -->
          <form method="POST" action="/dat-san/co-dinh-thang" id="form-co-dinh" style="display:none; padding:12px 4px 4px 4px;">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:14px;">
              <!-- Chọn thứ trong tuần -->
              <div class="xat-field-box" style="grid-column: 1 / -1;">
                <div class="xat-field-body" style="width:100%;">
                  <span class="xat-field-label">Thứ cố định hàng tuần *</span>
                  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;" id="fixed-weekdays-picker">
                    ${[
                      { val: 1, label: 'Thứ 2' },
                      { val: 2, label: 'Thứ 3' },
                      { val: 3, label: 'Thứ 4' },
                      { val: 4, label: 'Thứ 5' },
                      { val: 5, label: 'Thứ 6' },
                      { val: 6, label: 'Thứ 7' },
                      { val: 7, label: 'Chủ nhật' },
                    ].map(w => `
                      <label for="fixed-weekday-${w.val}" style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:6px 12px; font-size:13px; font-weight:600; user-select:none;">
                        <input id="fixed-weekday-${w.val}" type="checkbox" name="weekdays" value="${w.val}" ${w.val === 1 || w.val === 3 || w.val === 5 ? 'checked' : ''} style="accent-color:#0052ff; width:15px; height:15px;" />
                        <span>${w.label}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>
              </div>

              <!-- Giờ bắt đầu -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-start-hour" class="xat-field-label">Giờ bắt đầu mỗi ca *</label>
                  <select id="fixed-start-hour" name="startHour" class="xat-field-control" required>
                    ${data.hoursRange.map(h => `
                      <option value="${h}" ${h === 18 ? 'selected' : ''}>${escapeHtml(formatSlotRange(h))}</option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <!-- Số giờ mỗi ca -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-duration-hours" class="xat-field-label">Thời lượng mỗi ca *</label>
                  <select id="fixed-duration-hours" name="durationHours" class="xat-field-control">
                    <option value="1">1 giờ / buổi</option>
                    <option value="2" selected>2 giờ / buổi</option>
                    <option value="3">3 giờ / buổi</option>
                    <option value="4">4 giờ / buổi</option>
                  </select>
                </div>
              </div>

              <!-- Ngày bắt đầu -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-start-date" class="xat-field-label">Ngày bắt đầu *</label>
                  <input id="fixed-start-date" type="date" name="startDate" value="${escapeHtml(data.selectedDate)}" class="xat-field-control" required />
                </div>
              </div>

              <!-- Chọn sân mong muốn -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-court-id" class="xat-field-label">Sân mong muốn</label>
                  <select id="fixed-court-id" name="courtId" class="xat-field-control">
                    <option value="">Sân trống bất kỳ phù hợp</option>
                    ${activeCourts.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </div>
              </div>

              <!-- Họ tên khách -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-customer-name" class="xat-field-label">Họ và tên</label>
                  <input id="fixed-customer-name" type="text" name="customerName" placeholder="Tên cá nhân / CLB..." class="xat-field-control" />
                </div>
              </div>

              <!-- SĐT / Zalo -->
              <div class="xat-field-box">
                <div class="xat-field-body">
                  <label for="fixed-phone" class="xat-field-label">Số điện thoại / Zalo *</label>
                  <input id="fixed-phone" type="tel" name="contactPhone" placeholder="Nhập SĐT / Zalo liên hệ..." class="xat-field-control" required />
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid #dee1e6; padding-top:12px;">
              <div style="font-size:12.5px; color:#5b616e;">
                Ưu đãi lịch tháng: Giảm 10.000₫/ca chơi so với vãng lai &amp; tặng tủ khóa Box-Lock riêng.
              </div>
              <button type="submit" class="xat-submit-btn" style="min-width:200px;">
                <span>Gửi yêu cầu chốt lịch tháng</span>
              </button>
            </div>
          </form>
        </div></div>
      </div>
    </section>

    <script>
      (function() {
        var btnVangLai = document.getElementById('tab-btn-vang-lai');
        var btnCoDinh = document.getElementById('tab-btn-co-dinh');
        var dotVangLai = document.getElementById('dot-vang-lai');
        var dotCoDinh = document.getElementById('dot-co-dinh');
        var formVangLai = document.getElementById('form-vang-lai');
        var formCoDinh = document.getElementById('form-co-dinh');

        if (!btnVangLai || !btnCoDinh || !formVangLai || !formCoDinh) return;

        btnVangLai.addEventListener('click', function() {
          btnVangLai.classList.add('is-active');
          btnCoDinh.classList.remove('is-active');
          btnVangLai.setAttribute('aria-selected', 'true');
          btnCoDinh.setAttribute('aria-selected', 'false');
          if (dotVangLai) dotVangLai.className = 'xat-radio-dot';
          if (dotCoDinh) dotCoDinh.className = 'xat-radio-dot-idle';
          formVangLai.style.display = '';
          formCoDinh.style.display = 'none';
        });

        btnCoDinh.addEventListener('click', function() {
          btnCoDinh.classList.add('is-active');
          btnVangLai.classList.remove('is-active');
          btnCoDinh.setAttribute('aria-selected', 'true');
          btnVangLai.setAttribute('aria-selected', 'false');
          if (dotCoDinh) dotCoDinh.className = 'xat-radio-dot';
          if (dotVangLai) dotVangLai.className = 'xat-radio-dot-idle';
          formVangLai.style.display = 'none';
          formCoDinh.style.display = '';
        });
      })();
    </script>
  `;
}

export function renderHomePage(data: {
  center: CenterInfo;
  selectedDate: string;
  hasSelectedDate?: boolean;
  selectedSearch?: string;
  selectedHour: number | null;
  hoursRange: number[];
  courts: CourtSummary[];
  availableSlotCount: number;
  session: SessionContext | null;
  priceBoard?: PriceBoardTier[];
  equipmentItems?: EquipmentItem[];
  articles?: NewsArticle[];
  reviews?: CustomerReviewRecord[];
  coupons?: CouponRecord[];
  bookingFilters?: Record<string, string>;
  filteredSlots?: SlotAvailabilityItem[];
  suggestedAlternatives?: SlotAvailabilityItem[];
}): string {
  const csrfToken = data.session?.csrfToken || '';
  const filters = data.bookingFilters || {};
  const hasFilters = ['hour', 'search', 'minPrice', 'maxPrice', 'sortBy'].some(key => !!filters[key]);
  const sortedCourts = [...data.courts];
  if (filters.sortBy && filters.sortBy !== 'court_order' && data.filteredSlots) {
    const rank = new Map<string, number>();
    data.filteredSlots.forEach((slot, index) => {
      if (slot.state === 'AVAILABLE' && !rank.has(slot.courtId)) rank.set(slot.courtId, index);
    });
    sortedCourts.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }
  const homeAddons =
    data.equipmentItems !== undefined
      ? data.equipmentItems
      : BE_BADMINTON_ADDONS.map((a) => ({
        id: a.id,
        code: a.id.toUpperCase(),
        name: a.name,
        category: a.category,
        priceVnd: a.priceVnd,
        originalPriceVnd: null,
        unit: a.unit,
        depositVnd: 0,
        stockQuantity: 0,
        stockStatus: 'OUT_OF_STOCK' as const,
        isActive: true,
        badge: a.badge || null,
        imageUrl: a.imageUrl || '/public/assets/images/addons/giay-cau-long.png',
        description: a.description,
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
      }));

  return `
    <!-- TẦNG 2: BẢNG ĐẶT SÂN TRỰC QUAN 18 SÂN (MỞ SẴN NGAY DƯỚI THANH TÌM KIẾM - CHUYỂN ĐỔI TỨC THÌ) -->
    <section id="lich-san-nhanh" style="margin-bottom: 40px;" aria-labelledby="home-schedule-heading">
      ${sectionHeading({
    id: 'home-schedule-heading',
    title: 'Đặt sân',
    subtitle: 'Chọn ô giờ trống và thêm vào giỏ. Bạn có thể chọn nhiều sân, nhiều ngày.',
    actionHtml: `<a href="#bang-gia-niem-yet" class="btn-text">Bảng giá</a>`,
  })}

      ${data.availableSlotCount === 0 ? `<div class="booking-empty" role="status">Không có giờ trống phù hợp với bộ lọc.${data.suggestedAlternatives?.length ? `<p>Có thể chọn:</p><div class="booking-alternatives">${data.suggestedAlternatives.map(slot => `<a href="${escapeHtml(bookingHomeUrl({date:slot.date,hour:String(slot.startHour),search:slot.courtName}))}">${escapeHtml(slot.courtName)} · ${escapeHtml(formatVietnamDateDisplay(slot.date))} · ${escapeHtml(slot.timeLabel)} · ${escapeHtml(formatVnd(slot.priceVnd))}</a>`).join('')}</div>` : '<p>Thử ngày khác hoặc thay đổi bộ lọc.</p>'}</div>` : ''}

      ${renderBeBadmintonTimetableBoard({
    courts: sortedCourts,
    hoursRange: data.hoursRange,
    selectedDate: data.selectedDate,
    selectedHour: data.selectedHour,
    csrfToken,
    availableSlotCount: data.availableSlotCount,
    baseUrlPath: '/',
    filteredSlots: data.filteredSlots,
    bookingFilters: filters,
  })}
    </section>

    <!-- TIỆN ÍCH & CAM KẾT DỊCH VỤ (THIẾT KẾ GỌN GÀNG, CHUẨN THỂ THAO & TYPOGRAPHY COURTGO) -->
    <div class="bebad-features-wrap container" aria-label="Cam kết dịch vụ Be Badminton">
      <div class="bebad-features-grid">
        <!-- Card 1: 18 sân thảm tiêu chuẩn -->
        <article class="bebad-feature-item">
          <div class="bebad-feature-icon" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="icCourtBg" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#10b981" />
                  <stop offset="100%" stop-color="#047857" />
                </linearGradient>
                <filter id="icCourtDrop" x="2" y="2" width="52" height="52" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#047857" flood-opacity="0.25" />
                </filter>
              </defs>
              <g filter="url(#icCourtDrop)">
                <rect x="6" y="8" width="44" height="40" rx="10" fill="url(#icCourtBg)" />
                <rect x="11" y="13" width="34" height="30" rx="4" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.8" fill="none" />
                <line x1="28" y1="13" x2="28" y2="43" stroke="#ffffff" stroke-width="2" stroke-dasharray="2 1.5" stroke-opacity="0.9" />
                <line x1="11" y1="28" x2="45" y2="28" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.6" />
                <circle cx="36" cy="22" r="3.5" fill="#facc15" stroke="#ffffff" stroke-width="1.2" />
                <path d="M33 24L26 31M35 25L28 32M37 24L31 32" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
              </g>
            </svg>
          </div>
          <h3>18 sân thảm tiêu chuẩn</h3>
          <p>Mặt thảm PVC êm chân bám dính tốt, trần cao 13m thoáng đãng cùng hệ thống đèn LED dịu mắt khi đánh cầu.</p>
        </article>

        <!-- Card 2: Giữ chỗ tự động 5 phút -->
        <article class="bebad-feature-item">
          <div class="bebad-feature-icon" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="icTimerBg" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#ea580c" />
                  <stop offset="100%" stop-color="#c2410c" />
                </linearGradient>
                <filter id="icTimerDrop" x="2" y="2" width="52" height="52" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#ea580c" flood-opacity="0.25" />
                </filter>
              </defs>
              <g filter="url(#icTimerDrop)">
                <rect x="6" y="8" width="44" height="40" rx="10" fill="url(#icTimerBg)" />
                <rect x="25" y="4" width="6" height="4" rx="1.5" fill="#fef08a" />
                <line x1="24" y1="4" x2="32" y2="4" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="28" cy="28" r="13" stroke="#ffffff" stroke-width="2" fill="#fff7ed" fill-opacity="0.15" />
                <path d="M28 28L28 17A11 11 0 0 1 36 21Z" fill="#facc15" fill-opacity="0.85" />
                <line x1="28" y1="28" x2="28" y2="18" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
                <line x1="28" y1="28" x2="35" y2="21" stroke="#facc15" stroke-width="2" stroke-linecap="round" />
                <circle cx="28" cy="28" r="2.5" fill="#ffffff" />
                <path d="M42 16L45 13M44 24L48 23" stroke="#fef08a" stroke-width="1.5" stroke-linecap="round" />
              </g>
            </svg>
          </div>
          <h3>Giữ chỗ tự động 5 phút</h3>
          <p>Hệ thống giữ riêng ca chơi cho bạn trong 5 phút để thong thả quét mã thanh toán, không lo ai đặt trùng.</p>
        </article>

        <!-- Card 3: Hủy linh hoạt · Hoàn 100% -->
        <article class="bebad-feature-item">
          <div class="bebad-feature-icon" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="icShieldBg" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#1755aa" />
                  <stop offset="100%" stop-color="#0d3b66" />
                </linearGradient>
                <filter id="icShieldDrop" x="2" y="2" width="52" height="52" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#1755aa" flood-opacity="0.25" />
                </filter>
              </defs>
              <g filter="url(#icShieldDrop)">
                <rect x="6" y="8" width="44" height="40" rx="10" fill="url(#icShieldBg)" />
                <path d="M28 14L39 18V28C39 34.5 34.2 39.5 28 42C21.8 39.5 17 34.5 17 28V18L28 14Z" fill="#1e40af" stroke="#ffffff" stroke-width="1.5" />
                <path d="M28 20V23C31.3 23 34 25.7 34 29C34 30.5 33.4 31.8 32.5 32.8L34.2 34.2C35.5 32.8 36.3 31 36.3 29C36.3 24.4 32.6 20.7 28 20.7V20Z" fill="#38bdf8" />
                <path d="M28 37V34C24.7 34 22 31.3 22 28C22 26.5 22.6 25.2 23.5 24.2L21.8 22.8C20.5 24.2 19.7 26 19.7 28C19.7 32.6 23.4 36.3 28 36.3V37Z" fill="#38bdf8" />
                <path d="M25 28L27.5 30.5L32 25" stroke="#facc15" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </g>
            </svg>
          </div>
          <h3>Hủy linh hoạt · Hoàn 100%</h3>
          <p>Chủ động hủy trước giờ chơi 12 tiếng để nhận lại đủ 100% tiền sân, hoàn trả trực tiếp vào tài khoản.</p>
        </article>
      </div>
    </div>

    <!-- TẦNG 6: DỊCH VỤ CHO THUÊ VỢT, GIÀY & PHỤ KIỆN TẠI SÂN (COMPACT HORIZONTAL MENU - TINH GỌN, KHÔNG GÂY RỐI MẮT) -->
    <section class="xat-promo-band home-pricing-section" id="bang-gia-niem-yet" aria-labelledby="promo-services-heading" style="margin-bottom: 48px;">
      ${sectionHeading({
    id: 'promo-services-heading',
    title: 'Bảng giá',
    subtitle: 'Giá theo ca chơi và dịch vụ bạn chọn.',
    tone: 'blue',
  })}

      <div class="home-pricing-grid">
      ${renderPureCodePriceSection(data.priceBoard,data.selectedDate,true,data.coupons)}
      <div id="dich-vu-noi-bat" class="equipment-pricing-panel">
      <style>
      .equipment-groups{display:grid;grid-template-columns:1fr 1fr;gap:28px}.equipment-group{min-width:0}.equipment-group h3{font-size:18px;padding-bottom:14px;border-bottom:2px solid #dbe7ef;margin:0}.equipment-list{display:grid;gap:0}.equipment-product{display:grid;grid-template-columns:110px minmax(0,1fr) auto;gap:16px;align-items:center;padding:22px 0;border-bottom:1px solid #e2eaf0}.equipment-product img{width:110px;height:100px;object-fit:contain}.equipment-product h4{font-size:16px;line-height:1.4;margin:0 0 6px}.equipment-product p{font-size:12px;color:#6b7d8b;line-height:1.6;margin:5px 0}.equipment-price{text-align:right;white-space:nowrap;font-size:17px;font-weight:750;color:#164d72}.equipment-price small{display:block;font-size:11px;font-weight:500;color:#70808d}.equipment-state{font-size:12px;font-weight:650;color:#27734e}.equipment-state.out{color:#b3473d}.equipment-product.sold-out img{opacity:.85}@media(max-width:900px){.equipment-groups{grid-template-columns:1fr}}@media(max-width:480px){.equipment-product{grid-template-columns:76px minmax(0,1fr);gap:12px}.equipment-product img{width:76px;height:76px}.equipment-price{grid-column:2;text-align:left}.equipment-price small{display:inline;margin-left:6px}}
      </style><div class="equipment-groups" id="home-addon-cards-grid">
      ${[['Thuê dụng cụ',true],['Phụ kiện & nước uống',false]].map(([label,rental])=>`<div class="equipment-group"><div class="equipment-group-head"><h3>${label}</h3><a href="/dung-cu?nhom=${rental?'thue':'mua'}">Xem tất cả (${homeAddons.filter(i=>['RENTAL','FACILITY'].includes(i.category)===rental).length})</a></div><div class="equipment-list">${homeAddons.filter(i=>['RENTAL','FACILITY'].includes(i.category)===rental).slice(0,3).map(item=>`<article class="equipment-product ${item.stockStatus!=='AVAILABLE'?'sold-out':''}"><img src="${escapeHtml(item.imageUrl||'')}" alt="${escapeHtml(item.name)}" loading="lazy"><div><h4>${escapeHtml(item.name)}</h4><span class="equipment-state ${item.stockStatus!=='AVAILABLE'?'out':''}">${item.stockStatus==='MAINTENANCE'?'Tạm ngưng / bảo trì':item.stockStatus==='OUT_OF_STOCK'?'Hết hàng':'Còn '+item.stockQuantity+' tại quầy'}</span><p>${item.depositVnd>0?'Cọc '+formatVnd(item.depositVnd):rental?'Nhận và trả tại quầy':'Mua trực tiếp hoặc thêm khi đặt sân'}</p></div><div class="equipment-price">${formatVnd(item.priceVnd)}<small>/ ${escapeHtml(item.unit.toLowerCase())}</small></div></article>`).join('')||'<p>Chưa có sản phẩm.</p>'}</div></div>`).join('')}
      </div></div></div>
    </section>

    ${renderVenueLocationSection(data.selectedDate)}

    <!-- TẦNG 7: ĐÁNH GIÁ CỦA KHÁCH HÀNG (4.8★ GOOGLE MAPS TỪ CỘNG ĐỒNG VỢT THỦ) -->
    ${renderCustomerReviewsSection(data.reviews)}

    <!-- TẦNG 8: TIN TỨC HOẠT ĐỘNG & THÔNG BÁO DỊP LỄ -->
    ${renderHomeNewsSection(data.selectedDate, data.articles)}
  `;
}

export function renderCourtDetailPage(data: {
  center: CenterInfo;
  court: CourtSummary;
  selectedDate: string;
  hasSelectedDate?: boolean;
  session: SessionContext | null;
}): string {
  const { court, center, selectedDate } = data;
  const hasDate = data.hasSelectedDate !== false;
  const csrfToken = data.session?.csrfToken || '';
  const dateDisplay = formatVietnamDateDisplay(selectedDate);
  const tomorrowIso = addDaysVietnam(selectedDate, 1);

  return `<div class="court-detail-page">
    <div style="margin-bottom: 18px;">
      <a href="/?date=${encodeURIComponent(selectedDate)}#lich-san-nhanh" class="btn-text">
        ${inlineIcon('back', 16)}
        <span>Quay lại Đặt sân</span>
      </a>
    </div>

    <div class="editorial-layout" style="margin-bottom: 32px;">
      <div class="flat-panel">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
          <span class="badge-pill">
            ${svgGlyph('shuttle', 14, '#0052ff')}
            <span>${escapeHtml(court.code)} · ${escapeHtml(court.court_type)}</span>
          </span>
          <span class="status-badge ${court.status === 'ACTIVE' ? 'badge-confirmed' : 'badge-neutral'}">
            ${court.status === 'ACTIVE' ? '● Đang phục vụ' : '✕ Tạm ngưng'}
          </span>
        </div>

        <div class="order-section-head"><h1 class="headline-lg">${escapeHtml(court.name)}</h1><a class="btn-pill-dark" href="#court-slots-heading">Chọn giờ</a></div>

        ${renderCourtGallery(court.name, court.images)}

        <h2 class="headline-sm" style="margin-bottom: 6px;">Thông tin sân</h2>
        <p class="body-text" style="margin-bottom: 18px;">${escapeHtml(court.description)}</p>

        <div class="grid-2" style="margin-bottom: 20px;">
          <div class="soft-panel" style="padding:18px; display:flex; gap:12px; align-items:flex-start;">
            ${iconBadge('mat', 'green', 40)}
            <div>
              <div class="caption-text" style="font-weight:600; text-transform:uppercase;">Bề mặt thảm</div>
              <div class="body-sm" style="margin-top:4px; color:var(--ink);">${escapeHtml(court.surface_desc)}</div>
            </div>
          </div>
          <div class="soft-panel" style="padding:18px; display:flex; gap:12px; align-items:flex-start;">
            ${iconBadge('light', 'yellow', 40)}
            <div>
              <div class="caption-text" style="font-weight:600; text-transform:uppercase;">Chiếu sáng</div>
              <div class="body-sm" style="margin-top:4px; color:var(--ink);">${escapeHtml(court.lighting_desc)}</div>
            </div>
          </div>
        </div>

        <h2 class="headline-sm" style="margin-bottom: 10px;">Tiện ích</h2>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom: 20px;">
          ${court.amenities
      .map((a) => {
        const ic = amenityIcon(a);
        return `<span style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px 6px 6px; background:var(--surface-soft); border:1px solid var(--hairline); border-radius:var(--r-pill); font-size:14px; font-weight:500;">
                ${iconBadge(ic.name, ic.tone, 28)}
                <span>${escapeHtml(a)}</span>
              </span>`;
      })
      .join('')}
        </div>

        <div class="soft-panel" style="padding:18px; display:flex; gap:12px; align-items:flex-start;">
          ${iconBadge('info', 'blue', 40)}
          <div>
            <h2 class="headline-sm" style="margin-bottom: 4px;">Lưu ý</h2>
            <p class="body-sm">${escapeHtml(court.usage_notes)}</p>
          </div>
        </div>
      </div>

      <aside style="display:flex; flex-direction:column; gap:20px;">
        <div class="flat-panel">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            ${iconBadge('tag', 'blue', 40)}
            <div>
              <h2 class="headline-md">Giá thuê sân</h2>
              <p class="caption-text">Giá mỗi ca chơi</p>
            </div>
          </div>
          ${!hasDate
      ? `
              <div class="soft-panel" style="padding:18px;">
                <p class="body-sm" style="margin-bottom:12px;">
                  Vui lòng <strong>chọn ngày chơi</strong> ở phần lịch đặt sân bên dưới để xem bảng giá và khung giờ trống chính xác của <strong>${escapeHtml(court.name)}</strong>.
                </p>
                <a href="/san/${encodeURIComponent(court.id)}?date=${encodeURIComponent(selectedDate)}#court-slots-heading" class="btn-pill-primary" style="width:100%;">
                  ${inlineIcon('calendar', 16)}
                  <span>Chọn ngày hôm nay (${escapeHtml(dateDisplay)})</span>
                </a>
              </div>
            `
      : `
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Khung thời gian</th>
                    <th>Đơn giá</th>
                  </tr>
                </thead>
                <tbody>
                  ${court.pricingRules
        .map(
          (r) => `
                    <tr>
                      <td>${escapeHtml(r.label)}</td>
                      <td><strong class="num">${escapeHtml(formatVnd(r.price_vnd))}</strong></td>
                    </tr>
                  `
        )
        .join('')}
                </tbody>
              </table>
            `
    }
        </div>

        <div class="soft-panel">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            ${iconBadge('shield', 'purple', 40)}
            <h2 class="headline-sm">Chính sách đặt sân</h2>
          </div>
          <ul style="list-style:none; font-size:14px; display:flex; flex-direction:column; gap:10px;" class="body-sm">
            <li>• <strong>Giữ chỗ:</strong> Tối đa ${Math.floor(center.hold_duration_seconds / 60)} phút trong lúc thanh toán.</li>
            <li>• <strong>Hủy &amp; Hoàn tiền:</strong> Hoàn 100% số tiền đã thanh toán khi hủy trước giờ chơi tối thiểu ${center.cancellation_min_hours} giờ (bao gồm đúng mốc ${center.cancellation_min_hours} giờ).</li>
            <li>• <strong>Dưới ${center.cancellation_min_hours} giờ trước giờ chơi:</strong> Không áp dụng hủy đơn trực tuyến.</li>
          </ul>
          <div style="margin-top:16px;">
            <a href="/chinh-sach" class="btn-pill-outline" style="width:100%;">Xem toàn bộ chính sách</a>
          </div>
        </div>
      </aside>
    </div>

    <!-- Chọn khung giờ đặt sân trên sân này -->
    <section class="flat-panel" aria-labelledby="court-slots-heading">
      ${sectionHeading({
      id: 'court-slots-heading',
      title: hasDate
        ? `Chọn giờ · ${dateDisplay}`
        : `Chọn ngày chơi`,
      icon: 'clock',
      tone: 'green',
    })}

      <div style="margin-bottom: 18px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <label for="court-detail-date" class="form-label" style="margin:0;">Chọn ngày đặt sân:</label>
        <input
          id="court-detail-date"
          type="date"
          value="${escapeHtml(selectedDate)}"
          class="text-input"
          style="max-width:220px;"
          onchange="window.location.href='/san/${encodeURIComponent(court.id)}?date='+encodeURIComponent(this.value)+'#court-slots-heading';"
        />
      </div>

      ${!hasDate
      ? `
          <div class="soft-panel" style="padding:28px; text-align:center;">
            <p class="body-text" style="margin-bottom:16px;">
              Chọn ngày chơi để xem giờ trống và giá thuê.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
              <a href="/san/${encodeURIComponent(court.id)}?date=${encodeURIComponent(selectedDate)}" class="btn-pill-primary">
                <span>Xem giờ trống Hôm nay (${escapeHtml(dateDisplay)})</span>
              </a>
              <a href="/san/${encodeURIComponent(court.id)}?date=${encodeURIComponent(tomorrowIso)}" class="btn-pill-outline">
                <span>Xem giờ trống Ngày mai (${escapeHtml(formatVietnamDateDisplay(tomorrowIso))})</span>
              </a>
            </div>
          </div>
        `
      : `
          <div class="court-slot-grid">
            ${court.slots.map(slot => `<article class="court-slot"><div><strong>${escapeHtml(slot.timeLabel)}</strong><small>${escapeHtml(slot.stateLabelVi)}</small></div><span class="court-slot-price">${escapeHtml(formatVnd(slot.priceVnd))}</span>
              ${slot.state === 'AVAILABLE' ? `<form method="POST" action="/dat-san/giu-cho"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" /><input type="hidden" name="courtId" value="${escapeHtml(slot.courtId)}" /><input type="hidden" name="bookingDate" value="${escapeHtml(slot.date)}" /><input type="hidden" name="startHour" value="${slot.startHour}" /><button type="submit" class="btn-pill-dark" aria-label="Đặt sân ${escapeHtml(slot.timeLabel)}">Đặt sân</button></form>`
              : slot.state === 'MY_HOLD' && slot.myHoldBookingCode ? `<a class="btn-pill-outline" href="/thanh-toan/${encodeURIComponent(slot.myHoldBookingCode)}">Thanh toán</a>`
              : `<button class="btn-pill-outline" disabled aria-label="${escapeHtml(slot.timeLabel)}: ${escapeHtml(slot.stateLabelVi)}">Không đặt</button>`}</article>`).join('')}
          </div>
        `
    }
    </section>
  </div>`;
}

export function renderCheckoutPage(data: {
  booking: BookingRecord;
  center: CenterInfo;
  session: SessionContext;
  coupons?: CouponRecord[];
  equipmentItems?: EquipmentItem[];
}): string {
  const { booking, center, session, coupons = [] } = data;
  const checkoutAddons =
    data.equipmentItems !== undefined
      ? data.equipmentItems
      : BE_BADMINTON_ADDONS.map((a) => ({
        id: a.id,
        code: a.id.toUpperCase(),
        name: a.name,
        category: a.category,
        priceVnd: a.priceVnd,
        originalPriceVnd: null,
        unit: a.unit,
        depositVnd: 0,
        stockQuantity: 0,
        stockStatus: 'OUT_OF_STOCK' as const,
        isActive: true,
        badge: a.badge || null,
        imageUrl: a.imageUrl || '/public/assets/images/addons/giay-cau-long.png',
        description: a.description,
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
      }));
  const now = getServerNow();
  const expiresMs = new Date(booking.hold_expires_at).getTime();
  const remainingSec = Math.max(0, Math.floor((expiresMs - now.getTime()) / 1000));
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');
  const isHoldActive = booking.booking_status === 'HOLD' && remainingSec > 0;
  const dateDisplay = formatVietnamDateDisplay(booking.booking_date);

  if (!isHoldActive) {
    return `
      <div class="ink-border-panel" style="max-width: 720px; margin: 0 auto;">
        ${sectionHeading({
      level: 'h1',
      title: 'Thời gian giữ chỗ đã hết hạn',
      icon: 'timer',
      tone: 'red',
    })}
        <p class="body-text" style="margin-bottom: 16px;">
          Đơn giữ chỗ <strong class="num">${escapeHtml(booking.booking_code)}</strong> cho <strong>${escapeHtml(booking.court_name_snapshot)}</strong> (${escapeHtml(formatSlotRange(booking.start_hour))} ngày ${escapeHtml(dateDisplay)}) đã quá thời hạn 5 phút chờ thanh toán nên sân đã được giải phóng.
        </p>
        <p class="body-sm" style="margin-bottom: 20px;">
          Tải lại trang không tự tạo lại đơn mới. Bạn vui lòng kiểm tra lại lịch trống để chọn khung giờ khác hoặc đặt lại khung giờ này nếu sân vẫn còn trống.
        </p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <a href="/?date=${encodeURIComponent(booking.booking_date)}&hour=${booking.start_hour}#lich-san-nhanh" class="btn-pill-dark">
            Tìm khung giờ còn trống
          </a>
          <a href="/don-dat/${encodeURIComponent(booking.booking_code)}" class="btn-pill-outline">
            Xem chi tiết đơn ${escapeHtml(booking.booking_code)}
          </a>
        </div>
      </div>
    `;
  }

  const qrPayload = `COURTGO|${booking.booking_code}|${booking.total_amount_vnd}|BEBADMINTON`;
  const qrSvg = renderQrCodeSvg(qrPayload, 168);

  const memberTier = session.user.member_tier || 'BRONZE';
  const memberDiscountRate = memberTier === 'GOLD' ? 0.1 : memberTier === 'SILVER' ? 0.05 : 0;
  const memberDiscountVnd = Math.round(booking.quoted_price_vnd * memberDiscountRate);
  const payableInitialTotal = Math.max(1000, booking.quoted_price_vnd + booking.service_fee_vnd - memberDiscountVnd);

  const domesticBanks = [
    { code: 'VCB', short: 'Vietcombank', full: 'Ngân hàng TMCP Ngoại thương Việt Nam', color: '#006a31' },
    { code: 'MB', short: 'MBBank', full: 'Ngân hàng TMCP Quân Đội', color: '#1d4ed8' },
    { code: 'TCB', short: 'Techcombank', full: 'Ngân hàng TMCP Kỹ thương Việt Nam', color: '#dc2626' },
    { code: 'BIDV', short: 'BIDV', full: 'Ngân hàng TMCP Đầu tư và Phát triển VN', color: '#0369a1' },
    { code: 'CTG', short: 'VietinBank', full: 'Ngân hàng TMCP Công thương Việt Nam', color: '#0284c7' },
    { code: 'ACB', short: 'ACB', full: 'Ngân hàng TMCP Á Châu', color: '#1e40af' },
    { code: 'VPB', short: 'VPBank', full: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', color: '#15803d' },
    { code: 'TPB', short: 'TPBank', full: 'Ngân hàng TMCP Tiên Phong', color: '#7e22ce' },
    { code: 'STB', short: 'Sacombank', full: 'Ngân hàng TMCP Sài Gòn Thương Tín', color: '#0369a1' },
    { code: 'VIB', short: 'VIB', full: 'Ngân hàng TMCP Quốc Tế Việt Nam', color: '#ea580c' },
    { code: 'HDB', short: 'HDBank', full: 'Ngân hàng TMCP Phát triển TP.HCM', color: '#b91c1c' },
    { code: 'AGR', short: 'Agribank', full: 'Ngân hàng NN & PTNT Việt Nam', color: '#991b1b' },
  ];

  return `
    <!-- Thanh tiến trình 3 bước phong cách thương mại -->
    <nav class="stepper-bar" aria-label="Tiến trình đặt sân và thanh toán">
      <div class="stepper-step is-done">
        <span class="stepper-num">✓</span>
        <span>1. Chọn ngày &amp; Giữ chỗ sân</span>
      </div>
      <div class="stepper-step is-active" aria-current="step">
        <span class="stepper-num">2</span>
        <span>2. Thông tin &amp; Chọn hình thức thanh toán</span>
      </div>
      <div class="stepper-step">
        <span class="stepper-num">3</span>
        <span>3. Hoàn tất &amp; Nhận mã sân</span>
      </div>
    </nav>

    ${sectionHeading({
    level: 'h1',
    title: 'Kiểm tra đơn & chọn phương thức thanh toán',
    subtitle: 'Vui lòng kiểm tra thông tin người nhận sân và chọn hình thức thanh toán thuận tiện nhất.',
    icon: 'card',
    tone: 'blue',
  })}

    <!-- Thanh đếm ngược thời gian giữ chỗ trực tiếp từ máy chủ -->
    <div class="breaking-band" role="timer" aria-live="polite" id="hold-countdown-banner" data-expires-at="${escapeHtml(new Date(booking.hold_expires_at).toISOString())}">
      <div style="display:flex; align-items:center; gap:10px;">
        ${iconBadge('timer', 'red', 36)}
        <div>
          <span style="font-weight:700;">● ĐANG GIỮ CHỖ:</span>
          <span id="hold-countdown-text" class="num" style="margin-left:6px;">Chúng tôi đang giữ chỗ cho bạn trong ${mm}:${ss}.</span>
        </div>
      </div>
      <div style="font-size:13px;">Mã đơn: <strong class="num">${escapeHtml(booking.booking_code)}</strong></div>
    </div>

    <div class="editorial-layout">
      <!-- Cột trái: Thông tin người nhận sân & Chọn phương thức thanh toán -->
      <div class="flat-panel">
        <form method="POST" action="/thanh-toan/${encodeURIComponent(booking.booking_code)}/khoi-tao" id="checkout-payment-form">
          <input type="hidden" name="_csrf" value="${escapeHtml(session.csrfToken)}" />
          <input type="hidden" name="bankCode" id="selected-bank-code" value="VNPAYQR" />

          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            ${iconBadge('user', 'blue', 38)}
            <h2 class="headline-md">1. Thông tin người nhận sân</h2>
          </div>
          <p class="body-sm" style="margin-bottom: 18px;">
            Chúng tôi sử dụng thông tin này để đối chiếu khi bạn đến nhận sân tại quầy lễ tân Be Badminton và gửi thông báo xác nhận.
          </p>

          <div class="form-group">
            <label for="co-name" class="form-label">Họ và tên người đặt *</label>
            <input id="co-name" type="text" name="contactName" value="${escapeHtml(booking.contact_name)}" class="text-input" required />
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label for="co-phone" class="form-label">Số điện thoại liên hệ *</label>
              <input id="co-phone" type="tel" name="contactPhone" value="${escapeHtml(booking.contact_phone)}" class="text-input" required />
            </div>
            <div class="form-group">
              <label for="co-email" class="form-label">Địa chỉ Email nhận xác nhận *</label>
              <input id="co-email" type="email" name="contactEmail" value="${escapeHtml(booking.contact_email)}" class="text-input" required />
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 26px;">
            <label for="co-notes" class="form-label">Ghi chú cho trung tâm (không bắt buộc)</label>
            <textarea id="co-notes" name="notes" class="text-input" placeholder="Ví dụ: Nhóm 4 người, cần thuê thêm 2 vợt Yonex...">${escapeHtml(booking.notes || '')}</textarea>
          </div>

          <!-- Mục 2: Dịch vụ kèm theo & Phụ kiện tại sân (Tùy chọn) -->
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-top:18px; border-top:1px solid var(--hairline);">
            ${iconBadge('shuttle', 'purple', 38)}
            <div>
              <h2 class="headline-md">2. Dịch vụ kèm theo &amp; Cho thuê phụ kiện (Tùy chọn)</h2>
              <p class="caption-text">Tích chọn để cộng trực tiếp vào số tiền thanh toán — Quầy Lễ tân chuẩn bị sẵn sàng khi nhận sân</p>
            </div>
          </div>

          <input type="hidden" name="addonsJson" id="checkout-addons-json" value="{}" />

          <div class="addon-selection-grid" style="margin-bottom: 26px;">
            ${checkoutAddons.map((item) => {
    const isOut = item.stockStatus !== 'AVAILABLE';
    return `
              <div class="addon-card" id="addon-card-${item.id}" style="${isOut ? 'opacity:0.65;' : ''}">
                <div style="display:flex; align-items:flex-start; gap:12px;">
                  <input
                    type="checkbox"
                    id="addon-cb-${item.id}"
                    class="addon-checkbox js-addon-toggle"
                    data-addon-id="${item.id}"
                    data-price="${item.priceVnd}"
                    data-name="${escapeHtml(item.name)}"
                    ${isOut ? 'disabled' : ''}
                  />
                  <!-- Hình ảnh đại diện món đồ kèm fallback mượt mà -->
                  <div style="width:64px; height:64px; border-radius:10px; overflow:hidden; flex-shrink:0; background:linear-gradient(135deg, #091a32 0%, #17325c 100%); position:relative; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                    <img
                      src="${escapeHtml(item.imageUrl || '/public/assets/images/addons/giay-cau-long.png')}"
                      alt="${escapeHtml(item.name)}"
                      loading="lazy"
                      style="width:100%; height:100%; object-fit:cover; display:block;"
                      onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';"
                    />
                    <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:26px; background:linear-gradient(135deg, #091a32 0%, #163668 100%);">
                      🏸
                    </div>
                  </div>
                  <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                      <label for="addon-cb-${item.id}" style="font-weight:700; font-size:14px; color:#0f172a; cursor:${isOut ? 'not-allowed' : 'pointer'};">
                        ${escapeHtml(item.name)}
                      </label>
                      ${isOut
        ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:#fef2f2; color:#dc2626;">${item.stockStatus === 'MAINTENANCE' ? 'Bảo trì' : 'Hết hàng'}</span>`
        : item.badge
          ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:#eff6ff; color:#1d4ed8;">${escapeHtml(item.badge)}</span>`
          : ''}
                    </div>
                    <p style="font-size:12px; color:#64748b; margin:4px 0 8px 0; line-height:1.4;">
                      ${escapeHtml(item.description)}
                    </p>
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                      <div class="num" style="font-weight:700; font-size:15px; color:#0f6938;">
                        ${escapeHtml(formatVnd(item.priceVnd))} <span style="font-size:12px; font-weight:400; color:#64748b;">/ ${escapeHtml(item.unit)}</span>
                      </div>
                      <div class="addon-qty-group">
                        <label for="addon-qty-${item.id}" class="sr-only">Số lượng ${escapeHtml(item.name)}</label>
                        <button type="button" class="addon-qty-btn js-addon-qty-minus" data-addon-id="${item.id}" title="Giảm số lượng" ${isOut ? 'disabled' : ''}>-</button>
                        <input
                          type="number"
                          id="addon-qty-${item.id}"
                          class="addon-qty-input js-addon-qty"
                          data-addon-id="${item.id}"
                          value="1"
                          min="1"
                          max="${Math.max(1,Math.min(10,item.stockQuantity))}"
                          ${isOut ? 'disabled' : ''}
                        />
                        <button type="button" class="addon-qty-btn js-addon-qty-plus" data-addon-id="${item.id}" title="Tăng số lượng" ${isOut ? 'disabled' : ''}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
  }).join('')}
          </div>

          <!-- Mục 3: Mã giảm giá / Coupon ưu đãi (Tùy chọn) -->
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-top:18px; border-top:1px solid var(--hairline);">
            ${iconBadge('spark', 'orange', 38)}
            <div>
              <h2 class="headline-md">3. Mã giảm giá / Voucher ưu đãi (Tùy chọn)</h2>
              <p class="caption-text">Nhập mã ưu đãi hoặc chọn voucher có sẵn để trừ tiền trực tiếp vào hóa đơn</p>
            </div>
          </div>

          <input type="hidden" name="couponCode" id="checkout-applied-coupon-code" value="" />
          <input type="hidden" name="discountVnd" id="checkout-applied-discount-vnd" value="0" />

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:26px;">
            <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;">
              <div style="flex:1; min-width:240px;">
                <label for="co-coupon-input" class="form-label" style="margin-bottom:6px;">Mã ưu đãi (Coupon)</label>
                <div style="display:flex; gap:8px;">
                  <input
                    type="text"
                    id="co-coupon-input"
                    class="text-input"
                    placeholder="Nhập mã (Ví dụ: BEBADMINTON10, CHAOMUNG20K...)"
                    style="text-transform:uppercase; font-weight:700; letter-spacing:0.5px;"
                  />
                  <button type="button" id="btn-apply-coupon" class="btn-pill-dark" style="min-height:44px; padding:0 20px; white-space:nowrap;">
                    Áp dụng
                  </button>
                  <button type="button" id="btn-cancel-coupon" class="btn-pill-outline" style="min-height:44px; padding:0 14px; white-space:nowrap; display:none;">
                    Bỏ mã
                  </button>
                </div>
              </div>
            </div>

            <div id="coupon-feedback-msg" style="margin-top:10px; font-size:13px; font-weight:600; display:none;"></div>

            <!-- Gợi ý voucher có sẵn -->
            ${coupons && coupons.length > 0
      ? `
              <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #e2e8f0;">
                <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:8px;">Voucher gợi ý cho bạn (Click để áp dụng ngay):</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${coupons
        .map(
          (cp) => `
                    <button
                      type="button"
                      class="btn-text js-coupon-chip"
                      data-coupon-code="${escapeHtml(cp.code)}"
                      style="background:#eff6ff; border:1px dashed #93c5fd; color:#1d4ed8; padding:5px 12px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer;"
                      title="${escapeHtml(cp.title)}"
                    >
                      🏷️ ${escapeHtml(cp.code)}: ${cp.discount_type === 'PERCENT' ? `Giảm ${cp.discount_value}%` : `Giảm ${escapeHtml(formatVnd(cp.discount_value))}`}
                    </button>
                  `
        )
        .join('')}
                </div>
              </div>
            `
      : ''
    }
          </div>

          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-top:18px; border-top:1px solid var(--hairline);">
            ${iconBadge('card', 'green', 38)}
            <div>
              <h2 class="headline-md">4. Chọn hình thức thanh toán</h2>
              <p class="caption-text">Tất cả giao dịch đều được đối soát tự động và bảo mật chuẩn chữ ký số</p>
            </div>
          </div>

          <div class="pay-method-list" role="radiogroup" aria-label="Chọn phương thức thanh toán">
            <!-- Phương thức 1: Quét mã QR (VNPAY-QR / VietQR 24/7) — dùng qrIcon.svg từ xeanhtuyen.vn -->
            <div class="pay-method-card is-selected" data-method-card="QR_PAY">
              <div class="pay-method-header" data-select-radio="pm-qr">
                <input
                  type="radio"
                  id="pm-qr"
                  name="paymentMethod"
                  value="QR_PAY"
                  class="pay-method-radio"
                  checked
                  data-default-bank="VNPAYQR"
                />
                <img src="/public/assets/images/qrIcon.svg" alt="" width="34" height="34" style="flex-shrink:0;" />
                <div style="flex:1;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <label for="pm-qr" class="pay-method-title" style="cursor:pointer;">
                      Thanh toán quét mã QR (VNPAY-QR / VietQR 24/7)
                    </label>
                    <span class="pay-badge-recommend">Khuyên dùng · Nhanh nhất</span>
                  </div>
                  <p class="pay-method-desc">
                    Không cần nhập thông tin thẻ. Mở ứng dụng Ngân hàng hoặc Ví điện tử bất kỳ để quét mã QR, xác nhận thanh toán tức thì và ít sai sót.
                  </p>
                </div>
              </div>
              <div class="pay-method-body">
                <div class="qr-preview-box">
                  <div class="qr-frame" aria-label="Mã QR thanh toán đơn ${escapeHtml(booking.booking_code)}">
                    ${qrSvg}
                    <div style="font-size:11px; font-weight:700; color:#0b1930; margin-top:4px;">VIETQR · VNPAY-QR</div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="font-size:13px; color:#475569;">
                      Bạn có thể quét trực tiếp mã QR xem trước này hoặc bấm <strong>Tiếp tục thanh toán</strong> bên dưới để mở cổng xác nhận giao dịch trực tuyến:
                    </div>
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:13px; display:grid; gap:6px;">
                      <div style="display:flex; justify-content:space-between; gap:8px;">
                        <span style="color:#64748b;">Đơn vị thụ hưởng:</span>
                        <strong style="color:#0f172a;">HỆ THỐNG BE BADMINTON GÒ VẤP</strong>
                      </div>
                      <div style="display:flex; justify-content:space-between; gap:8px;">
                        <span style="color:#64748b;">Số tiền chính xác:</span>
                        <strong class="num" style="color:#0052ff; font-size:15px;">${escapeHtml(formatVnd(booking.total_amount_vnd))}</strong>
                      </div>
                      <div style="display:flex; justify-content:space-between; gap:8px;">
                        <span style="color:#64748b;">Nội dung chuyển khoản:</span>
                        <strong class="num" style="color:#0f172a;">COURTGO ${escapeHtml(booking.booking_code)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Phương thức 2: Thẻ ATM nội địa / Internet Banking — dùng domestic_payment.svg từ xeanhtuyen.vn -->
            <div class="pay-method-card" data-method-card="ATM_BANK">
              <div class="pay-method-header" data-select-radio="pm-atm">
                <input
                  type="radio"
                  id="pm-atm"
                  name="paymentMethod"
                  value="ATM_BANK"
                  class="pay-method-radio"
                  data-default-bank="VCB"
                />
                <img src="/public/assets/images/domestic_payment.svg" alt="" width="34" height="34" style="flex-shrink:0;" />
                <div style="flex:1;">
                  <label for="pm-atm" class="pay-method-title" style="cursor:pointer;">
                    Thẻ ATM nội địa / Internet Banking (Hỗ trợ 40+ ngân hàng)
                  </label>
                  <p class="pay-method-desc">
                    Vui lòng chọn ngân hàng và bấm nút Thanh toán bên dưới. Chúng tôi sẽ chuyển bạn đến cổng thanh toán để hoàn thành giao dịch.
                  </p>
                </div>
              </div>
              <div class="pay-method-body">
                <div class="form-group" style="margin-bottom:12px;">
                  <label for="bank-search-input" class="form-label">Tìm kiếm ngân hàng của bạn</label>
                  <input
                    id="bank-search-input"
                    type="text"
                    class="bank-search-box"
                    placeholder="Nhập tên ngân hàng (Ví dụ: Vietcombank, MBBank, Techcombank, ACB...)"
                  />
                </div>
                <div class="bank-grid" id="domestic-bank-grid">
                  ${domesticBanks
      .map(
        (b, idx) => `
                    <button
                      type="button"
                      class="bank-card ${idx === 0 ? 'is-active' : ''}"
                      data-bank-code="${escapeHtml(b.code)}"
                      data-bank-search="${escapeHtml((b.short + ' ' + b.full + ' ' + b.code).toLowerCase())}"
                    >
                      <span class="bank-code-pill" style="color:${b.color}; font-weight:800;">${escapeHtml(b.short)}</span>
                      <span class="bank-name-sub">${escapeHtml(b.code)} · Nội địa</span>
                    </button>
                  `
      )
      .join('')}
                </div>
              </div>
            </div>

            <!-- Phương thức 3: Thẻ thanh toán quốc tế Visa / MasterCard / JCB -->
            <div class="pay-method-card" data-method-card="INTL_CARD">
              <div class="pay-method-header" data-select-radio="pm-intl">
                <input
                  type="radio"
                  id="pm-intl"
                  name="paymentMethod"
                  value="INTL_CARD"
                  class="pay-method-radio"
                  data-default-bank="VISA"
                />
                <img src="/public/assets/images/international_card.svg" alt="" width="34" height="34" style="flex-shrink:0;" />
                <div style="flex:1;">
                  <label for="pm-intl" class="pay-method-title" style="cursor:pointer;">
                    Thẻ thanh toán quốc tế (Visa / MasterCard / JCB)
                  </label>
                  <p class="pay-method-desc">
                    Thanh toán an toàn qua chuẩn bảo mật 3D-Secure. Phù hợp với thẻ tín dụng hoặc thẻ ghi nợ quốc tế.
                  </p>
                </div>
              </div>
              <div class="pay-method-body">
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                  <span class="badge-pill">VISA 3D-Secure</span>
                  <span class="badge-pill">MasterCard Identity Check</span>
                  <span class="badge-pill">JCB J/Secure</span>
                  <span class="caption-text">Không thu thêm phụ phí quẹt thẻ quốc tế.</span>
                </div>
              </div>
            </div>

            <!-- Phương thức 4: Ví điện tử VNPAY / MoMo / ZaloPay -->
            <div class="pay-method-card" data-method-card="EWALLET">
              <div class="pay-method-header" data-select-radio="pm-wallet">
                <input
                  type="radio"
                  id="pm-wallet"
                  name="paymentMethod"
                  value="EWALLET"
                  class="pay-method-radio"
                  data-default-bank="VNPAY_WALLET"
                />
                <img src="/public/assets/images/ewallet.svg" alt="" width="34" height="34" style="flex-shrink:0;" />
                <div style="flex:1;">
                  <label for="pm-wallet" class="pay-method-title" style="cursor:pointer;">
                    Ví điện tử (VNPAY App / MoMo / ZaloPay)
                  </label>
                  <p class="pay-method-desc">
                    Liên kết trực tiếp ứng dụng ví điện tử trên điện thoại để xác nhận thanh toán nhanh bằng sinh trắc học.
                  </p>
                </div>
              </div>
              <div class="pay-method-body">
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                  <span class="badge-pill">Ví VNPAY</span>
                  <span class="badge-pill">Ví MoMo</span>
                  <span class="badge-pill">Ví ZaloPay</span>
                </div>
              </div>
            </div>
          </div>

          <div class="soft-panel" style="margin-top: 22px; margin-bottom: 22px; padding:20px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              ${iconBadge('shield', 'green', 34)}
              <h3 class="headline-sm">5. Điều kiện hủy &amp; hoàn tiền áp dụng cho đơn này</h3>
            </div>
            <p class="body-sm">
              • Phiên bản chính sách cam kết: <strong>${escapeHtml(booking.policy_version_snapshot)}</strong>.<br/>
              • Bạn được hủy trực tuyến và nhận lại <strong>${booking.refund_rate_pct_snapshot}% số tiền đã thanh toán (${escapeHtml(formatVnd(booking.total_amount_vnd))})</strong> nếu thực hiện hủy khi còn <strong>ít nhất ${booking.cancel_min_hours_snapshot} giờ</strong> trước giờ bắt đầu chơi (${escapeHtml(formatSlotRange(booking.start_hour))} ngày ${escapeHtml(dateDisplay)}).<br/>
              • Dưới ${booking.cancel_min_hours_snapshot} giờ trước giờ chơi, đơn không áp dụng hủy trực tuyến.
            </p>
          </div>

          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <button type="submit" id="btn-submit-payment" class="btn-pill-primary btn-lg">
              ${inlineIcon('card', 18)}
              <span id="btn-submit-label">Thanh toán ${escapeHtml(formatVnd(payableInitialTotal))}</span>
            </button>
            <a href="/don-dat/${encodeURIComponent(booking.booking_code)}#khu-vuc-huy" class="btn-pill-outline">
              Hủy giữ chỗ này
            </a>
          </div>
        </form>
      </div>

      <!-- Cột phải: Tóm tắt vé đặt sân của bạn -->
      <aside class="ink-border-panel">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          ${iconBadge('receipt', 'purple', 40)}
          <div>
            <h2 class="headline-md">Vé đặt sân của bạn</h2>
            <p class="caption-text">Tóm tắt lịch trình &amp; chi phí</p>
          </div>
        </div>

        <div style="border-bottom:1px solid var(--hairline-soft); padding-bottom:12px; margin-bottom:12px;">
          <div class="caption-text">Mã đơn đặt sân</div>
          <div class="num" style="font-size:18px; font-weight:700; color:var(--primary);">${escapeHtml(booking.booking_code)}</div>
        </div>

        <div style="border-bottom:1px solid var(--hairline-soft); padding-bottom:12px; margin-bottom:12px;">
          <div class="caption-text">Cơ sở &amp; Sân cầu lông</div>
          <div style="font-weight:700; font-size:16px;">${escapeHtml(booking.court_name_snapshot)}</div>
          <div class="caption-text" style="margin-top:4px;">${escapeHtml(center.name)} — ${escapeHtml(center.address)}</div>
          ${booking.notes && booking.notes.includes('BATCH_COMPANIONS')
      ? `
                <div style="margin-top:8px; font-size:12px; color:#1e40af; background:#eff6ff; padding:8px 10px; border-radius:8px; border:1px solid #bfdbfe; line-height:1.45;">
                  <strong>🏸 Danh sách sân trong combo:</strong><br/>
                  ${escapeHtml(booking.notes.split('|')[1]?.trim() || booking.notes)}
                </div>
              `
      : booking.court_name_snapshot.includes('+')
        ? `<div style="display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:#eff6ff; color:#1d4ed8; margin-top:6px;">🏸 Đặt gộp nhiều khung giờ cùng lúc</div>`
        : ''
    }
        </div>

        <div style="border-bottom:1px solid var(--hairline-soft); padding-bottom:12px; margin-bottom:12px;">
          <div class="caption-text">Ngày và khung giờ chơi</div>
          <div class="num" style="font-weight:700; font-size:16px;">
            ${escapeHtml(formatSlotRange(booking.start_hour, booking.end_hour))} · Ngày ${escapeHtml(dateDisplay)}
          </div>
          <div class="caption-text" style="margin-top:4px;">Áp dụng khung giá: ${escapeHtml(booking.pricing_label_snapshot)}</div>
        </div>

        <div style="border-bottom:1px solid var(--hairline-soft); padding-bottom:12px; margin-bottom:12px;">
          <div class="caption-text">Phương thức thanh toán đang chọn</div>
          <div id="summary-selected-method" style="font-weight:700; font-size:14px; color:#0f172a; margin-top:2px;">
            Quét mã QR (VNPAY-QR / VietQR 24/7)
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:8px;" class="body-sm">
          <span>Giá thuê sân (${booking.court_name_snapshot.includes('+') ? 'các khung giờ' : '60 phút'})</span>
          <strong class="num">${escapeHtml(formatVnd(booking.quoted_price_vnd))}</strong>
        </div>

        ${memberDiscountVnd > 0
      ? `
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:#d97706;" class="body-sm">
            <span>Ưu đãi Hội viên (${memberTier === 'GOLD' ? '🥇 Vàng -10%' : '🥈 Bạc -5%'})</span>
            <strong class="num" style="color:#d97706;">-${escapeHtml(formatVnd(memberDiscountVnd))}</strong>
          </div>
        `
      : ''
    }

        <div id="summary-addons-row" style="display:none; justify-content:space-between; margin-bottom:8px;" class="body-sm">
          <span>Dịch vụ &amp; Phụ kiện thêm</span>
          <strong class="num" id="summary-addons-price" style="color:#0f6938;">+0 ₫</strong>
        </div>
        <div id="summary-addons-list" style="margin-bottom:8px; font-size:12px; color:#475569; display:none; line-height:1.45;"></div>

        <div id="summary-coupon-row" style="display:none; justify-content:space-between; margin-bottom:8px;" class="body-sm">
          <span>Mã giảm giá (<strong id="summary-coupon-name"></strong>)</span>
          <strong class="num" id="summary-coupon-discount" style="color:#0f6938;">-0 ₫</strong>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--hairline);" class="body-sm">
          <span>Phí dịch vụ trực tuyến</span>
          <strong class="num">${escapeHtml(formatVnd(booking.service_fee_vnd))}</strong>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;">
          <span class="headline-sm">Tổng thanh toán</span>
          <span id="summary-total-amount" class="num" style="font-size:26px; font-weight:700; color:var(--primary);">${escapeHtml(formatVnd(payableInitialTotal))}</span>
        </div>

        <p class="caption-text">
          Tải lại trang này không làm mất lượt giữ chỗ và không tính lại thời gian giữ chỗ 5 phút ban đầu.
          <a href="/huong-dan-thanh-toan" target="_blank" rel="noopener" style="color:var(--primary); font-weight:700; display:inline-block; margin-top:4px;">Xem hướng dẫn thanh toán QR &amp; Cổng Sandbox ↗</a>
        </p>
      </aside>
    </div>

    <script>
      (function() {
        var banner = document.getElementById('hold-countdown-banner');
        var textEl = document.getElementById('hold-countdown-text');
        var payBtn = document.getElementById('btn-submit-payment');
        if (banner && textEl) {
          var expiresIso = banner.getAttribute('data-expires-at');
          if (expiresIso) {
            var expiresMs = new Date(expiresIso).getTime();
            var timer = setInterval(function() {
              var diffSec = Math.floor((expiresMs - Date.now()) / 1000);
              if (diffSec <= 0) {
                clearInterval(timer);
                textEl.textContent = 'Thời gian giữ chỗ 5 phút đã hết hạn. Vui lòng chọn lại khung giờ trên lịch sân.';
                if (payBtn) payBtn.disabled = true;
                setTimeout(function() { window.location.reload(); }, 1500);
                return;
              }
              var m = String(Math.floor(diffSec / 60)).padStart(2, '0');
              var s = String(diffSec % 60).padStart(2, '0');
              textEl.textContent = 'Chúng tôi đang giữ chỗ cho bạn trong ' + m + ':' + s + '.';
            }, 1000);
          }
        }

        // Tương tác chọn phương thức thanh toán & ngân hàng (phong cách xeanhtuyen.vn)
        var methodCards = document.querySelectorAll('.pay-method-card');
        var radios = document.querySelectorAll('input[name="paymentMethod"]');
        var bankInput = document.getElementById('selected-bank-code');
        var summaryMethod = document.getElementById('summary-selected-method');
        var bankCards = document.querySelectorAll('.bank-card');
        var bankSearch = document.getElementById('bank-search-input');

        var methodLabels = {
          QR_PAY: 'Quét mã QR (VNPAY-QR / VietQR 24/7)',
          ATM_BANK: 'Thẻ ATM nội địa / Internet Banking',
          INTL_CARD: 'Thẻ quốc tế (Visa / MasterCard / JCB)',
          EWALLET: 'Ví điện tử (VNPAY / MoMo / ZaloPay)'
        };

        function syncPaymentSelection() {
          var checkedRadio = document.querySelector('input[name="paymentMethod"]:checked');
          if (!checkedRadio) return;
          var val = checkedRadio.value;
          methodCards.forEach(function(card) {
            if (card.getAttribute('data-method-card') === val) {
              card.classList.add('is-selected');
            } else {
              card.classList.remove('is-selected');
            }
          });
          if (val === 'ATM_BANK') {
            var activeBank = document.querySelector('.bank-card.is-active');
            var bCode = activeBank ? activeBank.getAttribute('data-bank-code') : 'VCB';
            if (bankInput && bCode) bankInput.value = bCode;
            if (summaryMethod) summaryMethod.textContent = methodLabels[val] + ' (' + bCode + ')';
          } else {
            var defBank = checkedRadio.getAttribute('data-default-bank') || 'VNPAYQR';
            if (bankInput) bankInput.value = defBank;
            if (summaryMethod) summaryMethod.textContent = methodLabels[val] || val;
          }
        }

        radios.forEach(function(r) {
          r.addEventListener('change', syncPaymentSelection);
        });

        document.querySelectorAll('[data-select-radio]').forEach(function(header) {
          header.addEventListener('click', function(ev) {
            if (ev.target && ev.target.tagName === 'INPUT') return;
            var radioId = header.getAttribute('data-select-radio');
            var radioEl = radioId ? document.getElementById(radioId) : null;
            if (radioEl && !radioEl.checked) {
              radioEl.checked = true;
              syncPaymentSelection();
            }
          });
        });

        bankCards.forEach(function(btn) {
          btn.addEventListener('click', function() {
            bankCards.forEach(function(b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
            var atmRadio = document.getElementById('pm-atm');
            if (atmRadio) atmRadio.checked = true;
            syncPaymentSelection();
          });
        });

        if (bankSearch) {
          bankSearch.addEventListener('input', function() {
            var q = (bankSearch.value || '').trim().toLowerCase();
            bankCards.forEach(function(btn) {
              var hay = btn.getAttribute('data-bank-search') || '';
              btn.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
            });
          });
        }

        // Xử lý chọn dịch vụ kèm theo và mã giảm giá coupon
        var baseCourtAndFee = ${booking.quoted_price_vnd + booking.service_fee_vnd};
        var baseTotal = ${booking.quoted_price_vnd + booking.service_fee_vnd};
        var memberDiscountVnd = ${memberDiscountVnd};
        var addonsJsonInput = document.getElementById('checkout-addons-json');
        var summaryAddonsRow = document.getElementById('summary-addons-row');
        var summaryAddonsPrice = document.getElementById('summary-addons-price');
        var summaryAddonsList = document.getElementById('summary-addons-list');
        var summaryTotalAmount = document.getElementById('summary-total-amount');
        var btnSubmitLabel = document.getElementById('btn-submit-label');

        // Biến trạng thái mã giảm giá
        var appliedCouponCode = '';
        var appliedCouponDiscount = 0;
        var appliedCouponTitle = '';

        var couponInput = document.getElementById('co-coupon-input');
        var btnApplyCoupon = document.getElementById('btn-apply-coupon');
        var btnCancelCoupon = document.getElementById('btn-cancel-coupon');
        var couponFeedback = document.getElementById('coupon-feedback-msg');
        var hiddenCouponCode = document.getElementById('checkout-applied-coupon-code');
        var hiddenDiscountVnd = document.getElementById('checkout-applied-discount-vnd');
        var summaryCouponRow = document.getElementById('summary-coupon-row');
        var summaryCouponName = document.getElementById('summary-coupon-name');
        var summaryCouponDiscount = document.getElementById('summary-coupon-discount');

        function formatVndJs(amount) {
          var num = Number(amount);
          return (Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0') + ' ₫';
        }

        function calculateAddonsTotal() {
          var addonsTotal = 0;
          var checkboxes = document.querySelectorAll('.js-addon-toggle');
          checkboxes.forEach(function(cb) {
            if (cb.checked) {
              var addonId = cb.getAttribute('data-addon-id');
              var qtyInput = document.getElementById('addon-qty-' + addonId);
              var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
              var price = parseInt(cb.getAttribute('data-price'), 10) || 0;
              addonsTotal += price * qty;
            }
          });
          return addonsTotal;
        }

        function updateFinalPayableTotal() {
          var addonsTotal = calculateAddonsTotal();
          var subtotal = (Number(baseCourtAndFee) || 0) + addonsTotal - (Number(memberDiscountVnd) || 0);
          var curDiscount = Number(appliedCouponDiscount) || 0;
          var finalTotal = Math.max(1000, subtotal - curDiscount);

          if (summaryTotalAmount) {
            summaryTotalAmount.textContent = formatVndJs(finalTotal);
          }
          if (btnSubmitLabel) {
            btnSubmitLabel.textContent = 'Thanh toán ' + formatVndJs(finalTotal);
          }
        }

        function recalculateAddons() {
          var selectedAddons = {};
          var addonsTotal = 0;
          var listHtml = [];
          var checkboxes = document.querySelectorAll('.js-addon-toggle');
          checkboxes.forEach(function(cb) {
            var addonId = cb.getAttribute('data-addon-id');
            var card = document.getElementById('addon-card-' + addonId);
            if (cb.checked) {
              if (card) card.classList.add('is-selected');
              var qtyInput = document.getElementById('addon-qty-' + addonId);
              var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
              var price = parseInt(cb.getAttribute('data-price'), 10) || 0;
              var name = cb.getAttribute('data-name') || addonId;
              selectedAddons[addonId] = qty;
              addonsTotal += price * qty;
              listHtml.push('• ' + name + ' (x' + qty + '): +' + formatVndJs(price * qty));
            } else {
              if (card) card.classList.remove('is-selected');
            }
          });

          if (addonsJsonInput) {
            addonsJsonInput.value = JSON.stringify(selectedAddons);
          }

          if (summaryAddonsRow && summaryAddonsPrice && summaryAddonsList) {
            if (addonsTotal > 0) {
              summaryAddonsRow.style.display = 'flex';
              summaryAddonsPrice.textContent = '+' + formatVndJs(addonsTotal);
              summaryAddonsList.style.display = 'block';
              summaryAddonsList.innerHTML = listHtml.join('<br/>');
            } else {
              summaryAddonsRow.style.display = 'none';
              summaryAddonsList.style.display = 'none';
              summaryAddonsList.innerHTML = '';
            }
          }

          // Nếu đang có mã coupon, tự động kiểm tra lại với subtotal mới
          if (appliedCouponCode) {
            applyCouponByCode(appliedCouponCode, true);
          } else {
            updateFinalPayableTotal();
          }
        }

        function applyCouponByCode(codeToApply, isSilentRecalc) {
          var code = (codeToApply || (couponInput ? couponInput.value : '')).trim().toUpperCase();
          if (!code) {
            if (couponFeedback && !isSilentRecalc) {
              couponFeedback.style.display = 'block';
              couponFeedback.innerHTML = '<span style="color:#dc2626;">Vui lòng nhập mã giảm giá.</span>';
            }
            return;
          }

          var addonsTotal = calculateAddonsTotal();
          var currentSubtotal = baseCourtAndFee + addonsTotal;

          if (btnApplyCoupon && !isSilentRecalc) btnApplyCoupon.disabled = true;

          fetch('/api/coupons/kiem-tra', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, orderAmountVnd: currentSubtotal })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (btnApplyCoupon) btnApplyCoupon.disabled = false;
            if (data.valid) {
              appliedCouponCode = data.coupon.code;
              appliedCouponDiscount = Number(data.discountVnd) || 0;
              appliedCouponTitle = data.coupon.title;

              if (hiddenCouponCode) hiddenCouponCode.value = appliedCouponCode;
              if (hiddenDiscountVnd) hiddenDiscountVnd.value = appliedCouponDiscount;
              if (couponInput) {
                couponInput.value = appliedCouponCode;
                couponInput.disabled = true;
              }
              if (btnApplyCoupon) btnApplyCoupon.style.display = 'none';
              if (btnCancelCoupon) btnCancelCoupon.style.display = 'inline-flex';

              if (couponFeedback) {
                couponFeedback.style.display = 'block';
                couponFeedback.innerHTML = '<span style="color:#0f6938;">✓ Áp dụng thành công mã <strong>' + appliedCouponCode + '</strong>: Giảm -' + formatVndJs(appliedCouponDiscount) + ' (' + appliedCouponTitle + ')</span>';
              }

              if (summaryCouponRow && summaryCouponName && summaryCouponDiscount) {
                summaryCouponRow.style.display = 'flex';
                summaryCouponName.textContent = appliedCouponCode;
                summaryCouponDiscount.textContent = '-' + formatVndJs(appliedCouponDiscount);
              }

              updateFinalPayableTotal();
            } else {
              if (couponFeedback && !isSilentRecalc) {
                couponFeedback.style.display = 'block';
                couponFeedback.innerHTML = '<span style="color:#dc2626;">✕ ' + (data.errorVi || 'Mã giảm giá không hợp lệ.') + '</span>';
              }
            }
          })
          .catch(function(err) {
            console.error('Lỗi kết nối khi kiểm tra coupon:', err);
            if (btnApplyCoupon) btnApplyCoupon.disabled = false;
            if (couponFeedback && !isSilentRecalc) {
              couponFeedback.style.display = 'block';
              couponFeedback.innerHTML = '<span style="color:#dc2626;">Lỗi kết nối khi kiểm tra mã ưu đãi. Vui lòng thử lại.</span>';
            }
          });
        }

        if (btnApplyCoupon) {
          btnApplyCoupon.addEventListener('click', function(e) {
            e.preventDefault();
            applyCouponByCode();
          });
        }

        if (couponInput) {
          couponInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyCouponByCode();
            }
          });
        }

        if (btnCancelCoupon) {
          btnCancelCoupon.addEventListener('click', function(e) {
            e.preventDefault();
            appliedCouponCode = '';
            appliedCouponDiscount = 0;
            appliedCouponTitle = '';
            if (hiddenCouponCode) hiddenCouponCode.value = '';
            if (hiddenDiscountVnd) hiddenDiscountVnd.value = '0';
            if (couponInput) {
              couponInput.value = '';
              couponInput.disabled = false;
            }
            if (btnApplyCoupon) btnApplyCoupon.style.display = 'inline-flex';
            if (btnCancelCoupon) btnCancelCoupon.style.display = 'none';
            if (couponFeedback) {
              couponFeedback.style.display = 'none';
              couponFeedback.innerHTML = '';
            }
            if (summaryCouponRow) summaryCouponRow.style.display = 'none';
            updateFinalPayableTotal();
          });
        }

        document.querySelectorAll('.js-coupon-chip').forEach(function(chip) {
          chip.addEventListener('click', function(e) {
            e.preventDefault();
            var code = chip.getAttribute('data-coupon-code');
            if (couponInput) couponInput.value = code;
            applyCouponByCode(code);
          });
        });

        document.querySelectorAll('.js-addon-toggle').forEach(function(cb) {
          cb.addEventListener('change', recalculateAddons);
        });

        document.querySelectorAll('.js-addon-qty-minus').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            var addonId = btn.getAttribute('data-addon-id');
            var input = document.getElementById('addon-qty-' + addonId);
            if (input) {
              var val = parseInt(input.value, 10) || 1;
              if (val > 1) {
                input.value = val - 1;
                recalculateAddons();
              }
            }
          });
        });

        document.querySelectorAll('.js-addon-qty-plus').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            var addonId = btn.getAttribute('data-addon-id');
            var input = document.getElementById('addon-qty-' + addonId);
            if (input) {
              var val = parseInt(input.value, 10) || 1;
              if (val < Number(input.max || 10)) {
                input.value = val + 1;
                recalculateAddons();
              }
            }
          });
        });

        document.querySelectorAll('.js-addon-qty').forEach(function(input) {
          input.addEventListener('input', function() {
            var val = parseInt(input.value, 10);
            if (isNaN(val) || val < 1) input.value = 1;
            if (val > Number(input.max || 10)) input.value = input.max || 10;
            recalculateAddons();
          });
        });
      })();
    </script>
  `;
}

export function renderMyBookingsPage(data: {
  bookings: BookingRecord[];
  statusFilter: string;
  page: number;
  totalPages: number;
  totalCount: number;
}): string {
  return `
    ${sectionHeading({
    level: 'h1',
    title: `Đơn đặt sân của tôi (${data.totalCount})`,
    subtitle: 'Theo dõi tình trạng đặt sân, thanh toán tiếp hoặc hủy đơn trực tuyến.',
    icon: 'receipt',
    tone: 'blue',
  })}

    <div class="flat-panel" style="margin-bottom: 24px;">
      <form method="GET" action="/don-dat" style="display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0; min-width:260px;">
          <label for="bf-status" class="form-label">Lọc theo tình trạng đặt sân</label>
          <select id="bf-status" name="status" class="network-select">
            <option value="">Tất cả trạng thái</option>
            <option value="HOLD" ${data.statusFilter === 'HOLD' ? 'selected' : ''}>Đang giữ chỗ chờ thanh toán</option>
            <option value="CONFIRMED" ${data.statusFilter === 'CONFIRMED' ? 'selected' : ''}>Đã xác nhận</option>
            <option value="CHECKED_IN" ${data.statusFilter === 'CHECKED_IN' ? 'selected' : ''}>Đã nhận sân</option>
            <option value="COMPLETED" ${data.statusFilter === 'COMPLETED' ? 'selected' : ''}>Đã hoàn tất</option>
            <option value="CANCELLED" ${data.statusFilter === 'CANCELLED' ? 'selected' : ''}>Đã hủy</option>
            <option value="EXPIRED" ${data.statusFilter === 'EXPIRED' ? 'selected' : ''}>Đã hết hạn giữ chỗ</option>
          </select>
        </div>
        <button type="submit" class="btn-pill-dark">Lọc danh sách</button>
        <a href="/don-dat" class="btn-pill-outline">Xem tất cả</a>
      </form>
    </div>

    ${data.bookings.length === 0
      ? `
          <div class="flat-panel" style="text-align:center; padding: 48px 24px;">
            <div style="margin-bottom:12px;">${iconBadge('calendar', 'blue', 56)}</div>
            <h2 class="headline-md" style="margin-bottom: 8px;">Bạn chưa có đơn đặt sân nào trong mục này</h2>
            <p class="body-sm" style="margin-bottom: 20px;">Chọn ngày và khung giờ phù hợp trên bảng lịch trực tiếp để đặt sân ngay.</p>
            <a href="/#lich-san-nhanh" class="btn-pill-dark">Đặt sân</a>
          </div>
        `
      : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sân &amp; Thời gian chơi</th>
                  <th>Tổng tiền</th>
                  <th>Tình trạng đặt sân</th>
                  <th>Thanh toán &amp; Hoàn tiền</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${data.bookings
        .map((b) => {
          const bStat = formatBookingStatusVi(b.booking_status);
          const pStat = formatPaymentStatusVi(b.payment_status);
          const rStat = formatRefundStatusVi(b.refund_status);
          const canPayMore =
            b.booking_status === 'HOLD' && new Date(b.hold_expires_at).getTime() > getServerNow().getTime();

          const primaryCodeMatch = b.notes?.match(/BATCH_PRIMARY_CODE:\[(.*?)\]/);
          const primaryCode = primaryCodeMatch ? primaryCodeMatch[1] : null;
          const companionMatch = b.notes?.match(/BATCH_COMPANIONS:\[(.*?)\]/);
          const isPrimaryCombo = !!(companionMatch && companionMatch[1]);
          const payTargetCode = primaryCode || b.booking_code;
          const groupLink = b.payment_group_code
            ? `<div class="caption-text" style="margin-top:2px;">Thanh toán chung · <a href="/thanh-toan/nhom/${encodeURIComponent(b.payment_group_code)}" class="text-link">${escapeHtml(b.payment_group_code)}</a></div>`
            : '';

          return `
                    <tr>
                      <td>
                        <a href="/don-dat/${encodeURIComponent(b.booking_code)}" class="num" style="font-weight:700; font-size:15px;">
                          ${escapeHtml(b.booking_code)}
                        </a>
                        ${groupLink || (primaryCode
              ? `<div style="font-size:11.5px; color:#2563eb; font-weight:700; margin-top:2px;">🏸 Combo cùng đơn <a href="/don-dat/${encodeURIComponent(primaryCode)}" style="color:#2563eb; text-decoration:underline;">${escapeHtml(primaryCode)}</a></div>`
              : isPrimaryCombo
                ? `<div style="font-size:11.5px; color:#0f766e; font-weight:700; margin-top:2px;">⭐ Đơn chính combo</div>`
                : ''
            )}
                        <div class="caption-text">Tạo lúc ${escapeHtml(formatVietnamDateTimeDisplay(b.created_at))}</div>
                      </td>
                      <td>
                        <strong>${escapeHtml(b.court_name_snapshot)}</strong>
                        <div class="body-sm num">${escapeHtml(formatSlotRange(b.start_hour, b.end_hour))} · Ngày ${escapeHtml(formatVietnamDateDisplay(b.booking_date))}</div>
                      </td>
                      <td>
                        <strong class="num">${escapeHtml(formatVnd(b.total_amount_vnd))}</strong>
                        ${primaryCode ? `<div style="font-size:11px; color:#64748b;">(Thanh toán chung)</div>` : ''}
                      </td>
                      <td>
                        <span class="status-badge ${bStat.cssClass}">${bStat.symbol} ${escapeHtml(bStat.label)}</span>
                      </td>
                      <td>
                        <div><span class="status-badge ${pStat.cssClass}">${pStat.symbol} ${escapeHtml(pStat.label)}</span></div>
                        ${b.refund_status !== 'NONE' && b.refund_status !== 'NOT_APPLICABLE'
              ? `<div style="margin-top:6px;"><span class="status-badge ${rStat.cssClass}">${rStat.symbol} Hoàn tiền: ${escapeHtml(rStat.label)} (${escapeHtml(formatVnd(b.refundable_amount_vnd))})</span></div>`
              : ''
            }
                      </td>
                      <td>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <a href="/don-dat/${encodeURIComponent(b.booking_code)}" class="btn-pill-outline" style="padding:7px 14px; min-height:36px; font-size:13px;">Chi tiết</a>
                          ${canPayMore
              ? `<a href="/thanh-toan/${encodeURIComponent(payTargetCode)}" class="btn-pill-dark" style="padding:7px 14px; min-height:36px; font-size:13px;">Thanh toán tiếp</a>`
              : ''
            }
                        </div>
                      </td>
                    </tr>
                  `;
        })
        .join('')}
              </tbody>
            </table>
          </div>

          ${data.totalPages > 1
        ? `
                <div style="display:flex; justify-content:center; gap:8px; margin-top:20px;">
                  ${Array.from({ length: data.totalPages }, (_, idx) => idx + 1)
          .map(
            (p) =>
              `<a href="/don-dat?status=${encodeURIComponent(data.statusFilter)}&page=${p}" class="${p === data.page ? 'btn-pill-dark' : 'btn-pill-outline'}" style="padding:8px 14px; min-height:38px;">Trang ${p}</a>`
          )
          .join('')}
                </div>
              `
        : ''
      }
        `
    }
  `;
}

export function renderBookingDetailPage(data: {
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
    destination_bank_name?: string | null;
    destination_account_no?: string | null;
    destination_account_name?: string | null;
    is_manual_refund?: boolean;
    manual_txn_ref?: string | null;
  }>;
  cancellationEval: CancellationEvaluation;
  session: SessionContext;
}): string {
  const { booking, events, refunds, cancellationEval, session } = data;
  const code = encodeURIComponent(booking.booking_code);
  const canPayNow = booking.booking_status === 'HOLD' && new Date(booking.hold_expires_at).getTime() > getServerNow().getTime();
  const printable = canPrintBookingTicket(booking);
  return `<div class="order-page">
    <a class="order-back" href="/don-dat">${inlineIcon('back', 16)} Đơn đặt của tôi</a>
    <header class="order-header"><div><p class="order-muted">Chi tiết đặt sân</p><h1>${escapeHtml(booking.booking_code)}</h1></div>${orderStatus(booking)}</header>
    ${canPayNow ? `<div class="order-notice">Giữ chỗ đến ${escapeHtml(formatVietnamDateTimeDisplay(booking.hold_expires_at))}. Thanh toán để xác nhận đặt sân.</div>` : ''}
    ${booking.cancel_reason ? `<p class="order-notice">Lý do hủy: ${escapeHtml(booking.cancel_reason)}</p>` : ''}
    <div class="order-grid"><div class="order-stack">
      ${orderSchedule(booking)}
      ${orderContact(booking)}
      ${booking.equipment_rented_summary || booking.equipment_deposit_vnd ? `<section class="order-panel"><h2>Dụng cụ thuê</h2><p>${escapeHtml(booking.equipment_rented_summary || 'Chưa ghi nhận dụng cụ')}</p>
        ${booking.equipment_deposit_vnd ? `<p class="order-muted">Cọc tại quầy: ${escapeHtml(formatVnd(booking.equipment_deposit_vnd))} · ${booking.deposit_refunded ? 'Đã hoàn cọc' : 'Chưa hoàn cọc'}</p>` : ''}</section>` : ''}
      <details id="khu-vuc-huy" class="order-panel order-disclosure"><summary>Chính sách hủy &amp; hoàn tiền</summary>
        <p class="order-muted">Hủy trước ${booking.cancel_min_hours_snapshot} giờ được hoàn ${booking.refund_rate_pct_snapshot}% theo chính sách của đơn.</p>
        ${cancellationEval.canCancel ? `<p class="order-notice">${escapeHtml(cancellationEval.policySummaryVi)}<br>Số tiền được hoàn: ${escapeHtml(formatVnd(cancellationEval.refundAmountVnd))}.</p>
          <form method="POST" action="/don-dat/${code}/huy" class="order-form" onsubmit="return confirm('Xác nhận hủy đơn đặt sân này?');">
            <input type="hidden" name="_csrf" value="${escapeHtml(session.csrfToken)}" />
            <label for="cancel-reason">Lý do hủy<input id="cancel-reason" name="reason" class="text-input" required placeholder="Nhập lý do hủy" /></label>
            <div class="order-actions"><button type="submit" class="btn-pill-danger">Hủy đơn đặt sân</button></div>
          </form>` : `<p class="order-notice">${cancellationEval.requiresCounter ? `Còn dưới ${booking.cancel_min_hours_snapshot} giờ trước giờ chơi. Vui lòng liên hệ quầy để được hỗ trợ.` : escapeHtml(cancellationEval.reasonVi)}</p>`}
      </details>
      ${orderHistory(events)}
    </div><aside class="order-stack">
      ${orderPayment(booking)}
      ${canPayNow ? `<section class="order-panel order-action-panel"><div class="order-actions"><a href="/thanh-toan/${code}" class="btn-pill-dark">Tiếp tục thanh toán</a></div></section>` : ''}
      ${printable ? `<section class="order-panel order-qr"><h2>Vé nhận sân</h2>${renderQrCodeSvg(`${config.appBaseUrl}/quan-tri/soat-ve/${code}`, 180)}
        <p class="order-muted">Xuất trình QR tại quầy khi nhận sân.</p><div class="order-actions"><a class="btn-pill-outline" href="/don-dat/${code}/in-ve" target="_blank" rel="noopener">In vé</a></div></section>` : ''}
      ${refunds.length ? `<section class="order-panel"><h2>Khoản hoàn tiền (AML)</h2><ol class="order-history">${refunds.map(r => `<li><p>${escapeHtml(r.refund_code)} · ${escapeHtml(formatVnd(r.amount_vnd))}</p><p class="order-muted">${r.status === 'SUCCEEDED' ? (r.is_manual_refund ? 'Đã hoàn thủ công' : 'Đã hoàn tiền') : r.status === 'FAILED_DEFINITE' ? 'Đang được kiểm tra' : 'Đang xử lý'}${r.completed_at ? ` · ${escapeHtml(formatVietnamDateTimeDisplay(r.completed_at))}` : ''}</p>${r.destination_account_no ? `<p style="font-size:11.5px; color:#1e40af; margin:3px 0 0;">Tài khoản nhận: ${escapeHtml(r.destination_bank_name || 'Ngân hàng')} - ${escapeHtml(r.destination_account_no)} (${escapeHtml(r.destination_account_name || '')})</p>` : ''}</li>`).join('')}</ol><p style="font-size:11px; color:#64748b; margin-top:8px;">Bảo vệ giao dịch: Tiền chỉ hoàn về tài khoản thanh toán ban đầu theo chuẩn phòng chống rửa tiền.</p></section>` : ''}
      <p class="order-support">Cần hỗ trợ? <a href="tel:0773333371">0773 333 371</a></p>
    </aside></div>
  </div>`;
}

export function renderLoginPage(opts: {
  pendingBooking?: { courtId: string; date: string; startHour: string; selectedSlotsJson?: string } | null;
  emailPrefill?: string;
  returnUrl?: string;
}): string {
  const pb = opts.pendingBooking;
  const returnUrlParam = opts.returnUrl ? `&returnUrl=${encodeURIComponent(opts.returnUrl)}` : '';
  const slotsCarry = pb?.selectedSlotsJson ? `&selectedSlotsJson=${encodeURIComponent(pb.selectedSlotsJson)}` : '';
  const queryCarry =
    pb && pb.courtId && pb.date && pb.startHour !== undefined
      ? `?tiepTucDatSan=1&courtId=${encodeURIComponent(pb.courtId)}&date=${encodeURIComponent(pb.date)}&startHour=${encodeURIComponent(pb.startHour)}${slotsCarry}${returnUrlParam}`
      : opts.returnUrl
        ? `?returnUrl=${encodeURIComponent(opts.returnUrl)}`
        : '';

  let comboCount = 1;
  if (pb?.selectedSlotsJson) {
    try {
      const parsed = JSON.parse(pb.selectedSlotsJson);
      if (Array.isArray(parsed) && parsed.length > 1) comboCount = parsed.length;
    } catch { }
  }

  return `
    <div style="max-width: 520px; margin: 0 auto;">
      ${sectionHeading({
    level: 'h1',
    title: 'Đăng nhập tài khoản',
    icon: 'user',
    tone: 'blue',
  })}

      ${pb && pb.courtId
      ? `<div class="notice-band-info">
              <strong>Giữ lựa chọn đặt sân của bạn:</strong> Sau khi đăng nhập, hệ thống sẽ tự động kiểm tra lại tình trạng trống của ${comboCount > 1 ? `combo ${comboCount} khung giờ bạn đã chọn` : `khung giờ ${escapeHtml(formatSlotRange(Number(pb.startHour)))}`} ngày ${escapeHtml(formatVietnamDateDisplay(pb.date))} và giữ chỗ ngay cho bạn.
            </div>`
      : ''
    }

      <div class="flat-panel">
        <form method="POST" action="/tai-khoan/dang-nhap">
          ${opts.returnUrl ? `<input type="hidden" name="returnUrl" value="${escapeHtml(opts.returnUrl)}" />` : ''}
          ${pb && pb.courtId
      ? `
                <input type="hidden" name="courtId" value="${escapeHtml(pb.courtId)}" />
                <input type="hidden" name="date" value="${escapeHtml(pb.date)}" />
                <input type="hidden" name="startHour" value="${escapeHtml(pb.startHour)}" />
                ${pb.selectedSlotsJson ? `<input type="hidden" name="selectedSlotsJson" value="${escapeHtml(pb.selectedSlotsJson)}" />` : ''}
              `
      : ''
    }
          <div class="form-group">
            <label for="login-email" class="form-label">Địa chỉ Email</label>
            <input id="login-email" type="email" name="email" value="${escapeHtml(opts.emailPrefill || '')}" class="text-input" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="login-password" class="form-label">Mật khẩu</label>
            <input id="login-password" type="password" name="password" class="text-input" required autocomplete="current-password" />
          </div>

          <button type="submit" class="btn-pill-dark" style="width:100%; margin-top:8px;">Đăng nhập</button>
        </form>

        <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--hairline-soft); display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;" class="body-sm">
          <a href="/tai-khoan/quen-mat-khau">Quên mật khẩu?</a>
          <a href="/tai-khoan/dang-ky${queryCarry}">Chưa có tài khoản? <strong>Đăng ký ngay</strong></a>
        </div>
      </div>
    </div>
  `;
}

export function renderRegisterPage(opts: {
  pendingBooking?: { courtId: string; date: string; startHour: string; selectedSlotsJson?: string } | null;
}): string {
  const pb = opts.pendingBooking;
  const slotsCarry = pb?.selectedSlotsJson ? `&selectedSlotsJson=${encodeURIComponent(pb.selectedSlotsJson)}` : '';
  const queryCarry =
    pb && pb.courtId && pb.date && pb.startHour !== undefined
      ? `?tiepTucDatSan=1&courtId=${encodeURIComponent(pb.courtId)}&date=${encodeURIComponent(pb.date)}&startHour=${encodeURIComponent(pb.startHour)}${slotsCarry}`
      : '';

  let comboCount = 1;
  if (pb?.selectedSlotsJson) {
    try {
      const parsed = JSON.parse(pb.selectedSlotsJson);
      if (Array.isArray(parsed) && parsed.length > 1) comboCount = parsed.length;
    } catch { }
  }

  return `
    <div style="max-width: 560px; margin: 0 auto;">
      ${sectionHeading({
    level: 'h1',
    title: 'Đăng ký tài khoản khách hàng',
    icon: 'sparkle',
    tone: 'green',
  })}

      ${pb && pb.courtId
      ? `<div class="notice-band-info">
              <strong>Giữ lựa chọn đặt sân của bạn:</strong> Sau khi tạo tài khoản, chúng tôi sẽ kiểm tra lại khả năng cung cấp của ${comboCount > 1 ? `combo ${comboCount} khung giờ bạn đã chọn` : `khung giờ ${escapeHtml(formatSlotRange(Number(pb.startHour)))}`} ngày ${escapeHtml(formatVietnamDateDisplay(pb.date))} và chuyển bạn tới bước thanh toán.
            </div>`
      : ''
    }

      <div class="flat-panel">
        <p class="body-sm" style="margin-bottom: 16px;">
          Chúng tôi chỉ thu thập họ tên, số điện thoại và email cần thiết để quản lý đơn đặt sân và hoàn tiền của bạn.
        </p>

        <form method="POST" action="/tai-khoan/dang-ky">
          ${pb && pb.courtId
      ? `
                <input type="hidden" name="courtId" value="${escapeHtml(pb.courtId)}" />
                <input type="hidden" name="date" value="${escapeHtml(pb.date)}" />
                <input type="hidden" name="startHour" value="${escapeHtml(pb.startHour)}" />
                ${pb.selectedSlotsJson ? `<input type="hidden" name="selectedSlotsJson" value="${escapeHtml(pb.selectedSlotsJson)}" />` : ''}
              `
      : ''
    }
          <div class="form-group">
            <label for="reg-name" class="form-label">Họ và tên *</label>
            <input id="reg-name" type="text" name="fullName" class="text-input" required />
          </div>
          <div class="form-group">
            <label for="reg-phone" class="form-label">Số điện thoại liên hệ *</label>
            <input id="reg-phone" type="tel" name="phone" class="text-input" placeholder="Ví dụ: 0908123456" required />
          </div>
          <div class="form-group">
            <label for="reg-email" class="form-label">Địa chỉ Email *</label>
            <input id="reg-email" type="email" name="email" class="text-input" required />
          </div>
          <div class="form-group">
            <label for="reg-password" class="form-label">Mật khẩu (tối thiểu 8 ký tự) *</label>
            <input id="reg-password" type="password" name="password" minlength="8" class="text-input" required />
          </div>

          <button type="submit" class="btn-pill-dark" style="width:100%; margin-top:8px;">Tạo tài khoản</button>
        </form>

        <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hairline-soft);" class="body-sm">
          Đã có tài khoản? <a href="/tai-khoan/dang-nhap${queryCarry}"><strong>Đăng nhập tại đây</strong></a>
        </div>
      </div>
    </div>
  `;
}

export function renderForgotPasswordPage(opts: { resetTokenPrefill?: string } = {}): string {
  return `
    <div class="grid-2">
      <div class="flat-panel">
        ${sectionHeading({
    level: 'h1',
    title: 'Khôi phục mật khẩu',
    icon: 'mail',
    tone: 'blue',
  })}
        <p class="body-sm" style="margin-bottom: 16px;">
          Nhập địa chỉ email đăng ký tài khoản. Hệ thống sẽ tạo mã khôi phục dùng một lần (hiệu lực 30 phút).
        </p>
        <form method="POST" action="/tai-khoan/quen-mat-khau">
          <div class="form-group">
            <label for="fp-email" class="form-label">Địa chỉ Email của bạn</label>
            <input id="fp-email" type="email" name="email" class="text-input" required />
          </div>
          <button type="submit" class="btn-pill-dark">Nhận hướng dẫn đặt lại mật khẩu</button>
        </form>
      </div>

      <div class="flat-panel">
        ${sectionHeading({
    level: 'h2',
    title: 'Đặt mật khẩu mới',
    icon: 'key',
    tone: 'green',
  })}
        <p class="body-sm" style="margin-bottom: 16px;">
          Nếu bạn đã nhận được mã khôi phục dùng một lần, hãy nhập mã và mật khẩu mới dưới đây.
        </p>
        <form method="POST" action="/tai-khoan/dat-lai-mat-khau">
          <div class="form-group">
            <label for="rp-token" class="form-label">Mã khôi phục một lần</label>
            <input id="rp-token" type="text" name="token" value="${escapeHtml(opts.resetTokenPrefill || '')}" class="text-input" required />
          </div>
          <div class="form-group">
            <label for="rp-pass" class="form-label">Mật khẩu mới (tối thiểu 8 ký tự)</label>
            <input id="rp-pass" type="password" name="newPassword" minlength="8" class="text-input" required />
          </div>
          <button type="submit" class="btn-pill-dark">Cập nhật mật khẩu mới</button>
        </form>
      </div>
    </div>
  `;
}

export function renderAccountPage(data: {
  session: SessionContext;
  latestVerifyTokenHint?: string | null;
}): string {
  const { user, csrfToken } = data.session;
  const tier = user.member_tier || 'BRONZE';
  const tierNameVi = tier === 'GOLD' ? 'Vàng' : tier === 'SILVER' ? 'Bạc' : 'Đồng';
  const tierSlug = tier === 'GOLD' ? 'gold' : tier === 'SILVER' ? 'silver' : 'bronze';
  return `
    ${sectionHeading({
    level: 'h1',
    title: 'Tài khoản',
    subtitle: 'Thông tin cá nhân và hội viên.',
    icon: 'user',
    tone: 'blue',
  })}

    <div style="display:flex; flex-direction:column; gap:24px; max-width: 960px; margin: 0 auto 36px auto;">
      <section class="membership-overview" aria-label="Thẻ hội viên">
        <div class="membership-card membership-${tierSlug}">
          <div class="membership-card-top"><span>Be Badminton</span><span>Hội viên ${tierNameVi}</span></div>
          <div class="membership-card-name">${escapeHtml(user.full_name)}</div>
          <div class="membership-card-id">BE-${escapeHtml(user.id.slice(-6).toUpperCase())}</div>
          <p class="membership-card-benefit">${tier === 'GOLD' ? 'Giảm 10% tiền sân' : tier === 'SILVER' ? 'Giảm 5% tiền sân' : 'Tích lũy qua mỗi lần đặt sân'}</p>
        </div>
        <div class="membership-summary">${membershipProgress(user)}<a href="#membership-tiers">Xem các hạng hội viên</a></div>
      </section>
      <dl class="membership-tiers" id="membership-tiers">
        <div><dt>Đồng</dt><dd>Từ khi đăng ký<br>Tích lũy chi tiêu</dd></div>
        <div><dt>Bạc</dt><dd>Chi tiêu từ 1.000.000₫<br>Giảm 5% tiền sân</dd></div>
        <div><dt>Vàng</dt><dd>Chi tiêu từ 3.000.000₫<br>Giảm 10% tiền sân</dd></div>
      </dl>

      <!-- Hai khối chức năng: Thông tin cá nhân & Đổi mật khẩu -->
      <div class="grid-2 account-settings-grid" style="align-items: start; gap: 24px;">
        <!-- Cập nhật thông tin cá nhân -->
        <section class="flat-panel" style="height: 100%; display: flex; flex-direction: column;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${iconBadge('user', 'blue', 38)}
              <h2 class="headline-md">Thông tin cá nhân</h2>
            </div>
            <span class="status-badge ${user.email_verified_at ? 'badge-confirmed' : 'badge-live'}">
              ${user.email_verified_at ? '✓ Email đã xác minh' : '◔ Chưa xác minh email'}
            </span>
          </div>

          ${!user.email_verified_at
      ? `
                <div class="soft-panel" style="margin-bottom: 18px; padding:18px;">
                  <div class="body-sm" style="margin-bottom:8px;">
                    Xác minh địa chỉ email <strong>${escapeHtml(user.email)}</strong> bằng mã xác minh đã gửi:
                  </div>
                  <form method="POST" action="/tai-khoan/xac-minh-email" style="display:flex; gap:10px; flex-wrap:wrap;">
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <input type="text" name="token" value="${escapeHtml(data.latestVerifyTokenHint || '')}" placeholder="Nhập mã xác minh email" class="text-input" style="max-width:300px;" required />
                    <button type="submit" class="btn-pill-dark">Xác minh Email</button>
                  </form>
                </div>
              `
      : ''
    }

          <form method="POST" action="/tai-khoan/cap-nhat" style="flex: 1; display: flex; flex-direction: column;">
            <div class="profile-avatar-editor"><div id="profile-avatar-preview">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="Ảnh đại diện" />` : `<span>${escapeHtml(user.full_name.charAt(0))}</span>`}</div><div><label class="form-label" for="profile-avatar-file">Ảnh đại diện</label><input id="profile-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" /><p class="caption-text">JPG, PNG hoặc WebP, tối đa 5 MB.</p><button type="button" id="profile-avatar-remove" class="btn-text">Xóa ảnh</button></div></div>
            <input type="hidden" name="avatarData" id="profile-avatar-data" value="${escapeHtml(user.avatar_url || '')}" />
            <p id="profile-avatar-status" class="caption-text" role="status" aria-live="polite"></p>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <div class="form-group">
              <label class="form-label">Địa chỉ Email đăng nhập</label>
              <input type="email" value="${escapeHtml(user.email)}" class="text-input" disabled />
            </div>
            <div class="form-group">
              <label for="acc-name" class="form-label">Họ và tên *</label>
              <input id="acc-name" type="text" maxlength="100" autocomplete="name" name="fullName" value="${escapeHtml(user.full_name)}" class="text-input" required />
            </div>
            <div class="form-group">
              <label for="acc-phone" class="form-label">Số điện thoại *</label>
              <input id="acc-phone" type="tel" maxlength="15" autocomplete="tel" name="phone" value="${escapeHtml(user.phone)}" class="text-input" required />
            </div>
<div class="form-group"><label for="acc-birth-date" class="form-label">Ngày sinh</label><input id="acc-birth-date" name="birthDate" type="date" min="1900-01-01" max="${getServerNow().toISOString().slice(0,10)}" value="${escapeHtml(user.birth_date || '')}" class="text-input" /></div>
            <div class="form-group"><label for="acc-address" class="form-label">Địa chỉ</label><textarea id="acc-address" name="address" rows="2" maxlength="300" autocomplete="street-address" class="text-input">${escapeHtml(user.address || '')}</textarea></div>
            <div style="margin-top: auto; padding-top: 12px;">
              <button type="submit" class="btn-pill-dark" style="width: 100%;">Lưu thông tin cá nhân</button>
            </div>
          </form>
        </section>

        <!-- Đổi mật khẩu -->
        <section id="doi-mat-khau" class="flat-panel" style="height: 100%; display: flex; flex-direction: column;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
            ${iconBadge('lock', 'purple', 38)}
            <h2 class="headline-md">Đổi mật khẩu</h2>
          </div>
          <form method="POST" action="/tai-khoan/doi-mat-khau" style="flex: 1; display: flex; flex-direction: column;" oninput="if(newPassword.value && confirmPassword.value && newPassword.value !== confirmPassword.value){confirmPassword.setCustomValidity('Mật khẩu nhập lại không khớp');}else{confirmPassword.setCustomValidity('');}">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
            <div class="form-group">
              <label for="pwd-cur" class="form-label">Mật khẩu hiện tại *</label>
              <input id="pwd-cur" type="password" name="currentPassword" class="text-input" placeholder="Nhập mật khẩu đang dùng" required />
            </div>
            <div class="form-group">
              <label for="pwd-new" class="form-label">Mật khẩu mới (tối thiểu 8 ký tự) *</label>
              <input id="pwd-new" type="password" name="newPassword" minlength="8" class="text-input" placeholder="Tạo mật khẩu mới" required />
            </div>
            <div class="form-group">
              <label for="pwd-confirm" class="form-label">Nhập lại mật khẩu mới *</label>
              <input id="pwd-confirm" type="password" name="confirmPassword" minlength="8" class="text-input" placeholder="Nhập lại mật khẩu mới lần 2" required />
            </div>
            <div style="margin-top: auto; padding-top: 12px;">
              <button type="submit" class="btn-pill-outline" style="width: 100%;">Cập nhật mật khẩu</button>
            </div>
          </form>
        </section>
      </div>
    </div>
    <script src="/public/js/profile-avatar.js" defer></script>
  `;
}

export function renderPolicyPage(center: CenterInfo): string {
  return `
    ${sectionHeading({
    level: 'h1',
    title: 'Chính sách đặt sân, hủy đơn & hỗ trợ khách hàng',
    subtitle: 'Quy định rõ ràng về thời gian giữ chỗ, điều kiện hoàn tiền 100% và bảo mật thông tin.',
    icon: 'shield',
    tone: 'blue',
  })}

    <div class="grid-2" style="margin-bottom: 24px;">
      <section id="quy-trinh-dat-san" class="flat-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          ${iconBadge('timer', 'blue', 44)}
          <h2 class="headline-md">1. Quy trình đặt sân và thời gian giữ chỗ</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 10px;">
          • Mỗi đơn đặt tương ứng với <strong>01 sân cầu lông trong 01 khung giờ 60 phút</strong>.<br/>
          • Khi bạn chọn khung giờ còn trống, hệ thống ghi nhận trạng thái <strong>Đang giữ chỗ trong tối đa ${Math.floor(center.hold_duration_seconds / 60)} phút (${center.hold_duration_seconds} giây)</strong> tính theo đồng hồ máy chủ.<br/>
          • Trong thời gian giữ chỗ, sân được khóa tạm thời để không khách hàng nào khác đặt trùng.<br/>
          • Mỗi tài khoản được giữ tối đa <strong>${center.max_active_holds_per_user} lượt giữ chỗ đang chờ thanh toán</strong> cùng lúc.<br/>
          • Khi quá ${Math.floor(center.hold_duration_seconds / 60)} phút mà giao dịch chưa hoàn tất, lượt giữ chỗ tự động hết hạn và giải phóng sân.
        </p>
      </section>

      <section id="chinh-sach-huy" class="flat-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          ${iconBadge('refund', 'green', 44)}
          <h2 class="headline-md">2. Điều kiện hủy đơn và mức hoàn tiền</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 10px;">
          • <strong>Phiên bản chính sách hiện hành:</strong> ${escapeHtml(center.cancellation_policy_version)}.<br/>
          • <strong>Đơn đã xác nhận thanh toán:</strong> Được phép hủy trực tuyến khi thời gian còn lại trước giờ bắt đầu chơi <strong>tối thiểu ${center.cancellation_min_hours} giờ (bao gồm cả thời điểm đúng mốc ${center.cancellation_min_hours} giờ)</strong>.<br/>
          • <strong>Mức hoàn tiền khi đủ điều kiện:</strong> Hoàn lại <strong>100% số tiền thực tế khách hàng đã thanh toán</strong> cho đơn đó.<br/>
          • <strong>Dưới ${center.cancellation_min_hours} giờ trước giờ chơi:</strong> Không chấp nhận hủy đơn theo chính sách thông thường.<br/>
          • <strong>Đơn đang giữ chỗ chưa thanh toán:</strong> Được hủy bất kỳ lúc nào khi còn hiệu lực giữ chỗ và không phát sinh hoàn tiền.
        </p>
      </section>
    </div>

    <div class="grid-2">
      <section class="flat-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          ${iconBadge('card', 'purple', 44)}
          <h2 class="headline-md">3. Quy trình xử lý hoàn tiền &amp; thời gian nhận tiền</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 10px;">
          • Ngay khi bạn xác nhận hủy đơn hợp lệ (hoặc khi hệ thống ghi nhận khoản thanh toán đến trễ sau khi lượt giữ chỗ đã hết hạn), hệ thống tạo yêu cầu hoàn tiền vào hàng đợi xử lý nền.<br/>
          • Bạn không cần giữ trình duyệt mở sau khi hủy; có thể tra cứu trạng thái <em>“Đang xử lý khoản hoàn”</em> hoặc <em>“Đã hoàn tiền”</em> trong mục <strong>Đơn đặt của tôi</strong>.<br/>
          • Thời gian tiền ghi có thực tế vào tài khoản ngân hàng hoặc ví điện tử phụ thuộc vào quy trình xử lý của ngân hàng phát hành và cổng thanh toán được cấu hình vận hành. Trung tâm không cam kết một mốc giờ cố định nằm ngoài quy trình đối soát của ngân hàng.
        </p>
      </section>

      <section id="bao-mat-thong-tin" class="soft-panel">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          ${iconBadge('lock', 'teal', 44)}
          <h2 class="headline-md">4. Bảo vệ thông tin khách hàng &amp; liên hệ hỗ trợ</h2>
        </div>
        <p class="body-sm" style="margin-bottom: 12px;">
          • CourtGo chỉ thu thập Họ tên, Số điện thoại và Email để phục vụ xác nhận đặt sân, đối chiếu khi nhận sân và thông báo hoàn tiền.<br/>
          • Thông tin người đặt không bao giờ hiển thị công khai trên bảng lịch trống của trung tâm.<br/>
          • Hệ thống không lưu trữ số thẻ ngân hàng hoặc mã bảo mật thẻ (CVV/OTP) của khách hàng.
        </p>
        <div style="border-top:1px solid var(--hairline); padding-top:12px;" class="body-sm">
          <strong>Bộ phận Hỗ trợ Khách hàng — ${escapeHtml(center.name)}</strong><br/>
          • Địa chỉ: ${escapeHtml(center.address)}, ${escapeHtml(center.district)}, ${escapeHtml(center.city)}<br/>
          • Điện thoại / Zalo: <strong class="num">${escapeHtml(center.phone)}</strong> (05:00 – 24:00 hằng ngày)<br/>
          • Email: <strong>${escapeHtml(center.email)}</strong>
        </div>
      </section>
    </div>
  `;
}

export function renderPaymentGuidePage(center: CenterInfo): string {
  return `
    ${sectionHeading({
    level: 'h1',
    title: 'Hướng dẫn đặt sân và thanh toán',
    subtitle: 'Cách chọn giờ, giữ chỗ, thanh toán và nhận vé.',
    icon: 'card',
    tone: 'blue',
  })}

    <!-- 4 Bước Đặt Sân & Thanh Toán -->
    <section class="flat-panel" style="margin-bottom: 28px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${iconBadge('calendar', 'blue', 44)}
          <div>
            <h2 class="headline-md">Các bước đặt sân</h2>
            <p class="body-sm">Chọn một ca hoặc thêm nhiều ca vào giỏ trước khi thanh toán.</p>
          </div>
        </div>
        <a href="/#lich-san-nhanh" class="btn-pill-dark">Đặt sân</a>
      </div>

      <div class="grid-4" style="gap:16px;">
        <div class="soft-panel" style="padding:18px; border-top:4px solid #0052ff;">
          <div style="font-size:12px; font-weight:800; color:#0052ff; text-transform:uppercase; margin-bottom:6px;">Bước 1 · Chọn sân &amp; giờ</div>
          <h3 class="headline-sm" style="margin-bottom:6px;">Chọn ô Trống trên lịch 18 sân</h3>
          <p class="body-sm">
            Truy cập <a href="/#lich-san-nhanh" style="color:#0052ff; font-weight:600;">Đặt sân</a> (khung 05:00 – 24:00), lọc theo ca Sáng / Ngày / Giờ vàng / Đêm và nhấn chọn 1 hoặc nhiều ô màu trắng.
          </p>
        </div>

        <div class="soft-panel" style="padding:18px; border-top:4px solid #0f6938;">
          <div style="font-size:12px; font-weight:800; color:#0f6938; text-transform:uppercase; margin-bottom:6px;">Bước 2 · Khóa sân 5 phút</div>
          <h3 class="headline-sm" style="margin-bottom:6px;">Giữ chỗ độc quyền an toàn</h3>
          <p class="body-sm">
            Khi bấm <strong>Đặt sân &amp; Thanh toán</strong>, hệ thống khóa toàn bộ các ô bạn chọn trong <strong>${Math.floor(center.hold_duration_seconds / 60)} phút (${center.hold_duration_seconds} giây)</strong> để không ai đặt trùng.
          </p>
        </div>

        <div class="soft-panel" style="padding:18px; border-top:4px solid #d97706;">
          <div style="font-size:12px; font-weight:800; color:#d97706; text-transform:uppercase; margin-bottom:6px;">Bước 3 · Dụng cụ &amp; Ưu đãi</div>
          <h3 class="headline-sm" style="margin-bottom:6px;">Thêm phụ kiện &amp; Mã giảm giá</h3>
          <p class="body-sm">
            Tùy chọn thuê thêm vợt, giày, ống cầu, tủ khóa Box-Lock và áp dụng mã Coupon khuyến mãi (chỉ trừ lượt khi thanh toán thành công).
          </p>
        </div>

        <div class="soft-panel" style="padding:18px; border-top:4px solid #7c3aed;">
          <div style="font-size:12px; font-weight:800; color:#7c3aed; text-transform:uppercase; margin-bottom:6px;">Bước 4 · Quét QR xác thực</div>
          <h3 class="headline-sm" style="margin-bottom:6px;">Xác nhận tức thì qua IPN</h3>
          <p class="body-sm">
            Quét mã VietQR / VNPAY-QR hoặc xác nhận trên cổng Sandbox. Hệ thống đối chiếu chữ ký số HMAC-SHA256 và cấp mã nhận sân ngay lập tức.
          </p>
        </div>
      </div>
    </section>

    <!-- Hướng dẫn sử dụng Cổng Thanh Toán Sandbox -->
    <div class="grid-2" style="margin-bottom: 28px; align-items: stretch;">
      <section class="flat-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
            ${iconBadge('shield', 'orange', 44)}
            <div>
              <h2 class="headline-md">Hướng dẫn kiểm thử Cổng Thanh Toán Sandbox</h2>
              <p class="body-sm">Dành cho khách hàng trải nghiệm quy trình thanh toán và kiểm thử viên (QA/Tester).</p>
            </div>
          </div>

          <p class="body-sm" style="margin-bottom:12px;">
            Trên môi trường thử nghiệm, CourtGo tích hợp <strong>Cổng Thanh Toán Sandbox (<code>/cong-thanh-toan-sandbox</code>)</strong> mô phỏng đầy đủ luồng tạo mã QR động và gọi ngược <strong>Webhook IPN (<code>POST /api/payments/webhook</code>)</strong> có ký số bảo mật <code>HMAC-SHA256</code>:
          </p>

          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            <div class="soft-panel" style="padding:14px;">
              <strong style="color:#059669;">1. Kịch bản Thanh toán thành công (Nút màu xanh):</strong>
              <p class="body-sm" style="margin-top:4px;">
                Gửi gói tin IPN với <code>responseCode = "00"</code> và chữ ký hợp lệ. Đơn đặt sân (cùng toàn bộ các sân trong Combo) chuyển ngay sang trạng thái <strong>Đã xác nhận (CONFIRMED / PAID)</strong>, cộng tích lũy hạng thẻ VIP và ghi nhận lượt dùng Coupon.
              </p>
            </div>

            <div class="soft-panel" style="padding:14px;">
              <strong style="color:#dc2626;">2. Kịch bản Giao dịch thất bại / Hủy ngang (Nút màu đỏ):</strong>
              <p class="body-sm" style="margin-top:4px;">
                Gửi gói tin IPN với <code>responseCode = "24"</code>. Đơn giữ nguyên trạng thái <strong>Đang giữ chỗ (HOLD)</strong> cho đến khi hết 5 phút để bạn có thể chọn lại ngân hàng hoặc thử thanh toán lại mà không mất lượt.
              </p>
            </div>

            <div class="soft-panel" style="padding:14px;">
              <strong style="color:#d97706;">3. Kịch bản Thanh toán đến trễ sau 5 phút (Late Payment Conflict):</strong>
              <p class="body-sm" style="margin-top:4px;">
                Nếu giao dịch thanh toán thành công gửi về sau khi thời gian giữ chỗ 5 phút đã hết hạn, hệ thống tự động gắn nhãn <code>LATE_PAID_CONFLICT</code> và đẩy lệnh <strong>Hoàn tiền tự động 100%</strong> vào hàng đợi xử lý nền.
              </p>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; padding-top:12px; border-top:1px solid var(--hairline);">
          <a href="/cong-thanh-toan-sandbox" class="btn-pill-dark">Mở trang Cổng Thanh Toán Sandbox →</a>
          <a href="/#lich-san-nhanh" class="btn-pill-outline">Chọn sân tạo đơn thử nghiệm</a>
        </div>
      </section>

      <section class="flat-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
            ${iconBadge('refund', 'green', 44)}
            <div>
              <h2 class="headline-md">Các phương thức hỗ trợ &amp; Chính sách hoàn tiền</h2>
              <p class="body-sm">Minh bạch 100% về đơn giá, phụ phí và quyền lợi hủy đơn.</p>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
            <div class="soft-panel" style="padding:14px;">
              <strong>• Quét mã QR Ngân hàng 24/7 (VietQR / VNPAY-QR):</strong>
              <p class="body-sm" style="margin-top:4px;">
                Tự động điền sẵn số tiền và nội dung chuyển khoản <code>COURTGO [Mã Đơn]</code>. Hỗ trợ hơn 40 ngân hàng Việt Nam (Vietcombank, Techcombank, MB Bank, BIDV, ACB, VietinBank, TPBank, VPBank...).
              </p>
            </div>

            <div class="soft-panel" style="padding:14px;">
              <strong>• Ví điện tử &amp; Thẻ ATM nội địa / Thẻ quốc tế:</strong>
              <p class="body-sm" style="margin-top:4px;">
                Hỗ trợ Ví VNPAY, MoMo, ZaloPay, thẻ ATM Napas nội địa và thẻ quốc tế Visa / MasterCard / JCB. Không thu thêm bất kỳ phụ phí ẩn nào.
              </p>
            </div>

            <div class="soft-panel" style="padding:14px;">
              <strong>• Cam kết hoàn tiền 100% khi hủy trước ${center.cancellation_min_hours} giờ:</strong>
              <p class="body-sm" style="margin-top:4px;">
                Mọi đơn đã thanh toán nếu hủy trực tuyến trước giờ bắt đầu chơi từ <strong>${center.cancellation_min_hours} giờ trở lên</strong> đều được hệ thống tự động khởi tạo lệnh hoàn lại đủ 100% số tiền thực trả.
              </p>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; padding-top:12px; border-top:1px solid var(--hairline);">
          <a href="/don-dat" class="btn-pill-primary">Kiểm tra đơn đặt của tôi</a>
          <a href="/chinh-sach" class="btn-pill-outline">Xem chi tiết Chính sách</a>
        </div>
      </section>
    </div>
  `;
}
