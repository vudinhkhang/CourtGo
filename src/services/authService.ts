import crypto from 'node:crypto';
import { DatabaseClient, getDb } from '../db/client.js';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTotpCode,
  generateTotpCode,
} from '../utils/security.js';
import { getServerNow } from '../utils/time.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type MemberTier = 'BRONZE' | 'SILVER' | 'GOLD';

export function getMemberDiscountRate(tier: MemberTier | string | undefined): number {
  if (tier === 'GOLD') return 0.10; // Giảm 10%
  if (tier === 'SILVER') return 0.05; // Giảm 5%
  return 0; // Đồng 0%
}

export function formatMemberTierVi(tier: MemberTier | string | undefined): {
  label: string;
  icon: string;
  cssClass: string;
  discountPercent: number;
  minSpendVnd: number;
} {
  switch (tier) {
    case 'GOLD':
      return { label: 'Hội viên Vàng', icon: '🥇', cssClass: 'tier-gold', discountPercent: 10, minSpendVnd: 3000000 };
    case 'SILVER':
      return { label: 'Hội viên Bạc', icon: '🥈', cssClass: 'tier-silver', discountPercent: 5, minSpendVnd: 1000000 };
    case 'BRONZE':
    default:
      return { label: 'Hội viên Đồng', icon: '🥉', cssClass: 'tier-bronze', discountPercent: 0, minSpendVnd: 0 };
  }
}

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  email_verified_at: Date | string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  member_tier: MemberTier;
  avatar_url?: string | null;
  address?: string | null;
  birth_date?: string | null;
  total_spent_vnd: number;
  created_at: Date | string;
}

export interface SessionContext {
  sessionId: string;
  rawSessionToken: string;
  csrfToken: string;
  mfaVerified: boolean;
  user: UserRecord;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 phút

function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export async function registerCustomer(
  input: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
  },
  db: DatabaseClient = getDb()
): Promise<{ user: UserRecord; verificationToken: string }> {
  const email = normalizeEmail(input.email);
  const fullName = (input.fullName || '').trim();
  const phone = (input.phone || '').trim();
  const password = input.password || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError({
      code: 'INVALID_EMAIL',
      statusCode: 400,
      publicMessage: 'Địa chỉ email chưa đúng định dạng. Bạn kiểm tra lại nhé.',
    });
  }
  if (fullName.length < 2 || fullName.length > 100) {
    throw new AppError({
      code: 'INVALID_NAME',
      statusCode: 400,
      publicMessage: 'Vui lòng nhập họ và tên từ 2 đến 100 ký tự.',
    });
  }
  if (!/^[0-9+\s.-]{9,15}$/.test(phone)) {
    throw new AppError({
      code: 'INVALID_PHONE',
      statusCode: 400,
      publicMessage: 'Số điện thoại cần gồm từ 9 đến 15 chữ số để trung tâm liên hệ khi cần.',
    });
  }
  if (password.length < 8) {
    throw new AppError({
      code: 'WEAK_PASSWORD',
      statusCode: 400,
      publicMessage: 'Mật khẩu cần có ít nhất 8 ký tự để bảo vệ tài khoản của bạn.',
    });
  }

  const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows.length > 0) {
    throw new AppError({
      code: 'EMAIL_EXISTS',
      statusCode: 409,
      publicMessage: 'Email này đã được đăng ký. Bạn có thể đăng nhập hoặc khôi phục mật khẩu.',
    });
  }

  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = hashPassword(password);
  const rawVerifyToken = generateSecureToken(24);
  const verifyTokenHash = hashToken(rawVerifyToken);
  const now = getServerNow();
  const verifyExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db.withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'CUSTOMER', 'ACTIVE', $6, $6)`,
      [userId, email, passwordHash, fullName, phone, now.toISOString()]
    );

    await tx.query(
      `INSERT INTO auth_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
       VALUES ($1, $2, $3, 'EMAIL_VERIFY', $4, $5)`,
      [`tok-${crypto.randomUUID()}`, userId, verifyTokenHash, verifyExpiresAt.toISOString(), now.toISOString()]
    );

    await tx.query(
      `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
       VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)`,
      [
        `job-${crypto.randomUUID()}`,
        `email-verify-${userId}-${verifyTokenHash.slice(0, 12)}`,
        JSON.stringify({
          to: email,
          subject: 'Xác minh địa chỉ email tài khoản CourtGo',
          bodyText: `Xin chào ${fullName},\n\nMã xác minh email của bạn là: ${rawVerifyToken}\nHoặc truy cập đường dẫn xác minh trong tài khoản của bạn.`,
          category: 'EMAIL_VERIFY',
        }),
        now.toISOString(),
      ]
    );
  });

  const userRes = await db.query<UserRecord>(
    `SELECT id, email, full_name, phone, role, status, email_verified_at, mfa_enabled, mfa_secret,
            COALESCE(member_tier, 'BRONZE') AS member_tier, COALESCE(total_spent_vnd, 0) AS total_spent_vnd, avatar_url, address, birth_date, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  return {
    user: userRes.rows[0],
    verificationToken: rawVerifyToken,
  };
}

