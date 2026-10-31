(() => {
  'use strict';
  const STORAGE = 'courtgo.cart.v1';
  const fmt = n => {
    const num = Number(n);
    return (Number.isFinite(num) ? new Intl.NumberFormat('vi-VN').format(num) : '0') + ' ₫';
  };
  const keyOf = s => [s.courtId,s.date || s.bookingDate,s.startHour].join('|');
  let cart;
  try { cart = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch {}
  if (!cart || !Array.isArray(cart.slots)) cart = { slots: [], key: crypto.randomUUID() };
  cart.slots = cart.slots.filter(s => s && typeof s.courtId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isInteger(s.startHour) && s.startHour>=0 && s.startHour<24).slice(0,100);
  cart.slots = [...new Map(cart.slots.map(s=>[keyOf(s),s])).values()];
  const message = text => { const el=document.getElementById('cart-message')||document.getElementById('cart-live'); if(el) {el.textContent=text;if(el.id==='cart-live')setTimeout(()=>{if(el.textContent===text)el.textContent='';},5000);} };
  const save = () => { try { localStorage.setItem(STORAGE,JSON.stringify(cart)); } catch { message('Trình duyệt không cho lưu giỏ. Giữ trang này mở để tiếp tục.'); } };
  const changed = () => { cart.key=crypto.randomUUID(); save(); refresh(); };
  const groups = () => {
    const result=[];
    [...cart.slots].sort((a,b)=>a.date.localeCompare(b.date)||a.courtId.localeCompare(b.courtId)||a.startHour-b.startHour).forEach(s=>{
      const prev=result.at(-1)?.at(-1);
      if(prev&&prev.date===s.date&&prev.courtId===s.courtId&&prev.startHour+1===s.startHour) result.at(-1).push(s); else result.push([s]);
    });
    return result;
  };
  const textNode = (tag, cls, value) => {const el=document.createElement(tag);el.className=cls;el.textContent=value;return el;};
  const selection = new Map();
  const selectedTickets = new Set();
  const ticketKey = items => items.map(keyOf).join('~');
  function refresh() {
    document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=String(groups().length));
    document.querySelectorAll('.js-bebad-slot').forEach(btn=>{
      const s={courtId:btn.dataset.courtId,date:btn.dataset.date,startHour:Number(btn.dataset.startHour)};
      const inCart=cart.slots.some(x=>keyOf(x)===keyOf(s)), selected=selection.has(keyOf(s));
      btn.setAttribute('aria-pressed',String(inCart||selected));
      btn.closest('td')?.classList.toggle('cell-selected',inCart||selected);
      if (inCart) {
        btn.innerHTML = '<span class="bebad-cell-price-selected">✓ ' + (btn.dataset.priceShort || '') + '</span>';
      } else if (selected) {
        btn.innerHTML = '<span class="bebad-cell-price-selected">' + (btn.dataset.priceShort || '') + '</span>';
      } else {
        btn.innerHTML = '<span class="bebad-cell-price-hint">' + (btn.dataset.priceShort || '') + '</span>';
      }
    });
    const dock=document.getElementById('cart-selection-bar');
    if(dock) {
      dock.hidden=selection.size===0;
      document.getElementById('cart-selection-count').textContent=`${selection.size} ca chơi đã chọn`;
      document.getElementById('cart-selection-total').textContent=fmt([...selection.values()].reduce((n,s)=>n+s.priceVnd,0));
      document.body.classList.toggle('has-cart-selection',selection.size>0);
    }
    const list=document.getElementById('cart-items');
    if(!list)return;
    list.replaceChildren();
    const tickets=groups();
    if(!tickets.length) {
      list.append(textNode('p','cart-empty','Giỏ chưa có vé. Chọn sân và ca chơi để bắt đầu.'));
      try {localStorage.removeItem('courtgo.cart.return');} catch {}
    }
    tickets.forEach((items,index)=>{
      const first=items[0],last=items.at(-1);
      const key=ticketKey(items), available=items.every(s=>s.available===true), checked=selectedTickets.has(key)&&available;
      const article=textNode('article',`cart-ticket${checked?' is-selected':''}`,'');
      const picker=document.createElement('input');picker.type='checkbox';picker.className='cart-ticket-picker';picker.checked=checked;picker.disabled=!available;picker.setAttribute('aria-label',`Chọn vé ${first.courtName||''}, ${first.date}, ${String(first.startHour).padStart(2,'0')}:00–${String(last.startHour+1).padStart(2,'0')}:00`);
      picker.onchange=()=>{if(picker.checked)selectedTickets.add(key);else selectedTickets.delete(key);cart.key=crypto.randomUUID();save();refresh();};
      article.append(picker);
      article.append(textNode('span','ticket-index',String(index+1).padStart(2,'0')));
      const body=textNode('div','ticket-body','');body.append(textNode('h2','',first.courtName||'Đang kiểm tra sân…'));
      body.append(textNode('p','ticket-date',`${first.date.split('-').reverse().join('/')} · ${String(first.startHour).padStart(2,'0')}:00–${String(last.startHour+1).padStart(2,'0')}:00`));
      const unavailable=items.filter(s=>s.available===false);
      if(unavailable.length)body.append(textNode('p','cart-error','Không khả dụng: '+unavailable.map(s=>`${s.startHour}:00 (${s.reason||'đã được đặt'})`).join(', ')));
      const remove=textNode('button','btn-text','Xóa vé');remove.type='button';remove.setAttribute('aria-label',`Xóa vé ${index+1}`);remove.onclick=()=>{cart.slots=cart.slots.filter(s=>!items.some(x=>keyOf(x)===keyOf(s)));changed();};
      body.append(remove);article.append(body,textNode('strong','ticket-money num',fmt(items.reduce((n,s)=>n+(Number(s.priceVnd)||0),0))));list.append(article);
    });
    const chosen=tickets.filter(items=>selectedTickets.has(ticketKey(items))&&items.every(s=>s.available===true)).flat();
    const chosenCount=tickets.filter(items=>selectedTickets.has(ticketKey(items))&&items.every(s=>s.available===true)).length;
    const total=chosen.reduce((n,s)=>n+(Number(s.priceVnd)||0),0);
    document.getElementById('cart-ticket-count').textContent=`${chosenCount} vé đã chọn · ${chosen.length} ca chơi`;
    document.getElementById('cart-selection-summary').textContent=chosenCount?`Đã chọn ${chosenCount}/${tickets.length} vé`: 'Chưa chọn vé';
    document.getElementById('cart-total').textContent=fmt(total);
    document.getElementById('cart-slots').value=JSON.stringify(chosen.map(({courtId,date,startHour})=>({courtId,date,startHour})));
    document.getElementById('cart-key').value=cart.key;
    document.getElementById('cart-checkout').disabled=!chosen.length;
    const selectAll=document.getElementById('cart-select-available');
    if(selectAll)selectAll.textContent=chosenCount===tickets.filter(items=>items.every(s=>s.available===true)).length?'Bỏ chọn tất cả':'Chọn tất cả vé còn trống';
  }
  document.querySelectorAll('.js-bebad-slot').forEach(btn=>btn.addEventListener('click',()=>{
    btn.blur();
    const s={courtId:btn.dataset.courtId,courtName:btn.dataset.courtName,date:btn.dataset.date,startHour:Number(btn.dataset.startHour),priceVnd:Number(btn.dataset.priceVnd)};
    const key=keyOf(s);
    if(cart.slots.some(x=>keyOf(x)===key)) {
      cart.slots = cart.slots.filter(x => keyOf(x) !== key);
      changed();
      message('Đã bỏ chọn ca khỏi giỏ hàng.');
      return;
    }
    if(selection.has(key))selection.delete(key);else selection.set(key,s);
    refresh();
  }));
  document.getElementById('cart-add-selection')?.addEventListener('click',()=>{
    const slots=[...new Map([...cart.slots,...selection.values()].map(s=>[keyOf(s),s])).values()];
    if(slots.length>100) {message('Giỏ tối đa 100 ca chơi.');return;}
    cart.slots=slots;selection.clear();changed();message('Đã thêm vào giỏ. Bạn có thể đổi ngày để chọn thêm ca.');
  });
  document.getElementById('cart-clear-selection')?.addEventListener('click',()=>{selection.clear();refresh();});
  document.getElementById('cart-select-available')?.addEventListener('click',()=>{
    const tickets=groups().filter(items=>items.every(s=>s.available===true));
    const allSelected=tickets.length>0&&tickets.every(items=>selectedTickets.has(ticketKey(items)));
    if(allSelected)tickets.forEach(items=>selectedTickets.delete(ticketKey(items)));
    else tickets.forEach(items=>selectedTickets.add(ticketKey(items)));
    cart.key=crypto.randomUUID();save();refresh();
  });
  // Individual court pages share the same cart, without creating a hold on add.
  document.querySelectorAll('form[data-add-cart]').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(form);
    const s={courtId:String(data.get('courtId')),date:String(data.get('bookingDate')),startHour:Number(data.get('startHour')),courtName:form.dataset.courtName,priceVnd:Number(form.dataset.price)};
    if(!cart.slots.some(x=>keyOf(x)===keyOf(s)))cart.slots.push(s);
    changed();message('Đã thêm ca vào giỏ.');
  }));
  const paid=document.getElementById('paid-cart-slots');
  if(paid){
    const tickets=JSON.parse(paid.textContent);
    cart.slots=cart.slots.filter(s=>!tickets.some(t=>t.courtId===t.courtId&&t.date===s.date&&s.startHour>=t.startHour&&s.startHour<t.endHour));
    cart.key=crypto.randomUUID();save();
  }
  if(document.querySelector('[data-reset-cart-key]')){cart.key=crypto.randomUUID();save();}
  refresh();
  if(document.querySelector('[data-cart-page]')&&cart.slots.length){
    cart.slots.forEach(s=>{s.available=undefined;});refresh();
    fetch('/api/gio-hang/kiem-tra',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slots:cart.slots})})
      .then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.message||'Không thể kiểm tra lịch sân.');return data;})
      .then(data=>{cart.slots=cart.slots.map(s=>({...s,...data.slots.find(x=>keyOf(x)===keyOf(s))}));save();refresh();if(data.checkoutCodes?.length){message('Bạn đang giữ chỗ cho một số ca trong giỏ. ');const box=document.getElementById('cart-message');data.checkoutCodes.forEach(code=>{const a=textNode('a','btn-text','Tiếp tục '+code);a.href='/thanh-toan/nhom/'+encodeURIComponent(code);box.append(a);});}})
      .catch(error=>message(error.message));
  }
  document.getElementById('cart-checkout-form')?.addEventListener('submit',event=>{
    const form=event.currentTarget;
    if(form.dataset.authenticated==='false'){
      event.preventDefault();try{localStorage.setItem('courtgo.cart.return','1');}catch{}location.href='/tai-khoan/dang-nhap';
    } else document.getElementById('cart-checkout').disabled=true;
  });
  if(!document.querySelector('[data-cart-page]')&&document.body.dataset.authenticated==='true') {
    try{if(localStorage.getItem('courtgo.cart.return')==='1'){localStorage.removeItem('courtgo.cart.return');location.href='/gio-hang';}}catch{}
  }
  const deadline=document.querySelector('[data-deadline]');
  if(deadline){
    const tick=()=>{
      const secs=Math.max(0,Math.ceil((Date.parse(deadline.dataset.deadline)-Date.now())/1000));
      document.getElementById('group-countdown').textContent=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
      if(!secs){document.querySelector('#group-payment-form button[type="submit"]').disabled=true;cart.key=crypto.randomUUID();save();}
    };tick();setInterval(tick,1000);
  }

  // Quản lý thanh toán nhóm vé: Dịch vụ thêm riêng từng vé, Mã ưu đãi dạng button và danh sách công khai
  const summary = document.querySelector('.checkout-summary[data-base-total]');
  if (summary) {
    let discount = 0;
    const getCapacity = () => {
      const tickets = [...document.querySelectorAll('article.checkout-ticket[data-ticket-code]')];
      if (!tickets.length) {
        const base = Number(summary.dataset.baseTotal) || 0;
        const member = Number(summary.dataset.memberTotal) || 0;
        return Math.max(0, base - member - 1000);
      }
      return tickets.reduce((n, e) => {
        const base = Number(e.dataset.base) || 0;
        const member = Number(e.dataset.member) || 0;
        return n + Math.max(0, base - member - 1000);
      }, 0);
    };

    const update = () => {
      const service = [...document.querySelectorAll('[data-addon-price]')].reduce((n, e) => n + Math.max(0, Number(e.value) || 0) * Number(e.dataset.addonPrice), 0);
      const svcEl = document.getElementById('group-service-total');
      if (svcEl) svcEl.textContent = fmt(service);
      const rawDiscount = Number.isFinite(discount) ? Math.max(0, discount) : 0;
      const discEl = document.getElementById('group-discount-total');
      if (discEl) discEl.textContent = rawDiscount > 0 ? ('−' + fmt(rawDiscount)) : '0 ₫';
      const baseTot = Number(summary.dataset.baseTotal) || 0;
      const memTot = Number(summary.dataset.memberTotal) || 0;
      const totEl = document.getElementById('group-total');
      if (totEl) totEl.textContent = fmt(Math.max(0, baseTot - memTot + service - rawDiscount));

      // Cập nhật nhãn số lượng đồ đã đặt riêng cho từng vé
      const ticketCodes = new Set([...document.querySelectorAll('[data-addon-price]')].map(e => e.dataset.ticketCode).filter(Boolean));
      ticketCodes.forEach(code => {
        const badge = document.querySelector(`[data-ticket-addon-count="${code}"]`);
        if (!badge) return;
        const inputs = [...document.querySelectorAll(`[data-addon-price][data-ticket-code="${code}"]`)];
        const totalQty = inputs.reduce((sum, input) => sum + (parseInt(input.value, 10) || 0), 0);
        const ticketSvcTotal = inputs.reduce((sum, input) => sum + (parseInt(input.value, 10) || 0) * Number(input.dataset.addonPrice), 0);
        if (totalQty > 0) {
          badge.textContent = `${totalQty} món (+${fmt(ticketSvcTotal)})`;
          badge.classList.add('has-addons');
        } else {
          badge.textContent = 'Chưa chọn thêm';
          badge.classList.remove('has-addons');
        }
      });
    };

    document.querySelectorAll('[data-addon-price]').forEach(e => e.addEventListener('input', update));

    // Nút tăng giảm số lượng stepper [+] và [-] cho từng món của từng vé
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.addon-step-btn');
      if (!btn) return;
      e.preventDefault();
      const stepper = btn.closest('.addon-stepper');
      const input = stepper?.querySelector('.addon-qty-input');
      if (!input) return;
      let val = parseInt(input.value || '0', 10);
      const min = parseInt(input.min || '0', 10);
      const max = parseInt(input.max || '999', 10);
      if (btn.dataset.action === 'plus') {
        if (val < max) val++;
      } else if (btn.dataset.action === 'minus') {
        if (val > min) val--;
      }
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const couponInput = document.getElementById('group-coupon');
    if (couponInput) {
      couponInput.addEventListener('input', () => {
        discount = 0;
        const msg = document.getElementById('group-coupon-message');
        if (msg) {
          msg.textContent = '';
          msg.className = 'coupon-msg';
        }
        document.querySelectorAll('.js-group-coupon-chip').forEach(c => c.classList.remove('is-active'));
        update();
      });

      couponInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyCouponAction();
        }
      });
    }

    const applyCouponAction = async (customCode) => {
      const input = document.getElementById('group-coupon');
      const msg = document.getElementById('group-coupon-message');
      const code = (customCode !== undefined ? customCode : (input?.value || '')).trim().toUpperCase();
      if (!code) {
        if (msg) {
          msg.textContent = 'Vui lòng nhập mã ưu đãi.';
          msg.className = 'coupon-msg error';
        }
        discount = 0;
        update();
        return;
      }
      if (input) input.value = code;
      try {
        const baseTotalVal = Number(summary.dataset.baseTotal) || 0;
        const res = await fetch('/api/coupons/kiem-tra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, orderAmountVnd: baseTotalVal })
        });
        const data = await res.json();
        if (data.valid) {
          const cap = Math.max(0, getCapacity());
          const returnedDiscount = Number(data.discountVnd) || 0;
          discount = cap > 0 ? Math.min(returnedDiscount, cap) : returnedDiscount;
          if (msg) {
            msg.textContent = `Áp dụng thành công mã ${code}: Giảm ${fmt(discount)}`;
            msg.className = 'coupon-msg success';
          }
        } else {
          discount = 0;
          if (msg) {
            msg.textContent = data.errorVi || data.message || 'Mã không hợp lệ hoặc đã hết lượt dùng.';
            msg.className = 'coupon-msg error';
          }
        }
        update();
      } catch {
        if (msg) {
          msg.textContent = 'Chưa kiểm tra được mã. Vui lòng thử lại.';
          msg.className = 'coupon-msg error';
        }
      }
    };

    const applyBtn = document.getElementById('group-apply-coupon');
    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        applyCouponAction();
      });
    }

    // Nhấp vào mã ưu đãi công khai có sẵn để điền và tự động áp dụng ngay
    document.querySelectorAll('.js-group-coupon-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const code = chip.dataset.couponCode;
        if (code) {
          document.querySelectorAll('.js-group-coupon-chip').forEach(c => c.classList.remove('is-active'));
          chip.classList.add('is-active');
          applyCouponAction(code);
        }
      });
    });

    update();
  }
})();
