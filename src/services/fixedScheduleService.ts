import crypto from 'node:crypto';
import { DatabaseClient, getDb } from '../db/client.js';
import { SessionContext } from './authService.js';
import { AppError } from '../utils/errors.js';
import { addDaysVietnam, formatSlotRange, getServerNow, isValidDateString, toVietnamDateString } from '../utils/time.js';

export const WEEKDAY_LABELS: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
export const OPEN_HOUR = 5;
export const CLOSE_HOUR = 24;
export const DEFAULT_FIXED_WEEKS = 4;

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
  weekdays: string | null;
  start_hour: number | null;
  duration_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  court_id: string | null;
  locked_slot_count: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface FixedScheduleInput {
  courtId: string;
  weekdays: number[];
  startHour: number;
  durationHours: number;
  startDate: string;
  endDate?: string;
  durationMonths?: number;
  note?: string | null;
}

export interface FixedSlot {
  date: string;
  hour: number;
}

export interface FixedSlotConflict extends FixedSlot {
  reason: string;
}

/** 1 = Thứ 2 … 7 = Chủ nhật */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function parseWeekdays(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const set = new Set<number>();
  for (const v of list) {
    const n = Number(String(v).trim());
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function formatWeekdays(days: number[]): string {
  return days.map((d) => WEEKDAY_LABELS[d]).join(', ');
}

export function defaultFixedEndDate(startDate: string): string {
  return addDaysVietnam(startDate, DEFAULT_FIXED_WEEKS * 7 - 1);
}

export function validateFixedSchedule(input: Omit<FixedScheduleInput, 'courtId' | 'endDate'> & { endDate?: string }): void {
  const fail = (msg: string) => {
    throw new AppError({ code: 'INVALID_FIXED_SCHEDULE', statusCode: 400, publicMessage: msg });
  };
  if (input.weekdays.length === 0) fail('Vui lòng chọn ít nhất một thứ trong tuần.');
  if (!Number.isInteger(input.startHour) || input.startHour < OPEN_HOUR || input.startHour >= CLOSE_HOUR) {
    fail('Giờ bắt đầu nằm ngoài giờ mở cửa (05:00 – 24:00).');
  }
  if (!Number.isInteger(input.durationHours) || input.durationHours < 1 || input.durationHours > 4) {
    fail('Số giờ chơi mỗi buổi phải từ 1 đến 4 giờ.');
  }
  if (input.startHour + input.durationHours > CLOSE_HOUR) fail('Khung giờ vượt quá giờ đóng cửa 24:00.');
  if (!isValidDateString(input.startDate)) fail('Ngày bắt đầu không hợp lệ.');
  if (input.endDate !== undefined) {
    if (!isValidDateString(input.endDate)) fail('Ngày kết thúc không hợp lệ.');
    if (input.endDate < input.startDate) fail('Ngày kết thúc phải sau ngày bắt đầu.');
    if (input.endDate > addDaysVietnam(input.startDate, 120)) fail('Mỗi lần chốt tối đa 4 tháng.');
  }
}

export function expandFixedSlots(input: Pick<FixedScheduleInput, 'weekdays' | 'startHour' | 'durationHours' | 'startDate'> & { endDate?: string; durationMonths?: number }): FixedSlot[] {
  const slots: FixedSlot[] = [];
  const days = new Set(input.weekdays);
  const endDate = input.endDate || addDaysVietnam(input.startDate, Math.max(1, input.durationMonths || 1) * 30);
  for (let d = input.startDate; d <= endDate; d = addDaysVietnam(d, 1)) {
    if (!days.has(isoWeekday(d))) continue;
    for (let h = input.startHour; h < input.startHour + input.durationHours; h++) {
      slots.push({ date: d, hour: h });
    }
  }
  return slots;
}

async function findConflicts(db: DatabaseClient, courtId: string, slots: FixedSlot[], requestId: string): Promise<FixedSlotConflict[]> {
  if (slots.length === 0) return [];
  const dates = [...new Set(slots.map((s) => s.date))];
  const bookingsRes = await db.query<{ booking_date: string; start_hour: number; booking_code: string }>(
    `SELECT booking_date, start_hour, booking_code FROM bookings
     WHERE court_id = $1 AND booking_date = ANY($2::text[])
       AND booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
    [courtId, dates]
  );
  const blocksRes = await db.query<{ block_date: string; start_hour: number; reason: string; fixed_request_id: string | null }>(
    `SELECT block_date, start_hour, reason, fixed_request_id FROM court_blocks
     WHERE court_id = $1 AND block_date = ANY($2::text[]) AND is_active = TRUE`,
    [courtId, dates]
  );
  const taken = new Map<string, string>();
  for (const b of bookingsRes.rows) taken.set(`${b.booking_date}:${b.start_hour}`, `Đã có đơn ${b.booking_code}`);
  for (const bl of blocksRes.rows) {
    if (bl.fixed_request_id === requestId) continue;
    taken.set(`${bl.block_date}:${bl.start_hour}`, bl.reason);
  }
  return slots
    .filter((s) => taken.has(`${s.date}:${s.hour}`))
    .map((s) => ({ ...s, reason: taken.get(`${s.date}:${s.hour}`)! }));
}

function assertStaff(actor: SessionContext) {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Bạn không có quyền xếp lịch cố định.' });
  }
}

async function loadRequest(db: DatabaseClient, requestId: string): Promise<FixedBookingRequestRecord> {
  const res = await db.query<FixedBookingRequestRecord>(`SELECT * FROM fixed_booking_requests WHERE id = $1`, [requestId]);
  if (!res.rows[0]) {
    throw new AppError({ code: 'FIXED_REQUEST_NOT_FOUND', statusCode: 404, publicMessage: 'Không tìm thấy yêu cầu đặt lịch cố định.' });
  }
  return res.rows[0];
}

/** Xem trước số ô sẽ khóa và các ô bị trùng, không ghi dữ liệu. */
export async function previewFixedSchedule(
  requestId: string,
  input: FixedScheduleInput,
  db: DatabaseClient = getDb()
): Promise<{ slots: FixedSlot[]; conflicts: FixedSlotConflict[] }> {
  validateFixedSchedule(input);
  const slots = expandFixedSlots(input);
  const conflicts = await findConflicts(db, input.courtId, slots, requestId);
  return { slots, conflicts };
}

/**
 * Chốt lịch cố định: tạo court_blocks loại FIXED_MONTHLY cho mọi ô trống.
 * Có ô trùng mà chưa cho phép bỏ qua thì không ghi gì, chỉ trả về danh sách trùng để admin quyết định.
 */
export async function confirmFixedSchedule(
  actor: SessionContext,
  requestId: string,
  input: FixedScheduleInput & { skipConflicts?: boolean },
  db: DatabaseClient = getDb()
): Promise<{ locked: number; conflicts: FixedSlotConflict[]; applied: boolean }> {
  assertStaff(actor);
  validateFixedSchedule(input);
  const today = toVietnamDateString(getServerNow());
  if (input.startDate < today) {
    throw new AppError({ code: 'INVALID_FIXED_SCHEDULE', statusCode: 400, publicMessage: 'Ngày bắt đầu không được ở quá khứ.' });
  }
  const courtRes = await db.query<{ id: string; name: string }>(`SELECT id, name FROM courts WHERE id = $1`, [input.courtId]);
  if (!courtRes.rows[0]) {
    throw new AppError({ code: 'COURT_NOT_FOUND', statusCode: 404, publicMessage: 'Không tìm thấy sân đã chọn.' });
  }
  const court = courtRes.rows[0];
  const req = await loadRequest(db, requestId);

  return await db.withTransaction(async (tx) => {
    // Chốt lại: nhả các ô tương lai của lần chốt trước rồi khóa theo lịch mới
    await tx.query(
      `UPDATE court_blocks SET is_active = FALSE, released_at = NOW()
       WHERE fixed_request_id = $1 AND is_active = TRUE AND block_date >= $2`,
      [requestId, today]
    );

    const effectiveEndDate = input.endDate || addDaysVietnam(input.startDate, Math.max(1, input.durationMonths || 1) * 30);
    const slots = expandFixedSlots({ ...input, endDate: effectiveEndDate });
    const conflicts = await findConflicts(tx as unknown as DatabaseClient, input.courtId, slots, requestId);
    if (conflicts.length > 0 && !input.skipConflicts) {
      throw new FixedScheduleConflictError(conflicts);
    }
    const conflictKeys = new Set(conflicts.map((c) => `${c.date}:${c.hour}`));
    const customer = req.customer_name || req.contact_phone;
    let locked = 0;
    for (const s of slots) {
      if (conflictKeys.has(`${s.date}:${s.hour}`)) continue;
      await tx.query(
        `INSERT INTO court_blocks (id, court_id, block_date, start_hour, end_hour, reason, created_by, is_active, created_at, block_type, fixed_request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), 'FIXED_MONTHLY', $8)`,
        [`blk-${crypto.randomUUID()}`, input.courtId, s.date, s.hour, s.hour + 1, `Cố định tháng · ${customer}`, actor.user.id, requestId]
      );
      locked++;
    }

    const days = formatWeekdays(input.weekdays);
    const hourLabel = formatSlotRange(input.startHour, input.startHour + input.durationHours);
    await tx.query(
      `UPDATE fixed_booking_requests
       SET status = 'CONFIRMED', weekdays = $1, start_hour = $2, duration_hours = $3, start_date = $4, end_date = $5,
           court_id = $6, locked_slot_count = $7, fixed_days = $8, fixed_hour = $9, fixed_court = $10,
           admin_note = COALESCE($11, admin_note), handled_by = $12, updated_at = NOW()
       WHERE id = $13`,
      [
        input.weekdays.join(','),
        input.startHour,
        input.durationHours,
        input.startDate,
        effectiveEndDate,
        input.courtId,
        locked,
        days,
        hourLabel,
        court.name,
        input.note?.trim() || null,
        actor.user.id,
        requestId,
      ]
    );

    await tx.query(
      `INSERT INTO admin_audit_logs (id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, created_at)
       VALUES ($1, $2, $3, 'CONFIRM_FIXED_SCHEDULE', 'FIXED_BOOKING_REQUEST', $4, $5, NOW())`,
      [
        `audit-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        requestId,
        `Chốt lịch cố định ${req.request_code}: ${court.name}, ${days}, ${hourLabel}, ${input.startDate} → ${input.endDate}. Khóa ${locked} ô, bỏ qua ${conflicts.length} ô trùng.`,
      ]
    );

    return { locked, conflicts, applied: true };
  });
}