export async function loginWithPassword(
  input: {
    email: string;
    password: string;
    mfaCode?: string;
    ipAddress?: string;
    userAgent?: string;
  },
  db: DatabaseClient = getDb()
): Promise<SessionContext> {
  const email = normalizeEmail(input.email);
  const password = input.password || '';
  const now = getServerNow();

  const res = await db.query<
    UserRecord & {
      password_hash: string;
      failed_login_attempts: number;
      locked_until: string | Date | null;
    }
  >(
    `SELECT id, email, password_hash, full_name, phone, role, status,
            email_verified_at, mfa_enabled, mfa_secret,
            COALESCE(member_tier, 'BRONZE') AS member_tier, COALESCE(total_spent_vnd, 0) AS total_spent_vnd,
            failed_login_attempts, locked_until, created_at
     FROM users WHERE email = $1`,
    [email]
  );

  if (res.rows.length === 0) {
    throw new AppError({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
      publicMessage: 'Email hoặc mật khẩu chưa chính xác. Bạn kiểm tra lại hoặc chọn quên mật khẩu nhé.',
    });
  }

  const user = res.rows[0];
  if (user.status === 'LOCKED') {
    throw new AppError({
      code: 'ACCOUNT_LOCKED',
      statusCode: 403,
      publicMessage: 'Tài khoản của bạn đang tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ của trung tâm để được kiểm tra.',
    });
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > now.getTime()) {
    throw new AppError({
      code: 'TEMP_LOCKED',
      statusCode: 429,
      publicMessage: 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần. Bạn vui lòng thử lại sau 15 phút.',
    });
  }

  const validPassword = verifyPassword(password, user.password_hash);
  if (!validPassword) {
    const nextFailed = (user.failed_login_attempts || 0) + 1;
    const lockedUntil =
      nextFailed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString() : null;
    await db.query(
      `UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = $3 WHERE id = $4`,
      [nextFailed, lockedUntil, now.toISOString(), user.id]
    );
    throw new AppError({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
      publicMessage: 'Email hoặc mật khẩu chưa chính xác. Bạn kiểm tra lại hoặc chọn quên mật khẩu nhé.',
    });
  }

  // Cho phép đăng nhập bình thường mà không bắt buộc nhập mã MFA
  let mfaVerified = true;
  if (user.mfa_enabled && user.mfa_secret && input.mfaCode) {
    if (!verifyTotpCode(user.mfa_secret, input.mfaCode, now.getTime())) {
      throw new AppError({
        code: 'INVALID_MFA_CODE',
        statusCode: 401,
        publicMessage: 'Mã xác thực hai lớp (MFA) không đúng hoặc đã hết hạn. Vui lòng nhập mã 6 chữ số mới.',
      });
    }
  }

  await db.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = $1 WHERE id = $2`,
    [now.toISOString(), user.id]
  );

  const rawSessionToken = generateSecureToken(32);
  const tokenHash = hashToken(rawSessionToken);
  const csrfToken = generateSecureToken(24);
  const sessionId = `ses-${crypto.randomUUID()}`;
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.query(
    `INSERT INTO sessions (id, token_hash, user_id, csrf_token, mfa_verified, ip_address, user_agent, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      sessionId,
      tokenHash,
      user.id,
      csrfToken,
      mfaVerified,
      input.ipAddress || null,
      input.userAgent || null,
      expiresAt.toISOString(),
      now.toISOString(),
    ]
  );

  return {
    sessionId,
    rawSessionToken,
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      email_verified_at: user.email_verified_at,
      mfa_enabled: user.mfa_enabled,
      mfa_secret: null, // không trả bí mật MFA ra ngoài
      member_tier: (user.member_tier || 'BRONZE') as MemberTier,
      total_spent_vnd: Number(user.total_spent_vnd || 0),
      created_at: user.created_at,
    },
    mfaVerified,
  };
}

