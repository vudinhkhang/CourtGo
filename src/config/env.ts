import fs from 'node:fs';
import path from 'node:path';

export type NodeEnv = 'development' | 'test' | 'production';
export type PaymentMode = 'sandbox' | 'production';
export type EmailMode = 'log_outbox' | 'smtp_webhook';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  appBaseUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  paymentMode: PaymentMode;
  paymentProviderName: string;
  paymentMerchantId: string;
  paymentHashSecret: string;
  paymentGatewayUrl: string;
  emailMode: EmailMode;
  emailFrom: string;
  smtpWebhookUrl: string;
  smtpApiKey: string;
  allowSeedData: boolean;
}

const DEV_DEFAULT_SECRET = 'courtgo-dev-session-secret-key-2026-min-32-chars';
const DEV_DEFAULT_PAYMENT_SECRET = 'vnpay-sandbox-hmac-sha512-secret-2026-courtgo';

function loadDotEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnvFile();

export function loadAndValidateConfig(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnvRaw = (rawEnv.NODE_ENV || 'development').trim();
  if (nodeEnvRaw !== 'development' && nodeEnvRaw !== 'test' && nodeEnvRaw !== 'production') {
    throw new Error(`Cấu hình NODE_ENV không hợp lệ: "${nodeEnvRaw}". Chỉ chấp nhận development, test hoặc production.`);
  }
  const nodeEnv: NodeEnv = nodeEnvRaw;

  const port = Number(rawEnv.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Cấu hình PORT không hợp lệ: "${rawEnv.PORT}".`);
  }

  const host = (rawEnv.HOST || '127.0.0.1').trim();
  const appBaseUrl = (rawEnv.APP_BASE_URL || `http://localhost:${port}`).trim().replace(/\/+$/, '');
  const databaseUrl = (
    rawEnv.DATABASE_URL ||
    (nodeEnv === 'test' ? 'pglite://memory' : 'pglite://./data/courtgo-pg')
  ).trim();

  const sessionSecret = (rawEnv.SESSION_SECRET || (nodeEnv === 'production' ? '' : DEV_DEFAULT_SECRET)).trim();
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET bắt buộc có độ dài tối thiểu 32 ký tự để bảo đảm an toàn phiên đăng nhập.');
  }

  const paymentModeRaw = (rawEnv.PAYMENT_MODE || (nodeEnv === 'production' ? '' : 'sandbox')).trim();
  if (paymentModeRaw !== 'sandbox' && paymentModeRaw !== 'production') {
    throw new Error('PAYMENT_MODE bắt buộc phải được cấu hình rõ là "sandbox" hoặc "production".');
  }
  const paymentMode: PaymentMode = paymentModeRaw;

  const paymentProviderName = (
    rawEnv.PAYMENT_PROVIDER_NAME || (paymentMode === 'production' ? 'VNPAY_PRODUCTION' : 'VNPAY_SANDBOX')
  ).trim();
  const paymentMerchantId = (rawEnv.PAYMENT_MERCHANT_ID || (nodeEnv === 'production' ? '' : 'COURTGO_VN_01')).trim();
  const paymentHashSecret = (
    rawEnv.PAYMENT_HASH_SECRET || (nodeEnv === 'production' ? '' : DEV_DEFAULT_PAYMENT_SECRET)
  ).trim();
  const paymentGatewayUrl = (
    rawEnv.PAYMENT_GATEWAY_URL ||
    (nodeEnv === 'production' ? '' : `${appBaseUrl}/cong-thanh-toan-sandbox`)
  ).trim();

  const emailModeRaw = (rawEnv.EMAIL_MODE || 'log_outbox').trim();
  if (emailModeRaw !== 'log_outbox' && emailModeRaw !== 'smtp_webhook') {
    throw new Error('EMAIL_MODE không hợp lệ. Chỉ chấp nhận "log_outbox" hoặc "smtp_webhook".');
  }
  const emailMode: EmailMode = emailModeRaw;
  const emailFrom = (rawEnv.EMAIL_FROM || 'no-reply@courtgo.vn').trim();
  const smtpWebhookUrl = (rawEnv.SMTP_WEBHOOK_URL || '').trim();
  const smtpApiKey = (rawEnv.SMTP_API_KEY || '').trim();

  const allowSeedData = (rawEnv.ALLOW_SEED_DATA || (nodeEnv === 'production' ? 'false' : 'true')).trim() === 'true';

  // Kiểm tra nghiêm ngặt khi chạy ở môi trường production
  if (nodeEnv === 'production') {
    if (sessionSecret === DEV_DEFAULT_SECRET) {
      throw new Error('Production không được sử dụng SESSION_SECRET mặc định của môi trường phát triển.');
    }
    if (paymentMode !== 'production') {
      throw new Error('Môi trường production không được phép chạy PAYMENT_MODE=sandbox hoặc thanh toán giả lập.');
    }
    if (!paymentMerchantId || !paymentHashSecret || paymentHashSecret === DEV_DEFAULT_PAYMENT_SECRET) {
      throw new Error('Môi trường production thiếu thông tin xác thực cổng thanh toán (PAYMENT_MERCHANT_ID / PAYMENT_HASH_SECRET).');
    }
    if (!paymentGatewayUrl || paymentGatewayUrl.includes('cong-thanh-toan-sandbox')) {
      throw new Error('Môi trường production bắt buộc cấu hình PAYMENT_GATEWAY_URL thực tế, không dùng bộ mô phỏng.');
    }
    if (allowSeedData) {
      throw new Error('Môi trường production nghiêm cấm bật ALLOW_SEED_DATA=true.');
    }
    if (databaseUrl === 'pglite://memory') {
      throw new Error('Môi trường production bắt buộc sử dụng cơ sở dữ liệu lưu trữ bền vững.');
    }
  }

  if (!paymentMerchantId || !paymentHashSecret || !paymentGatewayUrl) {
    throw new Error('Thiếu cấu hình cổng thanh toán bắt buộc (PAYMENT_MERCHANT_ID, PAYMENT_HASH_SECRET, PAYMENT_GATEWAY_URL).');
  }

  return {
    nodeEnv,
    port,
    host,
    appBaseUrl,
    databaseUrl,
    sessionSecret,
    paymentMode,
    paymentProviderName,
    paymentMerchantId,
    paymentHashSecret,
    paymentGatewayUrl,
    emailMode,
    emailFrom,
    smtpWebhookUrl,
    smtpApiKey,
    allowSeedData,
  };
}

export const config: AppConfig = loadAndValidateConfig();
