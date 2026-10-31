import { DatabaseClient, getDb } from '../db/client.js';
import { getServerNow } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

export interface CouponRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_order_amount_vnd: number;
  max_discount_amount_vnd: number | null;
  usage_limit: number | null;
  max_uses_per_user: number | null;
  is_public_suggested: boolean;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface CreateCouponInput {
  code: string;
  title: string;
  description?: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minOrderAmountVnd?: number;
  maxDiscountAmountVnd?: number | null;
  usageLimit?: number | null;
  maxUsesPerUser?: number | null;
  isPublicSuggested?: boolean;
  validFrom?: string;
  validUntil?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface CouponValidationResult {
  valid: boolean;
  coupon?: CouponRecord;
  discountVnd: number;
  payableVnd: number;
  errorVi?: string;
}

/**
 * Chuẩn hóa mã coupon: viết hoa, bỏ khoảng trắng và ký tự đặc biệt không hợp lệ.
 */
export function normalizeCouponCode(code: string): string {
  return (code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Lấy toàn bộ danh sách coupon cho trang quản trị Admin, có thể lọc theo trạng thái.
 */
export async function listAllCoupons(
  statusFilter?: string,
  db: DatabaseClient = getDb()
): Promise<CouponRecord[]> {
  const params: any[] = [];
  let sql = `
    SELECT
      id, code, title, description, discount_type,
      discount_value::float AS discount_value,
      min_order_amount_vnd,
      max_discount_amount_vnd,
      usage_limit, max_uses_per_user, COALESCE(is_public_suggested, TRUE) AS is_public_suggested,
      used_count,
      valid_from::text AS valid_from,
      valid_until::text AS valid_until,
      status,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM coupons
  `;

  if (statusFilter === 'ACTIVE' || statusFilter === 'INACTIVE') {
    sql += ` WHERE status = $1`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY created_at DESC`;

  const res = await db.query<CouponRecord>(sql, params);
  return res.rows;
}

/**
 * Lấy danh sách các coupon đang kích hoạt, được bật gợi ý công khai và còn hiệu lực
 * để gợi ý nhanh tại mục "Voucher gợi ý cho bạn" ở trang thanh toán.
 */
export async function getActivePublicCoupons(
  limit: number = 6,
  db: DatabaseClient = getDb(),
  userId?: string | null
): Promise<CouponRecord[]> {
  const now = getServerNow().toISOString();
  const sql = `
    SELECT
      id, code, title, description, discount_type,
      discount_value::float AS discount_value,
      min_order_amount_vnd,
      max_discount_amount_vnd,
      usage_limit, max_uses_per_user, COALESCE(is_public_suggested, TRUE) AS is_public_suggested,
      used_count,
      valid_from::text AS valid_from,
      valid_until::text AS valid_until,
      status,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM coupons
    WHERE status = 'ACTIVE'
      AND COALESCE(is_public_suggested, TRUE) = TRUE
      AND valid_from <= $1
      AND (valid_until IS NULL OR valid_until >= $1)
      AND (usage_limit IS NULL OR used_count < usage_limit)
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const res = await db.query<CouponRecord>(sql, [now, limit]);
  if (!userId || res.rows.length === 0) {
    return res.rows;
  }

  // Lọc bỏ các mã mà tài khoản hiện tại đã dùng hết số lượt cho phép (max_uses_per_user)
  const filtered: CouponRecord[] = [];
  for (const cp of res.rows) {
    if (cp.max_uses_per_user !== null && cp.max_uses_per_user > 0) {
      const userUsedRes = await db.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT COALESCE((SELECT payment_group_id FROM booking_tickets WHERE id=bookings.ticket_id),id))::int AS cnt
         FROM bookings
         WHERE user_id = $1
           AND coupon_code_snapshot = $2
           AND (payment_status = 'PAID' OR booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED'))`,
        [userId, cp.code]
      );
      const userUsed = userUsedRes.rows[0]?.cnt || 0;
      if (userUsed >= cp.max_uses_per_user) {
        continue;
      }
    }
    filtered.push(cp);
  }

  return filtered;
}

/**
 * Tìm coupon theo mã code.
 */
export async function getCouponByCode(
  code: string,
  db: DatabaseClient = getDb()
): Promise<CouponRecord | null> {
  const cleanCode = normalizeCouponCode(code);
  if (!cleanCode) return null;

  const res = await db.query<CouponRecord>(
    `SELECT
      id, code, title, description, discount_type,
      discount_value::float AS discount_value,
      min_order_amount_vnd,
      max_discount_amount_vnd,
      usage_limit, max_uses_per_user, COALESCE(is_public_suggested, TRUE) AS is_public_suggested,
      used_count,
      valid_from::text AS valid_from,
      valid_until::text AS valid_until,
      status,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM coupons
    WHERE code = $1`,
    [cleanCode]
  );

  return res.rows[0] || null;
}

/**
 * Kiểm tra tính hợp lệ của mã coupon và tính số tiền được giảm giá theo đơn hàng.
 */
export async function validateAndCalculateCouponDiscount(
  code: string,
  orderAmountVnd: number,
  db: DatabaseClient = getDb(),
  userId?: string | null
): Promise<CouponValidationResult> {
  const cleanCode = normalizeCouponCode(code);
  if (!cleanCode) {
    return {
      valid: false,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: 'Vui lòng nhập mã giảm giá.',
    };
  }

  const coupon = await getCouponByCode(cleanCode, db);
  if (!coupon) {
    return {
      valid: false,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: `Mã giảm giá "${cleanCode}" không tồn tại trong hệ thống.`,
    };
  }

  if (coupon.status !== 'ACTIVE') {
    return {
      valid: false,
      coupon,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: `Mã ưu đãi "${cleanCode}" hiện đang tạm ngưng áp dụng.`,
    };
  }

  const nowMs = getServerNow().getTime();
  const validFromMs = new Date(coupon.valid_from).getTime();
  if (nowMs < validFromMs) {
    return {
      valid: false,
      coupon,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: `Mã ưu đãi "${cleanCode}" chưa đến ngày bắt đầu có hiệu lực.`,
    };
  }

  if (coupon.valid_until) {
    const validUntilMs = new Date(coupon.valid_until).getTime();
    if (nowMs > validUntilMs) {
      return {
        valid: false,
        coupon,
        discountVnd: 0,
        payableVnd: orderAmountVnd,
        errorVi: `Mã ưu đãi "${cleanCode}" đã hết hạn sử dụng.`,
      };
    }
  }

  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    return {
      valid: false,
      coupon,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: `Mã ưu đãi "${cleanCode}" đã đạt giới hạn lượt sử dụng tối đa.`,
    };
  }

  // Kiểm tra giới hạn lượt dùng trên mỗi tài khoản (max_uses_per_user)
  if (userId && coupon.max_uses_per_user !== null && coupon.max_uses_per_user > 0) {
    const userUsedRes = await db.query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT COALESCE((SELECT payment_group_id FROM booking_tickets WHERE id=bookings.ticket_id),id))::int AS cnt
       FROM bookings
       WHERE user_id = $1
         AND coupon_code_snapshot = $2
         AND (payment_status = 'PAID' OR booking_status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED'))`,
      [userId, cleanCode]
    );
    const userUsed = userUsedRes.rows[0]?.cnt || 0;
    if (userUsed >= coupon.max_uses_per_user) {
      return {
        valid: false,
        coupon,
        discountVnd: 0,
        payableVnd: orderAmountVnd,
        errorVi:
          coupon.max_uses_per_user === 1
            ? `Tài khoản của bạn đã sử dụng mã ưu đãi "${cleanCode}" trước đó (Mã chỉ áp dụng 1 lần/tài khoản).`
            : `Tài khoản của bạn đã đạt giới hạn sử dụng mã "${cleanCode}" (Tối đa ${coupon.max_uses_per_user} lần/tài khoản).`,
      };
    }
  }

  if (orderAmountVnd < coupon.min_order_amount_vnd) {
    const minFmt = coupon.min_order_amount_vnd.toLocaleString('vi-VN') + ' ₫';
    return {
      valid: false,
      coupon,
      discountVnd: 0,
      payableVnd: orderAmountVnd,
      errorVi: `Mã "${cleanCode}" chỉ áp dụng cho đơn đặt sân từ ${minFmt} trở lên.`,
    };
  }

  // Tính số tiền giảm
  let calculatedDiscount = 0;
  if (coupon.discount_type === 'PERCENT') {
    calculatedDiscount = Math.round((orderAmountVnd * coupon.discount_value) / 100);
    if (coupon.max_discount_amount_vnd !== null && coupon.max_discount_amount_vnd > 0) {
      calculatedDiscount = Math.min(calculatedDiscount, coupon.max_discount_amount_vnd);
    }
  } else {
    calculatedDiscount = Math.round(coupon.discount_value);
  }

  calculatedDiscount = Math.max(0, Math.min(orderAmountVnd, calculatedDiscount));
  const payableVnd = Math.max(0, orderAmountVnd - calculatedDiscount);

  return {
    valid: true,
    coupon,
    discountVnd: calculatedDiscount,
    payableVnd,
  };
}

/**
 * Tạo mới Coupon cho Admin.
 */
export async function createCoupon(
  input: CreateCouponInput,
  actorUserId: string,
  db: DatabaseClient = getDb()
): Promise<CouponRecord> {
  const code = normalizeCouponCode(input.code);
  if (!code || code.length < 3) {
    throw new Error('Mã giảm giá phải có ít nhất 3 ký tự (chữ hoa hoặc số).');
  }

  const existing = await getCouponByCode(code, db);
  if (existing) {
    throw new Error(`Mã giảm giá "${code}" đã tồn tại. Vui lòng chọn mã khác.`);
  }

  if (!input.title || !input.title.trim()) {
    throw new Error('Vui lòng nhập tên chương trình ưu đãi.');
  }

  if (input.discountValue <= 0) {
    throw new Error('Mức giảm giá phải lớn hơn 0.');
  }

  if (input.discountType === 'PERCENT' && input.discountValue > 100) {
    throw new Error('Mức giảm phần trăm không được vượt quá 100%.');
  }

  const id = `cp-${randomUUID().slice(0, 8)}`;
  const status = input.status || 'ACTIVE';
  const minOrderAmountVnd = Math.max(0, Number(input.minOrderAmountVnd) || 0);
  const maxDiscountAmountVnd =
    input.discountType === 'PERCENT' && input.maxDiscountAmountVnd && Number(input.maxDiscountAmountVnd) > 0
      ? Number(input.maxDiscountAmountVnd)
      : null;
  const usageLimit = input.usageLimit && Number(input.usageLimit) > 0 ? Number(input.usageLimit) : null;
  const maxUsesPerUser =
    input.maxUsesPerUser && Number(input.maxUsesPerUser) > 0 ? Number(input.maxUsesPerUser) : null;
  const isPublicSuggested = input.isPublicSuggested !== undefined ? Boolean(input.isPublicSuggested) : true;
  const validFrom = input.validFrom ? new Date(input.validFrom).toISOString() : getServerNow().toISOString();
  const validUntil = input.validUntil ? new Date(input.validUntil).toISOString() : null;

  if (validUntil && new Date(validUntil).getTime() <= new Date(validFrom).getTime()) {
    throw new Error('Ngày hết hạn phải diễn ra sau ngày bắt đầu có hiệu lực.');
  }

  const res = await db.query<CouponRecord>(
    `INSERT INTO coupons (
      id, code, title, description, discount_type, discount_value,
      min_order_amount_vnd, max_discount_amount_vnd, usage_limit, max_uses_per_user, is_public_suggested,
      used_count, valid_from, valid_until, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, NOW(), NOW())
    RETURNING
      id, code, title, description, discount_type,
      discount_value::float AS discount_value,
      min_order_amount_vnd, max_discount_amount_vnd,
      usage_limit, max_uses_per_user, COALESCE(is_public_suggested, TRUE) AS is_public_suggested,
      used_count,
      valid_from::text AS valid_from,
      valid_until::text AS valid_until,
      status, created_at::text AS created_at, updated_at::text AS updated_at`,
    [
      id,
      code,
      input.title.trim(),
      input.description ? input.description.trim() : null,
      input.discountType,
      input.discountValue,
      minOrderAmountVnd,
      maxDiscountAmountVnd,
      usageLimit,
      maxUsesPerUser,
      isPublicSuggested,
      validFrom,
      validUntil,
      status,
    ]
  );

  // Ghi nhật ký quản trị
  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, ip_address, created_at
    ) VALUES ($1, $2, 'ADMIN', 'CREATE_COUPON', 'COUPON', $3, $4, NULL, NOW())`,
    [
      `audit-${randomUUID().slice(0, 8)}`,
      actorUserId,
      id,
      `Tạo mã coupon ưu đãi mới: ${code} (${input.title}) — Giảm ${input.discountValue}${input.discountType === 'PERCENT' ? '%' : 'đ'}`,
    ]
  );

  logger.info('ADMIN_COUPON_CREATED', `Đã tạo coupon mới: ${code}`, { couponId: id, actorUserId });
  return res.rows[0];
}

/**
 * Bật/Tắt trạng thái coupon (ACTIVE / INACTIVE).
 */
export async function toggleCouponStatus(
  couponId: string,
  actorUserId: string,
  db: DatabaseClient = getDb()
): Promise<CouponRecord> {
  const current = await db.query<CouponRecord>(
    `SELECT id, code, title, status FROM coupons WHERE id = $1`,
    [couponId]
  );
  if (!current.rows[0]) {
    throw new Error('Không tìm thấy mã giảm giá cần cập nhật.');
  }

  const nextStatus = current.rows[0].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const res = await db.query<CouponRecord>(
    `UPDATE coupons
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING
       id, code, title, description, discount_type,
       discount_value::float AS discount_value,
       min_order_amount_vnd, max_discount_amount_vnd,
       usage_limit, max_uses_per_user, COALESCE(is_public_suggested, TRUE) AS is_public_suggested,
       used_count,
       valid_from::text AS valid_from,
       valid_until::text AS valid_until,
       status, created_at::text AS created_at, updated_at::text AS updated_at`,
    [nextStatus, couponId]
  );

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, ip_address, created_at
    ) VALUES ($1, $2, 'ADMIN', 'TOGGLE_COUPON_STATUS', 'COUPON', $3, $4, NULL, NOW())`,
    [
      `audit-${randomUUID().slice(0, 8)}`,
      actorUserId,
      couponId,
      `Đổi trạng thái coupon ${current.rows[0].code} sang ${nextStatus === 'ACTIVE' ? 'KÍCH HOẠT' : 'TẠM NGƯNG'}`,
    ]
  );

  return res.rows[0];
}

