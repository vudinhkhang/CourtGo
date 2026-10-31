import crypto from 'node:crypto';
import { DatabaseClient, DbExecutor, getDb } from '../db/client.js';
import {
  addDaysVietnam,
  formatSlotRange,
  getServerNow,
  isValidDateString,
  isWeekendVietnam,
  parsePriceVnd,
  toVietnamDateString,
  vietnamSlotToUtcDate,
} from '../utils/time.js';
import { AppError } from '../utils/errors.js';
import { SessionContext } from './authService.js';

export type SlotState = 'AVAILABLE' | 'HOLD' | 'MY_HOLD' | 'BOOKED' | 'MAINTENANCE' | 'PAST';

export interface SlotAvailabilityItem {
  courtId: string;
  courtCode: string;
  courtName: string;
  courtType: string;
  date: string;
  startHour: number;
  endHour: number;
  timeLabel: string;
  priceVnd: number;
  pricingLabel: string;
  state: SlotState;
  stateLabelVi: string;
  stateSymbol: string;
  blockReason?: string;
  myHoldBookingCode?: string;
}

export interface CourtSummary {
  id: string;
  center_id: string;
  code: string;
  name: string;
  court_type: string;
  surface_desc: string;
  lighting_desc: string;
  description: string;
  usage_notes: string;
  status: 'ACTIVE' | 'INACTIVE';
  open_hour: number;
  close_hour: number;
  base_price_vnd: number;
  sort_order: number;
  primaryImageUrl: string;
  primaryImageCaption: string;
  images?: Array<{
    id?: string;
    url: string;
    caption?: string;
    isPrimary?: boolean;
    sortOrder?: number;
  }>;
  amenities: string[];
  pricingRules: Array<{
    id: string;
    day_type: 'WEEKDAY' | 'WEEKEND' | 'ALL';
    start_hour: number;
    end_hour: number;
    price_vnd: number;
    label: string;
  }>;
  slots: SlotAvailabilityItem[];
}

export interface CenterInfo {
  id: string;
  slug: string;
  name: string;
  address: string;
  district: string;
  city: string;
  phone: string;
  email: string;
  open_hour: number;
  close_hour: number;
  timezone: string;
  description: string;
  cancellation_policy_version: string;
  cancellation_min_hours: number;
  hold_duration_seconds: number;
  max_active_holds_per_user: number;
}

export interface AddonItem {
  id: string;
  name: string;
  priceVnd: number;
  unit: string;
  category: 'RENTAL' | 'EQUIPMENT' | 'BEVERAGE' | 'FACILITY';
  description: string;
  badge?: string;
  imageUrl?: string;
  icon?: string;
}

export const BE_BADMINTON_ADDONS: AddonItem[] = [
  {
    id: 'addon-racket',
    name: 'Thuê vợt Yonex / Lining cao cấp',
    priceVnd: 30000,
    unit: 'cây / buổi',
    category: 'RENTAL',
    description: 'Vợt chuẩn thi đấu căng sẵn 10.5kg – 11kg, trợ lực tốt, quấn cán mới sạch sẽ',
    badge: 'Phổ biến nhất',
    imageUrl: '/public/assets/images/addons/vot-cau-long.png',
    icon: '🏸',
  },
  {
    id: 'addon-shoes',
    name: 'Thuê giày cầu lông chuyên dụng bám thảm',
    priceVnd: 30000,
    unit: 'đôi / buổi',
    category: 'RENTAL',
    description: 'Đế kếp bám thảm PVC chống lật cổ chân, đủ size Nam / Nữ 36 – 44, khử khuẩn sạch sẽ',
    badge: 'Khuyên dùng',
    imageUrl: '/public/assets/images/addons/giay-cau-long.png',
    icon: '👟',
  },
  {
    id: 'addon-shuttlecock-tube',
    name: 'Ống cầu lông thi đấu Hải Yến / Thành Công (12 trái)',
    priceVnd: 240000,
    unit: 'ống 12 trái',
    category: 'EQUIPMENT',
    description: 'Cầu lông lông vũ chuẩn thi đấu tốc độ 77, đường bay đầm, độ bền cao',
    badge: 'Chuẩn thi đấu',
    imageUrl: '/public/assets/images/addons/ong-cau-long.png',
    icon: '📦',
  },
  {
    id: 'addon-shuttlecock-single',
    name: 'Cầu lông thi đấu lẻ & Quấn cán vợt chống trơn',
    priceVnd: 25000,
    unit: 'combo',
    category: 'EQUIPMENT',
    description: '1 quả cầu Hải Yến mới + 1 quấn cán thấm hút mồ hôi tay cực tốt',
    badge: 'Bổ sung tức thì',
    imageUrl: '/public/assets/images/addons/cau-le-quan-can.png',
    icon: '🎯',
  },
  {
    id: 'addon-boxlock',
    name: 'Thuê tủ khóa cá nhân Box-Lock & Khăn thể thao',
    priceVnd: 20000,
    unit: 'tủ / buổi',
    category: 'FACILITY',
    description: 'Tủ có khóa riêng an toàn tuyệt đối cho túi xách, laptop, ví tiền + khăn thể thao',
    badge: 'An tâm 100%',
    imageUrl: '/public/assets/images/addons/tu-do-boxlock.png',
    icon: '🔐',
  },
  {
    id: 'addon-electrolyte',
    name: 'Combo 2 chai nước khoáng & Bù điện giải ướp lạnh',
    priceVnd: 35000,
    unit: 'combo 2 chai',
    category: 'BEVERAGE',
    description: '1 chai Pocari Sweat / Revive bù khoáng + 1 chai nước suối tinh khiết ướp lạnh',
    badge: 'Bù khoáng tức thì',
    imageUrl: '/public/assets/images/addons/nuoc-khoang-bu-khoang.png',
    icon: '🥤',
  },
];

/**
 * Giải phóng ngay các lượt giữ chỗ đã quá hạn 5 phút theo đồng hồ máy chủ.
 */