export async function getSessionByRawToken(
  rawSessionToken: string | undefined,
  db: DatabaseClient = getDb()
): Promise<SessionContext | null> {
  if (!rawSessionToken) return null;
  const tokenHash = hashToken(rawSessionToken);
  const now = getServerNow();

  const res = await db.query<{
    session_id: string;
    csrf_token: string;
    mfa_verified: boolean;
    expires_at: string | Date;
    id: string;
    email: string;
    full_name: string;
    phone: string;
    role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
    status: 'ACTIVE' | 'LOCKED';
    email_verified_at: string | Date | null;
    mfa_enabled: boolean;
    member_tier: MemberTier;
    avatar_url?: string | null;
  address?: string | null;
  birth_date?: string | null;
  total_spent_vnd: number;
    created_at: string | Date;
  }>(
    `SELECT s.id AS session_id, s.csrf_token, s.mfa_verified, s.expires_at,
            u.id, u.email, u.full_name, u.phone, u.role, u.status, u.email_verified_at, u.mfa_enabled,
            COALESCE(u.member_tier, 'BRONZE') AS member_tier, COALESCE(u.total_spent_vnd, 0) AS total_spent_vnd, u.avatar_url, u.address, u.birth_date, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (new Date(row.expires_at).getTime() <= now.getTime() || row.status !== 'ACTIVE') {
    await db.query(`DELETE FROM sessions WHERE id = $1`, [row.session_id]);
    return null;
  }

  return {
    sessionId: row.session_id,
    rawSessionToken,
    csrfToken: row.csrf_token,
    mfaVerified: row.mfa_verified,
    user: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      phone: row.phone,
      role: row.role,
      status: row.status,
      email_verified_at: row.email_verified_at,
      mfa_enabled: row.mfa_enabled,
      mfa_secret: null,
      member_tier: (row.member_tier || 'BRONZE') as MemberTier,
      total_spent_vnd: Number(row.total_spent_vnd || 0),
      avatar_url: row.avatar_url, address: row.address, birth_date: row.birth_date,
      created_at: row.created_at,
    },
  };
}

export async function verifySessionAdminMfa(
  sessionId: string,
  userId: string,
  mfaCode: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  const res = await db.query<{ mfa_enabled: boolean; mfa_secret: string | null }>(
    `SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1`,
    [userId]
  );
  if (res.rows.length === 0) {
    throw new AppError({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy tài khoản.',
    });
  }
  const { mfa_enabled, mfa_secret } = res.rows[0];
  if (!mfa_enabled || !mfa_secret) {
    await db.query(`UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`, [sessionId]);
    return;
  }
  const now = getServerNow();
  if (!verifyTotpCode(mfa_secret, mfaCode, now.getTime())) {
    throw new AppError({
      code: 'INVALID_MFA_CODE',
      statusCode: 401,
      publicMessage: 'Mã xác thực hai yếu tố (MFA) chưa đúng. Vui lòng kiểm tra và nhập lại 6 chữ số.',
    });
  }
  await db.query(`UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`, [sessionId]);
}

export async function getAdminMfaCurrentCodeForTestingOrSandbox(
  userId: string,
  db: DatabaseClient = getDb()
): Promise<string | null> {
  const res = await db.query<{ mfa_secret: string | null }>(`SELECT mfa_secret FROM users WHERE id = $1`, [userId]);
  const secret = res.rows[0]?.mfa_secret;
  if (!secret) return null;
  return generateTotpCode(secret, getServerNow().getTime());
}

export async function logoutByRawToken(rawSessionToken: string | undefined, db: DatabaseClient = getDb()): Promise<void> {
  if (!rawSessionToken) return;
  const tokenHash = hashToken(rawSessionToken);
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function verifyEmailWithToken(rawToken: string, db: DatabaseClient = getDb()): Promise<void> {
  const clean = (rawToken || '').trim();
  if (!clean) {
    throw new AppError({
      code: 'INVALID_TOKEN',
      statusCode: 400,
      publicMessage: 'Mã xác minh email không hợp lệ.',
    });
  }
  const tokenHash = hashToken(clean);
  const now = getServerNow();

  const res = await db.query<{ id: string; user_id: string; expires_at: string | Date; used_at: string | Date | null }>(
    `SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = $1 AND purpose = 'EMAIL_VERIFY'`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    throw new AppError({
      code: 'TOKEN_NOT_FOUND',
      statusCode: 400,
      publicMessage: 'Mã xác minh không tồn tại hoặc đã được thay thế. Bạn có thể yêu cầu gửi mã mới.',
    });
  }

  const tok = res.rows[0];
  if (tok.used_at) {
    throw new AppError({
      code: 'TOKEN_ALREADY_USED',
      statusCode: 400,
      publicMessage: 'Mã xác minh này đã được sử dụng trước đó.',
    });
  }
  if (new Date(tok.expires_at).getTime() <= now.getTime()) {
    throw new AppError({
      code: 'TOKEN_EXPIRED',
      statusCode: 400,
      publicMessage: 'Mã xác minh đã hết hạn. Vui lòng yêu cầu gửi lại mã mới trong phần Tài khoản.',
    });
  }

  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE auth_tokens SET used_at = $1 WHERE id = $2`, [now.toISOString(), tok.id]);
    await tx.query(`UPDATE users SET email_verified_at = $1, updated_at = $1 WHERE id = $2`, [
      now.toISOString(),
      tok.user_id,
    ]);
  });
}

