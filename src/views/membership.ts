import { escapeHtml } from '../utils/security.js';
import { formatVnd } from '../utils/time.js';

export function membershipProgress(user: { member_tier?: string; total_spent_vnd?: number }, compact = false): string {
  const spent = Math.max(0, Number(user.total_spent_vnd) || 0);
  const gold = user.member_tier === 'GOLD', silver = user.member_tier === 'SILVER';
  const target = silver ? 3000000 : 1000000;
  const start = silver ? 1000000 : 0;
  const percent = gold ? 100 : Math.max(0, Math.min(100, (spent-start)/(target-start)*100));
  return `<section class="membership-progress ${compact ? 'membership-progress-compact' : ''}" aria-label="Chi tiêu hội viên">
    <div class="membership-progress-heading"><span>${gold ? 'Hội viên Vàng' : silver ? 'Hội viên Bạc' : 'Hội viên Đồng'}</span><span>${gold ? 'Giảm 10%' : silver ? 'Giảm 5%' : 'Tích lũy chi tiêu'}</span></div>
    <p>Đã chi tiêu <strong>${escapeHtml(formatVnd(spent))}</strong></p>
    <div class="membership-meter" role="progressbar" aria-label="Tiến độ lên hạng" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"><span style="width:${percent}%"></span></div>
    <p class="membership-next">${gold ? 'Bạn đang ở hạng cao nhất.' : `Còn ${escapeHtml(formatVnd(Math.max(0,target-spent)))} để lên hạng ${silver ? 'Vàng' : 'Bạc'}.`}</p>
  </section>`;
}
