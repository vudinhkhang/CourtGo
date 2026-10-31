import crypto from 'node:crypto';
import { DatabaseClient, getDb } from '../db/client.js';
import { expireOverdueHolds, getCenterInfo } from './courtService.js';
import { formatSlotRange, getServerNow, isValidDateString, toVietnamDateString } from '../utils/time.js';
import { SessionContext } from './authService.js';
import { BookingRecord } from './bookingService.js';
import { AppError } from '../utils/errors.js';

export interface OperationalMetrics {
  fromDate: string;
  toDate: string;
  confirmedBookingsCount: number;
  upcomingBookingsCount: number;
  grossPaidAmountVnd: number;
  succeededRefundAmountVnd: number;
  netCollectedRevenueVnd: number; // Thu thực nhận = Tiền thanh toán thành công - Tiền hoàn thành công (Không gọi là lợi nhuận!)
  pendingRefundsCount: number;
  pendingRefundsAmountVnd: number;
  courtUtilizationRatePct: number;
  totalAvailableCourtHours: number;
  occupiedCourtHours: number;
  failedJobsCount: number;
}

/**
 * Tính toán các chỉ số tổng quan vận hành từ dữ liệu thực trong cơ sở dữ liệu:
 * - Đơn đã xác nhận (CONFIRMED, CHECKED_IN, COMPLETED).
 * - Lịch sắp diễn ra (CONFIRMED / CHECKED_IN có slot_start_at >= now).
 * - Tiền thanh toán thành công (SUCCEEDED + LATE_SUCCEEDED).
 * - Tiền hoàn thành công (refunds.status = 'SUCCEEDED').
 * - Thu thực nhận = Tiền thanh toán thành công - Tiền hoàn thành công (nhất quán, không gọi là lợi nhuận).
 * - Khoản hoàn cần xử lý (PENDING, PROCESSING, FAILED_RETRYABLE, FAILED_DEFINITE, UNKNOWN_NEEDS_RECONCILE).
 * - Tỷ lệ sử dụng sân (% số giờ có đơn CONFIRMED/CHECKED_IN/COMPLETED trên tổng số giờ mở cửa của các sân đang hoạt động trong kỳ).
 */