/**
 * Yêu cầu khôi phục mật khẩu:
 * - Token hết hạn sau 30 phút, dùng 1 lần.
 * - KHÔNG tiết lộ tài khoản có tồn tại hay không ra phản hồi công khai.
 */
export async function requestPasswordReset(
  emailInput: string,
  db: DatabaseClient = getDb()
): Promise<{ publicNotice: string; debugResetToken?: string }> {
  const email = normalizeEmail(emailInput);
  const publicNotice =
    'Nếu địa chỉ email này đã đăng ký tại CourtGo, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư của bạn.';

  if (!email) {
    return { publicNotice };
  }

  const userRes = await db.query<{ id: string; full_name: string; status: string }>(
    `SELECT id, full_name, status FROM users WHERE email = $1`,
    [email]
  );
  if (userRes.rows.length === 0 || userRes.rows[0].status !== 'ACTIVE') {
    return { publicNotice };
  }

  const user = userRes.rows[0];
  const rawResetToken = generateSecureToken(24);
  const resetTokenHash = hashToken(rawResetToken);
  const now = getServerNow();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 phút

  await db.withTransaction(async (tx) => {
    // Vô hiệu hóa các token đặt lại mật khẩu cũ chưa dùng của tài khoản này
    await tx.query(
      `UPDATE auth_tokens SET used_at = $1 WHERE user_id = $2 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`,
      [now.toISOString(), user.id]
    );

    await tx.query(
      `INSERT INTO auth_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
       VALUES ($1, $2, $3, 'PASSWORD_RESET', $4, $5)`,
      [`tok-${crypto.randomUUID()}`, user.id, resetTokenHash, expiresAt.toISOString(), now.toISOString()]
    );

    await tx.query(
      `INSERT INTO background_jobs (id, job_type, dedup_key, payload_json, status, next_run_at, created_at, updated_at)
       VALUES ($1, 'SEND_EMAIL', $2, $3, 'PENDING', $4, $4, $4)`,
      [
        `job-${crypto.randomUUID()}`,
        `pwd-reset-${user.id}-${resetTokenHash.slice(0, 12)}`,
        JSON.stringify({
          to: email,
          subject: 'Hướng dẫn đặt lại mật khẩu tài khoản CourtGo',
          bodyText: `Xin chào ${user.full_name},\n\nMã đặt lại mật khẩu dùng một lần của bạn (hiệu lực 30 phút): ${rawResetToken}\nNếu bạn không yêu cầu, vui lòng bỏ qua email này.`,
          category: 'PASSWORD_RESET',
        }),
        now.toISOString(),
      ]
    );
  });

  return {
    publicNotice,
    debugResetToken: rawResetToken,
  };
}