export async function expireOverdueHolds(db: DbExecutor = getDb()): Promise<number> {
  const now = getServerNow();
  const expiredRes = await db.query<{
    id: string;
    booking_code: string;
    user_id: string;
    court_name_snapshot: string;
    booking_date: string;
    start_hour: number;
  }>(
    `UPDATE bookings
     SET booking_status = 'EXPIRED',
         expired_at = $1,
         updated_at = $1
     WHERE booking_status = 'HOLD' AND NOT is_ticket_component
       AND hold_expires_at <= $1
     RETURNING id, booking_code, user_id, court_name_snapshot, booking_date, start_hour`,
    [now.toISOString()]
  );

  for (const row of expiredRes.rows) {
    await db.query(
      `INSERT INTO booking_events (id, booking_id, event_type, from_status, to_status, actor_role, message_vi, created_at)
       VALUES ($1, $2, 'HOLD_EXPIRED', 'HOLD', 'EXPIRED', 'SYSTEM', 'Thời gian giữ chỗ 5 phút đã hết hạn, sân được mở lại cho khách khác.', $3)`,
      [`evt-${crypto.randomUUID()}`, row.id, now.toISOString()]
    );

    await db.query(
      `INSERT INTO notifications (id, user_id, booking_id, type, title_vi, body_vi, email_delivery_status, created_at)
       VALUES ($1, $2, $3, 'BOOKING_EXPIRED', $4, $5, 'NOT_CONFIGURED', $6)`,
      [
        `ntf-${crypto.randomUUID()}`,
        row.user_id,
        row.id,
        `Đơn giữ chỗ ${row.booking_code} đã hết hạn`,
        `Lượt giữ chỗ ${row.court_name_snapshot} khung giờ ${formatSlotRange(row.start_hour)} ngày ${row.booking_date} đã hết thời hạn 5 phút chờ thanh toán.`,
        now.toISOString(),
      ]
    );
  }

  return expiredRes.rows.length;
}

export async function getCenterInfo(db: DbExecutor = getDb()): Promise<CenterInfo> {
  const res = await db.query<CenterInfo>(`SELECT * FROM centers ORDER BY id ASC LIMIT 1`);
  if (res.rows.length === 0) {
    throw new AppError({
      code: 'CENTER_NOT_FOUND',
      statusCode: 500,
      publicMessage: 'Thông tin trung tâm cầu lông đang được khởi tạo.',
    });
  }
  return res.rows[0];
}

export function resolveSlotPriceFromRules(
  rules: Array<{
    day_type: 'WEEKDAY' | 'WEEKEND' | 'ALL';
    start_hour: number;
    end_hour: number;
    price_vnd: number;
    label: string;
  }>,
  basePriceVnd: number,
  dateStr: string,
  startHour: number
): { priceVnd: number; pricingLabel: string } {
  const weekend = isWeekendVietnam(dateStr);
  const targetDayType = weekend ? 'WEEKEND' : 'WEEKDAY';

  const matchedSpecific = rules.find(
    (r) => r.day_type === targetDayType && startHour >= r.start_hour && startHour < r.end_hour
  );
  if (matchedSpecific) {
    return { priceVnd: matchedSpecific.price_vnd, pricingLabel: matchedSpecific.label };
  }

  const matchedAll = rules.find(
    (r) => r.day_type === 'ALL' && startHour >= r.start_hour && startHour < r.end_hour
  );
  if (matchedAll) {
    return { priceVnd: matchedAll.price_vnd, pricingLabel: matchedAll.label };
  }

  return {
    priceVnd: basePriceVnd,
    pricingLabel: weekend ? 'Giá tiêu chuẩn cuối tuần' : 'Giá tiêu chuẩn ngày thường',
  };
}

export interface ScheduleFilterInput {
  courtId?: string;
  date?: string;
  search?: string;
  hour?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  courtType?: string;
  sortBy?: 'court_order' | 'time_asc' | 'price_asc' | 'price_desc';
  viewerUserId?: string | null;
  includeInactiveCourts?: boolean;
}

