/**
 * Tiện ích xử lý thời gian theo múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+07:00)
 * và định dạng tiền tệ Việt Nam Đồng (số nguyên).
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

let clockOffsetMs = 0;
let frozenServerNow: Date | null = null;

/**
 * Cho phép dịch chuyển hoặc cố định đồng hồ máy chủ trong kiểm thử tự động (không dùng ở production).
 */
export function setTestClockOffsetMs(offsetMs: number): void {
  clockOffsetMs = offsetMs;
  frozenServerNow = null;
}

export function setFrozenServerNow(exactDate: Date | null): void {
  frozenServerNow = exactDate;
}

export function getServerNow(): Date {
  if (frozenServerNow) {
    return new Date(frozenServerNow.getTime());
  }
  return new Date(Date.now() + clockOffsetMs);
}

/**
 * Trả về chuỗi ngày YYYY-MM-DD theo múi giờ Việt Nam (UTC+7).
 */
export function toVietnamDateString(date: Date = getServerNow()): string {
  const vnTime = new Date(date.getTime() + VN_OFFSET_MS);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Cộng thêm số ngày vào một chuỗi ngày YYYY-MM-DD.
 */
export function addDaysVietnam(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, 0, 0, 0) + days * 24 * 60 * 60 * 1000;
  const dt = new Date(utc);
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tạo đối tượng Date (UTC) tương ứng với ngày YYYY-MM-DD và giờ (0..24) tại Việt Nam (UTC+7).
 */
export function vietnamSlotToUtcDate(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hour, 0, 0, 0) - VN_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Trả về thứ trong tuần tại Việt Nam: 0 = Chủ nhật, 1 = Thứ hai, ..., 6 = Thứ bảy.
 */
export function getVietnamDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return dt.getUTCDay();
}

export function isWeekendVietnam(dateStr: string): boolean {
  const dow = getVietnamDayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

export function getVietnameseDayLabel(dateStr: string): string {
  const dow = getVietnamDayOfWeek(dateStr);
  const names = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return names[dow] || '';
}

export function formatVietnamDateDisplay(dateStr: string): string {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const parts = raw.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatVietnamDateTimeDisplay(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '—';
  const vnTime = new Date(date.getTime() + VN_OFFSET_MS);
  const y = vnTime.getUTCFullYear();
  const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getUTCDate()).padStart(2, '0');
  const hh = String(vnTime.getUTCHours()).padStart(2, '0');
  const mm = String(vnTime.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} ngày ${d}/${m}/${y}`;
}

export function formatSlotRange(startHour: number, endHour: number = startHour + 1): string {
  const s = `${String(startHour).padStart(2, '0')}:00`;
  const e = `${String(endHour).padStart(2, '0')}:00`;
  return `${s} – ${e}`;
}

/**
 * Định dạng số nguyên đồng Việt Nam: ví dụ 150000 -> "150.000 ₫"
 */
export function formatVnd(amountVnd: number): string {
  const safeInt = Math.round(Number(amountVnd) || 0);
  const formatted = Math.abs(safeInt)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return safeInt < 0 ? `-${formatted} ₫` : `${formatted} ₫`;
}

export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Chuyển đổi an toàn chuỗi tiền tệ do người dùng nhập thành số nguyên VND.
 * Xử lý triệt để các dạng: "120000", "120.000", "120,000", "120k", "120.000 ₫", "120 000".
 */
export function parsePriceVnd(val: any): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val) : 0;
  }
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Dạng 120k, 120.5k, 120,5k
  const kMatch = str.match(/^([\d.,]+)\s*k$/i);
  if (kMatch) {
    const numPart = kMatch[1].replace(/,/g, '.');
    const floatVal = parseFloat(numPart);
    return Number.isFinite(floatVal) ? Math.round(floatVal * 1000) : 0;
  }

  // Xóa mọi ký tự không phải số (loại bỏ dấu chấm, phẩy, khoảng trắng, chữ đ/₫)
  const cleanDigits = str.replace(/[^\d]/g, '');
  if (!cleanDigits) return 0;
  const parsed = parseInt(cleanDigits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
