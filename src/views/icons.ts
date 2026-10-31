import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';
import { escapeHtml } from '../utils/security.js';

/**
 * Bộ nhận diện CourtGo: logo quả cầu lông, bộ icon nhiều màu và khung ảnh.
 * Màu hành động (nút, liên kết) vẫn chỉ dùng xanh thương hiệu theo DESIGN.md;
 * các màu khác chỉ xuất hiện bên trong icon minh họa (glyph), không dùng cho thao tác.
 */

export const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

export type IconTone = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'teal' | 'orange' | 'pink' | 'ink';

const TONES: Record<IconTone, { fg: string; bg: string }> = {
  blue: { fg: '#0052ff', bg: '#e8efff' },
  green: { fg: '#05b169', bg: '#e3f7ee' },
  yellow: { fg: '#d99a00', bg: '#fff5d9' },
  red: { fg: '#cf202f', bg: '#fdeaec' },
  purple: { fg: '#7b61ff', bg: '#efecff' },
  teal: { fg: '#0098b0', bg: '#e0f6f9' },
  orange: { fg: '#f26b1d', bg: '#feefe5' },
  pink: { fg: '#e0457b', bg: '#fdebf2' },
  ink: { fg: '#0a0b0d', bg: '#eef0f3' },
};

const GLYPHS: Record<string, string> = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  shuttle: '<path d="M8 3h8l-2.6 11h-2.8z"/><path d="M10 3.2l1.4 10.6M14 3.2l-1.4 10.6"/><path d="M9.6 15.5h4.8a2.4 2.4 0 0 1-4.8 0z"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/>',
  refund: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/><path d="M12 8.5v7M14.2 10c-.3-.8-1.2-1.3-2.2-1.3-1.2 0-2.2.6-2.2 1.6 0 2.2 4.5 1.1 4.5 3.3 0 1-1 1.7-2.3 1.7-1.1 0-2-.5-2.3-1.4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  mat: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  chair: '<path d="M6 10V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><rect x="4" y="10" width="16" height="4" rx="1.5"/><path d="M6 14v6M18 14v6"/>',
  fan: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  locker: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18"/><path d="M9.5 11v2M14.5 11v2"/>',
  shower: '<path d="M4 20V8a4 4 0 0 1 8 0"/><path d="M8 8h8"/><path d="M11 12v1M14 12v1M17 12v1M12.5 15v1M15.5 15v1"/>',
  scoreboard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M7 10v4M16 10h2v4h-2"/>',
  wall: '<rect x="4" y="4" width="7" height="16" rx="1.5"/><rect x="13" y="4" width="7" height="16" rx="1.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 6 6"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  cart: '<path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  court: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M8 4v16M16 4v16"/>',
};