export async function getScheduleAndAvailability(
  filter: ScheduleFilterInput = {},
  db: DatabaseClient = getDb()
): Promise<{
  center: CenterInfo;
  selectedDate: string;
  hoursRange: number[];
  courts: CourtSummary[];
  filteredSlots: SlotAvailabilityItem[];
  availableSlotCount: number;
  suggestedAlternatives: SlotAvailabilityItem[];
}> {
  await expireOverdueHolds(db);

  const center = await getCenterInfo(db);
  const now = getServerNow();
  const todayStr = toVietnamDateString(now);
  const selectedDate = filter.date && isValidDateString(filter.date) ? filter.date : todayStr;

  const courtsRes = await db.query<{
    id: string;
    center_id: string;
    code: string;
    name: string;
    court_type: string;
    surface_desc: string;
    lighting_desc: string;
    description: string;
    usage_notes: string;
    status: 'ACTIVE' | 'INACTIVE';
    open_hour: number;
    close_hour: number;
    base_price_vnd: number;
    sort_order: number;
  }>(`SELECT * FROM courts ORDER BY sort_order ASC, code ASC`);

  const imagesRes = await db.query<{
    court_id: string;
    image_url: string;
    caption: string;
    is_primary: boolean;
  }>(`SELECT court_id, image_url, caption, is_primary FROM court_images ORDER BY is_primary DESC, sort_order ASC`);

  const amenitiesRes = await db.query<{
    court_id: string;
    name: string;
  }>(`SELECT court_id, name FROM court_amenities ORDER BY sort_order ASC`);

  const rulesRes = await db.query<{
    id: string;
    court_id: string;
    day_type: 'WEEKDAY' | 'WEEKEND' | 'ALL';
    start_hour: number;
    end_hour: number;
    price_vnd: number;
    label: string;
  }>(`SELECT id, court_id, day_type, start_hour, end_hour, price_vnd, label FROM pricing_rules WHERE is_active = TRUE ORDER BY start_hour ASC`);

  const activeBookingsRes = await db.query<{
    court_id: string;
    start_hour: number;
    booking_status: string;
    user_id: string;
    booking_code: string;
  }>(
    `SELECT court_id, start_hour, booking_status, user_id, booking_code
     FROM bookings
     WHERE booking_date = $1
       AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
    [selectedDate]
  );

  const blocksRes = await db.query<{
    court_id: string;
    start_hour: number;
    reason: string;
    block_type?: string;
  }>(
    `SELECT court_id, start_hour, reason, block_type
     FROM court_blocks
     WHERE block_date = $1 AND is_active = TRUE`,
    [selectedDate]
  );

  const bookingMap = new Map<string, { status: string; userId: string; bookingCode: string }>();
  for (const b of activeBookingsRes.rows) {
    bookingMap.set(`${b.court_id}:${b.start_hour}`, {
      status: b.booking_status,
      userId: b.user_id,
      bookingCode: b.booking_code,
    });
  }

  const blockMap = new Map<string, { reason: string; blockType: string }>();
  for (const bl of blocksRes.rows) {
    blockMap.set(`${bl.court_id}:${bl.start_hour}`, {
      reason: bl.reason,
      blockType: bl.block_type || 'MAINTENANCE',
    });
  }

  const hoursRange: number[] = [];
  for (let h = center.open_hour; h < center.close_hour; h++) {
    hoursRange.push(h);
  }

  const searchLower = (filter.search || '').trim().toLowerCase();
  const courtTypeFilter = (filter.courtType || '').trim();

  const courts: CourtSummary[] = [];
  const allFilteredSlots: SlotAvailabilityItem[] = [];

  for (const c of courtsRes.rows) {
    if (filter.courtId && c.id !== filter.courtId) continue;
    if (!filter.includeInactiveCourts && c.status !== 'ACTIVE' && searchLower === '') {
      // Vẫn hiển thị sân trên bảng lịch với trạng thái "Tạm ngưng" để khách biết rõ
    }
    if (searchLower && !c.name.toLowerCase().includes(searchLower) && !c.code.toLowerCase().includes(searchLower)) {
      continue;
    }
    if (courtTypeFilter && c.court_type !== courtTypeFilter) {
      continue;
    }

    const courtImages = imagesRes.rows.filter((img) => img.court_id === c.id);
    const courtAmenities = amenitiesRes.rows.filter((a) => a.court_id === c.id).map((a) => a.name);
    const courtRules = rulesRes.rows.filter((r) => r.court_id === c.id);

    const slots: SlotAvailabilityItem[] = [];
    for (const h of hoursRange) {
      const slotStartUtc = vietnamSlotToUtcDate(selectedDate, h);
      const { priceVnd, pricingLabel } = resolveSlotPriceFromRules(courtRules, c.base_price_vnd, selectedDate, h);
      const key = `${c.id}:${h}`;
      const booking = bookingMap.get(key);
      const blockInfo = blockMap.get(key);
      const blockReason = blockInfo?.reason;

      let state: SlotState = 'AVAILABLE';
      let stateLabelVi = 'Còn trống';
      let stateSymbol = '○';
      let myHoldBookingCode: string | undefined;

      if (c.status !== 'ACTIVE' || h < c.open_hour || h >= c.close_hour) {
        state = 'MAINTENANCE';
        stateLabelVi = 'Tạm ngưng';
        stateSymbol = '✕';
      } else if (blockInfo) {
        if (blockInfo.blockType === 'FIXED_MONTHLY') {
          state = 'BOOKED';
          stateLabelVi = 'Đã đặt';
          stateSymbol = '●';
        } else {
          state = 'MAINTENANCE';
          stateLabelVi = 'Tạm ngưng';
          stateSymbol = '✕';
        }
      } else if (booking) {
        if (booking.status === 'HOLD') {
          if (filter.viewerUserId && booking.userId === filter.viewerUserId) {
            state = 'MY_HOLD';
            stateLabelVi = 'Bạn đang giữ chỗ';
            stateSymbol = '◔';
            myHoldBookingCode = booking.bookingCode;
          } else {
            state = 'HOLD';
            stateLabelVi = 'Đang giữ chỗ';
            stateSymbol = '◔';
          }
        } else {
          state = 'BOOKED';
          stateLabelVi = 'Đã đặt';
          stateSymbol = '●';
        }
      } else if (slotStartUtc.getTime() <= now.getTime()) {
        state = 'PAST';
        stateLabelVi = 'Đã qua giờ';
        stateSymbol = '—';
      }

      const slotItem: SlotAvailabilityItem = {
        courtId: c.id,
        courtCode: c.code,
        courtName: c.name,
        courtType: c.court_type,
        date: selectedDate,
        startHour: h,
        endHour: h + 1,
        timeLabel: formatSlotRange(h, h + 1),
        priceVnd,
        pricingLabel,
        state,
        stateLabelVi,
        stateSymbol,
        ...(blockReason ? { blockReason } : {}),
        ...(myHoldBookingCode ? { myHoldBookingCode } : {}),
      };

      slots.push(slotItem);

      const passHour = filter.hour === undefined || filter.hour === null || filter.hour === h;
      const passMin = filter.minPrice === undefined || filter.minPrice === null || priceVnd >= filter.minPrice;
      const passMax = filter.maxPrice === undefined || filter.maxPrice === null || priceVnd <= filter.maxPrice;

      if (passHour && passMin && passMax) {
        allFilteredSlots.push(slotItem);
      }
    }

    courts.push({
      ...c,
      primaryImageUrl: courtImages[0]?.image_url || '',
      primaryImageCaption:
        courtImages[0]?.caption || 'Sơ đồ minh họa kỹ thuật mặt sân tiêu chuẩn (không phải ảnh chụp thực tế)',
      images: courtImages.map((img) => ({
        url: img.image_url,
        caption: img.caption,
        isPrimary: img.is_primary,
      })),
      amenities: courtAmenities,
      pricingRules: courtRules,
      slots,
    });
  }

  const sortBy = filter.sortBy || 'court_order';
  if (sortBy === 'time_asc') {
    allFilteredSlots.sort((a, b) => a.startHour - b.startHour || a.priceVnd - b.priceVnd);
  } else if (sortBy === 'price_asc') {
    allFilteredSlots.sort((a, b) => a.priceVnd - b.priceVnd || a.startHour - b.startHour);
  } else if (sortBy === 'price_desc') {
    allFilteredSlots.sort((a, b) => b.priceVnd - a.priceVnd || a.startHour - b.startHour);
  }

  const availableSlotCount = allFilteredSlots.filter((s) => s.state === 'AVAILABLE').length;

  // Khi hết chỗ ở khung giờ/bộ lọc đang chọn, tự động tìm các lựa chọn thực sự còn khả dụng để gợi ý
  const suggestedAlternatives: SlotAvailabilityItem[] = [];
  if (availableSlotCount === 0) {
    // 1. Tìm các khung giờ còn trống khác trong cùng ngày
    for (const c of courts) {
      for (const s of c.slots) {
        if (s.state === 'AVAILABLE' && suggestedAlternatives.length < 6) {
          suggestedAlternatives.push(s);
        }
      }
    }
    // 2. Nếu cả ngày hôm đó đã hết chỗ, tìm sang ngày kế tiếp thực sự còn trống trong DB
    if (suggestedAlternatives.length === 0) {
      const nextDate = addDaysVietnam(selectedDate, 1);
      const nextActiveBookings = await db.query<{ court_id: string; start_hour: number }>(
        `SELECT court_id, start_hour FROM bookings
         WHERE booking_date = $1 AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
        [nextDate]
      );
      const nextBlocks = await db.query<{ court_id: string; start_hour: number }>(
        `SELECT court_id, start_hour FROM court_blocks WHERE block_date = $1 AND is_active = TRUE`,
        [nextDate]
      );
      const occupiedNext = new Set<string>([
        ...nextActiveBookings.rows.map((r) => `${r.court_id}:${r.start_hour}`),
        ...nextBlocks.rows.map((r) => `${r.court_id}:${r.start_hour}`),
      ]);

      for (const c of courtsRes.rows) {
        if (c.status !== 'ACTIVE') continue;
        const courtRules = rulesRes.rows.filter((r) => r.court_id === c.id);
        for (const h of hoursRange) {
          if (suggestedAlternatives.length >= 6) break;
          const slotStartUtc = vietnamSlotToUtcDate(nextDate, h);
          if (slotStartUtc.getTime() <= now.getTime()) continue;
          if (occupiedNext.has(`${c.id}:${h}`)) continue;
          const { priceVnd, pricingLabel } = resolveSlotPriceFromRules(courtRules, c.base_price_vnd, nextDate, h);
          suggestedAlternatives.push({
            courtId: c.id,
            courtCode: c.code,
            courtName: c.name,
            courtType: c.court_type,
            date: nextDate,
            startHour: h,
            endHour: h + 1,
            timeLabel: formatSlotRange(h, h + 1),
            priceVnd,
            pricingLabel,
            state: 'AVAILABLE',
            stateLabelVi: 'Còn trống',
            stateSymbol: '○',
          });
        }
      }
    }
  }

  return {
    center,
    selectedDate,
    hoursRange,
    courts,
    filteredSlots: allFilteredSlots,
    availableSlotCount,
    suggestedAlternatives,
  };
}

