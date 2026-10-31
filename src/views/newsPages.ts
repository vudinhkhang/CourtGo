import { escapeHtml } from '../utils/security.js';
import { sectionHeading } from './layout.js';

export interface NewsArticle {
  slug: string;
  title: string;
  summary: string;
  category: string;
  badgeTone: 'red' | 'blue' | 'green' | 'amber';
  publishedAt: string;
  coverImage: string;
  imageAlt: string;
  sourceUrl?: string;
  coverFit?: 'cover' | 'contain';
  contentHtml: string;
}

export const BE_BADMINTON_NEWS: NewsArticle[] = [
  {
    slug: 'le-2-9-be-badminton-hoat-dong-xuyen-le',
    title: 'Lễ 2/9 – Be Badminton Vẫn Mở Cửa Hoạt Động Bình Thường Xuyên Lễ!',
    summary:
      'Kỳ nghỉ lễ Quốc khánh 2/9 này, nếu chưa biết đi đâu thì xách vợt lên và đến Be Badminton thôi! Cụm 18 sân tiêu chuẩn thi đấu tại 262/1 Quang Trung mở cửa phục vụ xuyên suốt từ 06:00 – 24:00 hàng ngày đón các lông thủ.',
    category: 'Thông báo hoạt động',
    badgeTone: 'red',
    publishedAt: '29/08/2026',
    coverImage: '/public/images/news-le-2-9.jpg',
    imageAlt: 'Thông báo hoạt động Lễ 2/9 tại Hệ thống Sân Cầu Lông Be Badminton Gò Vấp',
    sourceUrl:
      'https://www.facebook.com/official.bebadminton/posts/pfbid02pp3nwdEvT1WPVJq6RqzMiZDFuuiTnp8iiVm9AczrQ9AV8jQC9EMvp1E6CQgZmisUl',
    contentHtml: `
      <p class="body-text" style="font-size: 17px; line-height: 1.7; margin-bottom: 20px;">
        🇻🇳 <strong>LỄ 2/9 – BE BADMINTON VẪN MỞ CỬA HOẠT ĐỘNG BÌNH THƯỜNG!</strong> 🏸
      </p>

      <p class="body-text" style="margin-bottom: 18px;">
        Kỳ nghỉ lễ Quốc khánh 2/9 này, nếu bạn và hội bạn bè, đồng nghiệp vẫn chưa biết đi đâu chơi xa thì hãy <strong>xách vợt lên và đến Be Badminton thôi!</strong> 😎 Một buổi giao lưu cầu lông sôi động vừa giúp xả stress, duy trì phong độ thể lực, vừa tạo cơ hội gắn kết tuyệt vời cùng đồng đội.
      </p>

      <div style="background: #f8fafc; border-left: 4px solid #0052ff; border-radius: 0 12px 12px 0; padding: 20px 24px; margin: 24px 0;">
        <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display:flex; align-items:center; gap:8px;">
          📌 THÔNG TIN HOẠT ĐỘNG XUYÊN LỄ TẠI BE BADMINTON
        </h3>
        <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:15px; color:#334155;">
          <li>⏰ <strong>Khung giờ phục vụ:</strong> Mở cửa liên tục từ <strong>06:00 sáng đến 24:00 đêm</strong> tất cả các ngày trong kỳ nghỉ lễ.</li>
          <li>📍 <strong>Địa chỉ cụm sân:</strong> 262/1 Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh.</li>
          <li>☎️ <strong>Hotline / Zalo hỗ trợ:</strong> <strong>077 333 3371</strong></li>
          <li>🏸 <strong>Quy mô sân bãi:</strong> Tổ hợp 18 sân thảm PVC xanh ngọc bích chuẩn thi đấu quốc tế, trần cao 13m thoáng đãng, hệ thống rèm bạt đen và đèn LED chống chói mắt tuyệt đối.</li>
          <li>🚗 <strong>Bãi giữ xe:</strong> Khu vực đậu xe rộng rãi, thuận tiện cho cả xe máy và ô tô.</li>
          <li>🥤 <strong>Tiện ích đi kèm:</strong> Quầy nước giải khát, khu vực khởi động giãn cơ & tập tạ miễn phí, ghế băng dài nghỉ ngơi có giá đỡ quay video trận đấu.</li>
        </ul>
      </div>

      <p class="body-text" style="margin-bottom: 18px;">
        Các khung giờ "giờ vàng" buổi sáng và chiều tối ngày nghỉ lễ thường được khách hàng và các câu lạc bộ đặt rất sớm. Quý khách vui lòng tra cứu lịch trống trực tuyến trên hệ thống để chọn đúng sân yêu thích và giữ chỗ kịp thời.
      </p>

      <p class="body-text" style="margin-bottom: 24px;">
        Kính chúc toàn thể Quý khách hàng, Quý hội viên và cộng đồng đam mê cầu lông có một kỳ nghỉ lễ Quốc khánh 2/9 thật nhiều niềm vui, sức khỏe và những trận cầu bùng nổ thăng hoa! 🎉
      </p>
    `,
  },
  {
    slug: 'be-badminton-tim-dong-doi-tuyen-dung',
    title: 'Be Badminton tìm đồng đội – Tuyển nhân viên phục vụ & tư vấn',
    summary: 'Fanpage chia sẻ thông tin tuyển nhân viên phục vụ tại Gò Vấp và nhân viên tư vấn tại Bình Thạnh, với ba ca làm việc. Xem bài gốc để tìm hiểu vị trí và cách ứng tuyển.',
    category: 'Tuyển dụng',
    badgeTone: 'amber',
    publishedAt: '27/05',
    coverImage: '/public/images/news-tuyen-dung.jpg',
    coverFit: 'contain',
    imageAlt: 'Thông báo Be Badminton tìm đồng đội – tuyển nhân viên phục vụ',
    sourceUrl: 'https://www.facebook.com/photo/?fbid=122268146846185284&set=pb.61555558521004.-2207520000',
    contentHtml: `
      <p>Be Badminton đăng tin tuyển nhân viên phục vụ nam tại 262 Quang Trung, Phường 10, Gò Vấp và nhân viên tư vấn tại 327/7a Nơ Trang Long, Phường 25, Bình Thạnh.</p>
      <h2 class="headline-sm">Ca làm việc theo bài đăng</h2>
      <ul>
        <li>Ca 1: 06:00 – 12:00.</li>
        <li>Ca 2: 12:00 – 18:00.</li>
        <li>Ca 3: 18:00 – 24:00.</li>
        <li>Mỗi tuần nghỉ một ngày, không nghỉ Thứ Bảy và Chủ Nhật.</li>
      </ul>
      <h2 class="headline-sm">Cách ứng tuyển</h2>
      <p>Ứng viên gửi CV đến <a href="mailto:tuyendung.becaulong@gmail.com">tuyendung.becaulong@gmail.com</a>, ghi rõ vị trí ứng tuyển. Bài gốc có liên kết mô tả công việc cho từng vị trí.</p>
      <p class="news-archive-note">Thông tin được tóm lược từ bài đăng ngày 27/05 trên Fanpage. Vui lòng liên hệ đơn vị tuyển dụng để xác nhận vị trí còn nhận hồ sơ.</p>
    `,
  },
  {
    slug: 'uu-dai-le-30-4-1-5-be-badminton',
    title: 'Lễ 30/4 – 1/5: Be Badminton mở cửa, không tăng giá',
    summary: 'Bài đăng dịp lễ 30/4 – 1/5 giới thiệu chương trình chơi 1 giờ tặng 1 giờ, giá từ 50.000đ/giờ trong khung 06:00 – 18:00. Xem lại thông tin chương trình trên Fanpage.',
    category: 'Ưu đãi dịp lễ',
    badgeTone: 'red',
    publishedAt: '27/04',
    coverImage: '/public/images/news-le-30-4-1-5.jpg',
    coverFit: 'contain',
    imageAlt: 'Ưu đãi dịp lễ 30/4 – 1/5: không tăng giá, chơi 1 giờ tặng 1 giờ từ 50K/giờ',
    sourceUrl: 'https://www.facebook.com/official.bebadminton/posts/pfbid037Yi6BQc1UaAft1z3prN22bzcRBCcRaLbCaZ6n6sQPc9Mm4qJJaBUE8CEHfTheqggl',
    contentHtml: `
      <p>Trong bài đăng dịp lễ 30/4 – 1/5, Be Badminton thông báo vẫn phục vụ xuyên lễ và giữ giá như ngày thường.</p>
      <h2 class="headline-sm">Nội dung chương trình theo bài gốc</h2>
      <ul>
        <li>Không nghỉ lễ, không tăng giá.</li>
        <li>Chơi một giờ, tặng một giờ; giá chỉ từ 50.000đ/giờ.</li>
        <li>Khung giờ áp dụng: 06:00 – 18:00.</li>
      </ul>
      <p>Địa chỉ: 262/1 Quang Trung, Phường 10, Gò Vấp. Hotline và Zalo: <a href="tel:0773333371">0773 333 371</a>.</p>
      <p class="news-archive-note">Đây là thông tin lưu trữ từ bài đăng ngày 27/04 cho dịp lễ 30/4 – 1/5. Vui lòng liên hệ sân để xác nhận ưu đãi hiện hành trước khi đặt.</p>
    `,
  },
];

