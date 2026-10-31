import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

/**
 * Băm mật khẩu an toàn bằng thuật toán scrypt kèm muối ngẫu nhiên.
 */
export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derived.toString('hex')}`;
}

/**
 * Kiểm tra mật khẩu chống tấn công đo thời gian (timing-safe).
 */
export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4];
    const expectedHex = parts[5];
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const derived = crypto.scryptSync(plainPassword, salt, expectedBuf.length, { N, r, p });
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function signHmacSha512(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload, 'utf8').digest('hex');
}

export function verifyHmacSha512(payload: string, signatureHex: string, secret: string): boolean {
  try {
    const expectedHex = signHmacSha512(payload, secret);
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(signatureHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Tạo và kiểm tra mã xác thực hai yếu tố (TOTP 6 chữ số theo chu kỳ 30 giây) cho quản trị viên.
 */
export function generateTotpCode(secret: string, timestampMs: number = Date.now()): string {
  const counter = Math.floor(timestampMs / 30000);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, timestampMs: number = Date.now()): boolean {
  const clean = (code || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const drift of [-1, 0, 1]) {
    const candidate = generateTotpCode(secret, timestampMs + drift * 30000);
    if (candidate === clean) return true;
  }
  return false;
}

export function escapeHtml(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bộ giới hạn tần suất yêu cầu (Rate Limiter) bảo vệ đăng nhập, gửi email, giữ chỗ và thanh toán.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  public check(key: string, maxRequests: number, windowMs: number, nowMs: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
    }
    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    existing.count += 1;
    return { allowed: true, remaining: maxRequests - existing.count, retryAfterSeconds: 0 };
  }

  public reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

export const rateLimiter = new RateLimiter();