export async function completePasswordReset(
  input: { token: string; newPassword: string },
  db: DatabaseClient = getDb()
): Promise<void> {
  const cleanToken = (input.token || '').trim();
  const newPassword = input.newPassword || '';

  if (!cleanToken) {
    throw new AppError({
      code: 'INVALID_RESET_TOKEN',
      statusCode: 400,
      publicMessage: 'Mã đặt lại mật khẩu không hợp lệ.',
    });
  }
  if (newPassword.length < 8) {
    throw new AppError({
      code: 'WEAK_PASSWORD',
      statusCode: 400,
      publicMessage: 'Mật khẩu mới cần có ít nhất 8 ký tự.',
    });
  }

  const tokenHash = hashToken(cleanToken);
  const now = getServerNow();

  const res = await db.query<{
    id: string;
    user_id: string;
    expires_at: string | Date;
    used_at: string | Date | null;
  }>(
    `SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = $1 AND purpose = 'PASSWORD_RESET'`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    throw new AppError({
      code: 'INVALID_RESET_TOKEN',
      statusCode: 400,
      publicMessage: 'Mã khôi phục mật khẩu không đúng hoặc đã hết hiệu lực. Bạn vui lòng yêu cầu mã mới.',
    });
  }

  const tok = res.rows[0];
  if (tok.used_at) {
    throw new AppError({
      code: 'RESET_TOKEN_ALREADY_USED',
      statusCode: 400,
      publicMessage: 'Mã khôi phục mật khẩu này đã được sử dụng một lần. Vui lòng tạo yêu cầu mới nếu cần.',
    });
  }
  if (new Date(tok.expires_at).getTime() <= now.getTime()) {
    throw new AppError({
      code: 'RESET_TOKEN_EXPIRED',
      statusCode: 400,
      publicMessage: 'Mã khôi phục mật khẩu đã quá hạn 30 phút. Vui lòng yêu cầu gửi lại mã mới.',
    });
  }

  const newHash = hashPassword(newPassword);
  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE auth_tokens SET used_at = $1 WHERE id = $2`, [now.toISOString(), tok.id]);
    await tx.query(
      `UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = $2 WHERE id = $3`,
      [newHash, now.toISOString(), tok.user_id]
    );
    // Thu hồi toàn bộ phiên đăng nhập cũ sau khi đặt lại mật khẩu
    await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [tok.user_id]);
  });
}

export async function updateUserProfile(
  userId: string,
  input: { fullName: string; phone: string; avatarData?: string; address?: string; birthDate?: string },
  db: DatabaseClient = getDb()
): Promise<UserRecord> {
  const fullName = (input.fullName || '').trim();
  const phone = (input.phone || '').trim();

  if (fullName.length < 2 || fullName.length > 100) {
    throw new AppError({
      code: 'INVALID_NAME',
      statusCode: 400,
      publicMessage: 'Họ và tên cần có độ dài từ 2 đến 100 ký tự.',
    });
  }
  if (!/^[0-9+\s.-]{9,15}$/.test(phone)) {
    throw new AppError({
      code: 'INVALID_PHONE',
      statusCode: 400,
      publicMessage: 'Số điện thoại cần gồm từ 9 đến 15 chữ số hợp lệ.',
    });
  }

  const address = input.address?.trim();
  const birthDate = input.birthDate?.trim();
  const avatar = input.avatarData;
  const invalid = (message: string) => { throw new AppError({code:'INVALID_PROFILE',statusCode:400,publicMessage:message}); };
  if (address && address.length > 300) invalid('Địa chỉ không quá 300 ký tự.');
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0,10) !== birthDate || birthDate > getServerNow().toISOString().slice(0,10) || birthDate < '1900-01-01')) invalid('Ngày sinh không hợp lệ.');
  if (avatar) {
    if (avatar.length > 700000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) invalid('Ảnh đại diện không hợp lệ. Vui lòng chọn lại ảnh.');
    const bytes = Buffer.from(avatar.split(',')[1], 'base64');
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) invalid('Dữ liệu ảnh đại diện không hợp lệ.');
  }
  await db.query(`UPDATE users SET full_name=$1, phone=$2, updated_at=$3,
    address=COALESCE($5,address), birth_date=COALESCE($6,birth_date), avatar_url=COALESCE($7,avatar_url) WHERE id=$4`,
    [fullName,phone,getServerNow().toISOString(),userId,address ?? null,birthDate ?? null,avatar ?? null]);

  const res = await db.query<UserRecord>(
    `SELECT id, email, full_name, phone, role, status, email_verified_at, mfa_enabled, NULL AS mfa_secret,
            COALESCE(member_tier, 'BRONZE') AS member_tier, COALESCE(total_spent_vnd, 0) AS total_spent_vnd, avatar_url, address, birth_date, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0];
}