export async function getAdminOperationalMetrics(
  filter: { fromDate?: string; toDate?: string } = {},
  db: DatabaseClient = getDb()
): Promise<OperationalMetrics> {
  await expireOverdueHolds(db);

  const now = getServerNow();
  const todayStr = toVietnamDateString(now);
  const fromDate = filter.fromDate && isValidDateString(filter.fromDate) ? filter.fromDate : todayStr;
  const toDate = filter.toDate && isValidDateString(filter.toDate) && filter.toDate >= fromDate ? filter.toDate : fromDate;

  const center = await getCenterInfo(db);

  // 1. Đơn đã xác nhận trong khoảng ngày chơi (booking_date BETWEEN fromDate AND toDate)
  const confirmedRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM bookings
     WHERE NOT is_ticket_component AND booking_date >= $1 AND booking_date <= $2
       AND booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
    [fromDate, toDate]
  );
  const confirmedBookingsCount = Number(confirmedRes.rows[0]?.cnt || '0');

  // 2. Lịch sắp diễn ra (bắt đầu từ thời điểm hiện tại trở đi trong phạm vi lọc)
  const upcomingRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM bookings
     WHERE NOT is_ticket_component AND booking_date >= $1 AND booking_date <= $2
       AND booking_status IN ('CONFIRMED', 'CHECKED_IN')
       AND slot_end_at > $3`,
    [fromDate, toDate, now.toISOString()]
  );
  const upcomingBookingsCount = Number(upcomingRes.rows[0]?.cnt || '0');

  // 3. Tiền thanh toán thành công gắn với các đơn trong kỳ lọc
  const paidRes = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(pa.amount_vnd), 0)::text AS total
     FROM payment_attempts pa
     JOIN bookings b ON b.id = pa.booking_id
     WHERE b.booking_date >= $1 AND b.booking_date <= $2
       AND pa.status IN ('SUCCEEDED', 'LATE_SUCCEEDED')`,
    [fromDate, toDate]
  );
  const grossPaidAmountVnd = Number(paidRes.rows[0]?.total || '0');

  // 4. Tiền hoàn thành công gắn với các đơn trong kỳ lọc
  const refundDoneRes = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(r.amount_vnd), 0)::text AS total
     FROM refunds r
     JOIN bookings b ON b.id = r.booking_id
     WHERE b.booking_date >= $1 AND b.booking_date <= $2
       AND r.status = 'SUCCEEDED'`,
    [fromDate, toDate]
  );
  const succeededRefundAmountVnd = Number(refundDoneRes.rows[0]?.total || '0');

  // 5. Thu thực nhận = Tiền thanh toán thành công - Tiền hoàn thành công
  const netCollectedRevenueVnd = grossPaidAmountVnd - succeededRefundAmountVnd;

  // 6. Khoản hoàn cần xử lý (trên toàn hệ thống để nhân sự không bỏ sót)
  const pendingRefundsRes = await db.query<{ cnt: string; total: string }>(
    `SELECT COUNT(*)::text AS cnt, COALESCE(SUM(amount_vnd), 0)::text AS total
     FROM refunds
     WHERE status <> 'SUCCEEDED'`
  );
  const pendingRefundsCount = Number(pendingRefundsRes.rows[0]?.cnt || '0');
  const pendingRefundsAmountVnd = Number(pendingRefundsRes.rows[0]?.total || '0');

  // 7. Tỷ lệ sử dụng sân trong kỳ lọc
  const activeCourtsRes = await db.query<{ open_hour: number; close_hour: number }>(
    `SELECT open_hour, close_hour FROM courts WHERE status = 'ACTIVE'`
  );
  const dailyHoursPerAllCourts = activeCourtsRes.rows.reduce(
    (sum, c) => sum + Math.max(0, (c.close_hour || center.close_hour) - (c.open_hour || center.open_hour)),
    0
  );

  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const daySpan = Math.max(
    1,
    Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 3600 * 1000)) + 1
  );

  const totalAvailableCourtHours = dailyHoursPerAllCourts * daySpan;
  const occupiedCourtHours = Number((await db.query<{n:string}>(`SELECT COALESCE(SUM(end_hour-start_hour),0)::text AS n FROM bookings WHERE NOT is_ticket_component AND booking_date >= $1 AND booking_date <= $2 AND booking_status IN ('CONFIRMED','CHECKED_IN','COMPLETED')`,[fromDate,toDate])).rows[0].n);
  const courtUtilizationRatePct =
    totalAvailableCourtHours > 0
      ? Number(((occupiedCourtHours / totalAvailableCourtHours) * 100).toFixed(1))
      : 0;

  const failedJobsRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM background_jobs WHERE status IN ('FAILED_RETRYABLE', 'DEAD_LETTER')`
  );
  const failedJobsCount = Number(failedJobsRes.rows[0]?.cnt || '0');

  return {
    fromDate,
    toDate,
    confirmedBookingsCount,
    upcomingBookingsCount,
    grossPaidAmountVnd,
    succeededRefundAmountVnd,
    netCollectedRevenueVnd,
    pendingRefundsCount,
    pendingRefundsAmountVnd,
    courtUtilizationRatePct,
    totalAvailableCourtHours,
    occupiedCourtHours,
    failedJobsCount,
  };
}

export interface LiveCourtMonitorItem {
  courtId: string;
  courtCode: string;
  courtName: string;
  courtStatus: 'ACTIVE' | 'INACTIVE';
  slotStatus: 'AVAILABLE' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'HOLD' | 'BLOCKED';
  booking: BookingRecord | null;
  blockReason: string | null;
  remainingMinutes: number | null;
  isLateCheckIn: boolean;
}

export interface LiveCourtsMonitorSummary {
  dateStr: string;
  selectedHour: number;
  currentVietnamHour: number;
  courts: LiveCourtMonitorItem[];
  counts: {
    available: number;
    playing: number;
    waitingCheckIn: number;
    completed: number;
    blocked: number;
  };
}

