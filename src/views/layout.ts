import { membershipProgress } from './membership.js';
import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { faviconDataUri, iconBadge, inlineIcon, logoLockup, svgGlyph } from './icons.js';
import { formatVietnamDateTimeDisplay } from '../utils/time.js';

export function formatBookingStatusVi(status: string): { label: string; symbol: string; cssClass: string } {
  switch (status) {
    case 'HOLD':
      return { label: 'Đang giữ chỗ', symbol: '◔', cssClass: 'badge-live' };
    case 'CONFIRMED':
      return { label: 'Đã xác nhận', symbol: '●', cssClass: 'badge-confirmed' };
    case 'CHECKED_IN':
      return { label: 'Đã nhận sân', symbol: '▶', cssClass: 'badge-confirmed' };
    case 'COMPLETED':
      return { label: 'Đã hoàn tất', symbol: '✓', cssClass: 'badge-neutral' };
    case 'EXPIRED':
      return { label: 'Đã hết hạn giữ chỗ', symbol: '—', cssClass: 'badge-muted' };
    case 'CANCELLED':
      return { label: 'Đã hủy', symbol: '✕', cssClass: 'badge-cancelled' };
    default:
      return { label: 'Đang xử lý', symbol: '•', cssClass: 'badge-neutral' };
  }
}

export function formatPaymentStatusVi(status: string): { label: string; symbol: string; cssClass: string } {
  switch (status) {
    case 'UNPAID':
      return { label: 'Chưa thanh toán', symbol: '○', cssClass: 'badge-muted' };
    case 'PENDING':
      return { label: 'Đang chờ xác nhận thanh toán', symbol: '◔', cssClass: 'badge-live' };
    case 'PAID':
      return { label: 'Đã thanh toán', symbol: '✓', cssClass: 'badge-confirmed' };
    case 'FAILED':
      return { label: 'Thanh toán chưa thành công', symbol: '!', cssClass: 'badge-live' };
    case 'LATE_PAID_CONFLICT':
      return { label: 'Thanh toán đến sau khi hết hạn', symbol: '!', cssClass: 'badge-live' };
    default:
      return { label: 'Đang kiểm tra', symbol: '•', cssClass: 'badge-neutral' };
  }
}

export function formatRefundStatusVi(status: string): { label: string; symbol: string; cssClass: string } {
  switch (status) {
    case 'NONE':
      return { label: 'Không phát sinh', symbol: '—', cssClass: 'badge-muted' };
    case 'NOT_APPLICABLE':
      return { label: 'Không phát sinh hoàn tiền', symbol: '—', cssClass: 'badge-muted' };
    case 'PENDING':
      return { label: 'Chúng tôi đang xử lý khoản hoàn', symbol: '◔', cssClass: 'badge-live' };
    case 'PROCESSING':
      return { label: 'Đang xử lý khoản hoàn', symbol: '◔', cssClass: 'badge-live' };
    case 'REFUNDED':
      return { label: 'Đã hoàn tiền', symbol: '✓', cssClass: 'badge-confirmed' };
    case 'FAILED_RETRYABLE':
      return { label: 'Đang xử lý khoản hoàn (tự động thử lại)', symbol: '◔', cssClass: 'badge-live' };
    case 'MANUAL_REVIEW':
      return { label: 'Chưa thể hoàn tiền. Bộ phận hỗ trợ đang kiểm tra.', symbol: '!', cssClass: 'badge-cancelled' };
    default:
      return { label: 'Đang kiểm tra', symbol: '•', cssClass: 'badge-neutral' };
  }
}

export function formatRoleVi(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Quản trị viên';
    case 'STAFF':
      return 'Nhân sự vận hành';
    case 'CUSTOMER':
      return 'Khách hàng';
    default:
      return 'Thành viên';
  }
}

export interface HeaderNotificationItem {
  id: string;
  booking_id: string | null;
  booking_code?: string | null;
  type?: string;
  title_vi: string;
  body_vi: string;
  is_read: boolean;
  created_at: string | Date;
}

export interface PageLayoutOptions {
  title: string;
  description?: string;
  activeNav?: 'home' | 'schedule' | 'pricing' | 'services' | 'news' | 'guide' | 'bookings' | 'account' | 'policy' | 'admin';
  session: SessionContext | null;
  flashMessage?: { type: 'success' | 'error' | 'info'; text: string } | null;
  isAdminSurface?: boolean;
  unreadNotificationsCount?: number;
  recentNotifications?: HeaderNotificationItem[];
  /** Khối tràn viền hiển thị ngay dưới thanh điều hướng (ví dụ hero tối của trang chủ). */
  fullBleedTopHtml?: string;
  bodyHtml: string;
}

function renderHeaderNotificationItem(n: HeaderNotificationItem): string {
  const isUnread = !n.is_read;
  const targetUrl = n.booking_code ? `/don-dat/${encodeURIComponent(n.booking_code)}` : '/don-dat';
  const createdDate = new Date(n.created_at);
  const timeFormatted = formatVietnamDateTimeDisplay(createdDate);

  return `
    <a href="${targetUrl}" class="notif-item ${isUnread ? 'is-unread' : 'is-read'}" ${n.booking_code ? `title="Xem chi tiết đơn ${escapeHtml(n.booking_code)}"` : ''}>
      <div class="notif-item-content">
        <div class="notif-item-title-row">
          <div class="notif-item-title">${escapeHtml(n.title_vi)}</div>
          ${isUnread ? `<span class="notif-unread-dot" title="Chưa đọc"></span>` : ''}
        </div>
        <div class="notif-item-body">${escapeHtml(n.body_vi)}</div>
        <div class="notif-item-time">${escapeHtml(timeFormatted)}</div>
      </div>
    </a>
  `;
}

/** Tiêu đề mục thống nhất: icon tròn nhiều màu + tiêu đề nét mảnh (display 400). */
export function sectionHeading(opts: {
  title: string;
  icon?: string;
  tone?: Parameters<typeof iconBadge>[1];
  level?: 'h1' | 'h2';
  id?: string;
  subtitle?: string;
  actionHtml?: string;
}): string {
  const tag = opts.level || 'h2';
  return `<div class="section-eyebrow-lockup">
    <div class="section-heading-main">
      ${opts.icon ? iconBadge(opts.icon, opts.tone || 'blue', 44) : '<span class="eyebrow-bar"></span>'}
      <div>
        <${tag} ${opts.id ? `id="${escapeHtml(opts.id)}"` : ''} class="eyebrow-text">${escapeHtml(opts.title)}</${tag}>
        ${opts.subtitle ? `<p class="section-subtitle">${escapeHtml(opts.subtitle)}</p>` : ''}
      </div>
    </div>
    ${opts.actionHtml ? `<div class="section-heading-action">${opts.actionHtml}</div>` : ''}
  </div>`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  return (last[0] || 'K').toUpperCase();
}