export async function getCourtDetail(
  courtIdOrCode: string,
  dateStr?: string,
  viewerUserId?: string | null,
  db: DatabaseClient = getDb()
): Promise<{
  center: CenterInfo;
  court: CourtSummary;
  selectedDate: string;
}> {
  const schedule = await getScheduleAndAvailability(
    { date: dateStr, viewerUserId, includeInactiveCourts: true },
    db
  );
  const court = schedule.courts.find((c) => c.id === courtIdOrCode || c.code === courtIdOrCode);
  if (!court) {
    throw new AppError({
      code: 'COURT_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy sân cầu lông bạn đang xem. Bạn vui lòng quay lại danh sách sân.',
    });
  }
  return {
    center: schedule.center,
    court,
    selectedDate: schedule.selectedDate,
  };
}

/**
 * Quản trị viên cập nhật thông tin sân hoặc trạng thái hoạt động:
 * - Ngăn ngừng hoạt động sân (INACTIVE) hoặc thu hẹp giờ mở cửa nếu đang có đơn đặt hoặc giữ chỗ còn hiệu lực!
 */
export async function adminUpdateCourt(
  actor: SessionContext,
  courtId: string,
  input: {
    name: string;
    courtType: string;
    surfaceDesc: string;
    lightingDesc: string;
    description: string;
    usageNotes: string;
    status: 'ACTIVE' | 'INACTIVE';
    basePriceVnd: number;
    amenities?: string[];
    images?: Array<{ imageUrl: string; caption?: string; isPrimary?: boolean }>;
  },
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền quản lý cấu hình sân.',
    });
  }

  const name = (input.name || '').trim();
  const basePriceVnd = parsePriceVnd(input.basePriceVnd);
  if (!name || basePriceVnd <= 0) {
    throw new AppError({
      code: 'INVALID_COURT_DATA',
      statusCode: 400,
      publicMessage: 'Tên sân và giá cơ sở (số nguyên dương đồng) không được để trống.',
    });
  }

  await expireOverdueHolds(db);
  const now = getServerNow();

  await db.withTransaction(async (tx) => {
    const existingRes = await tx.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      base_price_vnd: number;
    }>(`SELECT id, code, name, status, base_price_vnd FROM courts WHERE id = $1`, [courtId]);

    if (existingRes.rows.length === 0) {
      throw new AppError({
        code: 'COURT_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Không tìm thấy sân cần cập nhật.',
      });
    }
    const existing = existingRes.rows[0];

    if (input.status === 'INACTIVE') {
      const activeBookings = await tx.query<{ booking_code: string }>(
        `SELECT booking_code FROM bookings
         WHERE court_id = $1
           AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
           AND slot_end_at > $2
         LIMIT 5`,
        [courtId, now.toISOString()]
      );
      if (activeBookings.rows.length > 0) {
        const codes = activeBookings.rows.map((r) => r.booking_code).join(', ');
        throw new AppError({
          code: 'COURT_HAS_ACTIVE_BOOKINGS',
          statusCode: 409,
          publicMessage: `Không thể ngừng hoạt động ${existing.name} vì đang có đơn đặt hoặc giữ chỗ còn hiệu lực (${codes}). Vui lòng xử lý các đơn này trước.`,
        });
      }
    }

    await tx.query(
      `UPDATE courts
       SET name = $1,
           court_type = $2,
           surface_desc = $3,
           lighting_desc = $4,
           description = $5,
           usage_notes = $6,
           status = $7,
           base_price_vnd = $8,
           updated_at = $9
       WHERE id = $10`,
      [
        name,
        (input.courtType || 'Tiêu chuẩn thi đấu').trim(),
        (input.surfaceDesc || '').trim(),
        (input.lightingDesc || '').trim(),
        (input.description || '').trim(),
        (input.usageNotes || '').trim(),
        input.status,
        basePriceVnd,
        now.toISOString(),
        courtId,
      ]
    );

    if (input.amenities && input.amenities.length > 0) {
      await tx.query(`DELETE FROM court_amenities WHERE court_id = $1`, [courtId]);
      for (let i = 0; i < input.amenities.length; i++) {
        const amName = input.amenities[i].trim();
        if (!amName) continue;
        await tx.query(
          `INSERT INTO court_amenities (id, court_id, name, icon_symbol, sort_order)
           VALUES ($1, $2, $3, '■', $4)`,
          [`am-${courtId}-${Date.now()}-${i}`, courtId, amName, i + 1]
        );
      }
    }

    if (input.images !== undefined) {
      await tx.query(`DELETE FROM court_images WHERE court_id = $1`, [courtId]);
      const validImages = input.images.filter((img) => img && (img.imageUrl || '').trim());
      for (let i = 0; i < validImages.length; i++) {
        const img = validImages[i];
        const url = img.imageUrl.trim();
        const caption = (img.caption || `Hình ảnh sân ${name}`).trim();
        const isPrimary = i === 0 || Boolean(img.isPrimary);
        await tx.query(
          `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`img-${courtId}-${Date.now()}-${i + 1}`, courtId, url, caption, isPrimary, i + 1]
        );
      }
    }

    if (basePriceVnd !== existing.base_price_vnd) {
      // Đồng bộ các quy tắc giá của riêng sân này theo đơn giá cơ sở mới
      await tx.query(
        `UPDATE pricing_rules
         SET price_vnd = $1, updated_at = $2
         WHERE court_id = $3`,
        [basePriceVnd, now.toISOString(), courtId]
      );
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'UPDATE_COURT', 'COURT', $4, $5, $6, $7, $8)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        courtId,
        `Cập nhật thông tin ${name} (trạng thái: ${input.status}, giá cơ sở: ${basePriceVnd} ₫)`,
        JSON.stringify(existing),
        JSON.stringify({ name, status: input.status, basePriceVnd }),
        now.toISOString(),
      ]
    );
  });
}

export async function adminCreateCourt(
  actor: SessionContext,
  input: {
    code: string;
    name: string;
    courtType: string;
    surfaceDesc: string;
    lightingDesc: string;
    description: string;
    usageNotes: string;
    basePriceVnd: number;
    amenities: string[];
    images?: Array<{ imageUrl: string; caption?: string; isPrimary?: boolean }>;
  },
  db: DatabaseClient = getDb()
): Promise<string> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN_ADMIN_ONLY',
      statusCode: 403,
      publicMessage: 'Chỉ quản trị viên mới có quyền thêm sân mới.',
    });
  }

  const code = (input.code || '').trim().toUpperCase();
  const name = (input.name || '').trim();
  const basePriceVnd = Math.round(Number(input.basePriceVnd) || 0);
  if (!code || !name || basePriceVnd <= 0) {
    throw new AppError({
      code: 'INVALID_COURT_INPUT',
      statusCode: 400,
      publicMessage: 'Vui lòng nhập đầy đủ mã sân, tên sân và mức giá hợp lệ.',
    });
  }

  const center = await getCenterInfo(db);
  const courtId = `court-${crypto.randomUUID().slice(0, 8)}`;
  const now = getServerNow();

  await db.withTransaction(async (tx) => {
    const dup = await tx.query<{ id: string }>(`SELECT id FROM courts WHERE code = $1`, [code]);
    if (dup.rows.length > 0) {
      throw new AppError({
        code: 'COURT_CODE_EXISTS',
        statusCode: 409,
        publicMessage: `Mã sân ${code} đã tồn tại trong hệ thống.`,
      });
    }

    await tx.query(
      `INSERT INTO courts (
        id, center_id, code, name, court_type, surface_desc, lighting_desc,
        description, usage_notes, status, open_hour, close_hour, base_price_vnd, sort_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, $11, $12, 99, $13, $13)`,
      [
        courtId,
        center.id,
        code,
        name,
        (input.courtType || 'Tiêu chuẩn thi đấu').trim(),
        (input.surfaceDesc || 'Thảm PVC tiêu chuẩn').trim(),
        (input.lightingDesc || 'Đèn LED chống chói').trim(),
        (input.description || '').trim(),
        (input.usageNotes || 'Bắt buộc mang giày cầu lông đế kếp.').trim(),
        center.open_hour,
        center.close_hour,
        basePriceVnd,
        now.toISOString(),
      ]
    );

    const cleanAmenities = (input.amenities || []).map((a) => a.trim()).filter(Boolean);
    for (let i = 0; i < cleanAmenities.length; i++) {
      await tx.query(
        `INSERT INTO court_amenities (id, court_id, name, icon_symbol, sort_order)
         VALUES ($1, $2, $3, '■', $4)`,
        [`am-${courtId}-${i + 1}`, courtId, cleanAmenities[i], i + 1]
      );
    }

    if (input.images && input.images.length > 0) {
      const validImages = input.images.filter((img) => img && (img.imageUrl || '').trim());
      for (let i = 0; i < validImages.length; i++) {
        const img = validImages[i];
        const url = img.imageUrl.trim();
        const caption = (img.caption || `Hình ảnh sân ${name}`).trim();
        const isPrimary = i === 0 || Boolean(img.isPrimary);
        await tx.query(
          `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`img-${courtId}-${Date.now()}-${i + 1}`, courtId, url, caption, isPrimary, i + 1]
        );
      }
    } else {
      await tx.query(
        `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, 1)`,
        [`img-${courtId}-1`, courtId, '/public/images/court-interior.jpg', `Không gian ${name}`]
      );
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'CREATE_COURT', 'COURT', $4, $5, $6, $7)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        courtId,
        `Thêm mới sân ${code} — ${name} (giá cơ sở: ${basePriceVnd} ₫)`,
        JSON.stringify({ code, name, basePriceVnd }),
        now.toISOString(),
      ]
    );
  });

  return courtId;
}