/**
 * 1. BẢNG THEO DÕI TRẠNG THÁI 18 SÂN THỜI GIAN THỰC (LIVE COURT MONITOR)
 */
export async function getLiveCourtsMonitorData(
  filter: { date?: string; hour?: number } = {},
  db: DatabaseClient = getDb()
): Promise<LiveCourtsMonitorSummary> {
  await expireOverdueHolds(db);

  const now = getServerNow();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const todayStr = vnTime.toISOString().slice(0, 10);
  const currentVnHour = vnTime.getUTCHours();
  const currentVnMin = vnTime.getUTCMinutes();

  const dateStr = filter.date && isValidDateString(filter.date) ? filter.date : todayStr;
  let selectedHour =
    filter.hour !== undefined && Number.isInteger(Number(filter.hour))
      ? Number(filter.hour)
      : Math.min(23, Math.max(5, currentVnHour));
  if (selectedHour < 5 || selectedHour > 23) selectedHour = Math.min(23, Math.max(5, currentVnHour));

  const courtsRes = await db.query<{
    id: string;
    code: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    sort_order: number;
  }>(`SELECT id, code, name, status, sort_order FROM courts ORDER BY sort_order ASC`);

  const bookingsRes = await db.query<BookingRecord>(
    `SELECT * FROM bookings
     WHERE booking_date = $1 AND start_hour <= $2 AND end_hour > $2 AND NOT is_ticket_component
       AND (booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
            OR (booking_status = 'HOLD' AND hold_expires_at > $3))`,
    [dateStr, selectedHour, now.toISOString()]
  );
  const bkgByCourt = new Map<string, BookingRecord>();
  for (const b of bookingsRes.rows) {
    bkgByCourt.set(b.court_id, b);
  }

  const blocksRes = await db.query<{ court_id: string; reason: string; block_type?: string }>(
    `SELECT court_id, reason, block_type FROM court_blocks
     WHERE block_date = $1 AND start_hour = $2 AND is_active = TRUE`,
    [dateStr, selectedHour]
  );
  const blockByCourt = new Map<string, { reason: string; blockType: string }>();
  for (const bl of blocksRes.rows) {
    blockByCourt.set(bl.court_id, { reason: bl.reason, blockType: bl.block_type || 'MAINTENANCE' });
  }

  const counts = {
    available: 0,
    playing: 0,
    waitingCheckIn: 0,
    completed: 0,
    blocked: 0,
  };

  const items: LiveCourtMonitorItem[] = courtsRes.rows.map((c) => {
    const bkg = bkgByCourt.get(c.id) || null;
    const blockInfo = blockByCourt.get(c.id) || null;
    const blockReason = blockInfo?.reason || null;
    let slotStatus: LiveCourtMonitorItem['slotStatus'] = 'AVAILABLE';
    let remainingMinutes: number | null = null;
    let isLateCheckIn = false;

    if (c.status === 'INACTIVE') {
      slotStatus = 'BLOCKED';
      counts.blocked++;
    } else if (blockInfo) {
      if (blockInfo.blockType === 'FIXED_MONTHLY') {
        slotStatus = 'CONFIRMED';
        counts.waitingCheckIn++;
      } else {
        slotStatus = 'BLOCKED';
        counts.blocked++;
      }
    } else if (bkg) {
      if (bkg.booking_status === 'CHECKED_IN') {
        slotStatus = 'CHECKED_IN';
        counts.playing++;
        if (dateStr === todayStr && selectedHour === currentVnHour) {
          remainingMinutes = Math.max(0, 60 - currentVnMin);
        } else if (dateStr === todayStr && selectedHour > currentVnHour) {
          remainingMinutes = 60;
        }
      } else if (bkg.booking_status === 'CONFIRMED') {
        slotStatus = 'CONFIRMED';
        counts.waitingCheckIn++;
        if (dateStr === todayStr && (selectedHour < currentVnHour || (selectedHour === currentVnHour && currentVnMin >= 10))) {
          isLateCheckIn = true;
        }
      } else if (bkg.booking_status === 'COMPLETED') {
        slotStatus = 'COMPLETED';
        counts.completed++;
      } else if (bkg.booking_status === 'HOLD') {
        slotStatus = 'HOLD';
        counts.waitingCheckIn++;
      }
    } else {
      counts.available++;
    }

    return {
      courtId: c.id,
      courtCode: c.code,
      courtName: c.name,
      courtStatus: c.status,
      slotStatus,
      booking: bkg,
      blockReason: blockReason || (c.status === 'INACTIVE' ? 'Sân đang tạm ngưng hoạt động' : null),
      remainingMinutes,
      isLateCheckIn,
    };
  });

  return {
    dateStr,
    selectedHour,
    currentVietnamHour: currentVnHour,
    courts: items,
    counts,
  };
}

