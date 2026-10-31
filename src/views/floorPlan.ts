import { sectionHeading } from './layout.js';

/** Interactive floor plan, with positions traced from the venue's reference plan. */
export function renderPureCodeMapSection(selectedDate: string, compact = false): string {
  const court = (number: number, x: number, y: number, horizontal = false) => {
    const width = horizontal ? 230 : 103;
    const height = horizontal ? 103 : 230;
    // Draw the same court geometry in either orientation.
    const rotation = horizontal ? 'translate(230 0) rotate(90)' : '';
    return `
      <a href="/san/court-${String(number).padStart(2, '0')}?date=${encodeURIComponent(selectedDate)}"
        class="be-court-svg-node" aria-label="Sân ${number}">
        <g transform="translate(${x} ${y})">
          <g transform="${rotation}">
            <!-- Nền thảm PVC xanh tiêu chuẩn thi đấu BWF -->
            <rect class="be-map-court-surface" width="103" height="230" rx="3"/>

            <!-- Vạch kẻ sân thi đấu chuẩn quốc tế (Màu trắng sắc nét) -->
            <!-- Đường biên đôi ngoài cùng -->
            <rect x="5" y="6" width="93" height="218" fill="none" class="be-court-line-white"/>
            <!-- Đường biên đơn trong (2 bên) -->
            <line x1="11" y1="6" x2="11" y2="224" class="be-court-line-white"/>
            <line x1="92" y1="6" x2="92" y2="224" class="be-court-line-white"/>
            <!-- Vạch giao cầu dài đôi (2 đầu sân) -->
            <line x1="5" y1="14" x2="98" y2="14" class="be-court-line-white"/>
            <line x1="5" y1="216" x2="98" y2="216" class="be-court-line-white"/>
            <!-- Vạch giao cầu ngắn (2 bên lưới) -->
            <line x1="5" y1="81" x2="98" y2="81" class="be-court-line-white" stroke-width="1.8"/>
            <line x1="5" y1="149" x2="98" y2="149" class="be-court-line-white" stroke-width="1.8"/>
            <!-- Đường trung tâm chia 2 ô giao cầu trái/phải -->
            <line x1="51.5" y1="6" x2="51.5" y2="81" class="be-court-line-white"/>
            <line x1="51.5" y1="149" x2="51.5" y2="224" class="be-court-line-white"/>

            <!-- Lưới cầu lông ở chính giữa sân kèm trụ lưới -->
            <!-- Dải băng mép trên lưới màu trắng -->
            <line x1="1" y1="115" x2="102" y2="115" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
            <!-- Mắt lưới đan -->
            <line x1="1" y1="115" x2="102" y2="115" stroke="#0f172a" stroke-width="2" stroke-dasharray="2 1.5"/>
            <!-- Trụ lưới 2 bên mép sân -->
            <circle cx="2" cy="115" r="3.2" fill="#0f172a" stroke="#ffffff" stroke-width="0.8"/>
            <circle cx="101" cy="115" r="3.2" fill="#0f172a" stroke="#ffffff" stroke-width="0.8"/>
          </g>
          <!-- Huy hiệu số sân thể thao nổi bật -->
          <circle cx="${width / 2}" cy="${height / 2}" r="18" fill="#f59e0b" stroke="#ffffff" stroke-width="2" class="be-map-court-badge"/>
          <text x="${width / 2}" y="${height / 2 + 6}" text-anchor="middle" class="be-map-court-number">${number}</text>
        </g>
      </a>`;
  };
  const bench = (x: number, y: number, vertical = false) => `
    <g transform="translate(${x} ${y})${vertical ? ' rotate(90)' : ''}" class="be-bench-node">
      <!-- Ghế nghỉ vận động viên mặt nan gỗ thể thao sang trọng -->
      <rect width="32" height="11" rx="2" fill="#d97706" stroke="#92400e" stroke-width="0.8"/>
      <line x1="3" y1="3.5" x2="29" y2="3.5" stroke="#fef3c7" stroke-width="0.9"/>
      <line x1="3" y1="7.5" x2="29" y2="7.5" stroke="#fef3c7" stroke-width="0.9"/>
      <rect x="4" y="0" width="3" height="11" fill="#78350f"/>
      <rect x="25" y="0" width="3" height="11" fill="#78350f"/>
    </g>`;
  const entrance = (x: number) => `
    <g transform="translate(${x} 0)" fill="#15566b">
      <text x="-150" y="597" font-size="17" font-weight="800">LỐI VÀO SÂN</text>
      <path d="M-24 590H-5Q4 590 4 581V569 M-3 576L4 569L11 576" fill="none" stroke="#15566b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  const topRow = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5];

  return `
    <section id="so-do-18-san" class="be-floor-plan" aria-labelledby="code-map-heading">
      ${compact ? '<h3 class="venue-panel-title" id="code-map-heading">Sơ đồ 18 sân & khu tiện ích</h3><p class="venue-panel-note">Chọn số sân để xem chi tiết và lịch trống.</p>' : sectionHeading({
        id: 'code-map-heading',
        title: 'Sơ đồ mặt bằng 18 sân & Khu tiện ích',
        subtitle: 'Nhấp vào số sân (1 – 18) để xem chi tiết góc nhìn sân và lịch trống tương ứng.',
        icon: 'court',
        tone: 'green',
        actionHtml: `
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; background:#f8fafc; padding:6px 14px; border-radius:999px; border:1px solid #e2e8f0; font-size:12px; font-weight:700;">
            <span style="display:inline-flex; align-items:center; gap:6px; color:#0f5132;">
              <span style="display:inline-block; width:16px; height:10px; background:#0d7a48; border-radius:2px;"></span>
              Sân thảm PVC
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px; color:#78350f;">
              <span style="display:inline-block; width:18px; height:8px; background:#d97706; border-radius:2px;"></span>
              Ghế nghỉ VĐV
            </span>
            <span style="display:inline-flex; align-items:center; gap:4px; color:#0369a1;">
              <span>↗</span> Lối vào &amp; Tiện ích
            </span>
          </div>
        `,
      })}
      <div class="be-map-board">
        <div class="be-map-scroll" tabindex="0" role="region" aria-label="Sơ đồ 18 sân thi đấu; thiết kế thu nhỏ hiển thị trọn vẹn trong 1 màn hình">
          <svg class="be-floor-plan-svg" viewBox="0 0 1280 810" width="100%" role="group" aria-label="Sơ đồ mặt bằng Be Badminton">
            <defs>
              <pattern id="be-map-stairs" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0L8 8" stroke="#b7bec1" stroke-width="1"/>
              </pattern>
            </defs>
            <!-- Đã bỏ nền xám SVG theo yêu cầu -->
            <!-- Chu vi bao bọc toàn bộ cụm sân -->
            <path d="M370 552H24V24H1250V795H1105V755H1124 M415 552H926 M980 552H1250"
              fill="none" stroke="#334155" stroke-width="2.5"/>
            ${topRow.map((number, index) => court(number, 47 + index * 120, 60)).join('')}
            ${topRow.map((_, index) => bench(55 + index * 120, 32) + bench(90 + index * 120, 32)).join('')}

            <rect x="46" y="318" width="58" height="222" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-dasharray="4 3" rx="6"/>
            <g fill="#0f172a" text-anchor="middle" font-size="18" font-weight="800">
              <text x="75" y="399">KHU</text>
              <text x="75" y="433">TIỆN</text>
              <text x="75" y="467">ÍCH</text>
            </g>
            ${[325, 360, 395, 430, 465, 500].map(y => bench(120, y, true)).join('')}

            ${court(15, 141, 318, true)}
            ${court(16, 141, 436, true)}
            ${court(18, 415, 318, true)}
            ${court(17, 415, 436, true)}
            ${court(1, 706, 318, true)}
            ${court(2, 706, 436, true)}
            ${court(4, 980, 318, true)}
            ${court(3, 980, 436, true)}

            ${[344, 379, 414, 449, 484].map(y => bench(673, y, true) + bench(687, y, true)).join('')}
            ${[338, 373, 444, 479, 514].map(y => bench(1245, y, true)).join('')}
            ${entrance(391)}
            ${entrance(951)}

            <!-- Các phòng dịch vụ / Lễ tân / Thay đồ ở góc dưới bên phải -->
            <g stroke="#334155" stroke-width="2" fill="#fff">
              <rect x="1160" y="552" width="50" height="22" rx="3"/>
              <rect x="1210" y="552" width="40" height="38" fill="url(#be-map-stairs)"/>
              <path d="M1150 632V590H1160 M1197 590H1250V740H1150V672"/>
              <!-- Cửa vào khu dịch vụ -->
              <path d="M1160 590V612 M1160 612Q1182 612 1182 590" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
              <!-- Bàn lễ tân -->
              <rect x="1158" y="686" width="34" height="14" fill="#d97706" stroke="#92400e" rx="2"/>
              <path d="M1162 700V715H1188V700" fill="#fef3c7" stroke="#92400e"/>
              <path d="M1170 683V675H1182V683" fill="#cbd5e1" stroke-width="1"/>
              <path d="M1124 755H1170V795H1105V755 M1170 740V795" fill="none"/>
            </g>
            <g text-anchor="middle" fill="#0f172a" font-weight="800">
              <text x="1185" y="567" font-size="9" fill="#0369a1">BOX-LOCK</text>
              <text x="1200" y="629" font-size="12">CHO THUÊ</text>
              <text x="1200" y="646" font-size="12">GIÀY &amp; VỢT</text>
              <text x="1177" y="730" font-size="12" fill="#0f766e">LỄ TÂN</text>
              <text x="1138" y="781" font-size="15" fill="#be185d">WC ♀</text>
              <text x="1210" y="775" font-size="15" fill="#1d4ed8">WC ♂</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  `;
}
