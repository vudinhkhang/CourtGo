import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { iconBadge, inlineIcon } from './icons.js';

export interface AdminDashboardLayoutProps {
  title: string;
  description?: string;
  activeNav:
    | 'overview'
    | 'live_pos'
    | 'reports'
    | 'courts'
    | 'equipment'
    | 'bookings'
    | 'payments'
    | 'coupons'
    | 'accounts'
    | 'news'
    | 'reviews';
  session: SessionContext;
  flashMessage?: {
    type: 'success' | 'error' | 'info';
    message?: string;
    text?: string;
  } | null;
  bodyHtml: string;
}

export function renderAdminDashboardLayout(props: AdminDashboardLayoutProps): string {
  const { title, activeNav, session, flashMessage, bodyHtml } = props;
  const isAdmin = session.user.role === 'ADMIN';
  const roleVi = isAdmin ? 'Quản trị viên' : 'Nhân viên vận hành';
  const csrfToken = session.csrfToken;
  const flashText = flashMessage ? (flashMessage.message || flashMessage.text || '') : '';

  const navItems = [
    { section: 'Vận hành' },
    { key: 'overview', href: '/quan-tri', label: 'Tổng quan' },
    { key: 'live_pos', href: '/quan-tri/dieu-phoi-18-san', label: 'Điều phối' },
    { key: 'bookings', href: '/quan-tri/don-dat', label: 'Đơn đặt' },
    { key: 'payments', href: '/quan-tri/thanh-toan-hoan-tien', label: 'Thanh toán' },
    { key: 'reports', href: '/quan-tri/bao-cao-chot-ca', label: 'Báo cáo' },
    { section: 'Cơ sở' },
    { key: 'courts', href: '/quan-tri/san-va-gia', label: 'Sân & giá' },
    { key: 'equipment', href: '/quan-tri/dich-vu-dung-cu', label: 'Dụng cụ' },
    { section: 'Quản lý' },
    { key: 'coupons', href: '/quan-tri/khuyen-mai', label: 'Mã ưu đãi' },
    { key: 'news', href: '/quan-tri/tin-tuc', label: 'Tin tức' },
    ...(isAdmin
      ? [
          { key: 'accounts', href: '/quan-tri/tai-khoan', label: 'Tài khoản' },
        ]
      : []),
  ];

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(props.description || 'Quản trị CourtGo')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="/public/assets/icons/home-circle-gold.svg">
  <style>
    :root {
      --admin-bg: #f6f7f9;
      --admin-sidebar-bg: #ffffff;
      --admin-sidebar-border: #e2e6eb;
      --admin-topbar-bg: #0d1726;
      --admin-content-bg: #f4f6fa;
      --admin-primary: #0052ff;
      --admin-primary-hover: #0045d8;
      --admin-text-main: #0f172a;
      --admin-text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Lexend', system-ui, -apple-system, sans-serif;
      background: var(--admin-content-bg);
      color: var(--admin-text-main);
      min-height: 100vh;
      display: flex;
    }
    a { color: inherit; text-decoration: none; }

    /* Admin App Shell Layout */
    .admin-shell {
      display: flex;
      width: 100%;
      min-height: 100vh;
    }

    /* Sidebar */
    .admin-sidebar {
      width: 280px;
      background: var(--admin-sidebar-bg);
      border-right: 1px solid var(--admin-sidebar-border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 100;
      color: #243142;
    }
    .admin-brand {
      padding: 24px 22px 18px 22px;
      border-bottom: 1px solid var(--admin-sidebar-border);
    }
    .admin-brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .admin-brand-title {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .admin-brand-badge {
      background: #0052ff;
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .admin-brand-sub {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }

    /* Staff Profile Box */
    .admin-user-card {
      margin: 16px 16px 8px 16px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .admin-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0052ff 0%, #3b82f6 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 15px;
      flex-shrink: 0;
    }
    .admin-user-info {
      flex: 1;
      min-width: 0;
    }
    .admin-user-name {
      font-size: 13px;
      font-weight: 600;
      color: #243142;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-user-role {
      font-size: 11px;
      color: #60a5fa;
      font-weight: 600;
    }

    /* Nav Menu */
    .admin-nav {
      padding: 12px 14px;
      flex: 1;
    }
    .admin-nav-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 14px 10px 6px 10px;
    }
    .admin-nav-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-radius: 10px;
      color: #495565;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 3px;
      transition: all 0.15s ease;
    }
    .admin-nav-link:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
    }
    .admin-nav-link.is-active {
      background: #0052ff;
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(0, 82, 255, 0.35);
    }
    .admin-nav-link-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .admin-nav-badge-pill {
      background: #ef4444;
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
    }

    /* Bottom Quick Links */
    .admin-sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--admin-sidebar-border);
      background: rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .admin-btn-portal {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      transition: background 0.15s ease;
    }
    .admin-btn-portal:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .admin-btn-logout {
      background: transparent;
      border: 0;
      color: #ef4444;
      font-size: 12px;
      font-weight: 600;
      padding: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 6px;
      transition: background 0.15s ease;
    }
    .admin-btn-logout:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    /* Main Area */
    .admin-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: var(--admin-content-bg);
    }

    /* Topbar */
    .admin-topbar {
      height: 64px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      position: sticky;
      top: 0;
      z-index: 90;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .admin-topbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .admin-topbar-title {
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
    }
    .admin-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      font-size: 11.5px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .admin-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      display: inline-block;
    }

    /* Content Area */
    .admin-content {
      padding: 28px;
      flex: 1;
      max-width: 1480px;
      width: 100%;
      margin: 0 auto;
    }

    /* Flash Alerts */
    .admin-alert {
      padding: 14px 18px;
      border-radius: 12px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13.5px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .admin-alert-success {
      background: #ecfdf5;
      border: 1.5px solid #a7f3d0;
      color: #065f46;
    }
    .admin-alert-error {
      background: #fef2f2;
      border: 1.5px solid #fecaca;
      color: #991b1b;
    }

    /* Standard Cards & Panels in Admin */
    :root {
      --primary: #0052ff;
      --primary-active: #003ecc;
      --primary-tint: #e8efff;
      --ink: #0f172a;
      --body: #334155;
      --muted: #64748b;
      --muted-soft: #94a3b8;
      --hairline: #cbd5e1;
      --hairline-soft: #e2e8f0;
      --canvas: #ffffff;
      --surface-soft: #f8fafc;
      --surface-strong: #f1f5f9;
      --up: #059669;
      --down: #dc2626;
      --color-primary: #0052ff;
      --color-ink: #0f172a;
      --color-charcoal: #334155;
      --color-slate: #64748b;
      --color-canvas: #ffffff;
      --color-soft: #f8fafc;
      --color-hairline: #e2e8f0;
      --color-silver: #cbd5e1;
      --color-rail-teal: #059669;
      --color-rail-red: #dc2626;
      --color-gold: #d97706;
    }

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

    .num, .mono { font-variant-numeric: tabular-nums; }
    .body-text { font-size: 15px; color: #334155; line-height: 1.6; }
    .body-sm { font-size: 13.5px; color: #475569; line-height: 1.55; }
    .body-sm strong, .body-text strong { color: #0f172a; font-weight: 600; }
    .caption-text { font-size: 12.5px; color: #64748b; line-height: 1.5; }
    .icon-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; flex-shrink: 0; }
    .inline-icon { display: inline-flex; align-items: center; }

    /* Section Heading Lockup used across Admin Pages */
    .section-eyebrow-lockup { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .section-heading-main { display: flex; align-items: center; gap: 14px; }
    .eyebrow-bar { width: 10px; height: 10px; border-radius: 9999px; background: #0052ff; flex-shrink: 0; }
    .eyebrow-text { font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -0.4px; color: #0f172a; margin: 0; }
    .section-subtitle { font-size: 13.5px; color: #64748b; margin-top: 4px; }

    .flat-panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.03);
      margin-bottom: 24px;
    }
    .soft-panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
    }
    .ink-border-panel {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }
    .feature-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
    .feature-card:hover {
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }

    /* Stat Cards (KPIs) */
    .stat-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
    }
    .stat-label { font-size: 12.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; }
    .stat-value { font-size: 24px; font-weight: 600; letter-spacing: -0.5px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .stat-foot { font-size: 12px; color: #64748b; line-height: 1.45; }

    /* Data Tables */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
      width: 100%;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: transparent;
      text-align: left;
    }
    .data-table th {
      color: #475569;
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 13px 16px;
      text-align: left;
      border-bottom: 1.5px solid #e2e8f0;
      background: #f8fafc;
      white-space: nowrap;
    }
    .data-table td {
      padding: 14px 16px;
      font-size: 13.5px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      color: #0f172a;
      line-height: 1.45;
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tbody tr:hover td { background: #f8fafc; }
    .flat-panel > .data-table, .soft-panel > .data-table {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }

    /* Notice bands */
    .breaking-band { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 12px; padding: 14px 18px; margin: 16px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 600; }
    .notice-band-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 18px; margin: 16px 0; }
    .notice-band-info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 18px; margin: 16px 0; }

    .headline-xl { font-size: 28px; font-weight: 600; color: #0f172a; line-height: 1.2; }
    .headline-lg { font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.25; }
    .headline-md { font-size: 18px; font-weight: 600; color: #0f172a; line-height: 1.3; }
    .headline-sm { font-size: 15px; font-weight: 600; color: #0f172a; line-height: 1.35; }
    .text-input, .network-select {
      width: 100%;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1.5px solid #cbd5e1;
      font-family: inherit;
      font-size: 13.5px;
      color: #0f172a;
      background: #ffffff;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    textarea.text-input { min-height: 84px; resize: vertical; }
    .text-input:focus, .network-select:focus {
      outline: none;
      border-color: #0052ff;
      box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.12);
    }
    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .form-label { display: block; font-size: 12.5px; font-weight: 600; color: #334155; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
    .editorial-layout { display: grid; grid-template-columns: 1.75fr 1fr; gap: 24px; align-items: start; }
    .stack { display: flex; flex-direction: column; gap: 20px; }
    .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

    /* Buttons */
    .btn-pill-dark {
      background: #0f172a;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 13px;
      padding: 9px 18px;
      min-height: 38px;
      border-radius: 999px;
      border: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none !important;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-pill-dark:hover { background: #1e293b; color: #ffffff !important; }
    .btn-pill-primary, .btn-primary {
      background: #0052ff;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 13px;
      padding: 9px 18px;
      min-height: 38px;
      border-radius: 999px;
      border: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none !important;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-pill-primary:hover, .btn-primary:hover { background: #0045d8; color: #ffffff !important; }
    .btn-pill-outline, .btn-secondary {
      background: #f1f5f9;
      color: #0f172a !important;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 16px;
      min-height: 38px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none !important;
      white-space: nowrap;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-pill-outline:hover, .btn-secondary:hover { background: #e2e8f0; border-color: #94a3b8; color: #0f172a !important; }
    .btn-pill-danger {
      background: #fef2f2;
      color: #dc2626 !important;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 16px;
      min-height: 38px;
      border-radius: 999px;
      border: 1px solid #fecaca;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none !important;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-pill-danger:hover { background: #fee2e2; color: #b91c1c !important; }
    .btn-text {
      color: #0052ff !important;
      font-weight: 600;
      font-size: 13px;
      background: transparent;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
    }
    .btn-text:hover { color: #003ecc !important; text-decoration: underline; }
    .btn-lg { min-height: 46px; padding: 12px 24px; font-size: 14.5px; }

    /* Badges */
    .status-badge, .badge-pill {
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      line-height: 1.3;
    }
    .badge-pill { background: #f1f5f9; color: #0f172a; }
    .badge-confirmed, .badge-available { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-neutral { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .badge-muted { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
    .badge-live, .badge-warning { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .badge-cancelled, .badge-danger { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

    /* Toggle switch in Equipment Admin */
    input:checked + .admin-toggle-slider { background-color: #059669 !important; }
    .admin-toggle-slider::before {
      content: "";
      position: absolute;
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: .25s;
    }
    input:checked + .admin-toggle-slider::before { transform: translateX(20px); }

    /* Mobile navigation & responsive rules */
    .admin-mobile-toggle {
      display: none;
      width: 38px;
      height: 38px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .admin-sidebar-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(2px);
      z-index: 95;
    }

    @media (max-width: 960px) {
      .admin-mobile-toggle { display: inline-flex; }
      .admin-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 100;
        transform: translateX(-100%);
        transition: transform 0.22s ease;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
      }
      .admin-sidebar.is-open { transform: translateX(0); }
      .admin-sidebar-backdrop.is-open { display: block; }
      .grid-2, .grid-3, .grid-4, .editorial-layout { grid-template-columns: minmax(0, 1fr) !important; }
      .admin-content { padding: 16px; }
      .admin-topbar { padding: 0 16px; }
      .flat-panel { padding: 16px; }
      .section-eyebrow-lockup { flex-direction: column; align-items: flex-start; }
    }

    .admin-sidebar {border-right:1px solid #e2e6eb}
    .admin-user-card {border:0;border-radius:0;background:transparent;padding:14px 8px;border-bottom:1px solid #e2e6eb}
    .admin-avatar {background:#edf2f8;color:#24518b;font-weight:500}
    .admin-user-name {font-weight:500;white-space:normal;overflow-wrap:anywhere}
    .admin-user-role {color:#667080;font-weight:400;margin-top:3px}
    .admin-nav-section-title {font-size:11px;font-weight:500;text-transform:none;letter-spacing:0;color:#788391}
    .admin-nav-link {font-weight:400;border-radius:5px;color:#495565;padding:10px 12px}
    .admin-nav-link:hover {background:#f1f4f8;color:#243142}
    .admin-nav-link.is-active {background:#edf3fc;color:#1755aa;box-shadow:none;font-weight:500}
    .admin-sidebar-footer {background:transparent}
    .admin-btn-portal {background:#f4f6f9;border:1px solid #e2e6eb;color:#495565;font-weight:500}
    .admin-btn-portal:hover {background:#eaf0f7}
    .admin-btn-logout {font-weight:400}
    .admin-topbar {box-shadow:none;min-height:64px;height:auto;padding-top:12px;padding-bottom:12px;gap:12px}
    .admin-topbar-left {min-width:0}
    .admin-topbar-title {font-size:18px;font-weight:600;overflow-wrap:anywhere}
    .admin-content h2,.admin-content h3,.admin-content h4 {font-weight:600}
    .admin-content .section-heading-main > .icon-badge,.admin-content .section-heading-main > .eyebrow-bar {display:none}
    .admin-content .section-heading-main {min-width:0}
    .admin-content .eyebrow-text {font-size:20px;line-height:1.4}
    .admin-content .grid-2 > *,.admin-content .grid-3 > *,.admin-content .grid-4 > * {min-width:0}
    .admin-content select,.admin-content textarea,.admin-content input {max-width:100%}
    .admin-content button {white-space:normal}
    .admin-content .flat-panel,.admin-content .soft-panel,.admin-content .stat-card {box-shadow:none;border:1px solid #e2e6eb;border-radius:7px;background:#fff}
    .admin-content .stat-card {border-top:1px solid #e2e6eb!important}
    .admin-content .stat-value {color:#243142;font-weight:600;font-size:26px}
    .admin-content .stat-label,.admin-content .form-label,.admin-content th {font-weight:500;text-transform:none;letter-spacing:0}
    .admin-content .stat-foot {font-size:12px;color:#667080;line-height:1.5}
    .admin-content .btn-pill-dark,.admin-content .btn-pill-outline {font-weight:500;border-radius:5px;box-shadow:none}
    .admin-content .btn-pill-dark {background:#1755ba}
    .admin-content .text-input,.admin-content .network-select {border-radius:5px;box-shadow:none}
    .admin-quick-links {display:flex;flex-wrap:wrap;gap:18px;margin-bottom:20px;font-size:13px;color:#1755aa}
    .admin-quick-links a:hover {text-decoration:underline}
    a:focus-visible,button:focus-visible,summary:focus-visible {outline:2px solid #2563eb;outline-offset:3px}
  </style>
  <link rel="stylesheet" href="/public/css/order-pages.css" />
</head>
<body>
  <div class="admin-shell">
    <div class="admin-sidebar-backdrop" id="admin-sidebar-backdrop"></div>
    <!-- Standalone Sidebar -->
    <aside class="admin-sidebar" id="admin-sidebar">
      <!-- User Profile Pill -->
      <div class="admin-user-card">
        <div class="admin-avatar">${session.user.avatar_url ? `<img src="${escapeHtml(session.user.avatar_url)}" alt="" />` : escapeHtml(session.user.full_name.charAt(0).toUpperCase())}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHtml(session.user.full_name)}</div>
          <div class="admin-user-role">${escapeHtml(roleVi)}</div>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="admin-nav">
        ${navItems.map((item: any) => {
    if (item.section) {
      return `<div class="admin-nav-section-title">${escapeHtml(item.section)}</div>`;
    }
    const isActive = activeNav === item.key;
    return `
            <a href="${item.href}" class="admin-nav-link ${isActive ? 'is-active' : ''}">
              <div class="admin-nav-link-left">
                
                <span>${escapeHtml(item.label)}</span>
              </div>
              
            </a>
          `;
  }).join('')}
      </nav>

      <!-- Sidebar Footer -->
      <div class="admin-sidebar-footer">
        <a href="/" target="_blank" class="admin-btn-portal" title="Mở trang chủ khách hàng trong tab mới">
          <span>Trang chủ</span>
          <span>↗</span>
        </a>
        <form method="POST" action="/tai-khoan/dang-xuat" style="margin:0;">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <button type="submit" class="admin-btn-logout" style="width:100%;">
            <span>Đăng xuất</span>
          </button>
        </form>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="admin-main">
      <!-- Topbar -->
      <header class="admin-topbar">
        <div class="admin-topbar-left">
          <button type="button" class="admin-mobile-toggle" id="admin-mobile-menu-btn" aria-label="Mở menu quản trị">☰</button>
          <h1 class="admin-topbar-title" style="margin:0;">${escapeHtml(navItems.find((item: any) => item.key === activeNav)?.label || title)}</h1>
        </div>
        <div style="display:flex; align-items:center; gap:14px;">

          <a href="/#lich-san-nhanh" target="_blank" style="font-size:12.5px; color:#0052ff; font-weight:700; white-space:nowrap;">
            Đặt sân ↗
          </a>
        </div>
      </header>

      <!-- Workspace Container -->
      <main class="admin-content">
        ${flashMessage && flashText ? `
          <div class="admin-alert admin-alert-${flashMessage.type === 'error' ? 'error' : 'success'}">
            <div style="display:flex; align-items:center; gap:8px;">
              <span>${flashMessage.type === 'error' ? '⚠️' : '✓'}</span>
              <span>${escapeHtml(flashText)}</span>
            </div>
          </div>
        ` : ''}

        ${bodyHtml}
      </main>
    </div>
  </div>
  <script>
    (function() {
      var btn = document.getElementById('admin-mobile-menu-btn');
      var sidebar = document.getElementById('admin-sidebar');
      var backdrop = document.getElementById('admin-sidebar-backdrop');
      if (!btn || !sidebar || !backdrop) return;
      function toggleMenu() {
        sidebar.classList.toggle('is-open');
        backdrop.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(sidebar.classList.contains('is-open')));
      }
      btn.addEventListener('click', toggleMenu);
      backdrop.addEventListener('click', toggleMenu);
      btn.setAttribute('aria-controls', 'admin-sidebar');
      btn.setAttribute('aria-expanded', 'false');
      document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
          toggleMenu();
          btn.focus();
        }
      });
    })();
  </script>
</body>
</html>`;
}