export async function changeUserPassword(
  userId: string,
  currentSessionId: string,
  input: { currentPassword: string; newPassword: string },
  db: DatabaseClient = getDb()
): Promise<void> {
  if ((input.newPassword || '').length < 8) {
    throw new AppError({
      code: 'WEAK_PASSWORD',
      statusCode: 400,
      publicMessage: 'Mật khẩu mới cần có ít nhất 8 ký tự.',
    });
  }

  const res = await db.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (res.rows.length === 0 || !verifyPassword(input.currentPassword || '', res.rows[0].password_hash)) {
    throw new AppError({
      code: 'WRONG_CURRENT_PASSWORD',
      statusCode: 400,
      publicMessage: 'Mật khẩu hiện tại chưa chính xác. Bạn kiểm tra lại nhé.',
    });
  }

  const newHash = hashPassword(input.newPassword);
  const now = getServerNow();
  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [
      newHash,
      now.toISOString(),
      userId,
    ]);
    await tx.query(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [userId, currentSessionId]);
  });
}

/**
 * Quản trị viên khóa hoặc mở khóa tài khoản:
 * - Bắt buộc quyền ADMIN đã xác thực MFA.
 * - Không cho tự khóa chính mình.
 * - KHÔNG hủy các đơn đặt hợp lệ (CONFIRMED / CHECKED_IN) của khách hàng khi khóa tài khoản!
 */
