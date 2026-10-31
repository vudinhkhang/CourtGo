import { getPublicEquipmentCatalog } from '../services/equipmentService.js';
import { escapeHtml as e } from '../utils/security.js';
import { formatVnd as money } from '../utils/time.js';
export function renderEquipmentCatalog(data: Awaited<ReturnType<typeof getPublicEquipmentCatalog>>):string {
 const {items,filters:f,total,page,pages}=data;
 const title=f.nhom==='thue'?'Thuê dụng cụ':f.nhom==='mua'?'Phụ kiện & nước uống':'Dụng cụ & phụ kiện';
 const url=(changes:Record<string,string>)=>'/dung-cu?'+new URLSearchParams({nhom:f.nhom,loai:f.loai,tim:f.tim,conHang:f.conHang?'1':'',sapXep:f.sapXep,...changes}).toString();
 const opts=(values:string[][],current:string)=>values.map(([v,l])=>`<option value="${v}" ${current===v?'selected':''}>${l}</option>`).join('');
 return `<div class="catalog-page"><a class="order-back" href="/#bang-gia-niem-yet">← Bảng giá</a><header class="order-header"><div><h1>${title}</h1><p class="order-muted">Thêm dịch vụ khi thanh toán đặt sân hoặc liên hệ quầy để thuê, mua trực tiếp.</p></div><a class="btn-pill-dark" href="/#lich-san-nhanh">Đặt sân</a></header>
 <nav class="catalog-tabs" aria-label="Nhóm sản phẩm"><a href="/dung-cu" ${!f.nhom?'aria-current="page"':''}>Tất cả</a><a href="/dung-cu?nhom=thue" ${f.nhom==='thue'?'aria-current="page"':''}>Thuê dụng cụ</a><a href="/dung-cu?nhom=mua" ${f.nhom==='mua'?'aria-current="page"':''}>Phụ kiện &amp; nước uống</a></nav>
 <form method="GET" action="/dung-cu" class="catalog-filters"><input type="hidden" name="nhom" value="${e(f.nhom)}" />
 <label>Tìm sản phẩm<input name="tim" class="text-input" value="${e(f.tim)}" placeholder="Tên hoặc mã sản phẩm" maxlength="100" /></label>
 <label>Loại<select name="loai" class="network-select"><option value="">Tất cả</option>${opts((f.nhom==='thue'?[['RENTAL','Dụng cụ thuê'],['FACILITY','Tiện ích']]:f.nhom==='mua'?[['EQUIPMENT','Phụ kiện'],['BEVERAGE','Nước uống']]:[['RENTAL','Dụng cụ thuê'],['FACILITY','Tiện ích'],['EQUIPMENT','Phụ kiện'],['BEVERAGE','Nước uống']]),f.loai)}</select></label>
 <label>Sắp xếp<select name="sapXep" class="network-select"><option value="">Theo danh mục</option>${opts([['gia-tang','Giá tăng dần'],['gia-giam','Giá giảm dần']],f.sapXep)}</select></label>
 <label class="catalog-stock"><input type="checkbox" name="conHang" value="1" ${f.conHang?'checked':''}/> Chỉ còn hàng</label><button class="btn-pill-dark">Lọc</button><a class="btn-text" href="/dung-cu${f.nhom?'?nhom='+f.nhom:''}">Xóa bộ lọc</a></form>
 <p class="order-muted catalog-count">${total} sản phẩm${total?' · '+((page-1)*12+1)+'–'+Math.min(page*12,total):''}</p>
 <div class="catalog-grid">${items.map(item=>`<article class="catalog-product"><div class="catalog-image">${item.imageUrl?`<img src="${e(item.imageUrl)}" alt="${e(item.name)}" loading="lazy" />`:'<span>Chưa có ảnh</span>'}</div><div class="catalog-product-body"><p class="catalog-state ${item.stockStatus==='AVAILABLE'?'':'unavailable'}">${item.stockStatus==='MAINTENANCE'?'Tạm ngưng':item.stockStatus==='OUT_OF_STOCK'?'Hết hàng':'Còn '+item.stockQuantity+' tại quầy'}</p><h2>${e(item.name)}</h2><p class="catalog-description">${e(item.description)}</p><div class="catalog-product-price"><strong>${e(money(item.priceVnd))}</strong><span> / ${e(item.unit.toLowerCase())}</span></div>${item.depositVnd?`<p class="order-muted">Cọc ${e(money(item.depositVnd))}</p>`:''}</div></article>`).join('')||'<div class="catalog-empty"><h2>Không có sản phẩm phù hợp</h2><p>Thử từ khóa khác hoặc xóa bộ lọc.</p></div>'}</div>
 ${pages>1?`<nav class="account-pagination" aria-label="Phân trang sản phẩm">${page>1?`<a href="${e(url({trang:String(page-1)}))}">Trang trước</a>`:''}<span>Trang ${page}/${pages}</span>${page<pages?`<a href="${e(url({trang:String(page+1)}))}">Trang sau</a>`:''}</nav>`:''}
 </div>`;
}