/**
 * Xóa coupon nếu chưa có đơn nào sử dụng (nếu đã dùng thì chuyển INACTIVE để bảo toàn lịch sử).
 */
export async function deleteCoupon(
  couponId: string,
  actorUserId: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  const current = await db.query<CouponRecord>(
    `SELECT id, code, used_count FROM coupons WHERE id = $1`,
    [couponId]
  );
  if (!current.rows[0]) {
    throw new Error('Không tìm thấy mã giảm giá cần xóa.');
  }

  if (current.rows[0].used_count > 0) {
    // Đã có lượt dùng: chuyển sang INACTIVE để giữ tính toàn vẹn dữ liệu
    await db.query(`UPDATE coupons SET status = 'INACTIVE', updated_at = NOW() WHERE id = $1`, [couponId]);
  } else {
    await db.query(`DELETE FROM coupons WHERE id = $1`, [couponId]);
  }

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, ip_address, created_at
    ) VALUES ($1, $2, 'ADMIN', 'DELETE_COUPON', 'COUPON', $3, $4, NULL, NOW())`,
    [
      `audit-${randomUUID().slice(0, 8)}`,
      actorUserId,
      couponId,
      `Xóa mã giảm giá ${current.rows[0].code}`,
    ]
  );
}

/**
 * Tăng số lượt đã sử dụng của coupon lên 1 khi đơn thanh toán thành công.
 */
export async function incrementCouponUsage(
  code: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  const cleanCode = normalizeCouponCode(code);
  if (!cleanCode) return;
  await db.query(
    `UPDATE coupons
     SET used_count = used_count + 1, updated_at = NOW()
     WHERE code = $1`,
    [cleanCode]
  );
}
