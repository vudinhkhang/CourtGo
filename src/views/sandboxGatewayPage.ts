import { escapeHtml } from '../utils/security.js';
import { formatVietnamDateTimeDisplay, formatVnd } from '../utils/time.js';
import { faviconDataUri, logoLockup } from './icons.js';
import { generateRealQrSvg } from '../utils/qrCode.js';

/** Tạo mã QR SVG chuẩn quốc tế ISO/IEC 18004 (quét được bằng Camera điện thoại / Zalo / App ngân hàng). */
export function renderQrCodeSvg(seedText: string, size = 210): string {
  return generateRealQrSvg(seedText, size);
}

export function renderSandboxGatewayPage(params: {
  merchantId: string;
  merchantTxnRef: string;
  bookingCode: string;
  amountVnd: number;
  currency: string;
  expiresAtIso: string;
  returnUrl: string;
  signature: string;
  paymentMethod?: string;
  bankCode?: string;
}): string {
  const methodCode = (params.paymentMethod || 'QR_PAY').toUpperCase();
  const bankCode = (params.bankCode || 'VNPAYQR').toUpperCase();
  const methodLabel =
    methodCode === 'ATM_BANK' || methodCode === 'ATM_CARD'
      ? `Thẻ ATM nội địa / Internet Banking (${bankCode})`
      : methodCode === 'INTL_CARD' || methodCode === 'INT_CARD'
        ? 'Thẻ quốc tế (Visa / MasterCard / JCB)'
        : methodCode === 'EWALLET'
          ? 'Ví điện tử liên kết (VNPAY / MoMo / ZaloPay)'
          : 'Thanh toán quét mã VietQR 24/7';

  const qrPayload = `COURTGO|${params.bookingCode || 'DEMO-SANDBOX'}|${params.merchantTxnRef || 'TXN-DEMO-001'}|${params.amountVnd || 120000}`;
  const hasActiveTxn = Boolean(params.bookingCode && params.merchantTxnRef && params.amountVnd > 0);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cổng Thanh Toán Trực Tuyến — CourtGo &amp; Be Badminton</title>
  <link rel="icon" href="${faviconDataUri()}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #1755aa;
      --primary-hover: #103f80;
      --primary-tint: #edf3fb;
      --ink: #0d3b66;
      --body: #354d61;
      --muted: #607487;
      --accent-yellow: #f4b000;
      --green: #059669;
      --border: #dce6ee;
      --card-bg: #ffffff;
      --surface: #f1f6fa;
    }
    * { box-sizing: border-box; font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif; }
    body {
      background: var(--surface);
      color: var(--body);
      margin: 0;
      padding: 24px 16px 48px;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Top Gateway Header */
    .gateway-shell {
      width: 100%;
      max-width: 980px;
    }
    .gateway-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 0 4px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .gateway-topbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .gateway-topbar-left .sub-tagline {
      font-size: 13px;
      color: var(--muted);
      border-left: 1px solid #cbd5e1;
      padding-left: 14px;
      line-height: 1.3;
    }
    .gateway-topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge-secure {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid #a7f3d0;
    }
    .badge-sandbox {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fffbeb;
      color: #92400e;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid #fde68a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Countdown Bar */
    .countdown-banner {
      background: #ffffff;
      border: 1px solid #dce6ee;
      border-radius: 14px;
      padding: 12px 20px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 14px rgba(15, 45, 75, 0.04);
      flex-wrap: wrap;
      gap: 10px;
    }
    .countdown-banner-left {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      color: var(--ink);
    }
    .countdown-timer-box {
      font-size: 15px;
      font-weight: 750;
      color: #dc2626;
      background: #fef2f2;
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid #fecaca;
      font-variant-numeric: tabular-nums;
    }

    /* Main Container */
    .gateway-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: 0 16px 44px rgba(13, 59, 102, 0.08);
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(320px, 1fr) minmax(380px, 1.25fr);
    }

    @media (max-width: 820px) {
      .gateway-card {
        grid-template-columns: 1fr;
      }
    }

    /* Left Column: Order details */
    .gateway-left {
      background: #fafcfe;
      border-right: 1px solid var(--border);
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 24px;
    }
    @media (max-width: 820px) {
      .gateway-left {
        border-right: none;
        border-bottom: 1px solid var(--border);
        padding: 24px 20px;
      }
    }
    .order-brand-head h2 {
      font-size: 19px;
      font-weight: 700;
      color: var(--ink);
      margin: 0 0 4px;
    }
    .order-brand-head p {
      font-size: 13px;
      color: var(--muted);
      margin: 0;
      line-height: 1.5;
    }

    .amount-highlight-box {
      background: #ffffff;
      border: 1.5px solid #dce6ee;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(15, 45, 75, 0.04);
      margin-top: 14px;
    }
    .amount-highlight-box span {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 6px;
    }
    .amount-highlight-box strong {
      font-size: 32px;
      font-weight: 800;
      color: var(--primary);
      font-variant-numeric: tabular-nums;
      display: block;
      line-height: 1.1;
    }

    .order-meta-list {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .order-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13.5px;
      padding-bottom: 10px;
      border-bottom: 1px solid #edf2f7;
      gap: 10px;
    }
    .order-meta-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .order-meta-row .label {
      color: #64748b;
    }
    .order-meta-row .val {
      color: var(--ink);
      font-weight: 600;
      text-align: right;
    }
    .val-code {
      background: #edf3fb;
      color: #0d3b66;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .left-policy-box {
      background: #edf3fb;
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 12.5px;
      color: #334d6b;
      line-height: 1.6;
    }
    .left-policy-box strong {
      color: var(--ink);
    }

    /* Right Column: Payment Tabs & Interactive Form */
    .gateway-right {
      padding: 32px 30px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 22px;
    }
    @media (max-width: 820px) {
      .gateway-right {
        padding: 24px 20px;
      }
    }

    /* Payment Tabs */
    .pay-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid #eef3f8;
      padding-bottom: 8px;
      overflow-x: auto;
    }
    .pay-tab-btn {
      border: none;
      background: transparent;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .pay-tab-btn:hover {
      color: var(--primary);
      background: #edf3fb;
    }
    .pay-tab-btn.is-active {
      color: #ffffff;
      background: var(--primary);
      box-shadow: 0 4px 12px rgba(23, 85, 170, 0.28);
    }

    /* QR Pay Screen */
    .vietqr-box {
      background: #ffffff;
      border: 1.5px solid #dce6ee;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 6px 20px rgba(15, 45, 75, 0.05);
      margin: 6px 0 16px;
    }
    .vietqr-header {
      background: linear-gradient(90deg, #d32f2f 0%, #1565c0 100%);
      color: #ffffff;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .vietqr-content {
      padding: 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .vietqr-image-wrap {
      background: #ffffff;
      padding: 12px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      display: inline-flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 16px;
      border: 1px solid #eef2f6;
    }
    .vietqr-guide-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      width: 100%;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px dashed #e2e8f0;
      text-align: left;
    }
    @media (max-width: 540px) {
      .vietqr-guide-steps {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }
    .step-item {
      font-size: 11.5px;
      color: #55697d;
      line-height: 1.45;
    }
    .step-item strong {
      color: var(--ink);
      display: block;
      margin-bottom: 2px;
    }

    /* Copyable Transfer Rows */
    .transfer-quick-rows {
      width: 100%;
      background: #f8fafc;
      border-radius: 12px;
      padding: 12px 14px;
      display: grid;
      gap: 8px;
      margin-top: 12px;
      text-align: left;
    }
    .transfer-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
    }
    .transfer-field .field-name {
      color: #64748b;
    }
    .transfer-field .field-val {
      font-weight: 700;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-copy {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 600;
      color: var(--primary);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-copy:hover {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
    }

    /* Tab Panes */
    .tab-pane {
      display: none;
    }
    .tab-pane.is-active {
      display: block;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Mock Form Controls */
    .mock-bank-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 16px 0;
    }
    @media (max-width: 500px) {
      .mock-bank-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .mock-bank-btn {
      border: 1.5px solid #dce6ee;
      background: #ffffff;
      border-radius: 10px;
      padding: 12px 6px;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--ink);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mock-bank-btn:hover, .mock-bank-btn.selected {
      border-color: var(--primary);
      background: #edf3fb;
      color: var(--primary);
    }
    .mock-input-group {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }
    .mock-input-row {
      display: grid;
      gap: 6px;
    }
    .mock-input-row label {
      font-size: 13px;
      font-weight: 600;
      color: #334d6b;
    }
    .mock-input-row input {
      height: 44px;
      border-radius: 9px;
      border: 1px solid #cbd5e1;
      padding: 0 14px;
      font-size: 14px;
      background: #ffffff;
    }

    /* Actions Form */
    .gateway-actions-form {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }
    .btn-action-primary {
      height: 52px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(180deg, #1755aa 0%, #0d3b66 100%);
      color: #ffffff;
      font-size: 15.5px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 8px 24px rgba(23, 85, 170, 0.28);
      transition: all 0.2s ease;
      width: 100%;
    }
    .btn-action-primary:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
      box-shadow: 0 12px 28px rgba(23, 85, 170, 0.35);
    }
    .btn-action-secondary {
      height: 44px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #64748b;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      width: 100%;
    }
    .btn-action-secondary:hover {
      background: #f8fafc;
      color: #b91c1c;
      border-color: #fca5a5;
    }

    /* Footer Security */
    .gateway-footer-sec {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 18px;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }

    /* Loading overlay */
    #loading-state {
      display: none;
      text-align: center;
      padding: 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      font-size: 13.5px;
      color: var(--primary);
      font-weight: 600;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  </style>
</head>
<body>
  <div class="gateway-shell">
    <!-- Topbar -->
    <header class="gateway-topbar">
      <div class="gateway-topbar-left">
        <a href="/" style="text-decoration:none; display:inline-flex;" aria-label="Về trang chủ CourtGo">
          ${logoLockup({ size: 30 })}
        </a>
        <span class="sub-tagline">Cổng Thanh Toán Trực Tuyến<br/><strong>Be Badminton Gò Vấp</strong></span>
      </div>
      <div class="gateway-topbar-right">
        <span class="badge-secure">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          SSL 256-Bit
        </span>
        <span class="badge-sandbox">● Chế độ Hướng dẫn Sandbox</span>
      </div>
    </header>

    ${
      hasActiveTxn
        ? `
    <!-- Real-time Countdown Banner -->
    <div class="countdown-banner" role="timer" aria-live="polite">
      <div class="countdown-banner-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Thời gian giữ chỗ và hoàn tất thanh toán còn lại:</span>
      </div>
      <div class="countdown-timer-box" id="sandbox-countdown">04:59</div>
    </div>

    <!-- Main Gateway Box -->
    <main class="gateway-card">
      <!-- Cột Trái: Thông tin vé & Tóm tắt giao dịch -->
      <section class="gateway-left">
        <div>
          <div class="order-brand-head">
            <h2>Đơn đặt sân Be Badminton</h2>
            <p>262/1 Quang Trung, Phường 10, Quận Gò Vấp, TP.HCM</p>
          </div>

          <div class="amount-highlight-box">
            <span>Tổng thanh toán</span>
            <strong>${escapeHtml(formatVnd(params.amountVnd))}</strong>
          </div>

          <div class="order-meta-list">
            <div class="order-meta-row">
              <span class="label">Mã đơn đặt sân</span>
              <span class="val"><span class="val-code">${escapeHtml(params.bookingCode)}</span></span>
            </div>
            <div class="order-meta-row">
              <span class="label">Mã tham chiếu GD</span>
              <span class="val" style="font-size:12.5px; font-family:monospace;">${escapeHtml(params.merchantTxnRef)}</span>
            </div>
            <div class="order-meta-row">
              <span class="label">Phương thức</span>
              <span class="val">${escapeHtml(methodLabel)}</span>
            </div>
            <div class="order-meta-row">
              <span class="label">Hạn thanh toán</span>
              <span class="val" style="color:#dc2626;">${escapeHtml(formatVietnamDateTimeDisplay(params.expiresAtIso))}</span>
            </div>
          </div>
        </div>

        <div class="left-policy-box">
          🛡️ <strong>Cam kết giao dịch:</strong><br/>
          Sân được khóa tự động độc quyền trong 5 phút. Ngay khi giao dịch hoàn tất, vé điện tử và mã QR vào sân sẽ hiển thị tức thì.
        </div>
      </section>

      <!-- Cột Phải: Các hình thức thanh toán mô phỏng -->
      <section class="gateway-right">
        <div>
          <!-- Tab Navigation -->
          <nav class="pay-tabs" role="tablist">
            <button type="button" class="pay-tab-btn is-active" data-tab="tab-qr" role="tab" aria-selected="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              Quét mã VietQR
            </button>
            <button type="button" class="pay-tab-btn" data-tab="tab-atm" role="tab" aria-selected="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              Thẻ ATM nội địa
            </button>
            <button type="button" class="pay-tab-btn" data-tab="tab-intl" role="tab" aria-selected="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              Thẻ Quốc tế
            </button>
          </nav>

          <!-- Tab 1: VietQR Code -->
          <div class="tab-pane is-active" id="tab-qr" role="tabpanel">
            <div class="vietqr-box">
              <div class="vietqr-header">
                <span>VIETQR · NAPAS 247</span>
                <span>THANH TOÁN 24/7</span>
              </div>
              <div class="vietqr-content">
                <div class="vietqr-image-wrap">
                  ${renderQrCodeSvg(qrPayload, 195)}
                </div>

                <!-- Chuyển khoản thủ công -->
                <div class="transfer-quick-rows">
                  <div class="transfer-field">
                    <span class="field-name">Ngân hàng:</span>
                    <span class="field-val">MB Bank (Quân Đội)</span>
                  </div>
                  <div class="transfer-field">
                    <span class="field-name">Chủ tài khoản:</span>
                    <span class="field-val">BE BADMINTON GO VAP</span>
                  </div>
                  <div class="transfer-field">
                    <span class="field-name">Số tài khoản:</span>
                    <span class="field-val">
                      <span>0773333371</span>
                      <button type="button" class="btn-copy" onclick="copyText('0773333371', this)">Sao chép</button>
                    </span>
                  </div>
                  <div class="transfer-field">
                    <span class="field-name">Số tiền:</span>
                    <span class="field-val">
                      <span>${escapeHtml(formatVnd(params.amountVnd))}</span>
                      <button type="button" class="btn-copy" onclick="copyText('${params.amountVnd}', this)">Sao chép</button>
                    </span>
                  </div>
                  <div class="transfer-field">
                    <span class="field-name">Nội dung CK:</span>
                    <span class="field-val">
                      <span>COURTGO ${escapeHtml(params.bookingCode)}</span>
                      <button type="button" class="btn-copy" onclick="copyText('COURTGO ${params.bookingCode}', this)">Sao chép</button>
                    </span>
                  </div>
                </div>

                <!-- 3 Bước hướng dẫn -->
                <div class="vietqr-guide-steps">
                  <div class="step-item">
                    <strong>1. Mở App ngân hàng</strong>
                    Bất kỳ app ngân hàng hoặc MoMo / ZaloPay
                  </div>
                  <div class="step-item">
                    <strong>2. Quét mã QR</strong>
                    Camera tự nhận số tiền &amp; nội dung
                  </div>
                  <div class="step-item">
                    <strong>3. Xác nhận chuyển</strong>
                    Hệ thống tự động kích hoạt vé ngay lập tức
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: Thẻ ATM nội địa -->
          <div class="tab-pane" id="tab-atm" role="tabpanel">
            <p style="font-size:13px; color:#55697d; margin: 12px 0 8px;">Chọn ngân hàng phát hành thẻ ATM của bạn:</p>
            <div class="mock-bank-grid">
              <div class="mock-bank-btn selected">Vietcombank</div>
              <div class="mock-bank-btn">MB Bank</div>
              <div class="mock-bank-btn">Techcombank</div>
              <div class="mock-bank-btn">ACB</div>
              <div class="mock-bank-btn">BIDV</div>
              <div class="mock-bank-btn">Agribank</div>
              <div class="mock-bank-btn">VPBank</div>
              <div class="mock-bank-btn">TPBank</div>
            </div>
            <div class="mock-input-group">
              <div class="mock-input-row">
                <label>Số thẻ ATM</label>
                <input type="text" placeholder="9704 xxxx xxxx xxxx" value="9704 2200 1234 5678" readonly />
              </div>
              <div class="mock-input-row">
                <label>Tên in trên thẻ (không dấu)</label>
                <input type="text" placeholder="NGUYEN VAN A" value="NGUYEN VAN A" readonly />
              </div>
            </div>
          </div>

          <!-- Tab 3: Thẻ Quốc tế Visa / Master -->
          <div class="tab-pane" id="tab-intl" role="tabpanel">
            <p style="font-size:13px; color:#55697d; margin: 12px 0 8px;">Hỗ trợ thẻ tín dụng &amp; ghi nợ quốc tế Visa / MasterCard / JCB:</p>
            <div class="mock-input-group">
              <div class="mock-input-row">
                <label>Số thẻ quốc tế</label>
                <input type="text" placeholder="4123 xxxx xxxx xxxx" value="4123 4567 8901 2345" readonly />
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div class="mock-input-row">
                  <label>Ngày hết hạn</label>
                  <input type="text" placeholder="MM/YY" value="12/28" readonly />
                </div>
                <div class="mock-input-row">
                  <label>Mã CVV/CVC</label>
                  <input type="password" placeholder="•••" value="888" readonly />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Submission Controls -->
        <div>
          <div id="loading-state">
            ⏳ Đang gửi xác thực giao dịch qua IPN Webhook...
          </div>

          <form method="POST" action="/cong-thanh-toan-sandbox/xu-ly" id="sandbox-payment-form" class="gateway-actions-form">
            <input type="hidden" name="merchantTxnRef" value="${escapeHtml(params.merchantTxnRef)}" />
            <input type="hidden" name="bookingCode" value="${escapeHtml(params.bookingCode)}" />
            <input type="hidden" name="amountVnd" value="${params.amountVnd}" />
            <input type="hidden" name="currency" value="${escapeHtml(params.currency)}" />
            <input type="hidden" name="returnUrl" value="${escapeHtml(params.returnUrl)}" />
            <input type="hidden" name="signature" value="${escapeHtml(params.signature)}" />

            <!-- Thông tin tài khoản nguồn (AML & Hoàn cọc an toàn) -->
            <div class="aml-sender-box" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-bottom:14px; text-align:left;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:12.5px; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:6px;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  Tài khoản ngân hàng gửi (AML &amp; Hoàn cọc)
                </span>
                <span style="font-size:10.5px; font-weight:700; color:#047857; background:#d1fae5; border:1px solid #6ee7b7; padding:2px 7px; border-radius:99px;">
                  Chống rửa tiền AML
                </span>
              </div>
              <p style="font-size:11.5px; color:#64748b; line-height:1.45; margin:0 0 10px;">
                CourtGo lưu thông tin tài khoản chuyển để <strong>hoàn tiền thủ công/tự động</strong> và <strong>chống rửa tiền qua hoàn cọc</strong> theo quy định ngân hàng. Mọi khoản hoàn (nếu có) sẽ chuyển về đúng tài khoản nguồn này.
              </p>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">
                <div>
                  <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:3px;">Ngân hàng gửi:</label>
                  <select name="senderBankName" id="senderBankNameSelect" onchange="updateBankCode(this.value)" style="width:100%; height:34px; padding:4px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
                    <option value="MB Bank (Quân Đội)" data-code="MB" selected>MB Bank (Quân Đội)</option>
                    <option value="Vietcombank" data-code="VCB">Vietcombank</option>
                    <option value="Techcombank" data-code="TCB">Techcombank</option>
                    <option value="BIDV" data-code="BIDV">BIDV</option>
                    <option value="VietinBank" data-code="CTG">VietinBank</option>
                    <option value="ACB" data-code="ACB">ACB</option>
                    <option value="VPBank" data-code="VPB">VPBank</option>
                    <option value="TPBank" data-code="TPB">TPBank</option>
                    <option value="Agribank" data-code="VBA">Agribank</option>
                  </select>
                  <input type="hidden" name="senderBankCode" id="senderBankCodeHidden" value="MB" />
                </div>
                <div>
                  <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:3px;">Số tài khoản gửi:</label>
                  <input type="text" name="senderAccountNo" value="0987654321" required style="width:100%; height:34px; padding:4px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; font-family:monospace;" />
                </div>
              </div>
              <div>
                <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:3px;">Tên chủ tài khoản (không dấu):</label>
                <input type="text" name="senderAccountName" value="NGUYEN VAN A" required style="width:100%; height:34px; padding:4px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; text-transform:uppercase;" />
              </div>
            </div>

            <button type="submit" name="action" value="SUCCESS" id="btn-pay-success" class="btn-action-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Tôi đã chuyển khoản thành công (${escapeHtml(formatVnd(params.amountVnd))})</span>
            </button>

            <button type="submit" name="action" value="FAIL" class="btn-action-secondary">
              Hủy giao dịch / Trở về đơn đặt
            </button>
          </form>

          <div class="gateway-footer-sec">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span>Bảo mật chuẩn PCI-DSS &amp; Xác thực chữ ký HMAC-SHA256 theo thời gian thực</span>
          </div>
        </div>
      </section>
    </main>
    `
        : `
    <!-- Màn hình Hướng dẫn khi truy cập không kèm mã đơn -->
    <main class="gateway-card" style="grid-template-columns: 1fr;">
      <section style="padding: 44px 36px; text-align: center; max-width: 680px; margin: 0 auto;">
        <div style="display:flex; justify-content:center; margin-bottom:18px;">
          ${logoLockup({ size: 40 })}
        </div>
        <h1 style="font-size: 24px; font-weight:800; color:var(--ink); margin: 0 0 12px;">
          Cổng Thanh Toán Mô Phỏng Sandbox — CourtGo
        </h1>
        <p style="font-size: 14.5px; color: var(--muted); line-height: 1.7; margin: 0 0 28px;">
          Môi trường kiểm thử thanh toán quét mã VietQR và IPN Webhook có xác thực chữ ký số <code>HMAC-SHA256</code>. Để bắt đầu trải nghiệm, bạn vui lòng chọn sân và khung giờ trên trang đặt sân.
        </p>

        <div style="display:flex; justify-content:center; gap: 14px; flex-wrap:wrap;">
          <a href="/#lich-san-nhanh" class="btn-action-primary" style="display:inline-flex; width:auto; padding: 0 28px; text-decoration:none;">
            1. Chọn sân trống để tạo giao dịch thử nghiệm →
          </a>
          <a href="/don-dat" class="btn-action-secondary" style="display:inline-flex; width:auto; padding: 0 24px; text-decoration:none;">
            Xem danh sách đơn đặt của tôi
          </a>
        </div>
      </section>
    </main>
    `
    }
  </div>

  <script>
    // Copy helper
    function copyText(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Đã chép!';
        btn.style.background = '#059669';
        btn.style.color = '#ffffff';
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = '';
          btn.style.color = '';
        }, 1800);
      }).catch(() => {
        alert('Đã sao chép: ' + text);
      });
    }

    function updateBankCode(val) {
      const sel = document.getElementById('senderBankNameSelect');
      if (!sel) return;
      const opt = sel.options[sel.selectedIndex];
      const code = opt ? (opt.getAttribute('data-code') || 'BANK') : 'BANK';
      const hidden = document.getElementById('senderBankCodeHidden');
      if (hidden) hidden.value = code;
    }

    // Tabs switching
    document.querySelectorAll('.pay-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pay-tab-btn').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('is-active'));

        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        const targetId = btn.dataset.tab;
        document.getElementById(targetId)?.classList.add('is-active');
      });
    });

    // Mock Bank buttons
    document.querySelectorAll('.mock-bank-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mock-bank-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Countdown Timer (5 phút chân thực)
    const countdownEl = document.getElementById('sandbox-countdown');
    if (countdownEl) {
      let secondsLeft = 299;
      const timer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(timer);
          countdownEl.textContent = '00:00 - Hết hạn';
          countdownEl.style.color = '#b91c1c';
          alert('Thời gian giữ chỗ thanh toán đã hết. Vui lòng đặt lại khung giờ.');
          return;
        }
        const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
        const s = String(secondsLeft % 60).padStart(2, '0');
        countdownEl.textContent = m + ':' + s;
      }, 1000);
    }

    // Interactive Submit Simulation
    const form = document.getElementById('sandbox-payment-form');
    const paySuccessBtn = document.getElementById('btn-pay-success');
    const loadingState = document.getElementById('loading-state');

    if (paySuccessBtn && form) {
      paySuccessBtn.addEventListener('click', (e) => {
        e.preventDefault();
        paySuccessBtn.disabled = true;
        paySuccessBtn.style.opacity = '0.6';
        if (loadingState) loadingState.style.display = 'block';

        // Tạo cảm giác đang xác thực qua Webhook IPN ngân hàng trong 1.1 giây
        setTimeout(() => {
          const hiddenAction = document.createElement('input');
          hiddenAction.type = 'hidden';
          hiddenAction.name = 'action';
          hiddenAction.value = 'SUCCESS';
          form.appendChild(hiddenAction);
          form.submit();
        }, 1100);
      });
    }
  </script>
</body>
</html>`;
}