function renderNewsCard(article: NewsArticle): string {
  const href = '/tin-tuc/' + encodeURIComponent(article.slug);
  return `
    <article class="xat-news-card be-news-card">
      <a href="${href}" class="xat-news-thumb be-news-thumb" title="Xem chi tiết: ${escapeHtml(article.title)}">
        <img src="${escapeHtml(article.coverImage)}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" style="object-fit:${article.coverFit || 'cover'};" />
        <span class="be-news-tag be-news-tag-${article.badgeTone}">${escapeHtml(article.category)}</span>
      </a>
      <div class="be-news-body">
        <div class="be-news-meta">
          <span>📅 ${escapeHtml(article.publishedAt)}</span>
          <span style="opacity:0.4;">•</span>
          <span>Ban Quản Lý</span>
        </div>
        <a href="${href}" class="be-news-title-link"><h3 class="xat-news-title">${escapeHtml(article.title)}</h3></a>
        <p class="xat-news-summary" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:0;">${escapeHtml(article.summary)}</p>
      </div>
    </article>
  `;
}

/** Hiển thị ba bài mới nhất trong chuyên mục Tin tức trên trang chủ. */
export function renderHomeNewsSection(_selectedDate?: string, articles: NewsArticle[] = BE_BADMINTON_NEWS): string {
  const displayArticles = (articles && articles.length > 0 ? articles : BE_BADMINTON_NEWS).slice(0, 3);
  return `
    <section id="tin-tuc-su-kien" class="be-news-section" aria-labelledby="news-section-heading">
      ${sectionHeading({
        id: 'news-section-heading',
        title: 'Tin tức & sự kiện',
        subtitle: 'Thông báo, giải đấu và hoạt động tại Be Badminton.',
        icon: 'calendar',
        tone: 'blue',
        actionHtml: `<a href="/tin-tuc" class="btn-pill-outline" style="padding:8px 14px; font-size:13px;">Xem tất cả tin tức →</a>`,
      })}
      <div class="be-news-grid">${displayArticles.map(renderNewsCard).join('')}</div>
    </section>
  `;
}

