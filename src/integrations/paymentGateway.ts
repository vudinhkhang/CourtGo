import { config, AppConfig } from '../config/env.js';
import { signHmacSha512, verifyHmacSha512 } from '../utils/security.js';
import { AppError } from '../utils/errors.js';

export interface CreatePaymentRequestInput {
  merchantTxnRef: string;
  bookingCode: string;
  amountVnd: number;
  currency: 'VND';
  expiresAt: Date;
  returnUrl: string;
}

export interface CreatePaymentRequestOutput {
  provider: string;
  checkoutUrl: string;
  signature: string;
}

export interface WebhookPayloadInput {
  merchantTxnRef: string;
  providerTxnNo: string;
  amountVnd: number;
  currency: string;
  responseCode: string; // '00' = thành công, khác '00' = thất bại
  paidAtIso?: string;
  signature: string;
  senderBankName?: string;
  senderBankCode?: string;
  senderAccountNo?: string;
  senderAccountName?: string;
}

export type ProviderRefundOutcome =
  | { outcome: 'SUCCEEDED'; providerRefundId: string }
  | { outcome: 'FAILED_RETRYABLE'; errorCode: string; errorMessage: string }
  | { outcome: 'FAILED_DEFINITE'; errorCode: string; errorMessage: string }
  | { outcome: 'UNKNOWN_NEEDS_RECONCILE'; errorCode: string; errorMessage: string };

export type ProviderReconcileOutcome =
  | { found: true; status: 'SUCCEEDED'; providerRefundId: string }
  | { found: false; status: 'NOT_FOUND' }
  | { found: false; status: 'GATEWAY_UNAVAILABLE'; errorMessage: string };

export interface PaymentGatewayAdapter {
  createPaymentUrl(input: CreatePaymentRequestInput): CreatePaymentRequestOutput;
  signWebhookPayload(payload: Omit<WebhookPayloadInput, 'signature'>): string;
  verifyWebhookPayload(payload: WebhookPayloadInput): boolean;
  executeRefund(input: {
    merchantTxnRef: string;
    providerTxnNo: string;
    refundCode: string;
    amountVnd: number;
    reason: string;
  }): Promise<ProviderRefundOutcome>;
  reconcileRefund(input: {
    merchantTxnRef: string;
    refundCode: string;
  }): Promise<ProviderReconcileOutcome>;
}

// Lưu trữ trạng thái bên phía cổng thanh toán giả lập trong bộ nhớ để đối soát chính xác
const simulatedProviderProcessedRefunds = new Map<string, string>();
let mockRefundBehaviorSelector:
  | ((refundCode: string, attempt: number) => ProviderRefundOutcome | null)
  | null = null;
let mockReconcileBehaviorSelector:
  | ((refundCode: string) => ProviderReconcileOutcome | null)
  | null = null;

export function setTestRefundProviderBehavior(
  refundFn: ((refundCode: string, attempt: number) => ProviderRefundOutcome | null) | null,
  reconcileFn: ((refundCode: string) => ProviderReconcileOutcome | null) | null = null
): void {
  mockRefundBehaviorSelector = refundFn;
  mockReconcileBehaviorSelector = reconcileFn;
}

export function clearSimulatedProviderState(): void {
  simulatedProviderProcessedRefunds.clear();
  mockRefundBehaviorSelector = null;
  mockReconcileBehaviorSelector = null;
}

function canonicalRequestString(params: {
  merchantId: string;
  merchantTxnRef: string;
  bookingCode: string;
  amountVnd: number;
  currency: string;
  expiresAtIso: string;
  returnUrl: string;
}): string {
  return [
    `merchantId=${params.merchantId}`,
    `merchantTxnRef=${params.merchantTxnRef}`,
    `bookingCode=${params.bookingCode}`,
    `amountVnd=${params.amountVnd}`,
    `currency=${params.currency}`,
    `expiresAt=${params.expiresAtIso}`,
    `returnUrl=${params.returnUrl}`,
  ].join('&');
}

function canonicalWebhookString(params: {
  merchantId: string;
  merchantTxnRef: string;
  providerTxnNo: string;
  amountVnd: number;
  currency: string;
  responseCode: string;
}): string {
  return [
    `merchantId=${params.merchantId}`,
    `merchantTxnRef=${params.merchantTxnRef}`,
    `providerTxnNo=${params.providerTxnNo}`,
    `amountVnd=${params.amountVnd}`,
    `currency=${params.currency}`,
    `responseCode=${params.responseCode}`,
  ].join('&');
}

export class VietnamPaymentGateway implements PaymentGatewayAdapter {
  private readonly cfg: AppConfig;
  private callCounts = new Map<string, number>();

  constructor(customConfig: AppConfig = config) {
    this.cfg = customConfig;
  }