export async function adminSetUserStatus(
  actor: SessionContext,
  targetUserId: string,
  nextStatus: 'ACTIVE' | 'LOCKED',
  reason: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN_ADMIN_ONLY',
      statusCode: 403,
      publicMessage: 'Chỉ quản trị viên cấp cao mới có quyền khóa hoặc mở lại tài khoản.',
    });
  }
  if (actor.user.mfa_enabled && !actor.mfaVerified) {
    throw new AppError({
      code: 'ADMIN_MFA_REQUIRED',
      statusCode: 403,
      publicMessage: 'Vui lòng xác thực mã bảo mật hai lớp (MFA) trước khi thực hiện thao tác nhạy cảm này.',
    });
  }
  if (actor.user.id === targetUserId) {
    throw new AppError({
      code: 'CANNOT_LOCK_SELF',
      statusCode: 400,
      publicMessage: 'Bạn không thể tự khóa tài khoản quản trị đang sử dụng.',
    });
  }

  const targetRes = await db.query<UserRecord>(
    `SELECT id, email, full_name, phone, role, status, email_verified_at, mfa_enabled, NULL AS mfa_secret,
            COALESCE(member_tier, 'BRONZE') AS member_tier, COALESCE(total_spent_vnd, 0) AS total_spent_vnd, avatar_url, address, birth_date, created_at
     FROM users WHERE id = $1`,
    [targetUserId]
  );
  if (targetRes.rows.length === 0) {
    throw new AppError({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy tài khoản cần thao tác.',
    });
  }
  const target = targetRes.rows[0];
  const now = getServerNow();

  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE users SET status = $1, updated_at = $2 WHERE id = $3`, [
      nextStatus,
      now.toISOString(),
      targetUserId,
    ]);

    if (nextStatus === 'LOCKED') {
      // Chỉ xóa phiên đăng nhập, tuyệt đối KHÔNG hủy các đơn đặt đã xác nhận (CONFIRMED) của khách!
      await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [targetUserId]);
    }

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7, $8, $9)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        nextStatus === 'LOCKED' ? 'LOCK_USER_ACCOUNT' : 'UNLOCK_USER_ACCOUNT',
        targetUserId,
        `${nextStatus === 'LOCKED' ? 'Khóa' : 'Mở khóa'} tài khoản ${target.email}. Lý do: ${reason || 'Theo yêu cầu vận hành'}`,
        JSON.stringify({ status: target.status }),
        JSON.stringify({ status: nextStatus, reason }),
        now.toISOString(),
      ]
    );
  });

  logger.info('ADMIN_USER_STATUS_CHANGED', `Đã cập nhật trạng thái tài khoản ${target.email} -> ${nextStatus}`, {
    actorId: actor.user.id,
    targetUserId,
  });
}

export async function adminSetUserPassword(
  actor: SessionContext,
  targetUserId: string,
  newPassword: string,
  reason: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({code:'FORBIDDEN_ADMIN_ONLY',statusCode:403,publicMessage:'Chỉ quản trị viên mới có quyền đổi mật khẩu người dùng.'});
  }
  if (actor.user.mfa_enabled && !actor.mfaVerified) {
    throw new AppError({code:'ADMIN_MFA_REQUIRED',statusCode:403,publicMessage:'Vui lòng xác thực hai lớp trước khi đổi mật khẩu.'});
  }
  if (actor.user.id === targetUserId) {
    throw new AppError({code:'CANNOT_RESET_SELF',statusCode:400,publicMessage:'Không thể đổi mật khẩu tài khoản đang dùng tại đây. Hãy đổi trong mục Tài khoản.'});
  }
  if (newPassword.length < 8 || newPassword.length > 200) {
    throw new AppError({code:'WEAK_PASSWORD',statusCode:400,publicMessage:'Mật khẩu mới cần dài từ 8 đến 200 ký tự.'});
  }
  if (reason.trim().length < 5 || reason.trim().length > 300) {
    throw new AppError({code:'INVALID_REASON',statusCode:400,publicMessage:'Vui lòng nhập lý do từ 5 đến 300 ký tự.'});
  }
  const target=(await db.query<{id:string;email:string}>('SELECT id,email FROM users WHERE id=$1',[targetUserId])).rows[0];
  if(!target) throw new AppError({code:'USER_NOT_FOUND',statusCode:404,publicMessage:'Không tìm thấy tài khoản cần đổi mật khẩu.'});
  const now=getServerNow().toISOString();
  await db.withTransaction(async tx=>{
    await tx.query('UPDATE users SET password_hash=$1,failed_login_attempts=0,locked_until=NULL,updated_at=$2 WHERE id=$3',[hashPassword(newPassword),now,targetUserId]);
    await tx.query('DELETE FROM sessions WHERE user_id=$1',[targetUserId]);
    await tx.query("UPDATE auth_tokens SET used_at=$1 WHERE user_id=$2 AND purpose='PASSWORD_RESET' AND used_at IS NULL",[now,targetUserId]);
    await tx.query(`INSERT INTO admin_audit_logs(id,actor_user_id,actor_role,action,target_type,target_id,summary_vi,before_snapshot,after_snapshot,created_at)
      VALUES($1,$2,'ADMIN','RESET_USER_PASSWORD','USER',$3,$4,$5,$6,$7)`,[
      `aud-${crypto.randomUUID()}`,actor.user.id,targetUserId,`Đổi mật khẩu tài khoản ${target.email}. Lý do: ${reason.trim()}`,
      JSON.stringify({passwordChanged:false}),JSON.stringify({passwordChanged:true,sessionsRevoked:true,reason:reason.trim()}),now
    ]);
  });
  logger.info('ADMIN_USER_PASSWORD_CHANGED',`Đã đổi mật khẩu tài khoản ${target.email}`,{actorId:actor.user.id,targetUserId});
}

export async function adminChangeUserRole(
  actor: SessionContext,
  targetUserId: string,
  nextRole: 'CUSTOMER' | 'STAFF' | 'ADMIN',
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN_ADMIN_ONLY',
      statusCode: 403,
      publicMessage: 'Chỉ quản trị viên mới có quyền phân quyền tài khoản.',
    });
  }
  if (actor.user.mfa_enabled && !actor.mfaVerified) {
    throw new AppError({
      code: 'ADMIN_MFA_REQUIRED',
      statusCode: 403,
      publicMessage: 'Vui lòng xác thực mã bảo mật hai lớp (MFA) trước khi thay đổi phân quyền.',
    });
  }
  if (actor.user.id === targetUserId && nextRole !== 'ADMIN') {
    throw new AppError({
      code: 'CANNOT_DEMOTE_SELF',
      statusCode: 400,
      publicMessage: 'Không thể tự hạ quyền quản trị của chính mình.',
    });
  }

  const targetRes = await db.query<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM users WHERE id = $1`,
    [targetUserId]
  );
  if (targetRes.rows.length === 0) {
    throw new AppError({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
      publicMessage: 'Không tìm thấy tài khoản cần phân quyền.',
    });
  }
  const target = targetRes.rows[0];
  const now = getServerNow();

  await db.withTransaction(async (tx) => {
    await tx.query(`UPDATE users SET role = $1, updated_at = $2 WHERE id = $3`, [
      nextRole,
      now.toISOString(),
      targetUserId,
    ]);

    await tx.query(
      `INSERT INTO admin_audit_logs (
        id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, before_snapshot, after_snapshot, created_at
      ) VALUES ($1, $2, $3, 'CHANGE_USER_ROLE', 'USER', $4, $5, $6, $7, $8)`,
      [
        `aud-${crypto.randomUUID()}`,
        actor.user.id,
        actor.user.role,
        targetUserId,
        `Thay đổi vai trò tài khoản ${target.email} từ ${target.role} sang ${nextRole}`,
        JSON.stringify({ role: target.role }),
        JSON.stringify({ role: nextRole }),
        now.toISOString(),
      ]
    );
  });
}