/**
 * Hiển thị trang đọc chi tiết bài viết tin tức
 */
export function renderNewsDetailPage(article: NewsArticle): string {
  return `
    <!-- Breadcrumb điều hướng -->
    <nav aria-label="Đường dẫn trang" style="margin-bottom: 20px;">
      <ol style="display:flex; align-items:center; gap:8px; list-style:none; padding:0; margin:0; font-size:13.5px; color:#64748b; flex-wrap:wrap;">
        <li><a href="/" style="color:#64748b; text-decoration:none;">Trang chủ</a></li>
        <li>/</li>
        <li><a href="/tin-tuc" style="color:#64748b; text-decoration:none;">Tin tức &amp; Hoạt động</a></li>
        <li>/</li>
        <li style="color:#0f172a; font-weight:600;">${escapeHtml(article.category)}</li>
      </ol>
    </nav>

    <div style="max-width: 860px; margin: 0 auto 56px auto;">
      <article class="flat-panel" style="padding: 36px 32px; border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); background:#ffffff;">
        <!-- Header bài viết -->
        <div style="margin-bottom: 24px;">
          <div class="be-news-tag be-news-tag-${article.badgeTone}" style="display:inline-flex; position:static; margin-bottom:14px;">
            <span>${escapeHtml(article.category.toUpperCase())}</span>
          </div>
          <h1 style="font-size: 30px; font-weight: 800; line-height: 1.3; color: #0f172a; letter-spacing: -0.02em; margin-bottom: 14px;">
            ${escapeHtml(article.title)}
          </h1>
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span>🏸 <strong>Ban Quản Lý Be Badminton</strong></span>
              <span>•</span>
              <span>📅 Ngày đăng: ${escapeHtml(article.publishedAt)}</span>
            </div>
            <span style="font-size:12.5px; color:#0f766e; font-weight:700; background:#f0fdf4; border:1px solid #bbf7d0; padding:4px 10px; border-radius:999px;">
              ✓ Thông tin chính thức
            </span>
          </div>
        </div>

        <!-- Ảnh bìa bài viết chính -->
        <div style="margin-bottom: 28px; border-radius: 14px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.12); max-height: 480px; background: #0f172a;">
          <img src="${escapeHtml(article.coverImage)}" alt="${escapeHtml(article.imageAlt)}" style="width: 100%; height: 100%; object-fit: contain; max-height: 480px;" />
        </div>

        <!-- Nội dung bài viết -->
        <div class="news-content-body" style="font-size: 16px; color: #334155; line-height: 1.75;">
          ${article.contentHtml}
        </div>

        <!-- Khối kêu gọi hành động đặt sân ngay -->
        <div style="margin-top: 36px; padding: 24px 28px; background: linear-gradient(135deg, #0d3b66 0%, #0052ff 100%); border-radius: 16px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 18px;">
          <div>
            <div style="font-size: 20px; font-weight: 800; margin-bottom: 4px;">Đặt Sân Cầu Lông Trực Tuyến 24/7</div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.85);">Kiểm tra lịch trống tức thì 18 sân tại Be Badminton Gò Vấp &amp; thanh toán quét mã QR.</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <a href="/#lich-san-nhanh" class="btn-pill-dark" style="background: #ffaa00; color: #0f172a !important; font-weight: 800; padding: 12px 24px;">
              Xem Lịch Trống &amp; Đặt Sân
            </a>
            <a href="tel:0773333371" class="btn-pill-outline" style="color: #ffffff !important; border-color: rgba(255,255,255,0.4); padding: 12px 20px;">
              Hotline 077 333 3371
            </a>
          </div>
        </div>
      </article>
    </div>
  `;
}

/**
 * Hiển thị trang danh sách toàn bộ tin tức (/tin-tuc)
 */
export function renderNewsListPage(articles: NewsArticle[] = BE_BADMINTON_NEWS): string {
  const list = articles && articles.length > 0 ? articles : BE_BADMINTON_NEWS;
  return `
    ${sectionHeading({
      level: 'h1',
      title: 'Tin tức & sự kiện',
      subtitle: 'Thông báo và hoạt động mới tại Be Badminton.',
      icon: 'star',
      tone: 'blue',
    })}
    <div class="be-news-grid be-news-list">${list.map(renderNewsCard).join('')}</div>
  `;
}
