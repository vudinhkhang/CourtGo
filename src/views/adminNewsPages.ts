import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { NewsArticleAdminRecord } from '../services/newsService.js';
import { renderAdminSubnav } from './adminPages.js';
import { sectionHeading } from './layout.js';
import { inlineIcon } from './icons.js';

export function renderAdminNewsListPage(data: {
  session: SessionContext;
  articles: NewsArticleAdminRecord[];
}): string {
  const csrfToken = data.session.csrfToken;
  const total = data.articles.length;
  const publishedCount = data.articles.filter((a) => a.isPublished).length;
  const draftCount = total - publishedCount;

  return `
    ${renderAdminSubnav('news', data.session)}

    <!-- Hàng thống kê bài viết -->
    <div class="grid-3" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="stat-label">Tổng bài viết</span>
          <span style="font-size:24px;"></span>
        </div>
        <div class="stat-value">${total}</div>
        <div class="stat-foot">Bài viết trên toàn hệ thống</div>
      </div>

      <div class="stat-card" style="border-top:3px solid #10b981;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="stat-label">Đang hiển thị công khai</span>
          <span style="font-size:24px;"></span>
        </div>
        <div class="stat-value" style="color:#059669;">${publishedCount}</div>
        <div class="stat-foot">Khách hàng xem được trên trang chủ &amp; tin tức</div>
      </div>

      <div class="stat-card" style="border-top:3px solid #f59e0b;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="stat-label">Bản nháp / Tạm ẩn</span>
          <span style="font-size:24px;"></span>
        </div>
        <div class="stat-value" style="color:#d97706;">${draftCount}</div>
        <div class="stat-foot">Chỉ nhân viên và quản trị viên xem được</div>
      </div>
    </div>

    <!-- Bảng danh sách bài viết -->
    <section class="flat-panel">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
        <div>
          <h2 style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
            <span></span> Danh Sách Tin Tức &amp; Thông Báo Hoạt Động
          </h2>
          <p style="font-size:13.5px; color:#64748b; margin:0;">
            Quản lý các bài thông báo dịp lễ, sự kiện thi đấu, tin tuyển dụng và hướng dẫn cho lông thủ.
          </p>
        </div>
        <a href="/quan-tri/tin-tuc/tao-moi" class="btn-pill-dark" style="background:#0052ff; color:#fff; display:inline-flex; align-items:center; gap:6px;">
          <span></span>
          <span>Đăng bài viết mới</span>
        </a>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 80px;">Ảnh bìa</th>
              <th>Tiêu đề &amp; Chuyên mục</th>
              <th>Người đăng</th>
              <th>Ngày xuất bản</th>
              <th>Trạng thái</th>
              <th style="text-align: right;">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.articles.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding:32px; color:#94a3b8;">Chưa có bài viết nào. Hãy bấm "Đăng bài viết mới" để tạo bài đầu tiên!</td></tr>`
                : data.articles
                    .map((item) => {
                      const statusBadge = item.isPublished
                        ? `<span class="badge badge-success" style="font-size:12px; padding:3px 8px;">Đang hiển thị</span>`
                        : `<span class="badge badge-warning" style="font-size:12px; padding:3px 8px;">Bản nháp / Ẩn</span>`;

                      return `
                        <tr>
                          <td>
                            <div style="width: 72px; height: 48px; border-radius: 8px; overflow: hidden; background: #0f172a; border: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:center;">
                              <img src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.title)}" style="width:100%; height:100%; object-fit:${item.coverFit};" onerror="this.src='/public/assets/icons/home-circle-gold.svg'" />
                            </div>
                          </td>
                          <td>
                            <div style="font-weight: 500; color: #0f172a; font-size: 14.5px; margin-bottom: 4px;">
                              <a href="/tin-tuc/${encodeURIComponent(item.slug)}" target="_blank" style="color:inherit; text-decoration:none;" hover-underline>
                                ${escapeHtml(item.title)}
                              </a>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                              <span class="be-news-tag be-news-tag-${item.badgeTone}" style="position:static; font-size:11px; padding:2px 8px; border-radius:6px;">
                                ${escapeHtml(item.category)}
                              </span>
                              <span style="font-size:12px; color:#94a3b8;">slug: /${escapeHtml(item.slug)}</span>
                            </div>
                          </td>
                          <td>
                            <div style="font-size:13.5px; font-weight:600; color:#334155;">${escapeHtml(item.authorName || 'Ban Quản Lý')}</div>
                          </td>
                          <td>
                            <div style="font-size:13px; color:#64748b;">${escapeHtml(item.publishedAt)}</div>
                          </td>
                          <td>
                            ${statusBadge}
                          </td>
                          <td>
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                              <a href="/tin-tuc/${encodeURIComponent(item.slug)}" target="_blank" class="btn-text" title="Xem trên web" style="padding:4px 8px; font-size:13px; color:#0052ff;">
                                 Xem
                              </a>
                              <a href="/quan-tri/tin-tuc/${encodeURIComponent(item.id)}/sua" class="btn-pill-outline" style="padding:4px 10px; font-size:12.5px;">
                                 Sửa
                              </a>
                              <form method="POST" action="/quan-tri/tin-tuc/${encodeURIComponent(item.id)}/trang-thai" style="display:inline;">
                                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                <button type="submit" class="btn-pill-outline" style="padding:4px 10px; font-size:12.5px;" title="${item.isPublished ? 'Ẩn bài viết' : 'Công khai bài viết'}">
                                  ${item.isPublished ? 'Ẩn' : 'Bật'}
                                </button>
                              </form>
                              <form method="POST" action="/quan-tri/tin-tuc/${encodeURIComponent(item.id)}/xoa" style="display:inline;" onsubmit="return confirm('Bạn có chắc chắn muốn xóa bài viết này không?');">
                                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                                <button type="submit" class="btn-pill-outline" style="padding:4px 8px; font-size:12.5px; color:#dc2626; border-color:#fecaca;" title="Xóa bài">
                                  
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderAdminNewsEditPage(data: {
  session: SessionContext;
  article?: NewsArticleAdminRecord;
  isNew: boolean;
}): string {
  const { session, article, isNew } = data;
  const csrfToken = session.csrfToken;
  const formAction = isNew ? '/quan-tri/tin-tuc/tao-moi' : `/quan-tri/tin-tuc/${encodeURIComponent(article!.id)}/sua`;
  const pageTitle = isNew ? 'Soạn thảo Bài Viết Mới' : `Chỉnh sửa: ${article?.title || ''}`;

  const currentCategory = article?.category || 'Thông báo hoạt động';
  const currentBadgeTone = article?.badgeTone || 'blue';
  const currentCoverFit = article?.coverFit || 'cover';
  const currentPublished = article ? article.isPublished : true;

  const sampleHtml = `<p class="body-text" style="font-size: 16px; line-height: 1.75; margin-bottom: 18px;">
  Nhập nội dung đoạn văn giới thiệu tại đây...
</p>

<div style="background: #f8fafc; border-left: 4px solid #0052ff; border-radius: 0 12px 12px 0; padding: 20px 24px; margin: 24px 0;">
  <h3 style="font-size: 17px; font-weight: 500; color: #0f172a; margin-bottom: 12px;"> Chi tiết bài viết</h3>
  <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; font-size:15px; color:#334155;">
    <li>⏰ <strong>Thời gian áp dụng:</strong> Từ ngày ... đến ngày ...</li>
    <li> <strong>Áp dụng cho:</strong> Toàn bộ 18 sân tiêu chuẩn tại Be Badminton Gò Vấp</li>
    <li> <strong>Hotline hỗ trợ:</strong> 077 333 3371</li>
  </ul>
</div>

<p class="body-text">Chúc Quý khách và các lông thủ có những trận cầu thật nhiều niềm vui!</p>`;

  return `
    ${renderAdminSubnav('news', session)}

    <div style="max-width: 960px; margin: 0 auto 40px auto;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 20px;">
        <div>
          <a href="/quan-tri/tin-tuc" style="font-size:13.5px; color:#64748b; text-decoration:none;">← Quay lại danh sách tin tức</a>
          <h1 style="font-size: 24px; font-weight: 600; color: #0f172a; margin-top: 6px;">${escapeHtml(pageTitle)}</h1>
        </div>
      </div>

      <form method="POST" action="${formAction}" class="flat-panel" style="background:#fff; border-radius:16px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,0.04);">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

        <!-- Tiêu đề bài viết -->
        <div class="form-group">
          <label for="news-title" class="form-label" style="font-weight:500;">Tiêu đề bài viết <span style="color:#ef4444;">*</span></label>
          <input
            id="news-title"
            type="text"
            name="title"
            required
            value="${escapeHtml(article?.title || '')}"
            placeholder="Ví dụ: Lễ 2/9 – Be Badminton Mở Cửa Hoạt Động Xuyên Lễ!"
            class="text-input"
            style="font-size: 16px; font-weight:600; padding:12px 14px;"
          />
        </div>

        <!-- Slug & Chuyên mục -->
        <div class="grid-2">
          <div class="form-group">
            <label for="news-slug" class="form-label">Đường dẫn thân thiện (Slug - để trống sẽ tự tạo)</label>
            <input
              id="news-slug"
              type="text"
              name="slug"
              value="${escapeHtml(article?.slug || '')}"
              placeholder="vd: le-2-9-be-badminton"
              class="text-input"
            />
          </div>

          <div class="form-group">
            <label for="news-category" class="form-label">Chuyên mục <span style="color:#ef4444;">*</span></label>
            <select id="news-category" name="category" class="network-select" required>
              <option value="Thông báo hoạt động" ${currentCategory === 'Thông báo hoạt động' ? 'selected' : ''}>Thông báo hoạt động</option>
              <option value="Ưu đãi dịp lễ" ${currentCategory === 'Ưu đãi dịp lễ' ? 'selected' : ''}>Ưu đãi dịp lễ</option>
              <option value="Giải đấu &amp; Sự kiện" ${currentCategory === 'Giải đấu &amp; Sự kiện' ? 'selected' : ''}>Giải đấu &amp; Sự kiện</option>
              <option value="Tuyển dụng" ${currentCategory === 'Tuyển dụng' ? 'selected' : ''}>Tuyển dụng</option>
              <option value="Kỹ thuật &amp; Tập luyện" ${currentCategory === 'Kỹ thuật &amp; Tập luyện' ? 'selected' : ''}>Kỹ thuật &amp; Tập luyện</option>
            </select>
          </div>
        </div>

        <!-- Màu nhãn Tag & Tỷ lệ hiển thị ảnh bìa -->
        <div class="grid-2">
          <div class="form-group">
            <label for="news-badge-tone" class="form-label">Màu sắc nhãn thẻ (Badge tone)</label>
            <select id="news-badge-tone" name="badgeTone" class="network-select">
              <option value="blue" ${currentBadgeTone === 'blue' ? 'selected' : ''}>Xanh dương (Blue - Tiêu chuẩn)</option>
              <option value="red" ${currentBadgeTone === 'red' ? 'selected' : ''}>Đỏ nổi bật (Red - Lễ / Khẩn)</option>
              <option value="amber" ${currentBadgeTone === 'amber' ? 'selected' : ''}>Vàng cam (Amber - Tuyển dụng / Chú ý)</option>
              <option value="green" ${currentBadgeTone === 'green' ? 'selected' : ''}>Xanh lá (Green - Ưu đãi / Chào mừng)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="news-cover-fit" class="form-label">Tỷ lệ hiển thị ảnh bìa</label>
            <select id="news-cover-fit" name="coverFit" class="network-select">
              <option value="cover" ${currentCoverFit === 'cover' ? 'selected' : ''}>Lấp đầy khung (Cover - Khuyên dùng)</option>
              <option value="contain" ${currentCoverFit === 'contain' ? 'selected' : ''}>Giữ nguyên tỉ lệ không cắt (Contain - Poster)</option>
            </select>
          </div>
        </div>

        <!-- Ảnh bìa & Alt text -->
        <div class="grid-2">
          <div class="form-group">
            <label for="news-cover-image" class="form-label">Đường dẫn ảnh bìa (URL hoặc file public) <span style="color:#ef4444;">*</span></label>
            <input
              id="news-cover-image"
              type="text"
              name="coverImage"
              required
              value="${escapeHtml(article?.coverImage || '/public/images/news-le-2-9.jpg')}"
              placeholder="/public/images/... hoặc https://..."
              class="text-input"
            />
            <div style="font-size:12px; color:#64748b; margin-top:4px;">
              Ảnh sẵn có: <code>/public/images/news-le-2-9.jpg</code>, <code>/public/images/news-tuyen-dung.jpg</code>, <code>/public/images/news-le-30-4-1-5.jpg</code>
            </div>
          </div>

          <div class="form-group">
            <label for="news-image-alt" class="form-label">Mô tả ảnh bìa (Alt text cho SEO &amp; Hỗ trợ truy cập)</label>
            <input
              id="news-image-alt"
              type="text"
              name="imageAlt"
              value="${escapeHtml(article?.imageAlt || '')}"
              placeholder="Mô tả ngắn gọn hình ảnh"
              class="text-input"
            />
          </div>
        </div>

        <!-- Tóm tắt bài viết -->
        <div class="form-group">
          <label for="news-summary" class="form-label" style="font-weight:500;">Tóm tắt ngắn (Hiển thị ở thẻ bài viết trang chủ) <span style="color:#ef4444;">*</span></label>
          <textarea
            id="news-summary"
            name="summary"
            required
            rows="3"
            class="text-input"
            style="width:100%; resize:vertical; font-family:inherit; line-height:1.5;"
            placeholder="Tóm tắt 2-3 câu giới thiệu nhanh nội dung bài viết..."
          >${escapeHtml(article?.summary || '')}</textarea>
        </div>

        <!-- Trình soạn thảo Trực quan WYSIWYG (Quill.js Rich Text Editor) -->
        <div class="form-group" style="margin-bottom: 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <label class="form-label" style="font-weight:500; margin:0; display:flex; align-items:center; gap:6px;">
              <span></span>
              <span>Nội dung chi tiết bài viết</span>
              <span style="color:#ef4444;">*</span>
            </label>

            <!-- Nút chuyển đổi chế độ soạn thảo: Trực quan WYSIWYG vs Mã nguồn HTML -->
            <div style="display:flex; align-items:center; gap:4px; background:#f1f5f9; padding:3px; border-radius:8px; border:1px solid #cbd5e1;">
              <button
                type="button"
                id="btn-mode-visual"
                style="padding:5px 12px; font-size:12px; font-weight:500; min-height:28px; background:#0052ff; color:#fff; border:none; border-radius:6px; cursor:pointer;"
                onclick="switchEditorMode('visual')"
              >
                 Soạn thảo Trực quan
              </button>
              <button
                type="button"
                id="btn-mode-html"
                style="padding:5px 12px; font-size:12px; font-weight:600; min-height:28px; background:transparent; color:#475569; border:none; border-radius:6px; cursor:pointer;"
                onclick="switchEditorMode('html')"
              >
                &lt;/&gt; Mã nguồn HTML
              </button>
            </div>
          </div>

          <div style="font-size:12.5px; color:#64748b; margin-bottom:10px;">
             Bạn có thể định dạng tiêu đề, in đậm, đổi màu, tạo danh sách hoặc chèn liên kết/ảnh trực tiếp như Microsoft Word mà không cần gõ thẻ HTML.
          </div>

          <!-- Khung soạn thảo Quill WYSIWYG -->
          <div id="visual-editor-container" style="background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1;">
            <div id="quill-toolbar" style="border-top-left-radius:10px; border-top-right-radius:10px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
              <span class="ql-formats">
                <select class="ql-header">
                  <option value="1">Tiêu đề lớn (H1)</option>
                  <option value="2">Tiêu đề vừa (H2)</option>
                  <option value="3">Tiêu đề nhỏ (H3)</option>
                  <option selected>Đoạn văn chuẩn (Normal)</option>
                </select>
              </span>
              <span class="ql-formats">
                <button class="ql-bold" title="In đậm (Ctrl+B)"></button>
                <button class="ql-italic" title="In nghiêng (Ctrl+I)"></button>
                <button class="ql-underline" title="Gạch chân (Ctrl+U)"></button>
                <button class="ql-strike" title="Gạch ngang"></button>
              </span>
              <span class="ql-formats">
                <select class="ql-color" title="Màu chữ"></select>
                <select class="ql-background" title="Màu nền highlight"></select>
              </span>
              <span class="ql-formats">
                <button class="ql-list" value="ordered" title="Danh sách số"></button>
                <button class="ql-list" value="bullet" title="Danh sách gạch đầu dòng"></button>
              </span>
              <span class="ql-formats">
                <select class="ql-align" title="Căn lề"></select>
              </span>
              <span class="ql-formats">
                <button class="ql-blockquote" title="Khối trích dẫn"></button>
                <button class="ql-code-block" title="Khối mã lệnh"></button>
              </span>
              <span class="ql-formats">
                <button class="ql-link" title="Chèn liên kết web"></button>
                <button class="ql-image" title="Chèn hình ảnh"></button>
              </span>
              <span class="ql-formats">
                <button class="ql-clean" title="Xóa định dạng"></button>
              </span>
            </div>
            <div id="quill-editor" style="min-height:340px; font-size:15px; line-height:1.75; font-family:'Lexend', system-ui, sans-serif;"></div>
          </div>

          <!-- Textarea HTML (đồng bộ ngầm và hiển thị khi bấm Xem mã nguồn HTML) -->
          <div id="html-editor-container" style="display:none; margin-top:8px;">
            <textarea
              id="news-content-html"
              name="contentHtml"
              required
              rows="14"
              class="text-input"
              style="width:100%; font-family:Consolas, 'Courier New', monospace; font-size:13.5px; line-height:1.55; resize:vertical; background:#0f172a; color:#f8fafc; border-radius:10px; padding:16px;"
              placeholder="Nhập mã HTML bài viết..."
            >${escapeHtml(article?.contentHtml || sampleHtml)}</textarea>
          </div>
        </div>

        <!-- Tải thư viện Quill.js và kích hoạt WYSIWYG -->
        <link href="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
        <style>
          .ql-toolbar.ql-snow {
            border: none !important;
            border-bottom: 1px solid #e2e8f0 !important;
            background: #f8fafc;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
            padding: 10px 12px !important;
          }
          .ql-container.ql-snow {
            border: none !important;
            font-size: 15px !important;
            font-family: inherit !important;
          }
          .ql-editor {
            min-height: 340px;
            padding: 18px 22px !important;
            line-height: 1.75;
          }
          .ql-editor p {
            margin-bottom: 14px;
          }
          .ql-editor h1, .ql-editor h2, .ql-editor h3 {
            margin-top: 18px;
            margin-bottom: 10px;
            font-weight: 500;
          }
        </style>
        <script>
          (function() {
            var textarea = document.getElementById('news-content-html');
            var visualBox = document.getElementById('visual-editor-container');
            var htmlBox = document.getElementById('html-editor-container');
            var btnVisual = document.getElementById('btn-mode-visual');
            var btnHtml = document.getElementById('btn-mode-html');
            var currentMode = 'visual';
            var quillInstance = null;

            function initQuill() {
              if (typeof Quill === 'undefined') {
                setTimeout(initQuill, 100);
                return;
              }
              try {
                quillInstance = new Quill('#quill-editor', {
                  modules: {
                    toolbar: '#quill-toolbar'
                  },
                  theme: 'snow',
                  placeholder: 'Bắt đầu soạn thảo nội dung tin tức, thông báo trực tiếp tại đây...'
                });

                if (textarea && textarea.value) {
                  quillInstance.clipboard.dangerouslyPasteHTML(textarea.value);
                }

                quillInstance.on('text-change', function() {
                  if (textarea) {
                    textarea.value = quillInstance.root.innerHTML;
                  }
                });
              } catch (e) {
                console.warn('Không thể khởi tạo Quill, chuyển về chế độ HTML:', e);
                switchEditorMode('html');
              }
            }

            window.switchEditorMode = function(mode) {
              currentMode = mode;
              if (mode === 'html') {
                if (quillInstance && textarea) {
                  textarea.value = quillInstance.root.innerHTML;
                }
                visualBox.style.display = 'none';
                htmlBox.style.display = 'block';
                btnHtml.style.background = '#0052ff';
                btnHtml.style.color = '#fff';
                btnVisual.style.background = 'transparent';
                btnVisual.style.color = '#475569';
              } else {
                if (quillInstance && textarea) {
                  quillInstance.clipboard.dangerouslyPasteHTML(textarea.value);
                }
                htmlBox.style.display = 'none';
                visualBox.style.display = 'block';
                btnVisual.style.background = '#0052ff';
                btnVisual.style.color = '#fff';
                btnHtml.style.background = 'transparent';
                btnHtml.style.color = '#475569';
              }
            };

            var form = textarea ? textarea.closest('form') : null;
            if (form) {
              form.addEventListener('submit', function() {
                if (quillInstance && currentMode === 'visual') {
                  textarea.value = quillInstance.root.innerHTML;
                }
              });
            }

            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', initQuill);
            } else {
              initQuill();
            }
          })();
        </script>

        <!-- Checkbox xuất bản -->
        <div style="margin: 20px 0; padding:14px 18px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
          <input
            type="checkbox"
            id="news-is-published"
            name="isPublished"
            value="true"
            ${currentPublished ? 'checked' : ''}
            style="width:18px; height:18px; cursor:pointer;"
          />
          <label for="news-is-published" style="font-weight:600; color:#0f172a; cursor:pointer; font-size:14px;">
            Xuất bản công khai ngay (Khách hàng có thể đọc trên web)
          </label>
        </div>

        <!-- Nút Submit -->
        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top: 24px; padding-top: 18px; border-top:1px solid #f1f5f9;">
          <a href="/quan-tri/tin-tuc" class="btn-pill-outline" style="padding:10px 20px;">Hủy bỏ</a>
          <button type="submit" class="btn-pill-dark" style="background:#0052ff; color:#fff; font-weight:500; padding:10px 24px;">
            ${isNew ? ' Đăng bài viết' : ' Lưu thay đổi'}
          </button>
        </div>
      </form>
    </div>
  `;
}