export interface PriceBoardTier {
  id: string;
  tierKey: string;
  dayType: string;
  startHour: number;
  endHour: number;
  timeLabel: string;
  priceGuestVnd: number;
  priceFixedVnd: number;
  studentGuestVnd?: number | null;
  studentFixedVnd?: number | null;
  subLabel?: string | null;
  displayOrder: number;
}

/**
 * Lấy cấu hình Bảng giá thuê sân niêm yết hiện tại của hệ thống.
 * Nếu bảng cấu hình chưa có dữ liệu, trả về 5 khung giờ chuẩn mặc định của Be Badminton.
 */
export async function getPriceBoardSettings(db: DatabaseClient = getDb()): Promise<PriceBoardTier[]> {
  try {
    const res = await db.query<{
      id: string;
      tier_key: string;
      day_type: string;
      start_hour: number;
      end_hour: number;
      time_label: string;
      price_guest_vnd: number;
      price_fixed_vnd: number;
      student_guest_vnd: number | null;
      student_fixed_vnd: number | null;
      sub_label: string | null;
      display_order: number;
    }>(
      `SELECT id, tier_key, day_type, start_hour, end_hour, time_label, price_guest_vnd, price_fixed_vnd, student_guest_vnd, student_fixed_vnd, sub_label, display_order
       FROM price_board_settings
       ORDER BY display_order ASC`
    );

    if (res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: r.id,
        tierKey: r.tier_key,
        dayType: r.day_type,
        startHour: r.start_hour,
        endHour: r.end_hour,
        timeLabel: r.time_label,
        priceGuestVnd: Number(r.price_guest_vnd),
        priceFixedVnd: Number(r.price_fixed_vnd),
        studentGuestVnd: r.student_guest_vnd !== null && r.student_guest_vnd !== undefined ? Number(r.student_guest_vnd) : null,
        studentFixedVnd: r.student_fixed_vnd !== null && r.student_fixed_vnd !== undefined ? Number(r.student_fixed_vnd) : null,
        subLabel: r.sub_label,
        displayOrder: r.display_order,
      }));
    }
  } catch {
    // Dự phòng khi bảng chưa khởi tạo
  }

  return [
    {
      id: 'tier-wd-morning',
      tierKey: 'wd_morning',
      dayType: 'WEEKDAY',
      startHour: 5,
      endHour: 9,
      timeLabel: '05:00 - 09:00',
      priceGuestVnd: 120000,
      priceFixedVnd: 110000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: null,
      displayOrder: 1,
    },
    {
      id: 'tier-wd-day',
      tierKey: 'wd_day',
      dayType: 'WEEKDAY',
      startHour: 9,
      endHour: 17,
      timeLabel: '09:00 - 17:00',
      priceGuestVnd: 100000,
      priceFixedVnd: 90000,
      studentGuestVnd: 90000,
      studentFixedVnd: 80000,
      subLabel: 'Ưu đãi HS/SV',
      displayOrder: 2,
    },
    {
      id: 'tier-wd-peak',
      tierKey: 'wd_peak',
      dayType: 'WEEKDAY',
      startHour: 17,
      endHour: 22,
      timeLabel: '17:00 - 22:00',
      priceGuestVnd: 140000,
      priceFixedVnd: 130000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: 'Khung giờ vàng cao điểm',
      displayOrder: 3,
    },
    {
      id: 'tier-wd-night',
      tierKey: 'wd_night',
      dayType: 'WEEKDAY',
      startHour: 22,
      endHour: 24,
      timeLabel: '22:00 - 24:00',
      priceGuestVnd: 120000,
      priceFixedVnd: 110000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: null,
      displayOrder: 4,
    },
    {
      id: 'tier-weekend',
      tierKey: 'weekend',
      dayType: 'WEEKEND',
      startHour: 5,
      endHour: 24,
      timeLabel: 'CẢ NGÀY (05:00 - 24:00)',
      priceGuestVnd: 130000,
      priceFixedVnd: 130000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: 'Đồng giá T7, CN & Lễ',
      displayOrder: 5,
    },
  ];
}

