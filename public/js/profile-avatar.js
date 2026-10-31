(() => {
  const file = document.getElementById('profile-avatar-file');
  const data = document.getElementById('profile-avatar-data');
  const preview = document.getElementById('profile-avatar-preview');
  const status = document.getElementById('profile-avatar-status');
  if (!file || !data || !preview) return;
  let busy = false;
  const remove = document.getElementById('profile-avatar-remove');
  file.addEventListener('change', async () => {
    const selected = file.files[0];
    if (!selected) return;
    if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      status.textContent = 'Chọn ảnh JPG, PNG hoặc WebP không quá 5 MB.'; file.value = ''; return;
    }
    busy = true; remove.disabled = true; status.textContent = 'Đang xử lý ảnh…';
    const url = URL.createObjectURL(selected);
    try {
      const img = new Image();
      img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
      const ctx = canvas.getContext('2d'); const side = Math.min(img.naturalWidth,img.naturalHeight);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,320,320);
      ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,320,320);
      data.value = canvas.toDataURL('image/jpeg',0.85);
      const result = document.createElement('img'); result.src = data.value; result.alt = 'Ảnh đại diện mới';
      preview.replaceChildren(result); status.textContent = 'Ảnh đã sẵn sàng. Bấm Lưu thông tin cá nhân để cập nhật.';
    } catch { status.textContent = 'Không đọc được ảnh. Vui lòng chọn ảnh khác.'; }
    finally { URL.revokeObjectURL(url); busy = false; remove.disabled = false; file.value = ''; }
  });
  remove.addEventListener('click', () => { data.value = ''; preview.textContent = '—'; file.value = ''; status.textContent = 'Bấm Lưu thông tin cá nhân để xóa ảnh.'; });
  data.form.addEventListener('submit', event => { if (busy) { event.preventDefault(); status.textContent = 'Vui lòng chờ xử lý ảnh xong.'; } });
})();