export function svgGlyph(name: string, size = 20, color = 'currentColor', strokeWidth = 1.8): string {
  const body = GLYPHS[name] || GLYPHS.sparkle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Icon tròn nhiều màu (asset-icon-circular): nền nhạt + glyph đậm cùng tông. */
export function iconBadge(name: string, tone: IconTone = 'blue', size = 40): string {
  const t = TONES[tone];
  const glyphSize = Math.round(size * 0.5);
  return `<span class="icon-badge" style="width:${size}px;height:${size}px;background:${t.bg};color:${t.fg};">${svgGlyph(name, glyphSize, t.fg, 1.9)}</span>`;
}

/** Icon nhỏ nội dòng (không có nền), dùng trong nút và nhãn. */
export function inlineIcon(name: string, size = 18): string {
  return `<span class="inline-icon">${svgGlyph(name, size)}</span>`;
}

/** Chọn icon + màu cho tiện ích sân theo từ khóa tiếng Việt. */
export function amenityIcon(amenityName: string): { name: string; tone: IconTone } {
  const s = amenityName.toLowerCase();
  if (s.includes('thảm')) return { name: 'mat', tone: 'green' };
  if (s.includes('đèn') || s.includes('rèm') || s.includes('chống chói')) return { name: 'light', tone: 'yellow' };
  if (s.includes('ghế') || s.includes('bàn')) return { name: 'chair', tone: 'purple' };
  if (s.includes('quạt') || s.includes('gió') || s.includes('trần')) return { name: 'fan', tone: 'teal' };
  if (s.includes('nước') || s.includes('trà') || s.includes('căn tin')) return { name: 'water', tone: 'blue' };
  if (s.includes('tủ') || s.includes('box-lock') || s.includes('box')) return { name: 'locker', tone: 'orange' };
  if (s.includes('tắm') || s.includes('sấy')) return { name: 'shower', tone: 'teal' };
  if (s.includes('điểm') || s.includes('challenge') || s.includes('bi lắc')) return { name: 'scoreboard', tone: 'red' };
  if (s.includes('vách') || s.includes('độc lập')) return { name: 'wall', tone: 'purple' };
  if (s.includes('thay đồ') || s.includes('khởi động') || s.includes('giãn cơ')) return { name: 'user', tone: 'pink' };
  if (s.includes('giá đỡ') || s.includes('điện thoại') || s.includes('quay')) return { name: 'image', tone: 'blue' };
  return { name: 'sparkle', tone: 'blue' };
}

/** Logo CourtGo: quả cầu lông trong vòng tròn xanh thương hiệu. */
export function logoMark(size = 36, gradId = 'cg-ball'): string {
  return `<svg class="logo-mark" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${escapeHtml(gradId)}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2f6bff"/>
        <stop offset="1" stop-color="#0040d6"/>
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="24" fill="url(#${escapeHtml(gradId)})"/>
    <path d="M9 31c4 5 10 7.5 16 7" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
    <g transform="rotate(-28 24 24)">
      <path d="M15.5 9.5h17l-5 17.5h-7z" fill="#ffffff"/>
      <path d="M20.2 9.8l1.9 17M24 9.8V27M27.8 9.8l-1.9 17" stroke="#0052ff" stroke-opacity="0.28" stroke-width="1.2"/>
      <rect x="19.8" y="26.4" width="8.4" height="2.6" rx="1.3" fill="#f4b000"/>
      <path d="M19.8 29.4h8.4a4.2 4.2 0 0 1-8.4 0z" fill="#ffffff"/>
    </g>
  </svg>`;
}

export function logoLockup(opts: { onDark?: boolean; size?: number } = {}): string {
  const size = opts.size ?? 36;
  const gradId = opts.onDark ? 'cg-ball-footer' : 'cg-ball-header';
  return `<span class="logo-block${opts.onDark ? ' logo-on-dark' : ''}">
    ${logoMark(size, gradId)}
    <span class="logo-word"><span class="logo-word-court">Court</span><span class="logo-word-go">Go</span></span>
  </span>`;
}

export function faviconDataUri(): string {
  const svg = logoMark(64).replace('class="logo-mark" ', '');
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Trả về URL công khai nếu file ảnh có trong thư mục public, ngược lại trả về null. */
export function publicImageUrl(relPath: string): string | null {
  const clean = relPath.replace(/^\/+/, '');
  const abs = path.join(PUBLIC_DIR, clean);
  if (!abs.startsWith(PUBLIC_DIR)) return null;
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return `/public/${clean.split(path.sep).join('/')}`;
    }
  } catch {
    return null;
  }
  // Thử các phần mở rộng phổ biến khác
  const base = clean.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const candidate = `${base}.${ext}`;
    const candAbs = path.join(PUBLIC_DIR, candidate);
    if (fs.existsSync(candAbs)) return `/public/${candidate}`;
  }
  return null;
}

/**
 * Khung ảnh: hiển thị ảnh nếu đã có file trong thư mục public,
 * nếu chưa có thì hiển thị khung trống (ghi rõ đường dẫn cần thêm ảnh ở môi trường phát triển).
 */
export function imageSlot(opts: {
  relPath: string;
  alt: string;
  ratio?: string;
  label: string;
  recommendedSize?: string;
  illustrative?: boolean;
  tagText?: string;
  className?: string;
  eager?: boolean;
}): string {
  const ratio = opts.ratio || '16 / 9';
  const url = publicImageUrl(opts.relPath);
  if (url) {
    const caption = opts.tagText || (opts.illustrative ? 'Ảnh thực tế tại Be Badminton' : '');
    return `<figure class="image-slot ${opts.className || ''}" style="aspect-ratio:${ratio};">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(opts.alt)}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" />
      ${caption ? `<figcaption class="image-tag">${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  }
  const showHint = config.nodeEnv !== 'production';
  return `<div class="image-slot image-slot-empty ${opts.className || ''}" style="aspect-ratio:${ratio};" role="img" aria-label="${escapeHtml(opts.label)}">
    <div class="image-slot-inner">
      ${iconBadge('image', 'ink', 44)}
      <div class="image-slot-label">${escapeHtml(opts.label)}</div>
      ${
        showHint
          ? `<div class="image-slot-hint">Thêm ảnh tại <code>public/${escapeHtml(opts.relPath)}</code>${opts.recommendedSize ? ` · ${escapeHtml(opts.recommendedSize)}` : ''}</div>`
          : ''
      }
    </div>
  </div>`;
}

export function courtImageRelPath(courtCode: string): string {
  return `images/courts/${courtCode.toLowerCase()}.jpg`;
}