/**
 * Cập nhật bảng giá niêm yết chính thức và đồng bộ giá thuê thực tế vào toàn bộ 18 sân.
 * Khi khách đặt sân trực tuyến, hệ thống áp dụng đơn giá vãng lai tương ứng.
 */
export async function adminUpdateOfficialPriceBoard(
  actor: SessionContext,
  input: {
    tiers: Array<{
      tierKey: string;
      priceGuestVnd: number;
      priceFixedVnd: number;
      studentGuestVnd?: number | null;
      studentFixedVnd?: number | null;
      subLabel?: string | null;
    }>;
  },
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền điều chỉnh bảng giá niêm yết.',
    });
  }

  const now = getServerNow();

  await db.withTransaction(async (tx) => {
    const courtsRes = await tx.query<{ id: string }>(`SELECT id FROM courts`);
    const allCourtIds = courtsRes.rows.map((c) => c.id);

    const TIER_METADATA: Record<
      string,
      { dayType: string; startHour: number; endHour: number; timeLabel: string; displayOrder: number; subLabel?: string; defaultStudentGuest?: number; defaultStudentFixed?: number }
    > = {
      wd_morning: { dayType: 'WEEKDAY', startHour: 5, endHour: 9, timeLabel: '05:00 - 09:00', displayOrder: 1 },
      wd_day: { dayType: 'WEEKDAY', startHour: 9, endHour: 17, timeLabel: '09:00 - 17:00', displayOrder: 2, subLabel: 'Ưu đãi HS/SV', defaultStudentGuest: 90000, defaultStudentFixed: 80000 },
      wd_peak: { dayType: 'WEEKDAY', startHour: 17, endHour: 22, timeLabel: '17:00 - 22:00', displayOrder: 3, subLabel: 'Khung giờ vàng cao điểm' },
      wd_night: { dayType: 'WEEKDAY', startHour: 22, endHour: 24, timeLabel: '22:00 - 24:00', displayOrder: 4 },
      weekend: { dayType: 'WEEKEND', startHour: 5, endHour: 24, timeLabel: 'CẢ NGÀY (05:00 - 24:00)', displayOrder: 5, subLabel: 'Đồng giá T7, CN & Lễ' },
    };

    for (const t of input.tiers) {
      const guestVnd = parsePriceVnd(t.priceGuestVnd);
      const fixedVnd = parsePriceVnd(t.priceFixedVnd);
      const meta = TIER_METADATA[t.tierKey];
      if (!meta) continue;

      let studentGuestVnd: number | null = null;
      if (t.studentGuestVnd !== null && t.studentGuestVnd !== undefined && parsePriceVnd(t.studentGuestVnd) > 0) {
        studentGuestVnd = parsePriceVnd(t.studentGuestVnd);
      } else if (meta.defaultStudentGuest && (t.studentGuestVnd === undefined || t.studentGuestVnd === null)) {
        studentGuestVnd = meta.defaultStudentGuest;
      }

      let studentFixedVnd: number | null = null;
      if (t.studentFixedVnd !== null && t.studentFixedVnd !== undefined && parsePriceVnd(t.studentFixedVnd) > 0) {
        studentFixedVnd = parsePriceVnd(t.studentFixedVnd);
      } else if (meta.defaultStudentFixed && (t.studentFixedVnd === undefined || t.studentFixedVnd === null)) {
        studentFixedVnd = meta.defaultStudentFixed;
      }

      // Xử lý Ghi chú & Nhãn phụ: Nếu có nhập thì lưu, nếu để trống thì dùng giá trị mặc định cũ
      let resolvedSubLabel: string | null = null;
      if (t.subLabel !== undefined && t.subLabel !== null && t.subLabel.trim() !== '') {
        resolvedSubLabel = t.subLabel.trim();
      } else if (meta.subLabel) {
        resolvedSubLabel = meta.subLabel;
      }

      if (guestVnd <= 0 || fixedVnd <= 0) {
        throw new AppError({
          code: 'INVALID_PRICE',
          statusCode: 400,
          publicMessage: `Đơn giá khung giờ [${t.tierKey}] phải là số nguyên dương hợp lệ (₫/ca chơi).`,
        });
      }

      await tx.query(
        `INSERT INTO price_board_settings (id, tier_key, day_type, start_hour, end_hour, time_label, price_guest_vnd, price_fixed_vnd, student_guest_vnd, student_fixed_vnd, sub_label, display_order, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (tier_key) DO UPDATE
         SET price_guest_vnd = EXCLUDED.price_guest_vnd,
             price_fixed_vnd = EXCLUDED.price_fixed_vnd,
             student_guest_vnd = EXCLUDED.student_guest_vnd,
             student_fixed_vnd = EXCLUDED.student_fixed_vnd,
             sub_label = EXCLUDED.sub_label,
             updated_at = EXCLUDED.updated_at`,
        [
          `tier-${t.tierKey.replace('_', '-')}`,
          t.tierKey,
          meta.dayType,
          meta.startHour,
          meta.endHour,
          meta.timeLabel,
          guestVnd,
          fixedVnd,
          studentGuestVnd,
          studentFixedVnd,
          resolvedSubLabel,
          meta.displayOrder,
          now.toISOString(),
        ]
      );

      const fixedK = Math.round(fixedVnd / 1000);
      const dayLabel = meta.dayType === 'WEEKDAY' ? 'Thứ 2 – Thứ 6' : 'Thứ 7, Chủ Nhật & Lễ';
      const labelText = `${dayLabel} (${meta.timeLabel} · Cố định: ${fixedK}k)`;

      for (const courtId of allCourtIds) {
        const ruleId = `pr-${courtId}-${t.tierKey.replace('_', '-')}`;
        const existingRule = await tx.query<{ id: string }>(
          `SELECT id FROM pricing_rules WHERE court_id = $1 AND day_type = $2 AND start_hour = $3 AND end_hour = $4`,
          [courtId, meta.dayType, meta.startHour, meta.endHour]
        );

        if (existingRule.rows.length > 0) {
          await tx.query(
            `UPDATE pricing_rules
             SET price_vnd = $1, label = $2, updated_at = $3
             WHERE id = $4`,
            [guestVnd, labelText, now.toISOString(), existingRule.rows[0].id]
          );
        } else {
          await tx.query(
            `INSERT INTO pricing_rules (id, court_id, day_type, start_hour, end_hour, price_vnd, label, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $8)`,
            [ruleId, courtId, meta.dayType, meta.startHour, meta.endHour, guestVnd, labelText, now.toISOString()]
          );
        }
      }
    }

    // Đồng bộ giá cơ sở mặc định của toàn bộ 18 sân theo mức giá cuối tuần/ngày thường
    const weekendTier = input.tiers.find((t) => t.tierKey === 'weekend');
    const defaultCourtPrice = weekendTier ? parsePriceVnd(weekendTier.priceGuestVnd) : 130000;
    if (defaultCourtPrice > 0) {
      await tx.query(`UPDATE courts SET base_price_vnd = $1, updated_at = $2`, [defaultCourtPrice, now.toISOString()]);
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'UPDATE_OFFICIAL_PRICE_BOARD', 'PRICE_BOARD', 'be-badminton-official', $4, $5, $6)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        'Cập nhật bảng giá niêm yết chính thức và đồng bộ 18 sân Be Badminton',
        JSON.stringify(input.tiers),
        now.toISOString(),
      ]
    );
  });
}