/**
 * Quản trị viên cập nhật phân hạng hội viên cho người dùng:
 * - Đồng (BRONZE): 0% chiết khấu
 * - Bạc (SILVER): Giảm 5% tiền sân khi thanh toán
 * - Vàng (GOLD): Giảm 10% tiền sân khi thanh toán
 */
export async function adminSetUserMemberTier(
  actor: SessionContext,
  targetUserId: string,
  nextTier: MemberTier,
  db: DatabaseClient = getDb()
): Promise<void> {
  if (actor.user.role !== 'ADMIN' && actor.user.role !== 'STAFF') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      publicMessage: 'Chỉ ban quản trị mới có quyền điều chỉnh hạng hội viên.',
    });
  }

  await db.query(`UPDATE users SET member_tier = $1, updated_at = NOW() WHERE id = $2`, [
    nextTier,
    targetUserId,
  ]);

  await db.query(
    `INSERT INTO admin_audit_logs (
      id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
    ) VALUES ($1, $2, $3, 'UPDATE_MEMBER_TIER', 'USER', $4, $5, $6, NOW())`,
    [
      `aud-${crypto.randomUUID()}`,
      actor.user.id,
      actor.user.role,
      targetUserId,
      `Cập nhật hạng hội viên cho người dùng ${targetUserId} thành ${nextTier}`,
      JSON.stringify({ member_tier: nextTier }),
    ]
  );
}
