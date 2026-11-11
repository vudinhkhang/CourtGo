# CourtGo — Hệ Thống Đặt Sân Cầu Lông Trực Tuyến & Quản Trị Vận Hành O2O

> **Be Badminton Gò Vấp** — Tổ hợp 18 sân cầu lông tiêu chuẩn BWF  
> 📍 Địa chỉ: 262/1 Quang Trung, Phường 10, Gò Vấp, TP. Hồ Chí Minh  
> ⏰ Giờ mở cửa: 05:00 – 24:00 hàng ngày  
> 📞 Hotline: 0773 333 371

---

## 🌟 Giới Thiệu Dự Án

Đồ án thương mại điện tử: xây dựng hệ thống đặt sân cầu lông trực tuyến.

**CourtGo** là giải pháp nền tảng số toàn diện cho mô hình thể thao O2O (Online-to-Offline), hỗ trợ người chơi đặt sân cầu lông nhanh chóng, giữ chỗ công bằng theo thời gian thực và quản lý vận hành sân chuyên nghiệp cho ban quản trị và nhân viên.

Dự án được xây dựng với triết lý **hiệu năng cao, bảo mật nghiêm ngặt và trải nghiệm mượt mà**: kiến trúc Fastify SSR tối ưu tốc độ phản hồi cực nhanh, cơ sở dữ liệu quan hệ ACID đảm bảo chống trùng lịch và tích hợp thanh toán tự động VietQR / VNPAY bảo mật cao.

---

## 🚀 Tính Năng Chính

### 1. Trải Nghiệm Khách Hàng (Customer Experience)
- **Đặt sân trực quan theo khung giờ**: Xem trạng thái 18 sân theo thời gian thực (trống, đang giữ chỗ, đã đặt). Hỗ trợ đặt lẻ từng giờ hoặc combo nhiều sân/khung giờ cùng lúc.
- **Khóa sân tự động 5 phút (Hold Concurrency)**: Hệ thống tạm giữ độc quyền ca chơi ngay khi khách hàng chọn, loại bỏ hoàn toàn tình trạng tranh chấp hoặc đặt trùng ca.
- **Thanh toán VietQR & Cổng thanh toán Sandbox**: Tự động tạo mã QR động Napas 24/7 theo đơn giá chuẩn, đối soát chữ ký số bảo mật `HMAC-SHA256` và xác nhận vé ngay tức thì qua Webhook IPN.
- **Hệ thống ưu đãi linh hoạt**: Hỗ trợ mã giảm giá (Coupon), giá ưu đãi theo khung giờ (09:00 - 17:00 cho HS/SV) và bảng giá cố định / vãng lai minh bạch.
- **Vé điện tử & QR Soát vé**: Cấp vé điện tử kèm mã QR check-in tại quầy, quản lý lịch sử đơn đặt và in vé PDF.
- **Chính sách hủy sân & hoàn tiền tự động 100%**: Khách hàng chủ động hủy trước giờ chơi 12 tiếng để nhận hoàn tiền đủ 100% vào tài khoản nguồn.

### 2. Phòng Chống Rửa Tiền (AML) & Quản Lý Hoàn Tiền An Toàn
- **Lưu vết tài khoản nguồn thanh toán**: Tự động ghi nhận Ngân hàng, Số tài khoản và Tên chủ tài khoản của người gửi khi thực hiện giao dịch chuyển khoản.
- **Khóa tài khoản thụ hưởng hoàn tiền**: Mọi yêu cầu hoàn cọc hoặc hủy đơn đều được cố định trả về đúng số tài khoản ban đầu, ngăn chặn triệt để hành vi rửa tiền qua hoàn cọc hoặc đổi sang tài khoản/tiền mặt khác.
- **Đối soát & Hoàn tiền thủ công**: Giao diện quản trị hỗ trợ nhân viên đối soát giao dịch cổng tự động hoặc nhập Mã giao dịch ngân hàng / Ủy nhiệm chi (UNC) để hoàn tiền thủ công với nhật ký kiểm toán (Audit Logs) chặt chẽ.