export interface DetailedRevenueBreakdown {
  fromDate: string;
  toDate: string;
  courtRentalRevenueVnd: number;
  equipmentAndPosRevenueVnd: number;
  totalDiscountVnd: number;
  walkInPosCollectedVnd: number;
  onlinePaidVnd: number;
  depositHoldingVnd: number;
  depositRefundedVnd: number;
  totalCheckInCount: number;
  totalWalkInCount: number;
  staffPerformance: Array<{
    userId: string;
    fullName: string;
    role: string;
    checkInCount: number;
    completedCount: number;
    depositRefundedCount: number;
    auditActionCount: number;
  }>;
}

/**
 * 2. BÁO CÁO PHÂN RÃ DOANH THU CHI TIẾT & HIỆU SUẤT NHÂN SỰ TRỰC QUẦY
 */
export async function getDetailedRevenueAndShiftMetrics(
  filter: { fromDate?: string; toDate?: string } = {},
  db: DatabaseClient = getDb()
): Promise<DetailedRevenueBreakdown> {
  const now = getServerNow();
  const todayStr = toVietnamDateString(now);
  const fromDate = filter.fromDate && isValidDateString(filter.fromDate) ? filter.fromDate : todayStr;
  const toDate = filter.toDate && isValidDateString(filter.toDate) && filter.toDate >= fromDate ? filter.toDate : fromDate;

  const bkgAgg = await db.query<{
    court_rev: string;
    service_rev: string;
    discount_total: string;
    deposit_holding: string;
    deposit_refunded: string;
    checkin_cnt: string;
    walkin_cnt: string;
    walkin_rev: string;
    online_rev: string;
  }>(
    `SELECT
       COALESCE(SUM(quoted_price_vnd), 0)::text AS court_rev,
       COALESCE(SUM(service_fee_vnd), 0)::text AS service_rev,
       COALESCE(SUM(COALESCE(discount_amount_vnd, 0) + COALESCE(member_discount_vnd, 0)), 0)::text AS discount_total,
       COALESCE(SUM(CASE WHEN COALESCE(equipment_deposit_vnd, 0) > 0 AND COALESCE(deposit_refunded, FALSE) = FALSE THEN equipment_deposit_vnd ELSE 0 END), 0)::text AS deposit_holding,
       COALESCE(SUM(CASE WHEN COALESCE(equipment_deposit_vnd, 0) > 0 AND COALESCE(deposit_refunded, FALSE) = TRUE THEN equipment_deposit_vnd ELSE 0 END), 0)::text AS deposit_refunded,
       COUNT(CASE WHEN booking_status IN ('CHECKED_IN', 'COMPLETED') THEN 1 END)::text AS checkin_cnt,
       COUNT(CASE WHEN notes LIKE '%Walk-in POS%' THEN 1 END)::text AS walkin_cnt,
       COALESCE(SUM(CASE WHEN notes LIKE '%Walk-in POS%' THEN total_amount_vnd ELSE 0 END), 0)::text AS walkin_rev,
       COALESCE(SUM(CASE WHEN notes IS NULL OR notes NOT LIKE '%Walk-in POS%' THEN total_amount_vnd ELSE 0 END), 0)::text AS online_rev
     FROM bookings
     WHERE NOT is_ticket_component AND booking_date >= $1 AND booking_date <= $2
       AND booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
    [fromDate, toDate]
  );

  const row = bkgAgg.rows[0];

  const staffRes = await db.query<{
    id: string;
    full_name: string;
    role: string;
    checkin_cnt: string;
    completed_cnt: string;
    refund_cnt: string;
    audit_cnt: string;
  }>(
    `SELECT
       u.id,
       u.full_name,
       u.role,
       (SELECT COUNT(*)::text FROM bookings b WHERE NOT b.is_ticket_component AND b.checked_in_by = u.id AND b.booking_date >= $1 AND b.booking_date <= $2) AS checkin_cnt,
       (SELECT COUNT(*)::text FROM bookings b WHERE NOT b.is_ticket_component AND b.completed_by = u.id AND b.booking_date >= $1 AND b.booking_date <= $2) AS completed_cnt,
       (SELECT COUNT(*)::text FROM bookings b WHERE b.deposit_refunded_by = u.id AND b.booking_date >= $1 AND b.booking_date <= $2) AS refund_cnt,
       (SELECT COUNT(*)::text FROM admin_audit_logs a WHERE a.actor_user_id = u.id) AS audit_cnt
     FROM users u
     WHERE u.role IN ('ADMIN', 'STAFF')
     ORDER BY u.role ASC, u.full_name ASC`,
    [fromDate, toDate]
  );

  return {
    fromDate,
    toDate,
    courtRentalRevenueVnd: Number(row?.court_rev || '0'),
    equipmentAndPosRevenueVnd: Number(row?.service_rev || '0'),
    totalDiscountVnd: Number(row?.discount_total || '0'),
    walkInPosCollectedVnd: Number(row?.walkin_rev || '0'),
    onlinePaidVnd: Number(row?.online_rev || '0'),
    depositHoldingVnd: Number(row?.deposit_holding || '0'),
    depositRefundedVnd: Number(row?.deposit_refunded || '0'),
    totalCheckInCount: Number(row?.checkin_cnt || '0'),
    totalWalkInCount: Number(row?.walkin_cnt || '0'),
    staffPerformance: staffRes.rows.map((s) => ({
      userId: s.id,
      fullName: s.full_name,
      role: s.role,
      checkInCount: Number(s.checkin_cnt || '0'),
      completedCount: Number(s.completed_cnt || '0'),
      depositRefundedCount: Number(s.refund_cnt || '0'),
      auditActionCount: Number(s.audit_cnt || '0'),
    })),
  };
}

export interface ShiftHandoverRecord {
  id: string;
  shift_date: string;
  shift_name: string;
  staff_user_id: string | null;
  staff_name_snapshot: string;
  total_checkin_count: number;
  walkin_collected_vnd: number;
  pos_addon_collected_vnd: number;
  deposit_holding_vnd: number;
  deposit_refunded_vnd: number;
  cash_in_drawer_vnd: number;
  handover_note: string | null;
  status: 'SUBMITTED' | 'VERIFIED';
  verified_by: string | null;
  verified_at: string | Date | null;
  created_at: string | Date;
}

export async function listShiftHandovers(
  limit = 20,
  db: DatabaseClient = getDb()
): Promise<ShiftHandoverRecord[]> {
  const res = await db.query<ShiftHandoverRecord>(
    `SELECT * FROM shift_handovers ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function createShiftHandover(
  actor: SessionContext,
  input: {
    shiftDate?: string;
    shiftName: string;
    cashInDrawerVnd: number;
    handoverNote?: string;
  },
  db: DatabaseClient = getDb()
): Promise<ShiftHandoverRecord> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ nhân sự vận hành hoặc quản trị viên mới có quyền lập biên bản chốt ca.',
    });
  }

  const now = getServerNow();
  const shiftDate = input.shiftDate && isValidDateString(input.shiftDate) ? input.shiftDate : toVietnamDateString(now);
  const shiftName = (input.shiftName || 'CA_NGAY').trim();
  const cashInDrawerVnd = Math.max(0, Math.floor(Number(input.cashInDrawerVnd) || 0));
  const detail = await getDetailedRevenueAndShiftMetrics({ fromDate: shiftDate, toDate: shiftDate }, db);

  const id = `shf-${crypto.randomUUID()}`;
  await db.query(
    `INSERT INTO shift_handovers (
      id, shift_date, shift_name, staff_user_id, staff_name_snapshot,
      total_checkin_count, walkin_collected_vnd, pos_addon_collected_vnd,
      deposit_holding_vnd, deposit_refunded_vnd, cash_in_drawer_vnd,
      handover_note, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SUBMITTED', $13)`,
    [
      id,
      shiftDate,
      shiftName,
      actor.user.id,
      actor.user.full_name,
      detail.totalCheckInCount,
      detail.walkInPosCollectedVnd,
      detail.equipmentAndPosRevenueVnd,
      detail.depositHoldingVnd,
      detail.depositRefundedVnd,
      cashInDrawerVnd,
      (input.handoverNote || '').trim() || null,
      now.toISOString(),
    ]
  );

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
    ) VALUES ($1, $2, $3, 'SHIFT_HANDOVER_SUBMITTED', 'SHIFT', $4, $5, NULL, $6, $7)`,
    [
      `aud-${crypto.randomUUID()}`,
      actor.user.id,
      actor.user.role,
      id,
      `Nhân sự ${actor.user.full_name} nộp biên bản chốt ca ${shiftName} ngày ${shiftDate} — Tiền mặt tại két: ${cashInDrawerVnd.toLocaleString('vi-VN')} ₫`,
      JSON.stringify({ shiftDate, shiftName, cashInDrawerVnd }),
      now.toISOString(),
    ]
  );

  const created = await db.query<ShiftHandoverRecord>(`SELECT * FROM shift_handovers WHERE id = $1`, [id]);
  return created.rows[0];
}

export async function verifyShiftHandover(
  adminActor: SessionContext,
  handoverId: string,
  db: DatabaseClient = getDb()
): Promise<ShiftHandoverRecord> {
  if (adminActor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ Quản trị viên (Admin) mới có quyền xác nhận duyệt biên bản bàn giao ca.',
    });
  }

  const now = getServerNow();
  await db.query(
    `UPDATE shift_handovers
     SET status = 'VERIFIED',
         verified_by = $1,
         verified_at = $2
     WHERE id = $3`,
    [adminActor.user.id, now.toISOString(), handoverId]
  );

  const updated = await db.query<ShiftHandoverRecord>(`SELECT * FROM shift_handovers WHERE id = $1`, [handoverId]);
  if (updated.rows.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy biên bản bàn giao ca.',
    });
  }

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
    ) VALUES ($1, $2, $3, 'SHIFT_HANDOVER_VERIFIED', 'SHIFT', $4, $5, NULL, $6, $7)`,
    [
      `aud-${crypto.randomUUID()}`,
      adminActor.user.id,
      adminActor.user.role,
      handoverId,
      `Admin ${adminActor.user.full_name} đã đối soát và duyệt biên bản chốt ca của ${updated.rows[0].staff_name_snapshot}`,
      JSON.stringify({ status: 'VERIFIED' }),
      now.toISOString(),
    ]
  );

  return updated.rows[0];
}

