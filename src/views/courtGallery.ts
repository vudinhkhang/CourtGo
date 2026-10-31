import { escapeHtml } from '../utils/security.js';

export interface GalleryPhotoItem {
  src: string;
  alt: string;
}

const SHARED_COURT_PHOTOS: GalleryPhotoItem[] = [
  { src: '/public/images/courts/shared/be-badminton-01.jpg', alt: 'Các sân cầu lông Be Badminton nhìn từ trên cao' },
  { src: '/public/images/courts/shared/be-badminton-02.jpg', alt: 'Khu sân thi đấu và hàng ghế nghỉ tại Be Badminton' },
  { src: '/public/images/courts/shared/be-badminton-03.jpg', alt: 'Toàn cảnh sân và lối đi bên trong Be Badminton' },
  { src: '/public/images/court-interior.jpg', alt: 'Không gian thảm PVC xanh ngọc tiêu chuẩn thi đấu' },
];

export function renderCourtGallery(
  courtName: string,
  courtImages?: Array<{ url: string; caption?: string }>
): string {
  const photos: GalleryPhotoItem[] = (courtImages && courtImages.length > 0)
    ? courtImages.map((img, idx) => ({
        src: img.url,
        alt: img.caption || `${courtName} - Hình ảnh ${idx + 1}`,
      }))
    : SHARED_COURT_PHOTOS;

  const total = photos.length;
  // Bố cục hiển thị tối đa 5 ảnh trên lưới (nếu > 5 ảnh thì ảnh thứ 5 có lớp phủ "+N ảnh khác")
  const displayedPhotos = photos.slice(0, 5);
  const remainingCount = total > 5 ? total - 5 : 0;

  // JSON an toàn cho client-side Lightbox
  const photosJson = JSON.stringify(photos).replace(/</g, '\\u003c');

  return `
    <figure class="court-photo-gallery" aria-label="Hình ảnh không gian tại ${escapeHtml(courtName)}">
      <div class="court-adaptive-gallery count-${Math.min(total, 5)}" id="court-gallery-container">
        ${displayedPhotos.map((photo, index) => {
          const isFifthWithMore = index === 4 && remainingCount > 0;
          return `
            <button
              type="button"
              class="court-gallery-tile tile-${index + 1} js-court-lightbox-trigger"
              data-index="${index}"
              aria-label="Xem ảnh phóng to ${index + 1}/${total}: ${escapeHtml(photo.alt)}"
            >
              <img
                src="${photo.src}"
                alt="${escapeHtml(photo.alt)}"
                loading="eager"
                decoding="async"
                ${index === 0 ? 'fetchpriority="high"' : ''}
              />
              ${isFifthWithMore ? `
                <div class="court-tile-overlay">
                  <span class="overlay-plus">+${remainingCount}</span>
                  <span class="overlay-text">Xem tất cả ảnh</span>
                </div>
              ` : `
                <div class="court-tile-hover-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </div>
              `}
            </button>
          `;
        }).join('')}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:10px;">
        <figcaption style="color:#64748b; font-size:12px; margin:0;">
          Không gian thi đấu tiêu chuẩn ${escapeHtml(courtName)} · <span style="color:#0284c7; font-weight:600;">(Nhấp vào ảnh để phóng to toàn màn hình)</span>
        </figcaption>
        <button
          type="button"
          class="btn-pill-outline js-court-lightbox-trigger"
          data-index="0"
          style="padding:5px 12px; font-size:12px; font-weight:700; border-radius:999px;"
        >
          📷 Xem tất cả ${total} ảnh
        </button>
      </div>

      <!-- Lightbox Zoom Modal Phóng To Toàn Màn Hình (Không chuyển trang mới) -->
      <div id="court-lightbox-modal" class="court-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh phóng to" style="display:none;">
        <div class="court-lightbox-backdrop js-lightbox-close"></div>

        <div class="court-lightbox-header">
          <div class="court-lightbox-counter" id="court-lightbox-counter">Ảnh 1 / ${total}</div>
          <button type="button" class="court-lightbox-btn-close js-lightbox-close" aria-label="Đóng cửa sổ ảnh (Esc)">✕</button>
        </div>

        <div class="court-lightbox-stage">
          <button type="button" class="court-lightbox-nav prev" id="court-lightbox-prev" aria-label="Ảnh trước (Mũi tên trái)">❮</button>
          <div class="court-lightbox-main-img-wrap">
            <img id="court-lightbox-active-img" src="${photos[0].src}" alt="${escapeHtml(photos[0].alt)}" />
            <div id="court-lightbox-caption" class="court-lightbox-caption">${escapeHtml(photos[0].alt)}</div>
          </div>
          <button type="button" class="court-lightbox-nav next" id="court-lightbox-next" aria-label="Ảnh tiếp theo (Mũi tên phải)">❯</button>
        </div>

        <!-- Dải ảnh thu nhỏ phía dưới -->
        <div class="court-lightbox-thumbs" id="court-lightbox-thumbs">
          ${photos.map((p, idx) => `
            <button type="button" class="court-lightbox-thumb-item ${idx === 0 ? 'is-active' : ''}" data-index="${idx}">
              <img src="${p.src}" alt="${escapeHtml(p.alt)}" />
            </button>
          `).join('')}
        </div>
      </div>

      <script>
        (function() {
          var photos = ${photosJson};
          var currentIndex = 0;
          var modal = document.getElementById('court-lightbox-modal');
          var activeImg = document.getElementById('court-lightbox-active-img');
          var captionEl = document.getElementById('court-lightbox-caption');
          var counterEl = document.getElementById('court-lightbox-counter');
          var prevBtn = document.getElementById('court-lightbox-prev');
          var nextBtn = document.getElementById('court-lightbox-next');
          var thumbsContainer = document.getElementById('court-lightbox-thumbs');
          var triggers = document.querySelectorAll('.js-court-lightbox-trigger');

          if (!modal || !activeImg || !photos.length) return;

          function updateLightbox(idx) {
            if (idx < 0) idx = photos.length - 1;
            if (idx >= photos.length) idx = 0;
            currentIndex = idx;
            var item = photos[currentIndex];

            activeImg.style.opacity = '0.5';
            activeImg.src = item.src;
            activeImg.alt = item.alt;
            activeImg.onload = function() {
              activeImg.style.opacity = '1';
            };

            if (captionEl) captionEl.textContent = item.alt || '';
            if (counterEl) counterEl.textContent = 'Ảnh ' + (currentIndex + 1) + ' / ' + photos.length;

            if (thumbsContainer) {
              var allThumbs = thumbsContainer.querySelectorAll('.court-lightbox-thumb-item');
              allThumbs.forEach(function(th, tIdx) {
                if (tIdx === currentIndex) {
                  th.classList.add('is-active');
                  th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } else {
                  th.classList.remove('is-active');
                }
              });
            }
          }

          function openModal(idx) {
            updateLightbox(idx);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
          }

          function closeModal() {
            modal.style.display = 'none';
            document.body.style.overflow = '';
          }

          triggers.forEach(function(trig) {
            trig.addEventListener('click', function(e) {
              e.preventDefault();
              var i = parseInt(trig.getAttribute('data-index') || '0', 10);
              openModal(i);
            });
          });

          if (prevBtn) {
            prevBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              updateLightbox(currentIndex - 1);
            });
          }

          if (nextBtn) {
            nextBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              updateLightbox(currentIndex + 1);
            });
          }

          modal.querySelectorAll('.js-lightbox-close').forEach(function(el) {
            el.addEventListener('click', function(e) {
              e.stopPropagation();
              closeModal();
            });
          });

          if (thumbsContainer) {
            thumbsContainer.querySelectorAll('.court-lightbox-thumb-item').forEach(function(th) {
              th.addEventListener('click', function(e) {
                e.stopPropagation();
                var i = parseInt(th.getAttribute('data-index') || '0', 10);
                updateLightbox(i);
              });
            });
          }

          window.addEventListener('keydown', function(e) {
            if (modal.style.display !== 'flex') return;
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowLeft') updateLightbox(currentIndex - 1);
            if (e.key === 'ArrowRight') updateLightbox(currentIndex + 1);
          });
        })();
      </script>
    </figure>
  `;
}