/** Hủy chốt: nhả các ô từ hôm nay trở đi, giữ lịch sử các ngày đã qua. */
export async function releaseFixedSchedule(
  actor: SessionContext,
  requestId: string,
  reasonOrDb?: string | DatabaseClient,
  customDb?: DatabaseClient
): Promise<{ released: number }> {
  assertStaff(actor);
  const db = (typeof reasonOrDb === 'object' && reasonOrDb !== null ? reasonOrDb : customDb) || getDb();
  const req = await loadRequest(db, requestId);
  const today = toVietnamDateString(getServerNow());
  return await db.withTransaction(async (tx) => {
    const res = await tx.query(
      `UPDATE court_blocks SET is_active = FALSE, released_at = NOW()
       WHERE fixed_request_id = $1 AND is_active = TRUE AND block_date >= $2
       RETURNING id`,
      [requestId, today]
    );
    await tx.query(
      `UPDATE fixed_booking_requests SET status = 'CANCELLED', locked_slot_count = 0, handled_by = $1, updated_at = NOW() WHERE id = $2`,
      [actor.user.id, requestId]
    );
    await tx.query(
      `INSERT INTO admin_audit_logs (id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, created_at)
       VALUES ($1, $2, $3, 'RELEASE_FIXED_SCHEDULE', 'FIXED_BOOKING_REQUEST', $4, $5, NOW())`,
      [
        `audit-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        requestId,
        `Hủy lịch cố định ${req.request_code}, nhả ${res.rows.length} ô từ ${today}.`,
      ]
    );
    return { released: res.rows.length };
  });
}

export class FixedScheduleConflictError extends AppError {
  public readonly conflicts: FixedSlotConflict[];
  constructor(conflicts: FixedSlotConflict[]) {
    super({
      code: 'FIXED_SCHEDULE_CONFLICT',
      statusCode: 409,
      publicMessage: `Có ${conflicts.length} ô đã có người đặt hoặc đang bảo trì.`,
    });
    this.conflicts = conflicts;
  }
}