/**
 * 3. XUẤT BÁO CÁO KẾ TOÁN CSV / EXCEL (UTF-8 BOM MỞ TRỰC TIẾP TRÊN EXCEL)
 */
export async function generateBookingsCsvExport(
  filter: { fromDate?: string; toDate?: string } = {},
  db: DatabaseClient = getDb()
): Promise<{ filename: string; csvContent: string }> {
  const now = getServerNow();
  const todayStr = toVietnamDateString(now);
  const fromDate = filter.fromDate && isValidDateString(filter.fromDate) ? filter.fromDate : '2026-01-01';
  const toDate = filter.toDate && isValidDateString(filter.toDate) ? filter.toDate : '2026-12-31';

  const res = await db.query<BookingRecord>(
    `SELECT * FROM bookings
     WHERE NOT is_ticket_component AND booking_date >= $1 AND booking_date <= $2
     ORDER BY booking_date DESC, start_hour ASC, created_at DESC`,
    [fromDate, toDate]
  );

  const escapeCsvCell = (val: unknown): string => {
    const str = String(val ?? '').replace(/\r?\n/g, ' ');
    if (str.includes(',') || str.includes('"') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Mã Đơn',
    'Ngày Chơi',
    'Khung Giờ',
    'Sân',
    'Khách Hàng',
    'Số Điện Thoại',
    'Tiền Sân (VNĐ)',
    'Phụ Kiện & Nước Uống (VNĐ)',
    'Giảm Giá Coupon/VIP (VNĐ)',
    'Mã Coupon',
    'Tổng Thanh Toán (VNĐ)',
    'Dụng Cụ Thuê & Mua Kèm',
    'Tiền Cọc Dụng Cụ (VNĐ)',
    'Trạng Thái Cọc',
    'Trạng Thái Đơn',
    'Trạng Thái Thanh Toán',
    'Ghi Chú Quầy',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const b of res.rows) {
    const discountTotal = (b.discount_amount_vnd || 0) + (b.member_discount_vnd || 0);
    const depositStat =
      (b.equipment_deposit_vnd || 0) > 0
        ? b.deposit_refunded
          ? 'Đã hoàn cọc'
          : 'Đang giữ cọc tại quầy'
        : 'Không có cọc';
    const row = [
      b.booking_code,
      b.booking_date,
      formatSlotRange(b.start_hour, b.end_hour),
      b.court_name_snapshot,
      b.contact_name,
      b.contact_phone,
      b.quoted_price_vnd,
      b.service_fee_vnd || 0,
      discountTotal,
      b.coupon_code_snapshot || '',
      b.total_amount_vnd,
      b.equipment_rented_summary || '',
      b.equipment_deposit_vnd || 0,
      depositStat,
      b.booking_status,
      b.payment_status,
      b.counter_note || b.notes || '',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }

  // Thêm UTF-8 BOM (\uFEFF) để Microsoft Excel mở trực tiếp hiển thị chuẩn tiếng Việt
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const filename = `BaoCao_BeBadminton_${fromDate}_${toDate || todayStr}.csv`;
  return { filename, csvContent };
}

/**
 * 4. NHẬT KÝ HOẠT ĐỘNG NHÂN SỰ (STAFF AUDIT LOGS)
 */
export interface StaffAuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  summary_vi: string;
  created_at: string | Date;
}

export async function listStaffAuditLogs(
  filter: { role?: string; actionKeyword?: string; limit?: number } = {},
  db: DatabaseClient = getDb()
): Promise<StaffAuditLogEntry[]> {
  const limit = Math.min(200, Math.max(10, filter.limit || 50));
  const params: unknown[] = [];
  const conds: string[] = [];

  if (filter.role && (filter.role === 'ADMIN' || filter.role === 'STAFF')) {
    params.push(filter.role);
    conds.push(`a.actor_role = $${params.length}`);
  }
  if (filter.actionKeyword && filter.actionKeyword.trim()) {
    params.push(`%${filter.actionKeyword.trim().toUpperCase()}%`);
    conds.push(`(UPPER(a.action) LIKE $${params.length} OR UPPER(a.summary_vi) LIKE $${params.length})`);
  }

  params.push(limit);
  const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

  const res = await db.query<{
    id: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_role: string;
    action: string;
    target_type: string;
    target_id: string;
    summary_vi: string;
    created_at: string | Date;
  }>(
    `SELECT
       a.id,
       a.actor_user_id,
       COALESCE(u.full_name, 'Hệ thống / Quản trị') AS actor_name,
       a.actor_role,
       a.action,
       a.target_type,
       a.target_id,
       a.summary_vi,
       a.created_at
     FROM admin_audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows.map((r) => ({
    ...r,
    actor_name: r.actor_name || 'Hệ thống',
  }));
}

/**
 * 5. QUẢN LÝ ĐÁNH GIÁ KHÁCH HÀNG (CUSTOMER REVIEWS MODERATION)
 */
export interface CustomerReviewRecord {
  id: string;
  author_name: string;
  author_initials: string;
  author_avatar: string | null;
  profile_url: string | null;
  rating: number;
  comment_text: string;
  owner_reply: string | null;
  owner_replied_at: string | Date | null;
  source_label: string;
  is_visible: boolean;
  created_at: string | Date;
}

export async function listCustomerReviews(
  options: { visibleOnly?: boolean } = {},
  db: DatabaseClient = getDb()
): Promise<CustomerReviewRecord[]> {
  try {
    const whereClause = options.visibleOnly ? `WHERE is_visible = TRUE` : '';
    const res = await db.query<CustomerReviewRecord>(
      `SELECT * FROM customer_reviews ${whereClause} ORDER BY created_at DESC`
    );
    return res.rows;
  } catch {
    return [];
  }
}

export async function createCustomerReview(
  actor: SessionContext,
  input: {
    authorName: string;
    rating: number;
    commentText: string;
    ownerReply?: string;
    sourceLabel?: string;
  },
  db: DatabaseClient = getDb()
): Promise<CustomerReviewRecord> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ Quản trị viên mới có quyền thêm đánh giá tiêu biểu.',
    });
  }

  const authorName = (input.authorName || '').trim();
  const commentText = (input.commentText || '').trim();
  if (!authorName || !commentText) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      publicMessage: 'Vui lòng nhập tên khách hàng và nội dung đánh giá.',
    });
  }

  const words = authorName.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
      : authorName.slice(0, 2).toUpperCase();
  const rating = Math.min(5, Math.max(1, Math.floor(Number(input.rating) || 5)));
  const ownerReply = (input.ownerReply || '').trim() || null;
  const now = getServerNow();
  const id = `rev-${crypto.randomUUID()}`;

  await db.query(
    `INSERT INTO customer_reviews (
      id, author_name, author_initials, rating, comment_text, owner_reply, owner_replied_at, source_label, is_visible, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
    [
      id,
      authorName,
      initials,
      rating,
      commentText,
      ownerReply,
      ownerReply ? now.toISOString() : null,
      (input.sourceLabel || 'Hội viên Be Badminton').trim(),
      now.toISOString(),
    ]
  );

  const created = await db.query<CustomerReviewRecord>(`SELECT * FROM customer_reviews WHERE id = $1`, [id]);
  return created.rows[0];
}

export async function replyToCustomerReview(
  actor: SessionContext,
  reviewId: string,
  replyText: string,
  db: DatabaseClient = getDb()
): Promise<CustomerReviewRecord> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ Quản trị viên mới có quyền phản hồi đánh giá khách hàng.',
    });
  }

  const cleanReply = (replyText || '').trim();
  const now = getServerNow();
  await db.query(
    `UPDATE customer_reviews
     SET owner_reply = $1,
         owner_replied_at = $2
     WHERE id = $3`,
    [cleanReply || null, cleanReply ? now.toISOString() : null, reviewId]
  );

  const updated = await db.query<CustomerReviewRecord>(`SELECT * FROM customer_reviews WHERE id = $1`, [reviewId]);
  if (updated.rows.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy đánh giá.',
    });
  }
  return updated.rows[0];
}

export async function toggleCustomerReviewVisibility(
  actor: SessionContext,
  reviewId: string,
  db: DatabaseClient = getDb()
): Promise<CustomerReviewRecord> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ Quản trị viên mới có quyền ẩn/hiện đánh giá.',
    });
  }

  await db.query(`UPDATE customer_reviews SET is_visible = NOT is_visible WHERE id = $1`, [reviewId]);
  const updated = await db.query<CustomerReviewRecord>(`SELECT * FROM customer_reviews WHERE id = $1`, [reviewId]);
  if (updated.rows.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy đánh giá.',
    });
  }
  return updated.rows[0];
}

export async function deleteCustomerReview(
  actor: SessionContext,
  reviewId: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ Quản trị viên mới có quyền xóa đánh giá.',
    });
  }
  await db.query(`DELETE FROM customer_reviews WHERE id = $1`, [reviewId]);
}
