(function () {
  'use strict';
  const busy = new Set();
  const images = new Map();
  const field = (id, court) => document.getElementById(id + court);
  document.querySelectorAll('input[name="imagesJson"]').forEach(input => {
    images.set(input.id.replace('court-images-json-', ''), JSON.parse(input.value || '[]'));
  });
  function status(court, text, error = false) {
    const el = field('court-upload-status-', court);
    el.style.display = 'block';
    el.style.color = error ? '#b91c1c' : '#475569';
    el.setAttribute('role', error ? 'alert' : 'status');
    el.textContent = text;
  }
  function setBusy(court, value) {
    if (value) busy.add(court); else busy.delete(court);
    const form = field('court-images-json-', court).form;
    form.querySelectorAll('button, input[type=file]').forEach(el => { el.disabled = value; });
    form.setAttribute('aria-busy', String(value));
  }
  async function request(court, endpoint, body) {
    const csrf = field('court-images-json-', court).form.querySelector('[name="_csrf"]').value;
    const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','x-csrf-token':csrf}, body:JSON.stringify({...body,courtId:court,_csrf:csrf})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || (response.status === 413 ? 'Ảnh quá lớn. Chọn ảnh dưới 10 MB.' : 'Không thể lưu ảnh. Vui lòng thử lại.'));
    return data;
  }
  window.syncCourtImagesBeforeSubmit = function(court) {
    field('court-images-json-', court).value = JSON.stringify(images.get(court) || []);
  };
  function render(court) {
    const list = images.get(court) || [];
    list.forEach((img, i) => { img.isPrimary = i === 0; });
    window.syncCourtImagesBeforeSubmit(court);
    field('court-images-text-', court).value = list.map(img => img.url || img.imageUrl).join('\n');
    field('court-images-count-', court).textContent = `(${list.length} ảnh)`;
    const grid = field('court-images-grid-', court);
    grid.replaceChildren();
    if (!list.length) grid.textContent = 'Chưa có ảnh. Chọn Tải ảnh lên để thêm.';
    list.forEach((img, i) => {
      const card = document.createElement('div');
      card.style.cssText = 'position:relative;border:1px solid #d7dde5;border-radius:6px;overflow:hidden;height:110px';
      const photo = document.createElement('img');
      photo.src = img.url || img.imageUrl;
      photo.alt = `Ảnh sân ${i + 1}`;
      photo.style.cssText = 'width:100%;height:100%;object-fit:cover';
      const label = document.createElement('span');
      label.textContent = i === 0 ? 'Ảnh chính' : `Ảnh ${i + 1}`;
      label.style.cssText = 'position:absolute;left:6px;bottom:6px;background:white;padding:2px 6px;font-size:11px';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = 'Xóa ảnh này';
      remove.setAttribute('aria-label', `Xóa ảnh ${i + 1}`);
      remove.style.cssText = 'position:absolute;right:5px;top:5px;background:white;border:1px solid #d7dde5;border-radius:4px;width:26px;height:26px;cursor:pointer';
      remove.addEventListener('click', () => window.removeCourtImage(court, i));
      card.append(photo, label, remove); grid.append(card);
      if (i > 0) {
        const primary = document.createElement('button');
        primary.type = 'button'; primary.textContent = 'Đặt ảnh chính';
        primary.style.cssText = 'position:absolute;left:5px;top:5px;background:white;border:1px solid #d7dde5;border-radius:4px;padding:3px 5px;font:11px Arial;cursor:pointer';
        primary.addEventListener('click', async () => {
          if (busy.has(court)) return;
          setBusy(court, true);
          try {
            await request(court, '/api/quan-tri/anh-chinh-san', {imageUrl:img.url || img.imageUrl});
            list.unshift(list.splice(i, 1)[0]); render(court); status(court, 'Đã cập nhật ảnh chính.');
          } catch (error) { status(court, error.message, true); }
          finally { setBusy(court, false); }
        });
        card.append(primary);
      }
    });
  }
  window.removeCourtImage = async function(court, index) {
    if (busy.has(court)) return;
    const list = images.get(court) || [];
    if (!list[index]) return;
    setBusy(court, true);
    try {
      await request(court, '/api/quan-tri/xoa-anh-san', {imageUrl:list[index].url || list[index].imageUrl});
      list.splice(index, 1); render(court); status(court, 'Đã xóa ảnh.');
    } catch (error) { status(court, error.message, true); }
    finally { setBusy(court, false); }
  };
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được ảnh. Vui lòng chọn lại.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Ảnh bị hỏng hoặc không được hỗ trợ.'));
        img.onload = () => {
          try {
            const scale = Math.min(1, 1920 / img.width, 1080 / img.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', .85));
          } catch { reject(new Error('Không xử lý được ảnh. Vui lòng chọn ảnh khác.')); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  window.handleCourtImageFiles = async function(event, court) {
    if (busy.has(court)) return;
    const input = event.target, files = Array.from(input.files || []);
    if (!files.length) return;
    setBusy(court, true);
    let count = 0; const errors = [];
    try {
      for (const file of files) {
        try {
          if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Chỉ nhận JPG, PNG hoặc WebP.');
          if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh vượt quá 10 MB.');
          status(court, `Đang tải ${count + 1}/${files.length} ảnh…`);
          const data = await request(court, '/api/quan-tri/tai-anh-san', {base64Data:await readImage(file),filename:file.name});
          images.get(court).push({url:data.imageUrl,caption:data.caption,isPrimary:false});
          render(court); count++;
        } catch (error) { errors.push(`${file.name}: ${error.message}`); }
      }
      status(court, `Đã lưu ${count}/${files.length} ảnh.${errors.length ? ' ' + errors.join(' ') : ''}`, !!errors.length);
    } finally { input.value = ''; setBusy(court, false); }
  };
  document.querySelectorAll('input[name="imagesJson"]').forEach(input => {
    render(input.id.replace('court-images-json-', ''));
    input.form.addEventListener('submit', event => {
      const court = input.id.replace('court-images-json-', '');
      if (busy.has(court)) { event.preventDefault(); status(court, 'Chờ tải ảnh hoàn tất trước khi cập nhật sân.', true); }
    });
  });
})();