  public createPaymentUrl(input: CreatePaymentRequestInput): CreatePaymentRequestOutput {
    if (this.cfg.nodeEnv === 'production' && this.cfg.paymentMode !== 'production') {
      throw new AppError({
        code: 'PAYMENT_CONFIG_ERROR',
        statusCode: 503,
        publicMessage: 'Cổng thanh toán trực tuyến đang bảo trì cấu hình. Vui lòng thử lại sau.',
      });
    }

    const expiresAtIso = input.expiresAt.toISOString();
    const canonical = canonicalRequestString({
      merchantId: this.cfg.paymentMerchantId,
      merchantTxnRef: input.merchantTxnRef,
      bookingCode: input.bookingCode,
      amountVnd: input.amountVnd,
      currency: input.currency,
      expiresAtIso,
      returnUrl: input.returnUrl,
    });

    const signature = signHmacSha512(canonical, this.cfg.paymentHashSecret);
    const search = new URLSearchParams({
      merchantId: this.cfg.paymentMerchantId,
      merchantTxnRef: input.merchantTxnRef,
      bookingCode: input.bookingCode,
      amountVnd: String(input.amountVnd),
      currency: input.currency,
      expiresAt: expiresAtIso,
      returnUrl: input.returnUrl,
      signature,
    });

    return {
      provider: this.cfg.paymentProviderName,
      checkoutUrl: `${this.cfg.paymentGatewayUrl}?${search.toString()}`,
      signature,
    };
  }

  public verifyCheckoutRequestSignature(params: {
    merchantTxnRef: string;
    bookingCode: string;
    amountVnd: number;
    currency: string;
    expiresAtIso: string;
    returnUrl: string;
    signature: string;
  }): boolean {
    const canonical = canonicalRequestString({
      merchantId: this.cfg.paymentMerchantId,
      merchantTxnRef: params.merchantTxnRef,
      bookingCode: params.bookingCode,
      amountVnd: params.amountVnd,
      currency: params.currency,
      expiresAtIso: params.expiresAtIso,
      returnUrl: params.returnUrl,
    });
    return verifyHmacSha512(canonical, params.signature, this.cfg.paymentHashSecret);
  }

  public signWebhookPayload(payload: Omit<WebhookPayloadInput, 'signature'>): string {
    const canonical = canonicalWebhookString({
      merchantId: this.cfg.paymentMerchantId,
      merchantTxnRef: payload.merchantTxnRef,
      providerTxnNo: payload.providerTxnNo,
      amountVnd: payload.amountVnd,
      currency: payload.currency,
      responseCode: payload.responseCode,
    });
    return signHmacSha512(canonical, this.cfg.paymentHashSecret);
  }

  public verifyWebhookPayload(payload: WebhookPayloadInput): boolean {
    const canonical = canonicalWebhookString({
      merchantId: this.cfg.paymentMerchantId,
      merchantTxnRef: payload.merchantTxnRef,
      providerTxnNo: payload.providerTxnNo,
      amountVnd: payload.amountVnd,
      currency: payload.currency,
      responseCode: payload.responseCode,
    });
    return verifyHmacSha512(canonical, payload.signature, this.cfg.paymentHashSecret);
  }

  public async executeRefund(input: {
    merchantTxnRef: string;
    providerTxnNo: string;
    refundCode: string;
    amountVnd: number;
    reason: string;
  }): Promise<ProviderRefundOutcome> {
    const currentAttempt = (this.callCounts.get(input.refundCode) || 0) + 1;
    this.callCounts.set(input.refundCode, currentAttempt);

    if (mockRefundBehaviorSelector) {
      const mocked = mockRefundBehaviorSelector(input.refundCode, currentAttempt);
      if (mocked) {
        if (mocked.outcome === 'SUCCEEDED') {
          simulatedProviderProcessedRefunds.set(input.refundCode, mocked.providerRefundId);
        }
        return mocked;
      }
    }

    // Nếu đã được xử lý trước đó tại cổng thanh toán (idempotent phía cổng), trả về cùng mã giao dịch hoàn
    const existingProviderId = simulatedProviderProcessedRefunds.get(input.refundCode);
    if (existingProviderId) {
      return { outcome: 'SUCCEEDED', providerRefundId: existingProviderId };
    }

    if (this.cfg.paymentMode === 'production') {
      // Trong production thực tế, gọi API HTTPS hoàn tiền của nhà cung cấp.
      // Nếu chưa có kết nối mạng bên ngoài hoặc endpoint chưa phản hồi, trả về trạng thái cần kiểm tra rõ ràng.
      return {
        outcome: 'FAILED_RETRYABLE',
        errorCode: 'PRODUCTION_GATEWAY_UNREACHABLE',
        errorMessage: 'Không thể kết nối máy chủ hoàn tiền production trong môi trường hiện tại.',
      };
    }

    const providerRefundId = `VNP-RF-${input.refundCode}`;
    simulatedProviderProcessedRefunds.set(input.refundCode, providerRefundId);
    return {
      outcome: 'SUCCEEDED',
      providerRefundId,
    };
  }

  public async reconcileRefund(input: {
    merchantTxnRef: string;
    refundCode: string;
  }): Promise<ProviderReconcileOutcome> {
    if (mockReconcileBehaviorSelector) {
      const mocked = mockReconcileBehaviorSelector(input.refundCode);
      if (mocked) return mocked;
    }

    const existing = simulatedProviderProcessedRefunds.get(input.refundCode);
    if (existing) {
      return {
        found: true,
        status: 'SUCCEEDED',
        providerRefundId: existing,
      };
    }
    return {
      found: false,
      status: 'NOT_FOUND',
    };
  }
}

export const paymentGateway = new VietnamPaymentGateway();
