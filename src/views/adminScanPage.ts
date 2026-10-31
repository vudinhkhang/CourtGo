import { escapeHtml } from '../utils/security.js';
import { SessionContext } from '../services/authService.js';
import { inlineIcon } from './icons.js';

export function renderAdminScanQrPage(data: {
  session: SessionContext;
  errorMessage?: string;
}): string {
  const { session, errorMessage } = data;

  return `
    <div style="max-width: 680px; margin: 0 auto 48px auto;">
      <div style="margin-bottom: 20px;">
        <a href="/quan-tri/don-dat" class="btn-text" style="font-size:14px; font-weight:600;">
          ${inlineIcon('back', 16)}
          <span>Quay lại Quản lý đơn đặt sân</span>
        </a>
      </div>

      <div class="flat-panel" style="border-radius: var(--r-lg); border: 1px solid var(--hairline); padding: 28px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">
              Quét mã QR soát vé
            </h1>
            <p style="font-size: 13.5px; color: #64748b; margin: 0;">
              Sử dụng camera hoặc nhập mã đơn để mở hồ sơ điều phối tại quầy.
            </p>
          </div>
          <span class="badge badge-primary" style="font-size:12px; padding:4px 10px;">
            Nhân viên: ${escapeHtml(session.user.full_name)}
          </span>
        </div>

        ${
          errorMessage
            ? `<div class="breaking-band" style="margin-bottom: 20px;" role="alert">
                <span>${escapeHtml(errorMessage)}</span>
              </div>`
            : ''
        }

        <!-- Khung Camera Quét QR -->
        <div style="background:#0a0b0d; border-radius:12px; overflow:hidden; position:relative; min-height:300px; display:flex; align-items:center; justify-content:center;">
          <video id="qr-video" playsinline style="width:100%; height:100%; max-height:340px; object-fit:cover; display:none;"></video>
          <div id="camera-placeholder" style="text-align:center; padding:32px 20px; color:#ffffff;">
            <div style="font-size:36px; margin-bottom:12px; opacity:0.8;">📷</div>
            <div style="font-size:15px; font-weight:600; margin-bottom:8px;">Bật camera để quét mã QR</div>
            <div style="font-size:12.5px; color:#94a3b8; max-width:320px; margin:0 auto 16px auto;">
              Cho phép quyền truy cập camera trên trình duyệt khi có thông báo.
            </div>
            <button type="button" id="btn-start-camera" class="btn-pill-dark" style="background:#0052ff; border:none; padding:10px 20px; font-size:13.5px;">
              Bật Camera Quét
            </button>
          </div>

          <!-- Đường viền ngắm quét QR -->
          <div id="scan-frame" style="display:none; position:absolute; width:200px; height:200px; border:2px dashed #0052ff; border-radius:12px; pointer-events:none; box-shadow:0 0 0 9999px rgba(0,0,0,0.5);"></div>
        </div>

        <!-- Nhập thủ công mã đơn hoặc quét bằng máy scan mã vạch USB -->
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--hairline-soft);">
          <form id="form-manual-code" onsubmit="event.preventDefault(); handleScanCode();" style="display:flex; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:240px;">
              <label for="input-booking-code" class="form-label" style="font-size:12.5px;">Hoặc nhập mã đơn / quét máy scan USB</label>
              <input
                id="input-booking-code"
                type="text"
                placeholder="Nhập mã đơn (vd: CG-20261030-ABCD)..."
                class="text-input"
                style="padding:10px 14px; font-weight:600; font-size:14.5px;"
                autocomplete="off"
                autofocus
              />
            </div>
            <button type="submit" class="btn-pill-dark" style="align-self:flex-end; padding:10px 22px; font-size:13.5px; min-height:42px;">
              Mở đơn
            </button>
          </form>
        </div>
      </div>
    </div>

    <script>
      (function() {
        var video = document.getElementById('qr-video');
        var placeholder = document.getElementById('camera-placeholder');
        var scanFrame = document.getElementById('scan-frame');
        var btnStart = document.getElementById('btn-start-camera');
        var inputCode = document.getElementById('input-booking-code');
        var stream = null;
        var intervalId = null;

        function redirectToOrder(code) {
          if (!code) return;
          var clean = code.trim();
          // Nếu scan ra URL
          var match = clean.match(/\\/quan-tri\\/(?:soat-ve|don-dat)\\/([^?&#]+)/);
          if (match && match[1]) {
            clean = decodeURIComponent(match[1]);
          } else if (clean.indexOf('CG-') !== -1) {
            var cgMatch = clean.match(/CG-[A-Za-z0-9-]+/);
            if (cgMatch) clean = cgMatch[0];
          }
          window.location.href = '/quan-tri/don-dat/' + encodeURIComponent(clean);
        }

        window.handleScanCode = function() {
          if (inputCode && inputCode.value) {
            redirectToOrder(inputCode.value);
          }
        };

        if (btnStart) {
          btnStart.addEventListener('click', function() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              alert('Trình duyệt của bạn không hỗ trợ camera. Vui lòng nhập mã đơn thủ công.');
              return;
            }

            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
              .then(function(s) {
                stream = s;
                video.srcObject = stream;
                video.style.display = 'block';
                placeholder.style.display = 'none';
                scanFrame.style.display = 'block';
                video.play();

                // Dùng BarcodeDetector nếu có
                if ('BarcodeDetector' in window) {
                  var detector = new BarcodeDetector({ formats: ['qr_code'] });
                  intervalId = setInterval(function() {
                    if (video.readyState >= 2) {
                      detector.detect(video)
                        .then(function(barcodes) {
                          if (barcodes.length > 0) {
                            clearInterval(intervalId);
                            redirectToOrder(barcodes[0].rawValue);
                          }
                        })
                        .catch(function() {});
                    }
                  }, 400);
                }
              })
              .catch(function(err) {
                alert('Không thể mở camera: ' + (err.message || 'Lỗi quyền truy cập'));
              });
          });
        }
      })();
    </script>
  `;
}