/**
 * Thiết lập hoặc cập nhật bảng giá theo khung giờ cho sân:
 * - Chỉ áp dụng cho các đơn tạo mới sau thời điểm cập nhật.
 * - Các đơn đã tạo trước đó giữ nguyên snapshot giá đã cam kết.
 * - Hỗ trợ courtId = 'ALL' để áp dụng cho toàn bộ các sân.
 */
export async function adminUpsertPricingRule(
  actor: SessionContext,
  input: {
    ruleId?: string;
    courtId: string;
    dayType: 'WEEKDAY' | 'WEEKEND' | 'ALL';
    startHour: number;
    endHour: number;
    priceVnd: number;
    label: string;
  },
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền điều chỉnh bảng giá.',
    });
  }

  const priceVnd = parsePriceVnd(input.priceVnd);
  const startHour = Number(input.startHour);
  const endHour = Number(input.endHour);
  if (priceVnd <= 0 || !Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour >= endHour) {
    throw new AppError({
      code: 'INVALID_PRICING_RULE',
      statusCode: 400,
      publicMessage: 'Khung giờ và đơn giá (số nguyên dương đồng) chưa hợp lệ.',
    });
  }

  const now = getServerNow();
  await db.withTransaction(async (tx) => {
    const isAll = input.courtId === 'ALL';
    let targetCourtIds: string[] = [];

    if (isAll) {
      const courtsRes = await tx.query<{ id: string }>(`SELECT id FROM courts`);
      targetCourtIds = courtsRes.rows.map((c) => c.id);
    } else {
      targetCourtIds = [input.courtId];
    }

    for (const cId of targetCourtIds) {
      if (input.ruleId && !isAll) {
        await tx.query(
          `UPDATE pricing_rules
           SET day_type = $1, start_hour = $2, end_hour = $3, price_vnd = $4, label = $5, updated_at = $6
           WHERE id = $7 AND court_id = $8`,
          [
            input.dayType,
            startHour,
            endHour,
            priceVnd,
            (input.label || 'Khung giờ cập nhật').trim(),
            now.toISOString(),
            input.ruleId,
            cId,
          ]
        );
      } else {
        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM pricing_rules WHERE court_id = $1 AND day_type = $2 AND start_hour = $3 AND end_hour = $4`,
          [cId, input.dayType, startHour, endHour]
        );

        if (existing.rows.length > 0) {
          await tx.query(
            `UPDATE pricing_rules
             SET price_vnd = $1, label = $2, updated_at = $3
             WHERE id = $4`,
            [priceVnd, (input.label || 'Khung giờ cập nhật').trim(), now.toISOString(), existing.rows[0].id]
          );
        } else {
          await tx.query(
            `INSERT INTO pricing_rules (id, court_id, day_type, start_hour, end_hour, price_vnd, label, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $8)`,
            [
              `pr-${crypto.randomUUID().slice(0, 8)}`,
              cId,
              input.dayType,
              startHour,
              endHour,
              priceVnd,
              (input.label || 'Khung giờ tùy chỉnh').trim(),
              now.toISOString(),
            ]
          );
        }
      }
    }

    // Nếu áp dụng cho ALL 18 sân, đồng bộ luôn vào price_board_settings để bảng giá trang chủ tự động cập nhật
    if (isAll) {
      if (input.dayType === 'WEEKDAY') {
        if (startHour <= 5 && endHour >= 9) {
          await tx.query(`UPDATE price_board_settings SET price_guest_vnd = $1, updated_at = $2 WHERE tier_key = 'wd_morning'`, [priceVnd, now.toISOString()]);
        } else if (startHour <= 9 && endHour >= 17) {
          await tx.query(`UPDATE price_board_settings SET price_guest_vnd = $1, updated_at = $2 WHERE tier_key = 'wd_day'`, [priceVnd, now.toISOString()]);
        } else if (startHour <= 17 && endHour >= 22) {
          await tx.query(`UPDATE price_board_settings SET price_guest_vnd = $1, updated_at = $2 WHERE tier_key = 'wd_peak'`, [priceVnd, now.toISOString()]);
        } else if (startHour <= 22 && endHour >= 24) {
          await tx.query(`UPDATE price_board_settings SET price_guest_vnd = $1, updated_at = $2 WHERE tier_key = 'wd_night'`, [priceVnd, now.toISOString()]);
        }
      } else if (input.dayType === 'WEEKEND' || input.dayType === 'ALL') {
        await tx.query(`UPDATE price_board_settings SET price_guest_vnd = $1, updated_at = $2 WHERE tier_key = 'weekend'`, [priceVnd, now.toISOString()]);
      }
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'UPSERT_PRICING_RULE', 'COURT', $4, $5, $6, $7)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        input.courtId,
        `Cập nhật giá sân ${input.courtId} (${input.dayType} ${startHour}:00–${endHour}:00) thành ${priceVnd} ₫`,
        JSON.stringify(input),
        now.toISOString(),
      ]
    );
  });
}

/**
 * Khóa lịch bảo trì với lý do:
 * - Bắt buộc kiểm tra xung đột với đơn đặt hoặc giữ chỗ còn hiệu lực trong giao dịch DB!
 */
export async function adminCreateCourtBlock(
  actor: SessionContext,
  input: {
    courtId: string;
    blockDate: string;
    startHour: number;
    reason: string;
  },
  db: DatabaseClient = getDb()
): Promise<string> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền khóa lịch sân.',
    });
  }

  const reason = (input.reason || '').trim();
  if (!reason) {
    throw new AppError({
      code: 'MISSING_BLOCK_REASON',
      statusCode: 400,
      publicMessage: 'Vui lòng nhập lý do khóa lịch bảo trì (ví dụ: Thay lưới, Vệ sinh thảm).',
    });
  }
  if (!isValidDateString(input.blockDate)) {
    throw new AppError({
      code: 'INVALID_DATE',
      statusCode: 400,
      publicMessage: 'Ngày khóa lịch không hợp lệ.',
    });
  }

  await expireOverdueHolds(db);
  const now = getServerNow();
  const blockId = `blk-${crypto.randomUUID().slice(0, 8)}`;

  await db.withTransaction(async (tx) => {
    const conflictBooking = await tx.query<{ booking_code: string; booking_status: string }>(
      `SELECT booking_code, booking_status
       FROM bookings
       WHERE court_id = $1
         AND booking_date = $2
         AND start_hour = $3
         AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')`,
      [input.courtId, input.blockDate, input.startHour]
    );

    if (conflictBooking.rows.length > 0) {
      const b = conflictBooking.rows[0];
      throw new AppError({
        code: 'BLOCK_CONFLICTS_WITH_BOOKING',
        statusCode: 409,
        publicMessage: `Không thể khóa khung giờ ${formatSlotRange(input.startHour)} ngày ${input.blockDate} vì đang có đơn ${b.booking_code} (${b.booking_status === 'HOLD' ? 'Đang giữ chỗ' : 'Đã xác nhận'}).`,
      });
    }

    const existingBlock = await tx.query<{ id: string }>(
      `SELECT id FROM court_blocks
       WHERE court_id = $1 AND block_date = $2 AND start_hour = $3 AND is_active = TRUE`,
      [input.courtId, input.blockDate, input.startHour]
    );
    if (existingBlock.rows.length > 0) {
      throw new AppError({
        code: 'BLOCK_ALREADY_EXISTS',
        statusCode: 409,
        publicMessage: 'Khung giờ này đã được khóa bảo trì trước đó.',
      });
    }

    await tx.query(
      `INSERT INTO court_blocks (id, court_id, block_date, start_hour, end_hour, reason, created_by, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
      [
        blockId,
        input.courtId,
        input.blockDate,
        input.startHour,
        input.startHour + 1,
        reason,
        actor.user.id,
        now.toISOString(),
      ]
    );

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'CREATE_COURT_BLOCK', 'COURT_BLOCK', $4, $5, $6, $7)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        blockId,
        `Khóa lịch bảo trì sân ${input.courtId} ngày ${input.blockDate} (${formatSlotRange(input.startHour)}): ${reason}`,
        JSON.stringify(input),
        now.toISOString(),
      ]
    );
  });

  return blockId;
}

export async function adminReleaseCourtBlock(
  actor: SessionContext,
  blockId: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Bạn không có quyền mở khóa lịch bảo trì.',
    });
  }
  const now = getServerNow();
  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE court_blocks SET is_active = FALSE, released_at = $1 WHERE id = $2`, [
      now.toISOString(),
      blockId,
    ]);
    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, created_at
      ) VALUES ($1, $2, $3, 'RELEASE_COURT_BLOCK', 'COURT_BLOCK', $4, $5, $6)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        blockId,
        `Mở lại lịch bảo trì mã ${blockId}`,
        now.toISOString(),
      ]
    );
  });
}
