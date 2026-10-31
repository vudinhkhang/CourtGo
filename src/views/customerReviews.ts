import { escapeHtml } from '../utils/security.js';
import { sectionHeading } from './layout.js';
import { CustomerReviewRecord } from '../services/adminService.js';

// Snapshot verified against the public Google Maps reviews on 2026-10-28.
// Selected short five-star reviews, reproduced in full with their Google avatars.
// This is a verified snapshot, not a live Google feed.
const GOOGLE_REVIEWS_URL = 'https://www.google.com/maps/place/Be+Badminton+-+S%C3%A2n+C%E1%BA%A7u+L%C3%B4ng/@10.8303397,106.6679635,844m/data=!3m1!1e3!4m18!1m9!3m8!1s0x31752900570f9f77:0xeb96dc1eb1be2b71!2zQmUgQmFkbWludG9uIC0gU8OibiBD4bqndSBMw7RuZw!8m2!3d10.8303397!4d106.6705384!9m1!1b1!16s%2Fg%2F11ld7yx3r5!3m7!1s0x31752900570f9f77:0xeb96dc1eb1be2b71!8m2!3d10.8303397!4d106.6705384!9m1!1b1!16s%2Fg%2F11ld7yx3r5?hl=vi';

const REVIEW_SNAPSHOT = {
  rating: '4,8',
  total: 569,
  checkedAt: '28/10/2026',
  distribution: [528, 20, 3, 3, 15],
  reviews: [
    {
      author: 'Nam Bùi Hoài', initials: 'NH', rating: 5,
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocJWmjNcdnNt0z9vxiAITtDeGR_BiskdxM6LabtYsYKBQkwq8Q=w45-h45-p-rp-mo-br100',
      profile: 'https://www.google.com/maps/contrib/108975803908029768254/reviews?hl=vi',
      text: 'Nhân viên nhiệt tình. Mình ghé sân rất nhiều lần các bạn đều rất vui vẻ. Sân xịn giá cả hợp lý',
    },
    {
      author: 'Trần Bảo Anh Khoa', initials: 'AK', rating: 5,
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocLkytTDT4um2E6KOSyevJr1F3j_C9KjmwjPTrrWFM4uApo4RA=w45-h45-p-rp-mo-br100',
      profile: 'https://www.google.com/maps/contrib/106210544608304925303/reviews?hl=vi',
      text: 'sân sạch sẽ, thoáng mát nhân viên cực kỳ cực kỳ dễ thương, hoạt bát',
    },
    {
      author: 'Tan Dao', initials: 'TD', rating: 5,
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocLi0E_D3wImDqbje9lWnymKLiduEFUgUiqpvmBBF7zYW3ZIGQ=w45-h45-p-rp-mo-br100',
      profile: 'https://www.google.com/maps/contrib/101957999520718088297/reviews?hl=vi',
      text: 'Sân cầu sạch sẽ ,nhân viên tận tâm ,vui vẻ',
    },
    {
      author: 'Thư Nguyễn Đăng', initials: 'TĐ', rating: 5,
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocLfCXx3cViqtl_8gwmfEa3BnzIQGD8cdvwSLuj51s7JzCQ-NA=w45-h45-p-rp-mo-br100',
      profile: 'https://www.google.com/maps/contrib/118352000871804505620/reviews?hl=vi',
      text: 'Sân nhiệt tình rộng',
    },
  ],
};

export function renderCustomerReviewsSection(dbReviews?: CustomerReviewRecord[]): string {
  const source = escapeHtml(GOOGLE_REVIEWS_URL);
  const displayReviews =
    dbReviews && dbReviews.length > 0
      ? dbReviews.map((r) => ({
          author: r.author_name,
          initials: r.author_initials,
          rating: r.rating,
          avatar: r.author_avatar || '',
          profile: r.profile_url || GOOGLE_REVIEWS_URL,
          text: r.comment_text,
          ownerReply: r.owner_reply,
        }))
      : REVIEW_SNAPSHOT.reviews.map((r) => ({ ...r, ownerReply: null }));

  return `
    <section id="danh-gia-khach-hang" class="customer-reviews" aria-labelledby="customer-reviews-heading">
      ${sectionHeading({
        id: 'customer-reviews-heading',
        title: 'Khách hàng đánh giá',
        subtitle: `${REVIEW_SNAPSHOT.rating}/5 sao từ ${REVIEW_SNAPSHOT.total} đánh giá trên Google Maps.`,
        icon: 'star',
        tone: 'yellow',
        actionHtml: `
          <a class="btn-pill-outline customer-reviews-source" href="${source}" target="_blank" rel="noopener noreferrer" style="padding:8px 14px; font-size:13px;">
            Xem ${REVIEW_SNAPSHOT.total} đánh giá Google Maps <span aria-hidden="true">↗</span>
          </a>
        `,
      })}
      <div class="customer-reviews-layout">
        <aside class="customer-reviews-summary" aria-label="Điểm tổng hợp Google Maps: 4,8 trên 5 từ 569 đánh giá">
          <span class="customer-reviews-platform">Google Maps</span>
          <div class="customer-reviews-score"><strong>${REVIEW_SNAPSHOT.rating}</strong><span>/ 5</span></div>
          <div class="customer-review-stars" aria-hidden="true">★★★★★</div>
          <p class="customer-reviews-total">${REVIEW_SNAPSHOT.total} lượt đánh giá</p>
          <div class="customer-reviews-distribution" aria-label="Phân bố số sao">
            ${REVIEW_SNAPSHOT.distribution.map((count, index) => `
              <div class="customer-reviews-rating-row" aria-label="${5 - index} sao: ${count} đánh giá">
                <span aria-hidden="true">${5 - index} <span class="customer-reviews-small-star">★</span></span>
                <span class="customer-reviews-track" aria-hidden="true"><span style="width:${(count / REVIEW_SNAPSHOT.total * 100).toFixed(2)}%"></span></span>
                <span aria-hidden="true">${count}</span>
              </div>
            `).join('')}
          </div>
        </aside>
        <div class="customer-reviews-list">
          ${displayReviews.map((review) => `
            <article class="customer-review">
              <div class="customer-review-author">
                <span class="customer-review-avatar" aria-hidden="true">
                  <span>${escapeHtml(review.initials)}</span>
                  ${review.avatar ? `<img src="${escapeHtml(review.avatar)}" alt="" width="45" height="45" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true">` : ''}
                </span>
                <div>
                  <h3>${escapeHtml(review.author)}</h3>
                  <div class="customer-review-stars" role="img" aria-label="${review.rating} trên 5 sao" style="margin-top:2px;">
                    <span aria-hidden="true">${'★'.repeat(review.rating)}<span class="customer-review-empty-stars">${'★'.repeat(5 - review.rating)}</span></span>
                  </div>
                </div>
              </div>
              <blockquote class="customer-review-text" style="margin-top:8px;">${escapeHtml(review.text)}</blockquote>
            </article>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}