### 3. Phân Hệ Quản Trị & Vận Hành (Staff & Admin Operations)
- **Giám sát trực quan 18 sân**: Ma trận trạng thái sân theo thời gian thực, hỗ trợ chuyển sân nhanh (Quick Court Transfer) khi khách có nhu cầu.
- **Bán vé & Đặt sân tại quầy (Walk-in POS)**: Thu tiền mặt / chuyển khoản trực tiếp tại quầy và in hóa đơn tức thì.
- **Soát vé QR Check-in**: Quét mã QR trên vé khách hàng để xác thực vào sân và ghi nhận giờ bắt đầu thi đấu.
- **Dịch vụ & Dụng cụ thuê**: Quản lý kho vợt, cầu, nước giải khát, tiền đặt cọc dụng cụ và hoàn cọc khi trả đồ.
- **Báo cáo doanh thu & Bàn giao ca (Shift Handover)**: Thống kê doanh thu theo nguồn (tiền mặt, chuyển khoản, dịch vụ, tiền cọc), xuất báo cáo CSV và lưu biên bản bàn giao ca minh bạch.

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Type-safe toàn diện)
- **Web Framework**: [Fastify](https://fastify.dev/) (Hiệu năng vượt trội, kiến trúc plugin gọn nhẹ)
- **Database**: [PGlite](https://pglite.electric-sql.com/) / [PostgreSQL](https://www.postgresql.org/) (PostgreSQL WASM chạy trực tiếp trên file, hỗ trợ Transaction ACID, Isolation, Trigger & Constraint)
- **View Engine**: Server-Side Rendered (SSR) HTML5 thuần + CSS3 Custom Design System (Tải trang siêu tốc, zero client framework bundle)
- **Bảo mật**: Chữ ký số HMAC-SHA256 / SHA512, Rate Limiting, CSRF Protection, HTTP-only Cookie Session, PBKDF2 Password Hashing.

---

## 📂 Cấu Trúc Thư Mục

```text
CourtGo/
├── public/                 # Tài nguyên tĩnh (CSS, hình ảnh sân, icons SVG)
│   ├── css/                # customer-experience.css, style.css
│   └── images/             # hero-banner.png, ảnh sân cầu lông tiêu chuẩn
├── src/
│   ├── config/             # Cấu hình môi trường (env.ts)
│   ├── db/                 # Kết nối DB & Migrations (001 -> 017), Seed data
│   ├── integrations/       # Cổng thanh toán (VietnamPaymentGateway, HMAC)
│   ├── scripts/            # Script tiện ích: db:migrate, db:seed, db:backup
│   ├── services/           # Nghiệp vụ: booking, multi-ticket, auth, admin, inventory
│   ├── utils/              # Tiện ích bảo mật, format tiền tệ/thời gian, logger
│   ├── views/              # Template SSR: trang chủ, bảng giá, giỏ hàng, vé, admin
│   ├── app.ts              # Đăng ký routes, middleware và luồng xử lý ứng dụng
│   └── server.ts           # Điểm khởi chạy Fastify Server
├── .env.example            # Mẫu biến môi trường
├── .gitignore              # Danh sách loại trừ Git
├── package.json            # Scripts & Dependencies
├── tsconfig.json           # Cấu hình TypeScript compiler
└── README.md               # Tài liệu hướng dẫn dự án
```

---

## ⚙️ Cài Đặt & Chạy Ứng Dụng

### Yêu Cầu Hệ Thống
- **Node.js**: Phiên bản 20 trở lên
- **pnpm**: Trình quản lý gói khuyến nghị (`npm install -g pnpm`)

### Các Bước Cài Đặt

1. **Clone repository**:
   ```bash
   git clone https://github.com/vudinhkhang/CourtGo.git
   cd CourtGo
   ```

2. **Cài đặt thư viện phụ thuộc**:
   ```bash
   pnpm install
   ```

3. **Cấu hình môi trường**:
   Sao chép file `.env.example` thành `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Khởi tạo cơ sở dữ liệu & dữ liệu mẫu**:
   ```bash
   # Chạy các bản migration (001 -> 017)
   pnpm run db:migrate

   # Nạp dữ liệu ban đầu (18 sân, người dùng mẫu, bảng giá, dụng cụ)
   pnpm run db:seed
   ```

5. **Chạy server phát triển (Development)**:
   ```bash
   pnpm run dev
   ```
   Ứng dụng sẽ khả dụng tại: `http://127.0.0.1:3000`

---

## 🔐 Tài Khoản Kiểm Thử Mặc Định

| Vai trò | Email đăng nhập | Mật khẩu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `khang@gmail.com` | `123456` | Toàn quyền cấu hình, đối soát hoàn tiền AML, quản lý tài khoản |
| **Nhân viên (Staff)** | `luong@gmail.com` | `123456` | Quản lý quầy POS, soát vé, đổi sân, bàn giao ca |
| **Khách hàng (Customer)** | `huy@gmail.com` | `123456` | Đặt sân, xem lịch sử vé, yêu cầu hủy & hoàn tiền |

---

## 📜 Giấy Phép & Bản Quyền

Dự án phát triển cho **Be Badminton Gò Vấp** — Bản quyền © 2026. Mọi quyền được bảo lưu.