export function renderPageLayout(opts: PageLayoutOptions): string {
  const user = opts.session?.user || null;
  const isStaffOrAdmin = !!user && (user.role === 'ADMIN' || user.role === 'STAFF');
  const isAdminArea = opts.activeNav === 'admin';
  const navItems: Array<{ key: PageLayoutOptions['activeNav']; href: string; label: string; show: boolean }> = [
    { key: 'home', href: '/', label: 'Trang chủ', show: true },
    { key: 'schedule', href: opts.activeNav === 'home' ? '#lich-san-nhanh' : '/#lich-san-nhanh', label: 'Đặt sân', show: true },
    { key: 'pricing', href: '/#bang-gia-niem-yet', label: 'Bảng giá', show: true },
    { key: 'services', href: '/dung-cu', label: 'Dụng cụ & phụ kiện', show: true },
    { key: 'news', href: '/tin-tuc', label: 'Tin tức', show: true },
    { key: 'bookings', href: '/don-dat', label: 'Đơn đặt sân của tôi', show: true },
  ];

  const flashIcon =
    opts.flashMessage?.type === 'error'
      ? iconBadge('alert', 'red', 36)
      : opts.flashMessage?.type === 'success'
        ? iconBadge('check', 'green', 36)
        : iconBadge('info', 'blue', 36);

  const fullTitle = opts.title.includes('Be Badminton') || opts.title.includes('CourtGo')
    ? opts.title
    : `${opts.title} | Be Badminton Gò Vấp`;

  const metaDesc = opts.description
    || 'Đặt sân cầu lông Be Badminton Gò Vấp trực tuyến 24/7. Tổ hợp 18 sân tiêu chuẩn thi đấu tại 262/1 Quang Trung, Quận Gò Vấp. Giữ chỗ tự động 5 phút, thanh toán quét mã QR VietQR, bảng giá minh bạch từ 80.000đ/ca chơi.';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0052ff" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <meta name="keywords" content="sân cầu lông gò vấp, đặt sân cầu lông, be badminton, thuê sân cầu lông tphcm, bảng giá sân cầu lông, 18 sân cầu lông quang trung" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(fullTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:site_name" content="Hệ Thống Sân Cầu Lông Be Badminton Gò Vấp" />
  <link rel="icon" href="${faviconDataUri()}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Lexend:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #0052ff;
      --primary-active: #003ecc;
      --primary-disabled: #a8b8cc;
      --primary-tint: #e8efff;
      --ink: #0f172a;
      --body: #475569;
      --muted: #64748b;
      --muted-soft: #94a3b8;
      --hairline: #e2e8f0;
      --hairline-soft: #f1f5f9;
      --canvas: #ffffff;
      --surface-soft: #f8fafc;
      --surface-strong: #f1f5f9;
      --surface-dark: #091a32;
      --surface-dark-elevated: #0d3b66;
      --on-dark: #ffffff;
      --on-dark-soft: #94a3b8;
      --up: #0f6938;
      --down: #dc2626;
      --accent-yellow: #f59e0b;

      /* Ánh xạ tương thích với các biến cũ đang dùng trong markup nội dòng */
      --color-primary: var(--primary);
      --color-on-primary: #ffffff;
      --color-live-red: var(--down);
      --color-ink: var(--ink);
      --color-charcoal: var(--body);
      --color-slate: var(--muted);
      --color-canvas: var(--canvas);
      --color-soft: var(--surface-soft);
      --color-hairline: var(--hairline);
      --color-silver: var(--hairline);
      --color-graphite: var(--body);
      --color-rail-teal: var(--up);
      --color-rail-red: var(--down);
      --color-gold: var(--accent-yellow);

      --r-xs: 4px; --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 20px; --r-pill: 100px;
      --shadow-soft: 0 4px 16px rgba(15, 23, 42, 0.05);
      --font-sans: 'Lexend', -apple-system, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --font-mono: 'JetBrains Mono', 'Lexend', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font-sans); }
    html { scroll-behavior: smooth; font-family: var(--font-sans); }
    body {
      font-family: var(--font-sans);
      font-size: 16px; line-height: 1.5; font-weight: 400;
      color: var(--ink); background: var(--canvas);
      -webkit-font-smoothing: antialiased;
    }
    button, input, select, textarea { font-family: var(--font-sans); }
    img { max-width: 100%; display: block; }
    a { color: var(--ink); text-decoration: none; }
    a:hover { color: var(--primary); }
    code { font-family: var(--font-sans); font-size: 0.9em; font-weight: 600; background: var(--surface-strong); padding: 1px 6px; border-radius: var(--r-xs); }
    .num, .mono { font-family: var(--font-sans); font-variant-numeric: tabular-nums; }

    a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {
      outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 8px;
    }

    .skip-link {
      position: absolute; left: -9999px; top: 10px; z-index: 9999;
      background: var(--primary); color: #fff; padding: 10px 18px; border-radius: var(--r-pill); font-weight: 600;
    }
    .skip-link:focus { left: 16px; color: #fff; }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* ── Logo ── */
    .logo-block { display: inline-flex; align-items: center; gap: 10px; }
    .logo-word { font-size: 22px; font-weight: 700; letter-spacing: -0.6px; line-height: 1; }
    .logo-word-court { color: var(--ink); }
    .logo-word-go { color: var(--primary); }
    .logo-on-dark .logo-word-court { color: #fff; }
    .logo-on-dark .logo-word-go { color: #8fb0ff; }
    .brand-link { display: inline-flex; align-items: center; gap: 12px; }
    .brand-link:hover { color: inherit; }
    .brand-tagline { font-size: 12px; color: var(--muted); border-left: 1px solid var(--hairline); padding-left: 12px; line-height: 1.3; }

    /* ── Icon ── */
    .icon-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; flex-shrink: 0; }
    .inline-icon { display: inline-flex; align-items: center; }

    /* ── Top nav ── */
    .site-header { background: rgba(255,255,255,0.96); backdrop-filter: saturate(180%) blur(12px); border-bottom: 1px solid var(--hairline-soft); position: sticky; top: 0; z-index: 100; }
    .nav-bar { display: flex; align-items: center; justify-content: space-between; min-height: 64px; gap: 14px; flex-wrap: nowrap; }
    .nav-links { display: flex; align-items: center; gap: 2px; list-style: none; flex-shrink: 1; }
    .nav-links a { font-size: 13.5px; font-weight: 500; color: var(--ink); padding: 7px 11px; border-radius: var(--r-pill); display: inline-block; white-space: nowrap; }
    .nav-links a:hover { background: var(--surface-strong); color: var(--ink); }
    .nav-links a.active { background: var(--primary-tint); color: var(--primary); font-weight: 600; }
    .nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: nowrap; }
    .user-chip { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px 3px 4px; border-radius: var(--r-pill); background: var(--surface-strong); font-size: 13.5px; font-weight: 600; text-decoration: none; max-width: 230px; white-space: nowrap; overflow: hidden; }
    .user-chip:hover { color: var(--ink); background: var(--hairline); }
    .user-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; }
    .avatar { width: 30px; height: 30px; border-radius: 9999px; background: linear-gradient(135deg, #2f6bff, #7b61ff); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
    
    /* ── Dropdown menu tài khoản người dùng (Header User Dropdown) ── */
    .user-dropdown-wrap { position: relative; display: inline-flex; align-items: center; }
    .user-chip-btn {
      border: 1px solid var(--hairline);
      cursor: pointer;
      font-family: inherit;
      color: inherit;
      transition: background 0.15s ease, border-color 0.15s ease;
      background: var(--surface-strong);
    }
    .user-chip-btn:hover, .user-chip-btn[aria-expanded="true"] {
      background: var(--hairline);
      border-color: #cbd5e1;
    }
    .user-popover {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 320px;
      max-width: 92vw;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 16px 40px -6px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08);
      z-index: 1050;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: notifSlideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .user-popover-header {
      padding: 14px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
    }
    .user-popover-tier-card {
      padding: 12px 16px;
      background: #ffffff;
      border-bottom: 1px solid #f1f5f9;
    }
    .user-popover-tier-pill {
      font-size: 11.5px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .user-popover-tier-pill.tier-gold {
      background: #fef3c7;
      color: #92400e;
      border-color: #fde68a;
    }
    .user-popover-tier-pill.tier-silver {
      background: #f1f5f9;
      color: #334155;
      border-color: #cbd5e1;
    }
    .user-popover-tier-pill.tier-bronze {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }
    .user-popover-progress-track {
      height: 6px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 6px;
    }
    .user-popover-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #f59e0b, #eab308);
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    .user-popover-menu {
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .user-popover-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 600;
      color: #1e293b;
      text-decoration: none !important;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .user-popover-item:hover {
      background: #f1f5f9;
      color: var(--primary);
    }
    .user-popover-footer {
      padding: 8px 12px 12px;
      border-top: 1px solid #f1f5f9;
      background: #fafafa;
    }
    .user-popover-logout-btn {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid #fecaca;
      background: #fff;
      color: #dc2626;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .user-popover-logout-btn:hover {
      background: #fef2f2;
    }

    /* ── Dropdown thông báo nhanh (Header Notification Popover) ── */
    .notif-wrapper { position: relative; display: inline-flex; align-items: center; }
    .notif-bell-btn { position: relative; width: 38px; height: 38px; border-radius: 9999px; background: var(--surface-strong); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; text-decoration: none; flex-shrink: 0; border: none; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
    .notif-bell-btn:hover, .notif-bell-btn:focus-visible { background: var(--hairline); color: var(--primary); outline: none; }
    .notif-badge { position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9999px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; border: 2px solid #fff; line-height: 1; }

    .notif-popover {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 380px;
      max-width: 92vw;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 16px 40px -6px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08);
      z-index: 1050;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: notifSlideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes notifSlideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .notif-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
    }
    .notif-popover-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .notif-popover-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .notif-unread-count-pill {
      font-size: 11px;
      font-weight: 700;
      background: #eff6ff;
      color: #2563eb;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #bfdbfe;
    }
    .notif-mark-all-read-btn {
      font-size: 12px;
      font-weight: 600;
      color: #2563eb;
      background: transparent;
      border: none;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .notif-mark-all-read-btn:hover {
      background: #eff6ff;
      text-decoration: underline;
    }

    .notif-popover-list {
      max-height: 380px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .notif-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      text-decoration: none;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s ease;
    }
    .notif-item:last-child { border-bottom: none; }
    .notif-item:hover { background: #f8fafc; }
    .notif-item.is-unread { background: #f0f7ff; }
    .notif-item.is-unread:hover { background: #e0f0fe; }

    .notif-item-icon-col { flex-shrink: 0; margin-top: 2px; }
    .notif-icon-circle {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .notif-icon-green { background: #dcfce7; color: #16a34a; }
    .notif-icon-blue { background: #dbeafe; color: #2563eb; }
    .notif-icon-amber { background: #fef3c7; color: #d97706; }
    .notif-icon-slate { background: #f1f5f9; color: #64748b; }

    .notif-item-content { flex: 1; min-width: 0; }
    .notif-item-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
    .notif-item-title { font-size: 13.5px; font-weight: 700; color: #0f172a; line-height: 1.35; }
    .notif-unread-dot { width: 7px; height: 7px; border-radius: 999px; background: #2563eb; flex-shrink: 0; }
    .notif-item-body { font-size: 12.5px; color: #475569; line-height: 1.45; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .notif-item-time { font-size: 11px; color: #94a3b8; margin-top: 4px; }

    .notif-empty-state {
      padding: 36px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .notif-empty-icon {
      width: 48px;
      height: 48px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .notif-empty-text { font-size: 14px; font-weight: 600; color: #334155; }
    .notif-empty-sub { font-size: 12px; color: #94a3b8; max-width: 240px; }

    .notif-popover-footer {
      padding: 11px 16px;
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
      text-align: center;
    }
    .notif-footer-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 700;
      color: #2563eb;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .notif-footer-link:hover { color: #1d4ed8; text-decoration: underline; }

    @media (max-width: 640px) {
      .notif-popover {
        position: fixed;
        top: 66px;
        left: 12px;
        right: 12px;
        width: auto;
        max-width: none;
      }
    }

    /* Huy hiệu phân hạng Hội viên */
    .member-badge-chip { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .member-badge-chip.tier-gold { background: #fef08a; color: #854d0e; border: 1px solid #facc15; }
    .member-badge-chip.tier-silver { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .member-badge-chip.tier-bronze { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }

    .icon-btn { width: 38px; height: 38px; border-radius: 9999px; border: none; background: var(--surface-strong); color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .icon-btn:hover { background: var(--hairline); }
    .nav-toggle { display: none; }

    /* ── Typography (Chuẩn hóa thang chữ 5 cấp mạnh mẽ, đồng nhất toàn hệ thống) ── */
    .display-mega { font-size: 52px; font-weight: 800; line-height: 1.08; letter-spacing: -0.03em; }
    .headline-xl { font-size: 36px; font-weight: 800; line-height: 1.15; letter-spacing: -0.025em; color: var(--ink); }
    .headline-lg { font-size: 28px; font-weight: 800; line-height: 1.22; letter-spacing: -0.02em; color: var(--ink); }
    .headline-md { font-size: 19px; font-weight: 700; line-height: 1.32; letter-spacing: -0.01em; color: var(--ink); }
    .headline-sm { font-size: 16px; font-weight: 700; line-height: 1.38; color: var(--ink); }
    .body-text { font-size: 15.5px; color: var(--body); line-height: 1.62; }
    .body-sm { font-size: 14px; color: var(--body); line-height: 1.55; }
    .body-sm strong, .body-text strong { color: var(--ink); font-weight: 600; }
    .caption-text { font-size: 12.5px; color: var(--muted); line-height: 1.5; }
    .badge-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-strong); color: var(--ink); font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: var(--r-pill); letter-spacing: 0.2px; }
    .badge-pill-dark { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.12); }

    /* ── Section heading ── */
    .section-eyebrow-lockup { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .section-heading-main { display: flex; align-items: center; gap: 14px; }
    .eyebrow-bar { width: 10px; height: 10px; border-radius: 9999px; background: var(--primary); flex-shrink: 0; }
    .eyebrow-text { font-size: 26px; font-weight: 800; line-height: 1.22; letter-spacing: -0.02em; color: var(--ink); }
    .section-subtitle { font-size: 14.5px; color: var(--body); margin-top: 4px; line-height: 1.5; max-width: 780px; }
    .page-section { padding: 56px 0; }
    .page-section + .page-section { border-top: 1px solid var(--hairline-soft); }

    /* ── Buttons (pill) ── */
    .btn-pill-dark, .btn-primary, .btn-pill-primary {
      background: var(--primary); color: #fff !important; font-family: var(--font-sans);
      font-size: 15px; font-weight: 600; line-height: 1.15; border: none;
      border-radius: var(--r-pill); padding: 12px 22px; min-height: 44px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none !important; white-space: nowrap;
    }
    .btn-pill-dark:hover, .btn-primary:hover, .btn-pill-primary:hover { background: var(--primary-active); color: #fff !important; }
    .btn-pill-dark:disabled, .btn-primary:disabled, .btn-pill-primary:disabled { background: var(--primary-disabled); cursor: not-allowed; }
    .btn-lg { min-height: 56px; padding: 16px 32px; font-size: 16px; }
    .btn-pill-outline, .btn-secondary {
      background: var(--surface-strong); color: var(--ink) !important; font-family: var(--font-sans);
      font-size: 15px; font-weight: 600; line-height: 1.15; border: none;
      border-radius: var(--r-pill); padding: 12px 22px; min-height: 44px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none !important; white-space: nowrap;
    }
    .btn-pill-outline:hover, .btn-secondary:hover { background: var(--hairline); color: var(--ink) !important; }
    .btn-outline-dark { background: transparent; color: #fff !important; border: 1px solid rgba(255,255,255,0.6); border-radius: var(--r-pill); padding: 11px 21px; min-height: 44px; font-weight: 600; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
    .btn-outline-dark:hover { background: rgba(255,255,255,0.08); color: #fff !important; }
    .btn-pill-danger {
      background: var(--canvas); color: var(--down) !important; font-family: var(--font-sans);
      font-size: 15px; font-weight: 600; line-height: 1.15; border: 1px solid #f0b8bd;
      border-radius: var(--r-pill); padding: 11px 21px; min-height: 44px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none !important; white-space: nowrap;
    }
    .btn-pill-danger:hover { background: #fdeaec; }
    .btn-text { color: var(--primary) !important; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
    .btn-text:hover { color: var(--primary-active) !important; }
    .btn-pill-mini { background: var(--primary); color: #fff !important; font-size: 11px; font-weight: 700; border-radius: 9999px; padding: 2px 8px; display: inline-flex; align-items: center; }

    /* ── Forms ── */
    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .form-label { font-size: 14px; font-weight: 600; color: var(--ink); }
    .text-input, .network-select {
      background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 15px;
      border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 12px 16px; min-height: 48px; width: 100%;
      transition: border-color .15s, box-shadow .15s;
    }
    .network-select { appearance: none; padding-right: 40px; cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b616e' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 14px center; }
    .text-input:focus, .network-select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .text-input:disabled { background: var(--surface-soft); color: var(--muted); }
    textarea.text-input { min-height: 96px; resize: vertical; }
    .search-pill { background: var(--surface-strong); border: none; border-radius: var(--r-pill); }

    /* ── Cards & surfaces ── */
    .flat-panel { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); padding: 28px; }
    .soft-panel { background: var(--surface-soft); border-radius: var(--r-xl); padding: 28px; }
    .ink-border-panel { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); padding: 28px; box-shadow: var(--shadow-soft); }
    .feature-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); padding: 28px; transition: box-shadow .2s, transform .2s; }
    .feature-card:hover { box-shadow: var(--shadow-soft); }
    .dark-panel, .indigo-hero-panel { background: var(--surface-dark); color: #fff; border-radius: var(--r-xl); padding: 32px; }
    .dark-card { background: var(--surface-dark-elevated); color: #fff; border-radius: var(--r-xl); padding: 24px; border: 1px solid rgba(255,255,255,0.06); }

    /* ── Image slot ── */
    .image-slot { position: relative; width: 100%; overflow: hidden; border-radius: var(--r-xl); background: var(--surface-strong); margin: 0; }
    .image-slot img { width: 100%; height: 100%; object-fit: cover; }
    .image-slot-empty { border: 2px dashed #c9ced6; background: repeating-linear-gradient(135deg, #f7f7f7 0 14px, #f1f2f4 14px 28px); display: flex; align-items: center; justify-content: center; }
    .image-slot-dark.image-slot-empty { border: 2px dashed rgba(255,255,255,0.28); background: repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 16px, rgba(255,255,255,0.07) 16px 32px); }
    .image-slot-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; text-align: center; }
    .image-slot-label { font-size: 14px; font-weight: 600; color: var(--ink); }
    .image-slot-dark .image-slot-label { font-size: 17px; color: #ffffff; }
    .image-slot-hint { font-size: 12px; color: var(--muted); }
    .image-slot-dark .image-slot-hint { font-size: 13px; color: var(--on-dark-soft); }
    .image-slot-dark .image-slot-hint code { background: rgba(255,255,255,0.12); color: #8fb0ff; }
    .image-tag { position: absolute; left: 12px; bottom: 12px; background: rgba(10,11,13,0.62); color: #fff; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: var(--r-pill); backdrop-filter: blur(6px); }

    /* ── Notices ── */
    .flash { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: var(--r-lg); margin: 20px 0 4px; font-size: 15px; font-weight: 500; }
    .flash-success { background: #e9f8f1; color: #04603a; }
    .flash-error { background: #fdecee; color: #8f1520; }
    .flash-info { background: var(--primary-tint); color: #0a2f8f; }
    .breaking-band { background: #fdecee; color: #8f1520; border-radius: var(--r-lg); padding: 14px 18px; margin: 16px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 500; }
    .notice-band-success { background: #e9f8f1; color: #04603a; border-radius: var(--r-lg); padding: 16px 20px; margin: 16px 0; }
    .notice-band-info { background: var(--primary-tint); color: #0a2f8f; border-radius: var(--r-lg); padding: 16px 20px; margin: 16px 0; }
    .notice-band-info strong, .notice-band-success strong { color: inherit; }

    /* ── Status badges ── */
    .status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: var(--r-pill); line-height: 1.3; white-space: nowrap; }
    .badge-live { background: #fff5d9; color: #8a6100; }
    .badge-confirmed { background: #e3f7ee; color: #047a49; }
    .badge-neutral { background: var(--surface-strong); color: var(--ink); }
    .badge-muted { background: var(--surface-soft); color: var(--muted); border: 1px solid var(--hairline-soft); }
    .badge-cancelled { background: #fdeaec; color: #a3141f; }
    .badge-available { background: #fff; color: #047a49; border: 1px solid #bfe9d5; }

    /* ── Grid ── */
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .editorial-layout { display: grid; grid-template-columns: 1.75fr 1fr; gap: 24px; align-items: start; }
    .stack { display: flex; flex-direction: column; gap: 24px; }
    .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

    /* ── Schedule matrix ── */
    .schedule-table-wrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--r-xl); background: var(--canvas); }
    .schedule-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 980px; }
    .schedule-table th, .schedule-table td { padding: 6px 4px; text-align: center; vertical-align: middle; font-size: 13px; border-bottom: 1px solid var(--hairline-soft); }
    .schedule-table tbody tr:last-child td { border-bottom: none; }
    .schedule-table th { background: var(--surface-soft); color: var(--muted); font-weight: 600; font-size: 12px; padding: 12px 4px; }
    .schedule-table th .num { color: var(--ink); font-size: 13px; }
    .schedule-table td.court-col, .schedule-table th.court-col { text-align: left; padding: 12px 16px; min-width: 210px; position: sticky; left: 0; z-index: 1; background: var(--canvas); border-right: 1px solid var(--hairline-soft); }
    .schedule-table th.court-col { background: var(--surface-soft); }
    .court-col-inner { display: flex; align-items: center; gap: 10px; }
    .court-col-inner a { font-weight: 600; font-size: 14px; }
    .slot-cell-btn, .slot-cell-disabled {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      width: 100%; min-height: 54px; padding: 6px 4px; border-radius: var(--r-md); font-family: var(--font-sans);
    }
    .slot-cell-btn { border: 1px solid #bfe9d5; background: #f4fbf8; color: #047a49; cursor: pointer; transition: all .12s; }
    .slot-cell-btn:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
    .slot-cell-btn .slot-price { color: var(--ink); }
    .slot-cell-btn:hover .slot-price { color: #fff; }
    .slot-cell-myhold { border: 1px solid var(--primary) !important; background: var(--primary-tint) !important; color: var(--primary) !important; }
    .slot-cell-disabled { background: var(--surface-soft); color: var(--muted-soft); font-size: 12px; }
    .slot-cell-booked { background: var(--surface-strong); color: var(--muted); }
    .slot-cell-hold { background: #fff8e6; color: #8a6100; }
    .slot-cell-maint { background: repeating-linear-gradient(135deg, #f3f4f6 0 6px, #e9ebee 6px 12px); color: var(--body); }
    .slot-label { font-size: 11px; font-weight: 600; }
    .slot-price { font-family: var(--font-mono); font-size: 12px; font-weight: 500; }
    .legend { display: flex; gap: 8px; flex-wrap: wrap; }

    /* ── Data table ── */
    .table-wrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--r-xl); background: var(--canvas); }
    .data-table { width: 100%; border-collapse: collapse; background: transparent; }
    .data-table th { color: var(--muted); font-size: 12px; font-weight: 600; padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--hairline); background: var(--surface-soft); white-space: nowrap; }
    .data-table td { padding: 16px; font-size: 14px; border-bottom: 1px solid var(--hairline-soft); vertical-align: middle; color: var(--ink); }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tbody tr:hover td { background: #fafbfc; }
    .flat-panel > .data-table, .soft-panel > .data-table { border: 1px solid var(--hairline-soft); border-radius: var(--r-lg); overflow: hidden; }

    /* ── Timeline ── */
    .timeline-list { list-style: none; position: relative; margin-left: 8px; padding-left: 22px; border-left: 2px solid var(--hairline-soft); }
    .timeline-item { position: relative; padding-bottom: 18px; }
    .timeline-item::before { content: ''; position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 9999px; background: var(--canvas); border: 3px solid var(--primary); }
    .timeline-item:last-child { padding-bottom: 0; }

    /* ── Stat cards ── */
    .stat-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); padding: 22px; display: flex; flex-direction: column; gap: 10px; }
    .stat-label { font-size: 13px; color: var(--muted); font-weight: 500; }
    .stat-value { font-family: var(--font-mono); font-size: 26px; font-weight: 500; letter-spacing: -0.6px; color: var(--ink); }
    .stat-foot { font-size: 12px; color: var(--muted); }

    /* ── Banner Full-Size & Hộp tìm kiếm đặt ngay bên dưới (không che khuất nội dung trên Banner) ── */
    .xat-hero-stage {
      position: relative;
      width: 100%;
      margin-bottom: 24px;
    }
    .xat-banner-full {
      position: relative;
      width: 100%;
      aspect-ratio: 21 / 7.4;
      max-height: 580px;
      overflow: hidden;
      background: #0b1930;
    }
    .xat-banner-slide {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      transition: opacity 0.8s ease-in-out;
      pointer-events: none;
    }
    .xat-banner-slide.is-active {
      opacity: 1;
      pointer-events: auto;
    }
    .xat-banner-dots {
      position: absolute;
      bottom: 14px;
      right: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10;
    }
    .xat-dot-btn {
      width: 26px;
      height: 5px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.45);
      border: none;
      cursor: pointer;
      padding: 0;
      transition: all 0.3s ease;
    }
    .xat-dot-btn:hover {
      background: rgba(255, 255, 255, 0.75);
    }
    .xat-dot-btn.is-active {
      width: 44px;
      background: #ffffff;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
    }
    .xat-banner-full .image-slot {
      width: 100% !important;
      height: 100% !important;
      aspect-ratio: unset !important;
      border-radius: 0 !important;
      border: none !important;
    }
    .xat-banner-full .image-slot img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center center;
    }
    .xat-floating-search-holder {
      position: relative;
      width: 100%;
      max-width: 1240px;
      margin: 18px auto 0;
      padding: 0 16px;
      z-index: 25;
    }
    .xat-search-wrap {
      background: #ffffff;
      color: var(--ink);
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: 0 6px 30px rgba(0, 0, 0, 0.14);
      border: 1px solid #ececec;
    }
    .xat-mode-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .xat-radio-group {
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 15px;
      font-weight: 500;
      color: #2d2d2f;
    }
    .xat-radio-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      background: transparent;
      border: none;
      padding: 4px 2px;
      font-family: var(--font-sans);
      font-size: 15px;
      font-weight: 500;
      color: #666666;
      transition: color 0.15s;
    }
    .xat-radio-pill.is-active {
      color: #111827;
      font-weight: 600;
    }
    .xat-radio-dot { width: 16px; height: 16px; border-radius: 9999px; border: 2px solid #1677ff; display: inline-flex; align-items: center; justify-content: center; }
    .xat-radio-dot::after { content: ''; width: 8px; height: 8px; border-radius: 9999px; background: #1677ff; }
    .xat-radio-dot-idle { width: 16px; height: 16px; border-radius: 9999px; border: 1.5px solid #cbd5e1; display: inline-block; }
    .xat-search-grid { display: grid; grid-template-columns: 1.35fr 1.15fr 0.95fr 185px; gap: 10px; align-items: stretch; }
    .xat-search-grid-4 { display: grid; grid-template-columns: 1.1fr 1fr 0.95fr 1.05fr 195px; gap: 10px; align-items: stretch; }
    .xat-field-box {
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px 14px;
      height: 74px;
      display: flex;
      align-items: center;
      gap: 10px;
      position: relative;
      transition: border-color .15s, background .15s, box-shadow .15s;
    }
    .xat-field-box:hover { border-color: #94a3b8; background: #ffffff; }
    .xat-field-box:focus-within { background: #ffffff; border-color: #0052ff; box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.12); }
    .xat-field-body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
    .xat-field-label { font-size: 12.5px; font-weight: 600; color: #64748b; margin-bottom: 2px; cursor: pointer; }
    .xat-field-control { background: transparent; border: none; font-family: var(--font-sans); font-size: 15px; font-weight: 700; color: #0f172a; width: 100%; padding: 0; outline: none; cursor: pointer; line-height: 24px; }
    .xat-field-control:focus { outline: none; }
    /* Ẩn icon lịch mặc định bên phải của trình duyệt để không bị trùng 2 icon lịch trong ô Ngày đặt sân */
    .xat-field-control[type="date"]::-webkit-calendar-picker-indicator {
      opacity: 0;
      position: absolute;
      right: 0;
      top: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .xat-submit-btn {
      background: linear-gradient(180deg, #0052ff 0%, #003ecc 100%);
      color: #ffffff !important;
      border: none;
      border-radius: 12px;
      padding: 0 22px;
      height: 74px;
      font-family: var(--font-sans);
      font-size: 15.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 82, 255, 0.25);
      transition: filter .15s, transform .15s, box-shadow .15s;
      white-space: nowrap;
    }
    .xat-submit-btn:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0, 82, 255, 0.32); }

    .sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    /* ── 4 Thẻ giá trị cốt lõi Be Badminton với minh họa 3D cầu lông thiết kế riêng ── */
    .xat-4cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 44px;
    }
    .xat-3cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 44px;
    }
    .xat-3card-box {
      background: #ffffff;
      box-shadow: 0 4px 30px 0 rgba(0, 0, 0, 0.06);
      border: 1px solid #f1f5f9;
      border-radius: 12px;
      padding: 26px 18px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .xat-3card-box:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 34px 0 rgba(15, 23, 42, 0.1);
    }
    .xat-3card-title {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
    }
    .xat-3card-desc {
      font-size: 14px;
      color: #64748b;
      line-height: 1.58;
      max-width: 300px;
    }

    /* ── Khu vực Khuyến mại / Dịch vụ nổi bật & Tin tức kiểu xeanhtuyen.vn ── */
    .xat-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .xat-section-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .xat-section-title {
      font-size: 24px;
      font-weight: 700;
      color: #2D2D2F;
      margin: 0;
    }
    .xat-promo-band {
      background: #F8F8F8;
      padding: 34px 28px;
      border-radius: 16px;
      margin-bottom: 44px;
    }
    .xat-promo-thumb {
      width: 100%;
      height: 225px;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      background: #e2e8f0;
    }
    .xat-promo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .xat-promo-overlap-card {
      margin-top: -22px;
      position: relative;
      z-index: 2;
      width: 92%;
      margin-left: auto;
      margin-right: auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .xat-promo-badge-blue {
      width: 50px;
      height: 50px;
      border-radius: 16px;
      background: #1E63EF;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(30, 99, 239, 0.25);
    }
    .xat-news-card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 150ms ease;
    }
    .xat-news-card:hover { transform: translateY(-3px); }
    .xat-news-thumb {
      width: 100%;
      height: 225px;
      overflow: hidden;
      background: #e2e8f0;
    }
    .xat-news-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .xat-news-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .xat-news-title {
      font-size: 16px;
      font-weight: 600;
      color: #2D2D2F;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 46px;
    }
    .xat-news-summary {
      font-size: 14px;
      color: #666666;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @media (max-width: 1024px) {
      .xat-banner-full { aspect-ratio: 21 / 7.4; height: auto; min-height: 180px; }
      .xat-floating-search-holder { position: relative; transform: none; margin-top: 16px; }
      .xat-hero-stage { margin-bottom: 20px; }
      .xat-3cards-grid { grid-template-columns: 1fr; }
    }

    /* ── Thanh trượt chọn ngày (date-search-slider kiểu xeanhtuyen.vn) ── */
    .date-slider-strip { background: #ffffff; border: 1px solid var(--hairline); border-radius: 16px; padding: 10px 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); gap: 8px; overflow-x: auto; margin-bottom: 24px; }
    .date-slide-item { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 8px 12px; border-radius: 12px; text-decoration: none !important; color: var(--body); transition: background .15s, color .15s; text-align: center; }
    .date-slide-item:hover { background: var(--surface-soft); color: var(--ink); }
    .date-slide-item.active { background: #f0f5ff; color: var(--primary); font-weight: 700; }
    .date-slide-item.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 72%; height: 3px; border-radius: 999px; background: #ff7f02; }
    .date-slide-day { font-size: 13px; font-weight: 600; }
    .date-slide-num { font-family: var(--font-mono); font-size: 15px; font-weight: 700; margin-top: 2px; color: var(--ink); }
    .date-slide-item.active .date-slide-num { color: var(--primary); }

    /* ── Stepper 3 bước & Phương thức thanh toán kiểu xeanhtuyen.vn ── */
    .stepper-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #ffffff; border: 1px solid var(--hairline); border-radius: 16px; padding: 16px 20px; margin-bottom: 24px; box-shadow: var(--shadow-soft); }
    .stepper-step { display: flex; align-items: center; gap: 12px; position: relative; font-size: 14px; font-weight: 600; color: var(--muted); }
    .stepper-circle, .stepper-num { width: 34px; height: 34px; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; background: var(--surface-strong); color: var(--muted); }
    .stepper-step.done, .stepper-step.is-done { color: var(--up); }
    .stepper-step.done .stepper-circle, .stepper-step.done .stepper-num,
    .stepper-step.is-done .stepper-circle, .stepper-step.is-done .stepper-num { background: #e6f9f0; color: var(--up); border: 1px solid #9be2c0; }
    .stepper-step.active, .stepper-step.is-active { color: var(--ink); font-weight: 700; }
    .stepper-step.active .stepper-circle, .stepper-step.active .stepper-num,
    .stepper-step.is-active .stepper-circle, .stepper-step.is-active .stepper-num { background: var(--primary); color: #ffffff; box-shadow: 0 0 0 4px rgba(0, 82, 255, 0.15); }
    .stepper-title { font-size: 14px; font-weight: 700; color: var(--ink); }
    .stepper-sub { font-size: 12px; color: var(--muted); }

    .pay-method-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 22px; }
    .pay-method-card { border: 1.5px solid var(--hairline); border-radius: 14px; background: #ffffff; padding: 16px 18px; transition: border-color .15s, box-shadow .15s, background .15s; cursor: pointer; }
    .pay-method-card:hover { border-color: #b0c4ff; }
    .pay-method-card.selected, .pay-method-card.is-selected { border-color: var(--primary); background: #f8faff; box-shadow: 0 4px 16px rgba(0, 82, 255, 0.08); }
    .pay-method-header { display: flex; align-items: flex-start; gap: 14px; cursor: pointer; width: 100%; }
    .pay-method-radio { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--primary); cursor: pointer; flex-shrink: 0; }
    .pay-method-title { font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
    .pay-method-desc { font-size: 13px; color: var(--body); line-height: 1.5; margin-top: 4px; }
    .pay-badge-recommend { font-size: 11px; font-weight: 700; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
    .pay-method-body { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--hairline); margin-left: 34px; display: none; }
    .pay-method-card.selected .pay-method-body, .pay-method-card.is-selected .pay-method-body { display: block; }
    .qr-preview-box { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center; background: #ffffff; border: 1px solid #dbeafe; border-radius: 12px; padding: 14px; }
    .qr-frame { background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .bank-search-box { width: 100%; padding: 10px 14px; border: 1px solid var(--hairline); border-radius: 10px; font-size: 13.5px; color: var(--ink); background: #ffffff; }
    .bank-search-box:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.12); }
    .bank-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
    .bank-card { position: relative; border: 1.5px solid var(--hairline); border-radius: 10px; padding: 10px 8px; background: #ffffff; text-align: center; cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bank-card:hover { border-color: var(--primary); transform: translateY(-1px); }
    .bank-card.active, .bank-card.is-active { border: 2px solid #0052ff; background: #f0f7ff; box-shadow: 0 4px 12px rgba(0, 82, 255, 0.14); }
    .bank-check { display: none; position: absolute; top: -7px; right: -7px; width: 20px; height: 20px; border-radius: 9999px; background: #05b169; color: #fff; font-size: 11px; font-weight: 800; align-items: center; justify-content: center; border: 2px solid #fff; }
    .bank-card.active .bank-check, .bank-card.is-active .bank-check { display: inline-flex; }
    .bank-short, .bank-code-pill { font-weight: 800; font-size: 13px; letter-spacing: -0.2px; padding: 2px 8px; border-radius: 6px; }
    .bank-full, .bank-name-sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

    /* ── Footer thương mại cảm hứng từ xeanhtuyen.vn (.footer-wp & .footer-copyright) ── */
    .cta-band-dark { background: var(--surface-dark); color: #fff; padding: 64px 0; margin-top: 64px; position: relative; overflow: hidden; }
    .cta-band-dark::after { content: ''; position: absolute; right: -120px; top: -120px; width: 420px; height: 420px; border-radius: 9999px; background: radial-gradient(circle, rgba(0,82,255,0.35), rgba(0,82,255,0) 70%); }
    .cta-band-inner { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap; }
    .cta-band-dark h2 { font-size: 40px; font-weight: 600; letter-spacing: -0.8px; line-height: 1.12; }
    .cta-band-dark p { color: var(--on-dark-soft); margin-top: 10px; max-width: 540px; }



    /* ==========================================================================
       BẢNG ĐẶT SÂN TRỰC QUAN KIỂU BE BADMINTON / ALOBO (KHÔNG HIỂN THỊ GIÁ TRÊN Ô GIỜ)
       Giá chỉ hiển thị ở hộp góc màn hình khi người dùng click chọn ô giờ trống
       ========================================================================== */
    .bebad-board {
      background: #ffffff;
      border: 1px solid #dbe3ef;
      border-top: 4px solid #0f6938;
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
      margin-bottom: 32px;
    }
    .bebad-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .bebad-day-pill-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bebad-day-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f6938;
      letter-spacing: -0.02em;
    }
    .bebad-date-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      font-family: var(--font-sans);
      font-size: 18px;
      font-weight: 800;
      color: #0f6938;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
    }
    .bebad-legend {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .bebad-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #334155;
    }
    .bebad-swatch {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: inline-block;
      flex-shrink: 0;
    }
    .bebad-swatch.swatch-locked { background: #d1d5db; border: 1px solid #cbd5e1; }
    .bebad-swatch.swatch-free { background: #ffffff; border: 1.5px solid #cbd5e1; }
    .bebad-swatch.swatch-booked { background: #0f6938; border: 1px solid #0b532b; }
    .bebad-swatch.swatch-mine { background: #ea580c; border: 1px solid #c2410c; }

    .bebad-sport-heading {
      font-size: 20px;
      font-weight: 800;
      color: #0f6938;
      margin: 14px 0 10px;
    }
    .bebad-timeband-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin: 10px 0 12px;
      padding: 10px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }
    .bebad-timeband-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .bebad-timeband-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
      font-family: var(--font-sans);
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 140ms ease;
    }
    .bebad-timeband-pill:hover {
      border-color: #0f6938;
      color: #0f6938;
      background: #f0fdf4;
    }
    .bebad-timeband-pill.is-active {
      background: #0f6938;
      color: #ffffff;
      border-color: #0f6938;
      box-shadow: 0 3px 10px rgba(15, 105, 56, 0.22);
    }
    .bebad-grid-scroll {
      overflow: auto;
      max-height: 76vh;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      scroll-behavior: smooth;
    }
    .bebad-grid-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      min-width: 980px;
      user-select: none;
    }
    .bebad-grid-table thead th {
      background: #0d3b66;
      color: #ffffff;
      font-family: var(--font-mono);
      font-size: 12.5px;
      font-weight: 700;
      padding: 12px 6px;
      text-align: center;
      border-right: 1px solid rgba(255, 255, 255, 0.16);
      border-bottom: 1px solid rgba(255, 255, 255, 0.22);
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .bebad-grid-table thead th.is-focus-hour {
      background: #d97706 !important;
      color: #ffffff;
      font-weight: 800;
      box-shadow: inset 0 -3px 0 #fde047;
    }
    .bebad-grid-table thead th.bebad-corner-th {
      width: 108px;
      min-width: 108px;
      position: sticky;
      top: 0;
      left: 0;
      z-index: 6;
      background: #092847;
      font-family: var(--font-sans);
    }
    .bebad-grid-table tbody td.bebad-court-name {
      background: #0f6938;
      color: #ffffff;
      font-weight: 700;
      font-size: 13.5px;
      text-align: center;
      padding: 0 12px;
      height: 44px;
      width: 108px;
      min-width: 108px;
      position: sticky;
      left: 0;
      z-index: 3;
      border-bottom: 1px solid rgba(255, 255, 255, 0.22);
      border-right: 1px solid #cbd5e1;
      white-space: nowrap;
      transition: background 120ms ease;
    }
    .bebad-grid-table tbody tr:hover td.bebad-court-name {
      background: #094725;
      box-shadow: inset 4px 0 0 #fde047;
    }
    .bebad-grid-table tbody tr:hover td.bebad-cell.cell-free {
      background: #f8fafc;
    }
    .bebad-grid-table tbody td.bebad-cell {
      height: 46px;
      min-width: 54px;
      padding: 0;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      text-align: center;
      vertical-align: middle;
      transition: background 120ms ease, box-shadow 120ms ease;
      position: relative;
    }
    .bebad-cell.cell-free.is-focus-hour {
      background: #fefce8;
      box-shadow: inset 0 0 0 1.5px #f59e0b;
    }
    .bebad-cell.cell-locked {
      background: #d1d5db;
      cursor: not-allowed;
    }
    .bebad-cell.cell-booked {
      background: #0f6938;
      color: #ffffff;
      cursor: not-allowed;
    }
    .bebad-cell.cell-free {
      background: #ffffff;
      cursor: pointer;
    }
    .bebad-cell.cell-free:hover {
      background: #fff7ed;
      box-shadow: inset 0 0 0 2px #ea580c;
    }
    .bebad-cell-price-hint {
      font-size: 10.5px;
      font-weight: 700;
      color: #94a3b8;
      opacity: 0;
      transition: opacity 120ms ease, color 120ms ease;
      pointer-events: none;
    }
    .bebad-cell.cell-free:hover .bebad-cell-price-hint {
      opacity: 1;
      color: #0052ff;
    }
    .bebad-cell.cell-selected .bebad-cell-price-hint {
      display: inline-block;
      opacity: 1;
      color: #102e42;
    }
    .bebad-cell.cell-selected,
    .bebad-cell.cell-mine {
      background: #ea580c !important;
      color: #ffffff;
      cursor: pointer;
      font-weight: 800;
      font-size: 15px;
      box-shadow: inset 0 0 0 2px #9a3412;
    }
    .bebad-cell-btn {
      width: 100%;
      height: 100%;
      min-height: 44px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      padding: 0;
    }

    /* Hộp nổi bên góc phải dưới màn hình: ẨN MẶC ĐỊNH, chỉ bật lên khi khách click chọn ô giờ trống */
    .bebad-corner-dock {
      display: none;
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 420px;
      max-width: calc(100vw - 32px);
      background: #ffffff;
      border: 2px solid #0d3b66;
      border-radius: 18px;
      box-shadow: 0 24px 54px rgba(15, 23, 42, 0.26);
      padding: 18px 20px;
      z-index: 95;
    }
    .bebad-corner-dock.is-open {
      display: block;
      animation: dockSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes dockSlideUp {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .bebad-dock-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #0f6938;
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .bebad-dock-price {
      font-family: var(--font-mono);
      font-size: 24px;
      font-weight: 800;
      color: #ea580c;
    }
    .bebad-slot-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
    }
    .bebad-chip-remove {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      line-height: 1;
      padding: 0 2px;
    }
    .bebad-chip-remove:hover {
      color: #ef4444;
    }

    /* ── Mục Dịch vụ kèm theo & Phụ kiện tại sân trên trang Checkout ── */
    .addon-selection-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 14px;
      margin-bottom: 24px;
    }
    .addon-card {
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      padding: 14px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    }
    .addon-card:hover {
      border-color: #0f6938;
    }
    .addon-card.is-active, .addon-card.is-selected {
      border-color: #0f6938;
      background: #f0fdf4;
      box-shadow: 0 4px 14px rgba(15, 105, 56, 0.08);
    }
    .addon-card-header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
    }
    .addon-checkbox {
      width: 19px;
      height: 19px;
      margin-top: 2px;
      accent-color: #0f6938;
      cursor: pointer;
      flex-shrink: 0;
    }
    .addon-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
    }
    .addon-desc {
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
      margin-top: 2px;
    }
    .addon-bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px dashed #e2e8f0;
    }
    .addon-price-tag {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 800;
      color: #0f6938;
    }
    .addon-qty-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 2px 4px;
    }
    .addon-qty-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: #ffffff;
      border-radius: 6px;
      font-weight: 800;
      font-size: 14px;
      color: #0f172a;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .addon-qty-val, .addon-qty-input {
      width: 36px;
      min-width: 24px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      border: none;
      background: transparent;
      padding: 0;
      -moz-appearance: textfield;
    }
    .addon-qty-input::-webkit-outer-spin-button,
    .addon-qty-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* ==========================================================================
       BẢNG GIÁ THUÊ SÂN & SƠ ĐỒ 18 SÂN BE BADMINTON BẰNG CODE THUẦN 100%
       ========================================================================== */
    .be-code-showcase {
      display: flex;
      flex-direction: column;
      gap: 36px;
      margin-bottom: 48px;
    }
    #bang-gia-niem-yet { scroll-margin-top: 90px; }
    .be-price-location-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      gap: 24px;
      align-items: stretch;
    }
    .be-price-location-grid > * { min-width: 0; }
    .be-location-board {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #f3f5f8;
      border: 2px solid #0d3b66;
      border-radius: 18px;
    }
    .be-location-header { padding: 14px 18px; }
    .be-location-header h3 {
      margin: 0 0 6px;
      font-size: 18px;
      line-height: 1.3;
      color: #0d3b66;
    }
    .be-location-header p {
      margin: 0;
      color: #475569;
      font-size: 13px;
      line-height: 1.6;
    }
    .be-location-map {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 300px;
      flex: 1;
      border: 0;
    }
    @media (max-width: 960px) {
      .be-price-location-grid { grid-template-columns: minmax(0, 1fr); }
      .be-location-map { height: 380px; flex: none; }
    }
    @media (max-width: 640px) {
      #bang-gia-niem-yet .xat-section-header {
        flex-direction: column;
        align-items: stretch;
      }
      #bang-gia-niem-yet .xat-section-title-group { min-width: 0; }
      #bang-gia-niem-yet .xat-section-title-group > svg { flex-shrink: 0; }
    }
    @media (max-width: 480px) {
      .be-price-location-grid .be-price-board { padding: 16px 12px; }
      .be-price-location-grid .be-price-table th,
      .be-price-location-grid .be-price-table td { padding: 9px 4px; }
      .be-price-location-grid .be-price-table thead th,
      .be-price-location-grid .be-price-time-col { font-size: 11px; }
      .be-price-location-grid .be-price-val { font-size: 15px; }
      .be-price-location-grid .be-price-sub { font-size: 10px; }
      .be-location-map { height: 340px; min-height: 340px; }
    }
    .be-price-board {
      background: #ffffff;
      border: 1px solid #d5e3ee;
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 4px 16px rgba(13, 59, 102, 0.04);
      position: relative;
      overflow: hidden;
      width: 100%;
    }
    .be-price-board > div {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex: 1;
      gap: 14px;
    }
    .be-price-perks-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 4px;
    }
    .be-price-perk-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      padding: 12px 14px;
      color: #0f172a;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
    }
    .be-coupon-perk {grid-column:1 / -1}
    .be-coupon-details summary {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:13px;font-weight:800;color:#0d3b66;cursor:pointer;list-style:none}
    .be-coupon-details summary::-webkit-details-marker {display:none}
    .be-coupon-details summary:focus-visible {outline:2px solid #2563eb;outline-offset:3px}
    .be-coupon-toggle {font-size:11.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
    .be-coupon-details[open] .be-coupon-list {margin-top:12px}
    .be-coupon-intro {font-size:12px;color:#475569;line-height:1.45;margin:4px 0 0}
    .be-coupon-list {display:grid;gap:10px}
    .be-coupon-item {padding:12px;background:#fff;border:1px dashed #b9cddc;border-radius:8px;min-width:0}
    .be-coupon-top {display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:6px;font-size:12px;line-height:1.5;color:#163c57}
    .be-coupon-value {font-weight:800;color:#0f6938;white-space:nowrap}
    .be-coupon-item p {font-size:12px;line-height:1.6;color:#526477;margin:6px 0}
    .be-coupon-item .be-coupon-terms {font-size:11px;color:#667b8c}
    .be-coupon-action {display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:0}
    .be-coupon-action code {font-size:13px;font-weight:800;color:#163c57;overflow-wrap:anywhere;min-width:0}
    .be-coupon-copy {min-height:36px;border:1px solid #bfd0dd;border-radius:6px;background:#f4f8fb;color:#16486c;font-size:12px;font-weight:700;padding:6px 10px;cursor:pointer}
    .be-coupon-copy:hover {background:#e5f0f7}
    .be-coupon-copy:focus-visible {outline:2px solid #2563eb;outline-offset:3px}
    .be-coupon-feedback {font-size:12px;line-height:1.5;color:#0f6938;margin:10px 0 0}
    .be-coupon-feedback:empty {display:none}
    @media (max-width: 640px) {
      .be-price-perks-grid {
        grid-template-columns: 1fr;
      }
    }
    #dich-vu-noi-bat.xat-promo-band {
      background: transparent !important;
      padding: 10px 0 24px 0 !important;
    }
    .be-addon-compact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .be-addon-compact-card {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-radius: 16px;
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .be-addon-compact-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      border-color: #cbd5e1;
    }
    .be-addon-compact-main {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
      flex: 1;
    }
    .be-addon-compact-thumb {
      width: 88px;
      height: 88px;
      border-radius: 12px;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      flex-shrink: 0;
    }
    .be-addon-compact-thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.12));
      transition: transform 0.2s ease;
    }
    .be-addon-compact-card:hover .be-addon-compact-thumb img {
      transform: scale(1.08);
    }
    .be-addon-compact-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 3px 0;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .be-addon-compact-desc {
      display: none;
    }
    .be-addon-compact-price {
      text-align: right;
      flex-shrink: 0;
      padding-left: 14px;
      border-left: 1px dashed #cbd5e1;
    }
    @media (max-width: 820px) {
      .be-addon-compact-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 480px) {
      .be-addon-compact-card {
        padding: 12px 14px;
        gap: 12px;
      }
      .be-addon-compact-thumb {
        width: 72px;
        height: 72px;
      }
      .be-addon-compact-price {
        padding-left: 10px;
      }
    }
    .be-price-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #0d3b66;
      background: #ffffff;
      font-family: var(--font-sans);
      margin-top: 0;
    }
    .be-price-table th,
    .be-price-table td {
      border: 1px solid #c8d8e6;
      padding: 15px 8px;
      text-align: center;
      vertical-align: middle;
    }
    .be-price-table thead th {
      background: #0d3b66;
      color: #ffffff;
      font-weight: 800;
      font-size: 13.5px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border: 1px solid #1a4d7d;
      padding: 14px 8px;
    }
    .be-price-table thead tr.sub-head th {
      background: #e5a823;
      color: #0d3b66;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      border: 1px solid #c8d8e6;
      padding: 12px 8px;
    }
    .be-price-day-col {
      background: #f4f8fb;
      color: #0d3b66;
      text-align: center;
    }
    .be-price-day-col .be-day-label {
      font-size: 18px;
      font-weight: 800;
      color: #0d3b66;
      line-height: 1.2;
    }
    .be-price-day-col .be-day-desc {
      font-size: 12.5px;
      font-weight: 600;
      color: #0d3b66;
      margin-top: 4px;
    }
    .be-price-time-col {
      color: #0d3b66;
      font-weight: 700;
      font-size: 14px;
      white-space: nowrap;
    }
    .be-price-time-col.be-time-allday {
      font-size: 14.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .be-price-val {
      color: #0d3b66;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 0.2px;
    }
    .be-price-sub {
      display: block;
      font-size: 11.5px;
      font-weight: 700;
      color: #c2410c;
      margin-top: 3px;
    }
    .be-price-weekend-cell {
      background: #fdf7ea !important;
      text-align: center;
      vertical-align: middle;
    }
    .be-price-val-weekend {
      font-size: 24px;
      font-weight: 900;
      color: #c27803 !important;
      letter-spacing: 0.5px;
    }
    .be-floor-plan { margin-bottom: 36px; scroll-margin-top: 90px; }
    .be-map-instruction { margin: 4px 0 0; font-size: 13px; color: #64748b; }
    .be-map-board { width: 100%; min-width: 0; }
    .be-map-scroll {
      overflow-x: auto;
      border: none;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      display: flex;
      justify-content: center;
      padding: 0;
    }
    .be-floor-plan-svg {
      display: block;
      width: 100%;
      height: auto;
      max-height: min(65vh, 550px);
      font-family: Lexend, sans-serif;
    }
    .be-map-court-surface {
      fill: #0d7a48;
      stroke: #064e2e;
      stroke-width: 1.5;
      transition: fill 200ms ease, stroke 200ms ease;
    }
    .be-court-line-white {
      stroke: #ffffff;
      stroke-width: 1.6;
      fill: none;
    }
    .be-map-court-badge {
      transition: fill 200ms ease, stroke 200ms ease;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }
    .be-map-court-number {
      fill: #091e36;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.5px;
      pointer-events: none;
    }
    .be-court-svg-node {
      cursor: pointer;
      display: inline-block;
    }
    .be-court-svg-node:hover .be-map-court-surface,
    .be-court-svg-node:focus .be-map-court-surface {
      fill: #16a34a;
      stroke: #15803d;
    }
    .be-court-svg-node:hover .be-map-court-badge,
    .be-court-svg-node:focus .be-map-court-badge {
      fill: #fde047;
      stroke: #ca8a04;
    }
    .be-court-svg-node:focus-visible { outline: 3px solid #0f766e; outline-offset: 3px; }
    .be-map-scroll:focus-visible { outline: 3px solid #0f766e; outline-offset: 3px; }

    .be-news-section { margin-bottom: 48px; scroll-margin-top: 90px; }
    .be-news-section .xat-section-title-group { min-width: 0; }
    .be-news-section .xat-section-title-group > svg { flex-shrink: 0; }
    .be-news-intro { font-size: 13.5px; line-height: 1.6; color: #64748b; margin-top: 4px; }
    .be-news-all { color: #0052ff; font-weight: 700; font-size: 14px; white-space: nowrap; }
    .be-news-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
    .be-news-list { margin-bottom: 56px; }
    .be-news-card {
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .be-news-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
      border-color: #cbd5e1;
    }
    .be-news-thumb { height: 235px; position: relative; display: block; overflow: hidden; background: #0f172a; }
    .be-news-thumb img { width: 100%; height: 100%; display: block; transition: transform .35s ease; }
    .be-news-thumb:hover img { transform: scale(1.04); }
    .be-news-tag {
      position: absolute;
      top: 12px;
      left: 12px;
      font-size: 11.5px;
      font-weight: 800;
      padding: 5px 12px;
      border-radius: 999px;
      letter-spacing: 0.3px;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }
    .be-news-tag-red { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .be-news-tag-amber { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
    .be-news-tag-blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
    .be-news-tag-green { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .be-news-body { padding: 20px 22px; display: flex; flex-direction: column; flex: 1; }
    .be-news-meta { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .be-news-title-link { text-decoration: none; }
    .be-news-body .xat-news-title { margin: 0 0 10px; color: #0f172a; font-size: 16.5px; font-weight: 700; line-height: 1.45; }
    .be-news-body .xat-news-summary { margin: 0 0 18px; color: #475569; font-size: 13.5px; line-height: 1.65; flex: 1; display: block; overflow: visible; }
    .be-news-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid #f1f5f9; padding-top: 14px; }
    .be-news-links a { color: #0052ff; font-size: 13px; font-weight: 700; }
    .be-news-links .be-news-original { color: #64748b; font-size: 12px; font-weight: 400; text-decoration: underline; text-underline-offset: 3px; }
    .news-content-body > p { margin-bottom: 18px; }
    .news-content-body > h2 { margin: 26px 0 12px; }
    .news-content-body > ul { padding-left: 22px; margin-bottom: 20px; }
    .news-content-body > ul > li { margin-bottom: 8px; }
    .news-archive-note { background: #f8fafc; padding: 16px 18px; border-left: 3px solid #cbd5e1; font-size: 13px; line-height: 1.7; color: #475569; }
    @media (max-width: 960px) {
      .be-news-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .be-news-section .xat-section-header { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 640px) {
      .be-news-grid { grid-template-columns: minmax(0, 1fr); }
      .be-news-thumb { height: 270px; }
    }

    .court-photo-gallery { margin: 0 0 24px; min-width: 0; }
    .court-adaptive-gallery {
      display: grid;
      gap: 10px;
      border-radius: 16px;
      overflow: hidden;
      aspect-ratio: 2 / 1;
      max-height: 480px;
    }
    .court-adaptive-gallery.count-1 { grid-template-columns: 1fr; aspect-ratio: 16 / 9; }
    .court-adaptive-gallery.count-2 { grid-template-columns: 1fr 1fr; }
    .court-adaptive-gallery.count-3 {
      grid-template-columns: 1.6fr 1fr;
      grid-template-rows: 1fr 1fr;
    }
    .court-adaptive-gallery.count-3 .tile-1 { grid-row: 1 / span 2; }
    .court-adaptive-gallery.count-4 {
      grid-template-columns: 1.5fr 1fr;
      grid-template-rows: repeat(3, 1fr);
    }
    .court-adaptive-gallery.count-4 .tile-1 { grid-row: 1 / span 3; }
    .court-adaptive-gallery.count-5 {
      grid-template-columns: 1.6fr 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }
    .court-adaptive-gallery.count-5 .tile-1 { grid-row: 1 / span 2; }

    .court-gallery-tile {
      position: relative;
      border: 0;
      padding: 0;
      margin: 0;
      background: #0f172a;
      cursor: pointer;
      overflow: hidden;
      display: block;
      width: 100%;
      height: 100%;
    }
    .court-gallery-tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.28s ease, filter 0.28s ease;
    }
    .court-gallery-tile:hover img {
      transform: scale(1.04);
      filter: brightness(0.92);
    }
    .court-tile-hover-icon {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.3);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .court-gallery-tile:hover .court-tile-hover-icon {
      opacity: 1;
    }
    .court-tile-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.72);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      backdrop-filter: blur(2px);
      transition: background 0.2s ease;
    }
    .court-gallery-tile:hover .court-tile-overlay {
      background: rgba(15, 23, 42, 0.85);
    }
    .overlay-plus { font-size: 26px; font-weight: 900; color: #fde047; }
    .overlay-text { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Lightbox Modal Phóng to ảnh toàn màn hình */
    .court-lightbox {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px;
    }
    .court-lightbox-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(7, 12, 20, 0.94);
      backdrop-filter: blur(10px);
      cursor: pointer;
    }
    .court-lightbox-header {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 12px;
    }
    .court-lightbox-counter {
      color: #f8fafc;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      background: rgba(255,255,255,0.1);
      padding: 4px 12px;
      border-radius: 999px;
    }
    .court-lightbox-btn-close {
      background: rgba(255,255,255,0.15);
      border: 0;
      color: #ffffff;
      font-size: 22px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .court-lightbox-btn-close:hover {
      background: #dc2626;
      transform: scale(1.1);
    }
    .court-lightbox-stage {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
      min-height: 0;
      padding: 10px 0;
    }
    .court-lightbox-nav {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ffffff;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      font-size: 22px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin: 0 12px;
    }
    .court-lightbox-nav:hover {
      background: #0052ff;
      border-color: #0052ff;
      transform: scale(1.12);
    }
    .court-lightbox-main-img-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      max-width: 90%;
      max-height: 100%;
      overflow: hidden;
    }
    .court-lightbox-main-img-wrap img {
      max-width: 100%;
      max-height: 72vh;
      object-fit: contain;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      transition: opacity 0.2s ease;
    }
    .court-lightbox-caption {
      color: #e2e8f0;
      font-size: 13.5px;
      font-weight: 600;
      margin-top: 10px;
      text-align: center;
      text-shadow: 0 2px 6px rgba(0,0,0,0.8);
    }
    .court-lightbox-thumbs {
      position: relative;
      z-index: 2;
      display: flex;
      gap: 10px;
      justify-content: center;
      overflow-x: auto;
      padding: 8px 12px;
    }
    .court-lightbox-thumb-item {
      width: 64px;
      height: 44px;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid transparent;
      padding: 0;
      background: transparent;
      cursor: pointer;
      opacity: 0.55;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }
    .court-lightbox-thumb-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .court-lightbox-thumb-item.is-active,
    .court-lightbox-thumb-item:hover {
      opacity: 1;
      border-color: #0052ff;
      transform: scale(1.08);
    }
    @media (max-width: 640px) {
      .court-adaptive-gallery { grid-template-columns: 1fr 1fr !important; aspect-ratio: auto; }
      .court-gallery-tile { aspect-ratio: 4 / 3; }
      .court-gallery-tile.tile-1 { grid-column: 1 / -1; grid-row: auto !important; aspect-ratio: 16 / 9; }
      .court-lightbox-nav { width: 38px; height: 38px; font-size: 18px; margin: 0 4px; }
    }
    .customer-reviews { margin: 0 0 48px; scroll-margin-top: 90px; }
    .customer-reviews-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      margin-bottom: 24px;
    }
    .customer-reviews-eyebrow {
      color: #0d3b66;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .customer-reviews-intro { margin-top: 8px; color: #64748b; font-size: 13.5px; line-height: 1.6; }
    .customer-reviews-source { flex-shrink: 0; display: inline-flex; gap: 8px; align-items: center; font-size: 13px; }
    .customer-reviews-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 28px; }
    .customer-reviews-summary { background: #f4f7fb; border-radius: 16px; padding: 26px 24px; }
    .customer-reviews-platform { font-size: 15px; font-weight: 700; color: #0d3b66; }
    .customer-reviews-score { display: flex; align-items: baseline; gap: 8px; margin-top: 14px; font-variant-numeric: tabular-nums; }
    .customer-reviews-score strong { color: #0d3b66; font-size: 64px; line-height: 1.1; letter-spacing: -0.06em; }
    .customer-reviews-score > span { color: #64748b; font-size: 18px; }
    .customer-review-stars { color: #b77900; font-size: 19px; line-height: 1.3; letter-spacing: 2px; }
    .customer-reviews-summary > .customer-review-stars { margin-top: 8px; }
    .customer-reviews-total { color: #475569; font-size: 13px; margin-top: 8px; }
    .customer-reviews-distribution { display: grid; gap: 8px; margin-top: 24px; }
    .customer-reviews-rating-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; gap: 8px; align-items: center; color: #475569; font-size: 11px; font-variant-numeric: tabular-nums; }
    .customer-reviews-rating-row > span:last-child { text-align: right; }
    .customer-reviews-small-star { color: #b77900; }
    .customer-reviews-track { height: 6px; border-radius: 4px; background: #dce3ed; overflow: hidden; }
    .customer-reviews-track > span { height: 100%; display: block; background: #e8aa14; border-radius: inherit; }
    .customer-reviews-updated { margin-top: 24px; font-size: 11px; color: #64748b; line-height: 1.7; }
    .customer-reviews-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; }
    .customer-review { display: flex; flex-direction: column; align-items: flex-start; padding: 22px 0; border-bottom: 1px solid #e2e8f0; min-width: 0; }
    .customer-review:nth-child(-n+2) { padding-top: 4px; }
    .customer-review-author { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .customer-review-avatar { position: relative; width: 45px; height: 45px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: #eaf0f7; color: #0d3b66; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .customer-review-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #eaf0f7; }
    .customer-review-avatar img[hidden] { display: none; }
    .customer-review:nth-child(2) .customer-review-avatar { background: #f9f0d9; color: #885e0b; }
    .customer-review:nth-child(3) .customer-review-avatar { background: #e9f2ee; color: #246247; }
    .customer-review-author h3 { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.4; }
    .customer-review-origin { font-size: 11px; color: #64748b; }
    .customer-review-empty-stars { color: #d1d9e4; }
    .customer-review-text { margin: 10px 0 14px; padding: 0; border: 0; font-size: 13px; line-height: 1.8; color: #475569; white-space: pre-line; overflow-wrap: anywhere; }
    .customer-review-original { margin-top: auto; font-size: 11px; color: #64748b; text-decoration: underline; text-underline-offset: 3px; }
    .customer-review-original:hover { color: #0d3b66; }
    .customer-reviews-note { margin-top: 18px; font-size: 11.5px; line-height: 1.8; color: #64748b; }
    .customer-reviews-note a { color: #0d3b66; text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 960px) {
      .customer-reviews-header { align-items: flex-start; flex-direction: column; gap: 16px; }
      .customer-reviews-layout { grid-template-columns: 220px minmax(0, 1fr); gap: 22px; }
      .customer-reviews-list { grid-template-columns: minmax(0, 1fr); }
      .customer-review:nth-child(2) { padding-top: 22px; }
    }
    @media (max-width: 640px) {
      .customer-reviews-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; }
      .customer-reviews-source { white-space: normal; text-align: left; font-size: 12px; }
      .customer-reviews-summary { padding: 24px; }
    }

    /* ── Khối Đăng ký nhận bản tin từ Be Badminton ở cuối trang (tách biệt rõ ràng với Footer tối màu) ── */
    .newsletter-band {
      background: #f1f5f9;
      padding: 56px 0;
      margin-top: 56px;
      border-top: 1px solid #e2e8f0;
    }
    .newsletter-card-wrapper {
      background: linear-gradient(135deg, #ffffff 0%, #fffdf5 45%, #ecfdf5 100%);
      border: 1.5px solid #cbd5e1;
      border-left: 6px solid #e8aa14;
      border-radius: 20px;
      padding: 38px 44px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
    }
    .newsletter-inner {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      gap: 36px;
      align-items: center;
    }
    .newsletter-form {
      display: flex;
      gap: 10px;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      padding: 6px;
      border-radius: 14px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .newsletter-form:focus-within {
      border-color: #0f6938;
      box-shadow: 0 0 0 3px rgba(15, 105, 56, 0.12);
    }
    .newsletter-input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      padding: 12px 14px;
      font-family: var(--font-sans);
      font-size: 15px;
      color: #0f172a;
      outline: none;
    }
    .newsletter-btn {
      background: linear-gradient(180deg, #0f6938 0%, #0b532b 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0 22px;
      font-family: var(--font-sans);
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      transition: filter 150ms ease, transform 150ms ease;
    }
    .newsletter-btn:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    main.main-content { padding-top: 28px; padding-bottom: 24px; min-height: 50vh; }

    @media (max-width: 1120px) {
      .brand-tagline { display: none; }
      .nav-actions .btn-pill-outline[href^="tel:"] { display: none; }
      .nav-links a { padding: 8px 10px; font-size: 13.5px; }
    }
    @media (max-width: 1024px) {
      .editorial-layout, .be-code-showcase, .newsletter-inner { grid-template-columns: 1fr; }
      .grid-4, .xat-4cards-grid { grid-template-columns: repeat(2, 1fr); }
      .grid-3 { grid-template-columns: repeat(2, 1fr); }
      .xat-search-grid, .xat-search-grid-4 { grid-template-columns: 1fr 1fr; }
      .xat-search-grid-4 > .xat-submit-btn { grid-column: 1 / -1; height: 56px; }
      .footer-main-grid { grid-template-columns: 1fr 1fr; }
      .bank-grid { grid-template-columns: repeat(3, 1fr); }
      .display-mega { font-size: 52px; }
    }
    @media (max-width: 1180px) {
      .nav-toggle { display: inline-flex; }
      .nav-menu { display: none; position: absolute; left: 0; right: 0; top: 68px; background: #fff; border-bottom: 1px solid var(--hairline); padding: 12px 24px 20px; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); z-index: 90; }
      .nav-menu.open { display: block; }
      .nav-links { flex-direction: column; align-items: stretch; }
      .nav-links a { display: block; padding: 12px 14px; font-size: 14.5px; }

      .stepper-bar { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .bebad-board { padding: 14px 12px; }
      .bebad-day-title { font-size: 20px; }
      .bebad-date-badge { font-size: 15px; padding: 5px 10px; }
      .bebad-timeband-bar { padding: 8px 10px; gap: 8px; }
      .bebad-timeband-group {
        width: 100%;
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 4px;
        -webkit-overflow-scrolling: touch;
      }
      .bebad-timeband-pill { flex-shrink: 0; font-size: 12px; padding: 6px 10px; }
      .bebad-grid-table thead th.bebad-corner-th,
      .bebad-grid-table tbody td.bebad-court-name {
        width: 78px;
        min-width: 78px;
        font-size: 12px;
        padding: 0 6px;
      }
      .be-map-scroll {
        display: block;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .be-floor-plan-svg {
        min-width: 680px;
        max-height: none;
      }
    }
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      .grid-2, .grid-3, .grid-4, .xat-4cards-grid, .xat-search-grid, .xat-search-grid-4, .footer-main-grid, .newsletter-form, .addon-selection-grid, .qr-preview-box { grid-template-columns: 1fr; flex-direction: column; }
      .xat-field-box { height: 64px; }
      .xat-submit-btn { height: 54px; width: 100%; }
      .xat-section-title-group { min-width: 0; align-items: flex-start; }
      .xat-section-title-group > svg { flex-shrink: 0; }
      .xat-section-title { font-size: 20px; line-height: 1.3; }
      .xat-promo-band { padding: 20px 14px; margin-bottom: 32px; }
      .newsletter-band { padding: 36px 0; margin-top: 36px; }
      .newsletter-card-wrapper { padding: 24px 18px; }
      .bebad-corner-dock {
        left: 12px;
        right: 12px;
        bottom: 12px;
        width: auto;
        max-width: none;
        padding: 14px 16px;
      }
      .pay-method-body { margin-left: 0; }
      .newsletter-btn { min-height: 46px; }
      .bank-grid { grid-template-columns: repeat(2, 1fr); }
      .display-mega { font-size: 36px; letter-spacing: -1px; }
      .headline-xl, .cta-band-dark h2 { font-size: 30px; }
      .eyebrow-text { font-size: 24px; }
      .flat-panel, .soft-panel, .ink-border-panel, .feature-card { padding: 20px; border-radius: var(--r-lg); }
      .nav-actions .btn-pill-outline { display: none; }
    }

    .venue-location-section {margin-bottom:44px;scroll-margin-top:90px}
    .venue-location-grid {display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);gap:24px;align-items:stretch}
    .venue-panel-title {font-size:18px;line-height:1.4;color:#163c57;margin:0 0 6px}
    .venue-panel-note {font-size:12px;color:#667b8c;line-height:1.6;margin:0 0 16px}
    .venue-location-grid .be-floor-plan {margin:0;min-width:0}
    .venue-location-grid .be-map-scroll {display:flex;justify-content:center;overflow:visible}
    .venue-location-grid .be-floor-plan-svg {min-width:0;width:100%;height:auto;max-height:560px}
    .venue-directions {min-width:0;display:flex;flex-direction:column}
    .venue-location-grid .be-location-board {position:relative;flex:1;min-height:260px;border:1px solid #dce5eb;border-radius:10px;overflow:hidden}
    .venue-location-grid .be-location-map {position:absolute;inset:0;width:100%;height:100%;min-height:0;flex:none}
    .venue-directions-link {font-size:12px;font-weight:400;color:#12537c;text-decoration:underline;text-underline-offset:4px}
    .home-pricing-section {scroll-margin-top:90px}
    .home-pricing-grid {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:32px;align-items:stretch}
    .court-pricing-panel,.equipment-pricing-panel {min-width:0;scroll-margin-top:90px}
    .home-pricing-grid .court-pricing-panel {display:flex;flex-direction:column}
    .home-pricing-grid .court-price-content {display:flex;flex:1}
    .home-pricing-grid .be-price-board {border:1px solid #dbe5ed;background:#f8fafb;border-radius:10px;box-shadow:none;padding:12px}
    .home-pricing-grid .be-price-perks-grid {grid-template-columns:1fr}
    .home-pricing-grid .be-price-perk-card {border:none;border-top:1px solid #dbe5ed;border-radius:0;background:transparent;box-shadow:none;padding:12px 4px}
    .home-pricing-grid .equipment-groups {grid-template-columns:1fr;gap:22px}
    .home-pricing-grid .equipment-product {grid-template-columns:68px minmax(0,1fr) auto;gap:12px;padding:12px 0}
    .home-pricing-grid .equipment-product img {width:68px;height:64px}
    .home-pricing-grid .equipment-product h4 {font-size:14px}
    .home-pricing-grid .equipment-price {font-size:15px}
    @media(max-width:900px){.venue-location-grid,.home-pricing-grid{grid-template-columns:1fr}.venue-location-grid .be-floor-plan-svg{height:auto;max-height:360px}.venue-location-grid .be-location-board{flex:none;min-height:0;aspect-ratio:4/3;max-height:360px}}
    @media(max-width:480px){.home-pricing-grid .equipment-product{grid-template-columns:64px minmax(0,1fr)}.home-pricing-grid .equipment-price{grid-column:2;text-align:left}.home-pricing-grid .be-price-table th,.home-pricing-grid .be-price-table td{padding:9px 4px;font-size:11px}.home-pricing-grid .be-price-val{font-size:15px}.home-pricing-grid .be-price-sub{font-size:10px}}


    /* Shared, restrained navigation and booking controls. */
    #lich-san-nhanh {scroll-margin-top:84px}
    .user-chip {max-width:310px;background:transparent;font-weight:500;border:0;border-radius:6px}
    .user-name {max-width:240px;min-width:0}
    .avatar {background:#e9eff8;color:#24518b;font-weight:500}
    .nav-links a {border-radius:5px}
    .user-popover,.notif-popover {border:1px solid #dfe4ea;border-radius:8px;box-shadow:0 8px 24px #152a4014;max-width:calc(100vw - 24px)}
    .user-popover {width:300px}
    .user-popover-header {padding:16px}
    .user-popover-item {font-weight:400;font-size:14px;border-radius:4px;padding:10px 12px}
    .user-popover-logout-btn {font-weight:500;justify-content:flex-start;padding:8px 12px}
    .notif-item-title {font-weight:500}
    .notif-item.is-unread .notif-item-title {font-weight:600}
    .notif-item.is-unread {background:#f5f8fc}
    .notif-popover-title {font-weight:600}
    .notif-empty-state {padding:24px 16px;min-height:0}
    .booking-filters {margin:0 0 16px;border-bottom:1px solid #e2e6eb;padding-bottom:12px}
    .booking-filters summary {cursor:pointer;font-size:14px;font-weight:500;width:fit-content}
    .booking-filter-form {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end;gap:12px;margin-top:12px}
    .booking-filter-form label {font-size:12px;display:grid;gap:5px;color:#526071}
    .booking-empty {padding:16px 0;font-size:14px}
    .booking-alternatives {display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
    .booking-alternatives a {padding:8px 10px;border:1px solid #dfe4ea;border-radius:5px;font-size:13px}
    .xat-radio-pill {font-size:14px;font-weight:500}
    .xat-field-box {border:1px solid #d7dde5;border-radius:7px;padding:12px 14px;min-height:72px;background:#fff}
    .xat-field-label {font-size:12px;font-weight:400;color:#667080}
    .xat-field-control {font-size:14px;font-weight:500!important}
    .xat-submit-btn {box-shadow:none;border-radius:7px;font-size:14px;font-weight:500;background:#1755ba}
    .xat-radio-pill > span:last-child:not(.xat-radio-dot):not(.xat-radio-dot-idle) {font-weight:500!important}
    .xat-search-wrap {box-shadow:none;border:1px solid #e2e6eb;border-radius:8px}
    .home-search-form {grid-template-columns:1.2fr 1.2fr 1fr auto}
    .home-search-form > div:last-child {display:flex;align-items:stretch}
    .home-search-form .xat-submit-btn {height:auto;min-height:48px}
    .booking-hour-filter {display:inline-flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#526071}
    .booking-hour-filter a {color:#1755aa;text-decoration:underline}
    .booking-filter-actions {display:flex;align-items:center;gap:16px}
    .cell-filtered {background:#f1f3f5;opacity:.55}
    .bebad-timeband-pill {font-weight:500}
    @media(max-width:960px) {.home-search-form {grid-template-columns:1fr 1fr}}
    @media(max-width:600px) {
      .nav-bar {gap:6px}
      .brand-link,.nav-toggle,.notif-wrapper {flex-shrink:0}
      .nav-actions {min-width:0;flex-shrink:1;margin-left:auto}
      .user-dropdown-wrap {min-width:0}
      .user-chip {max-width:100%;min-width:0;padding-right:2px;gap:4px}
      .user-chip > svg {flex-shrink:0}
      .user-name {display:inline-block;max-width:100%;font-size:12px}
      .user-chip .avatar {width:24px;height:24px;font-size:12px}
      .nav-actions {gap:4px}
      .user-popover,.notif-popover {position:fixed;top:68px;right:12px;left:12px;width:auto;max-width:none;max-height:calc(100dvh - 84px);overflow-y:auto}
      .footer-main-grid,.booking-filter-form {grid-template-columns:1fr}
      .home-search-form {grid-template-columns:1fr}
      .xat-mode-bar {align-items:flex-start;gap:10px;flex-direction:column}
    }
  </style>
  <link rel="stylesheet" href="/public/css/order-pages.css" />
<link rel="stylesheet" href="/public/css/customer-experience.css">
<script src="/public/js/cart.js" defer></script>
<script src="/public/js/hero-carousel.js" defer></script>
</head>
<body data-authenticated="${!!user}">
  <a href="#main-content" class="skip-link">Bỏ qua điều hướng đến nội dung chính</a>

  <header class="site-header">
    <div class="container nav-bar">
      <a href="/" class="brand-link" aria-label="CourtGo — về trang chủ">
        ${logoLockup()}
      </a>

      <nav aria-label="Điều hướng chính" class="nav-menu" id="nav-menu">
        <ul class="nav-links">
          ${navItems
      .filter((n) => n.show)
      .map(
        (n) =>
          `<li><a href="${n.href}" class="${opts.activeNav === n.key ? 'active' : ''}" ${opts.activeNav === n.key ? 'aria-current="page"' : ''}>${n.label.replace('&', '&amp;')}</a></li>`
      )
      .join('')}
        </ul>
      </nav>

      <div class="nav-actions"><a href="/gio-hang" class="header-cart" aria-label="Mở giỏ vé" title="Giỏ vé">${svgGlyph('cart',22)}<b data-cart-count>0</b></a>
        ${user
      ? `
              <div class="notif-wrapper" id="notif-wrapper">
                <button type="button" class="notif-bell-btn" id="notif-toggle-btn"
                  aria-expanded="false" aria-haspopup="true"
                  aria-label="Thông báo (${opts.unreadNotificationsCount || 0} mới)"
                  title="Thông báo (${opts.unreadNotificationsCount || 0} mới)"
                  onclick="toggleNotifDropdown(event);">
                  ${svgGlyph('bell', 18)}
                  ${opts.unreadNotificationsCount && opts.unreadNotificationsCount > 0
        ? `<span class="notif-badge" id="notif-badge-pill" aria-label="${opts.unreadNotificationsCount} thông báo mới">${opts.unreadNotificationsCount}</span>`
        : ''
      }
                </button>
                <div class="notif-popover" id="notif-popover" role="dialog" aria-label="Thông báo nhanh" style="display:none;">
                  <div class="notif-popover-header">
                    <div class="notif-popover-title-row">
                      <span class="notif-popover-title">Thông báo</span>
                    </div>
                    ${opts.unreadNotificationsCount && opts.unreadNotificationsCount > 0
        ? `<button type="button" class="notif-mark-all-read-btn" id="notif-mark-all-read-btn" onclick="markAllNotificationsRead(event);">Đã đọc tất cả</button>`
        : ''
      }
                  </div>
                  <div class="notif-popover-list" id="notif-popover-list">
                    ${opts.recentNotifications && opts.recentNotifications.length > 0
        ? opts.recentNotifications.map((n) => renderHeaderNotificationItem(n)).join('')
        : `
                          <div class="notif-empty-state">
                            <div class="notif-empty-text">Chưa có thông báo</div>
                            
                          </div>
                        `
      }
                  </div>
                  <div class="notif-popover-footer">
                    <a href="/don-dat" class="notif-footer-link">
                      <span>Xem đơn đặt</span>
                    </a>
                  </div>
                </div>
              </div>
              <div class="user-dropdown-wrap" id="user-dropdown-wrap">
                <button type="button" class="user-chip user-chip-btn" id="user-dropdown-btn"
                  aria-expanded="false" aria-haspopup="true"
                  aria-label="Tài khoản ${escapeHtml(user.full_name)}"
                  title="${escapeHtml(user.full_name)}"
                  onclick="toggleUserDropdown(event);">
                  <span class="avatar" aria-hidden="true">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="" />` : escapeHtml(initials(user.full_name))}</span>
                  <span class="user-name">${escapeHtml(user.full_name)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6; margin-left:2px;"><path d="M6 9l6 6 6-6"/></svg>
                </button>

                <div class="user-popover" id="user-popover" role="dialog" aria-label="Menu tài khoản cá nhân" style="display:none;">
                  <!-- Header: Tên + Email / SĐT -->
                  <div class="user-popover-header">
                    <div style="display:flex; align-items:center; gap:12px;">
                      <span class="avatar" style="width:38px; height:38px; font-size:15px;">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="" />` : escapeHtml(initials(user.full_name))}</span>
                      <div style="min-width:0; flex:1;">
                        <div style="font-weight:600; font-size:14px; color:#0f172a; overflow-wrap:anywhere;">
                          ${escapeHtml(user.full_name)}
                        </div>
                        <div style="font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                          ${escapeHtml(user.email || user.phone || '')}
                        </div>
                      </div>
                    </div>
                  </div>

                  ${membershipProgress(user, true)}
                  <div class="user-popover-menu">
                    <a href="/tai-khoan" class="user-popover-item">Tài khoản</a>
                    <a href="/don-dat" class="user-popover-item">Đơn đặt</a>
                    ${isStaffOrAdmin ? '<a href="/quan-tri" class="user-popover-item">Quản trị</a>' : ''}
                    <a href="/tai-khoan#doi-mat-khau" class="user-popover-item">Đổi mật khẩu</a>
                  </div>

                  <!-- Footer: Nút đăng xuất -->
                  <div class="user-popover-footer">
                    <form method="POST" action="/tai-khoan/dang-xuat" style="margin:0; width:100%;">
                      <input type="hidden" name="_csrf" value="${escapeHtml(opts.session?.csrfToken || '')}" />
                      <button type="submit" class="user-popover-logout-btn">
                        
                        <span>Đăng xuất</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            `
      : `
              <a href="/tai-khoan/dang-nhap" class="btn-pill-outline">Đăng nhập</a>
              <a href="/tai-khoan/dang-ky" class="btn-pill-dark">Đăng ký</a>
            `
    }
        <button type="button" class="icon-btn nav-toggle" aria-controls="nav-menu" aria-expanded="false" aria-label="Mở menu"
          onclick="var m=document.getElementById('nav-menu');var o=m.classList.toggle('open');this.setAttribute('aria-expanded',o);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>
  </header>

  ${opts.fullBleedTopHtml || ''}

  <main id="main-content" class="container main-content">
    ${opts.flashMessage
      ? `<div role="alert" aria-live="polite" class="flash flash-${opts.flashMessage.type}">
            ${flashIcon}
            <span>${escapeHtml(opts.flashMessage.text)}</span>
          </div>`
      : ''
    }
    ${opts.bodyHtml}
  </main>

  <div id="cart-live" class="cart-live" role="status" aria-live="polite"></div>
  <footer class="footer-wp">
    <div class="container footer-main-grid">
      <section class="footer-brand"><a href="/" aria-label="Be Badminton — Trang chủ">${logoLockup({onDark:true})}</a>
        <p class="footer-tagline">Thêm một trận hay.<br>Thêm một ngày vui.</p>
        <p class="footer-contact-row">${svgGlyph('pin',20)} <span>262/1 Quang Trung, Phường 10,<br>Gò Vấp, TP.HCM</span></p>
        <p class="footer-contact-row">${svgGlyph('clock',20)} <span>05:00–24:00 hằng ngày</span></p>
        <p class="footer-contact-row">${svgGlyph('mail',20)} <a href="mailto:hotro@bebadminton.vn">hotro@bebadminton.vn</a></p>
        <div class="footer-actions"><a class="footer-call" href="tel:0773333371">${svgGlyph('phone',18)} 0773 333 371</a><a class="footer-map" href="https://www.google.com/maps/search/?api=1&query=Be+Badminton+262%2F1+Quang+Trung" target="_blank" rel="noopener noreferrer">Chỉ đường ${svgGlyph('arrow',16)}</a></div>
      </section>
      <nav aria-label="Điều hướng cuối trang"><h2>Đến sân</h2><ul class="footer-nav-list">
        <li><a href="/#lich-san-nhanh">Đặt sân theo giờ</a></li><li><a href="/#bang-gia-niem-yet">Bảng giá</a></li><li><a href="/#so-do-18-san">Sơ đồ sân</a></li><li><a href="/dung-cu">Dụng cụ & phụ kiện</a></li><li><a href="/tin-tuc">Tin tức</a></li>
      </ul><a class="footer-social" href="https://www.facebook.com/official.bebadminton/" target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5A23 23 0 0 0 15 1c-3 0-5 2-5 5v3H7v4h3v9z"/></svg> Be Badminton</a></nav>
      <nav aria-label="Hỗ trợ cuối trang"><h2>Luôn sẵn sàng hỗ trợ</h2><ul class="footer-nav-list">
        <li><a href="/huong-dan-thanh-toan">Hướng dẫn đặt sân</a></li><li><a href="/don-dat">Vé của tôi</a></li><li><a href="/chinh-sach#chinh-sach-huy">Hủy & hoàn tiền</a></li><li><a href="/chinh-sach#bao-mat-thong-tin">Bảo mật thông tin</a></li><li><a href="/chinh-sach">Nội quy sân</a></li>
      </ul><p class="footer-parking">Có chỗ để xe máy và ô tô.</p></nav>
    </div>
    <div class="container footer-copyright"><span>© ${new Date().getFullYear()} Be Badminton</span><span>Gặp nhau trên sân cầu.</span></div>
  </footer>
  <script>
    (function() {
      function syncSectionNav() {
        if (window.location.pathname !== '/') return;
        document.querySelectorAll('.nav-links a').forEach(function(link) {
          var active = window.location.hash === '#lich-san-nhanh' ? link.getAttribute('href') === '#lich-san-nhanh'
            : window.location.hash === '#bang-gia-niem-yet' ? ['/#bang-gia-niem-yet','#bang-gia-niem-yet'].includes(link.getAttribute('href')) : link.getAttribute('href') === '/';
          link.classList.toggle('active', active);
          if (active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
        });
      }
      window.addEventListener('hashchange', syncSectionNav); syncSectionNav();
      document.querySelectorAll('a[href^="/#"]').forEach(function(link) {
        if (window.location.pathname === '/') link.setAttribute('href', link.getAttribute('href').slice(1));
      });
      document.querySelectorAll('.nav-links a').forEach(function(link) {
        link.addEventListener('click', function() {
          document.getElementById('nav-menu').classList.remove('open');
          document.querySelector('.nav-toggle').setAttribute('aria-expanded','false');
        });
      });
      window.toggleNotifDropdown = function(e) {
        if (e) e.stopPropagation();
        var p = document.getElementById('notif-popover');
        var b = document.getElementById('notif-toggle-btn');
        if (!p) return;
        var userP = document.getElementById('user-popover');
        var userB = document.getElementById('user-dropdown-btn');
        if (userP) {
          userP.style.display = 'none';
          if (userB) userB.setAttribute('aria-expanded', 'false');
        }
        var isHidden = p.style.display === 'none' || !p.style.display;
        if (isHidden) {
          p.style.display = 'flex';
          if (b) b.setAttribute('aria-expanded', 'true');
        } else {
          p.style.display = 'none';
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      };

      window.toggleUserDropdown = function(e) {
        if (e) e.stopPropagation();
        var p = document.getElementById('user-popover');
        var b = document.getElementById('user-dropdown-btn');
        if (!p) return;
        var notifP = document.getElementById('notif-popover');
        var notifB = document.getElementById('notif-toggle-btn');
        if (notifP) {
          notifP.style.display = 'none';
          if (notifB) notifB.setAttribute('aria-expanded', 'false');
        }
        var isHidden = p.style.display === 'none' || !p.style.display;
        if (isHidden) {
          p.style.display = 'flex';
          if (b) b.setAttribute('aria-expanded', 'true');
        } else {
          p.style.display = 'none';
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      };

      document.addEventListener('click', function(e) {
        var w = document.getElementById('notif-wrapper');
        var p = document.getElementById('notif-popover');
        var b = document.getElementById('notif-toggle-btn');
        if (w && !w.contains(e.target)) {
          if (p && p.style.display !== 'none') {
            p.style.display = 'none';
            if (b) b.setAttribute('aria-expanded', 'false');
          }
        }

        var uw = document.getElementById('user-dropdown-wrap');
        var up = document.getElementById('user-popover');
        var ub = document.getElementById('user-dropdown-btn');
        if (uw && !uw.contains(e.target)) {
          if (up && up.style.display !== 'none') {
            up.style.display = 'none';
            if (ub) ub.setAttribute('aria-expanded', 'false');
          }
        }
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          var p = document.getElementById('notif-popover');
          var b = document.getElementById('notif-toggle-btn');
          if (p && p.style.display !== 'none') {
            p.style.display = 'none';
            if (b) {
              b.setAttribute('aria-expanded', 'false');
              b.focus();
            }
          }

          var up = document.getElementById('user-popover');
          var ub = document.getElementById('user-dropdown-btn');
          if (up && up.style.display !== 'none') {
            up.style.display = 'none';
            if (ub) {
              ub.setAttribute('aria-expanded', 'false');
              ub.focus();
            }
          }
        }
      });

      window.markAllNotificationsRead = function(e) {
        if (e) e.stopPropagation();
        fetch('/api/thong-bao/doc-tat-ca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
          .then(function(r) { return r.json(); })
          .then(function() {
            var badge = document.getElementById('notif-badge-pill');
            if (badge) badge.remove();
            var pill = document.getElementById('notif-unread-count-pill');
            if (pill) pill.remove();
            var btn = document.getElementById('notif-mark-all-read-btn');
            if (btn) btn.remove();
            var unreadItems = document.querySelectorAll('.notif-item.is-unread');
            for (var i = 0; i < unreadItems.length; i++) {
              unreadItems[i].classList.remove('is-unread');
              unreadItems[i].classList.add('is-read');
            }
            var dots = document.querySelectorAll('.notif-unread-dot');
            for (var j = 0; j < dots.length; j++) {
              dots[j].remove();
            }
          })
          .catch(function() {});
      };
      // ─── Hero Banner Slider (Luân chuyển 2 ảnh banner mượt mà) ───
    })();
  </script>
</body>
</html>`;
}
