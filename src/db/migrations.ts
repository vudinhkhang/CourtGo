import { DatabaseClient, getDb } from './client.js';
import { logger } from '../utils/logger.js';

export interface MigrationItem {
  version: string;
  name: string;
  sql: string[];
}

export const MIGRATIONS: MigrationItem[] = [
  {
    version: '001_initial_schema',
    name: 'Khởi tạo cấu trúc bảng cốt lõi cho CourtGo',
    sql: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED')),
        email_verified_at TIMESTAMPTZ NULL,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret TEXT NULL,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ip_address TEXT NULL,
        user_agent TEXT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
      `CREATE TABLE IF NOT EXISTS auth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        purpose TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFY', 'PASSWORD_RESET', 'ADMIN_MFA')),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS centers (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        district TEXT NOT NULL,
        city TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        open_hour INTEGER NOT NULL DEFAULT 5 CHECK (open_hour >= 0 AND open_hour < 24),
        close_hour INTEGER NOT NULL DEFAULT 24 CHECK (close_hour > open_hour AND close_hour <= 24),
        timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        description TEXT NOT NULL,
        cancellation_policy_version TEXT NOT NULL DEFAULT 'v1-12h-100pct',
        cancellation_min_hours INTEGER NOT NULL DEFAULT 12 CHECK (cancellation_min_hours >= 0),
        hold_duration_seconds INTEGER NOT NULL DEFAULT 300 CHECK (hold_duration_seconds BETWEEN 60 AND 300),
        max_active_holds_per_user INTEGER NOT NULL DEFAULT 3 CHECK (max_active_holds_per_user >= 1),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS courts (
        id TEXT PRIMARY KEY,
        center_id TEXT NOT NULL REFERENCES centers(id),
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        court_type TEXT NOT NULL,
        surface_desc TEXT NOT NULL,
        lighting_desc TEXT NOT NULL,
        description TEXT NOT NULL,
        usage_notes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        open_hour INTEGER NOT NULL DEFAULT 5 CHECK (open_hour >= 0 AND open_hour < 24),
        close_hour INTEGER NOT NULL DEFAULT 24 CHECK (close_hour > open_hour AND close_hour <= 24),
        base_price_vnd INTEGER NOT NULL CHECK (base_price_vnd > 0),
        sort_order INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS court_images (
        id TEXT PRIMARY KEY,
        court_id TEXT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        caption TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS court_amenities (
        id TEXT PRIMARY KEY,
        court_id TEXT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        icon_symbol TEXT NOT NULL DEFAULT '●',
        sort_order INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS pricing_rules (
        id TEXT PRIMARY KEY,
        court_id TEXT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        day_type TEXT NOT NULL CHECK (day_type IN ('WEEKDAY', 'WEEKEND', 'ALL')),
        start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
        end_hour INTEGER NOT NULL CHECK (end_hour > start_hour AND end_hour <= 24),
        price_vnd INTEGER NOT NULL CHECK (price_vnd > 0),
        label TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pricing_rules_court ON pricing_rules(court_id, is_active)`,
      `CREATE TABLE IF NOT EXISTS court_blocks (
        id TEXT PRIMARY KEY,
        court_id TEXT NOT NULL REFERENCES courts(id),
        block_date TEXT NOT NULL,
        start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
        end_hour INTEGER NOT NULL CHECK (end_hour = start_hour + 1),
        reason TEXT NOT NULL,
        created_by TEXT NULL REFERENCES users(id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_court_blocks_active
        ON court_blocks (court_id, block_date, start_hour)
        WHERE is_active = TRUE`,
      `CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        booking_code TEXT NOT NULL UNIQUE,
        idempotency_key TEXT UNIQUE NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        court_id TEXT NOT NULL REFERENCES courts(id),
        booking_date TEXT NOT NULL,
        start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
        end_hour INTEGER NOT NULL CHECK (end_hour = start_hour + 1),
        slot_start_at TIMESTAMPTZ NOT NULL,
        slot_end_at TIMESTAMPTZ NOT NULL,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        notes TEXT NULL,
        quoted_price_vnd INTEGER NOT NULL CHECK (quoted_price_vnd > 0),
        service_fee_vnd INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_vnd >= 0),
        total_amount_vnd INTEGER NOT NULL CHECK (total_amount_vnd > 0),
        pricing_label_snapshot TEXT NOT NULL,
        court_name_snapshot TEXT NOT NULL,
        policy_version_snapshot TEXT NOT NULL,
        cancel_min_hours_snapshot INTEGER NOT NULL DEFAULT 12,
        refund_rate_pct_snapshot INTEGER NOT NULL DEFAULT 100,
        booking_status TEXT NOT NULL CHECK (booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
        payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'LATE_PAID_CONFLICT')),
        refund_status TEXT NOT NULL CHECK (refund_status IN ('NONE', 'NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'REFUNDED', 'FAILED_RETRYABLE', 'MANUAL_REVIEW')),
        hold_expires_at TIMESTAMPTZ NOT NULL,
        confirmed_at TIMESTAMPTZ NULL,
        checked_in_at TIMESTAMPTZ NULL,
        checked_in_by TEXT NULL REFERENCES users(id),
        completed_at TIMESTAMPTZ NULL,
        completed_by TEXT NULL REFERENCES users(id),
        expired_at TIMESTAMPTZ NULL,
        cancelled_at TIMESTAMPTZ NULL,
        cancelled_by TEXT NULL REFERENCES users(id),
        cancel_reason TEXT NULL,
        refundable_amount_vnd INTEGER NOT NULL DEFAULT 0 CHECK (refundable_amount_vnd >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
        ON bookings (court_id, booking_date, start_hour)
        WHERE booking_status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')`,
      `CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_bookings_date_court ON bookings(booking_date, court_id)`,
      `CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires ON bookings(booking_status, hold_expires_at)`,
      `CREATE TABLE IF NOT EXISTS booking_events (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        from_status TEXT NULL,
        to_status TEXT NULL,
        actor_user_id TEXT NULL REFERENCES users(id),
        actor_role TEXT NOT NULL,
        message_vi TEXT NOT NULL,
        internal_detail JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id, created_at ASC)`,
      `CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        merchant_txn_ref TEXT NOT NULL UNIQUE,
        provider_txn_no TEXT NULL,
        amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
        currency TEXT NOT NULL DEFAULT 'VND',
        status TEXT NOT NULL CHECK (status IN ('CREATED', 'REDIRECTED', 'SUCCEEDED', 'FAILED', 'LATE_SUCCEEDED', 'EXPIRED')),
        checkout_url TEXT NOT NULL,
        signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
        failure_reason TEXT NULL,
        raw_webhook_summary JSONB NULL,
        paid_at TIMESTAMPTZ NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking ON payment_attempts(booking_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS provider_webhook_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        event_key TEXT NOT NULL UNIQUE,
        merchant_txn_ref TEXT NOT NULL,
        provider_txn_no TEXT NULL,
        signature_valid BOOLEAN NOT NULL,
        payload_json JSONB NOT NULL,
        processing_outcome TEXT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id),
        payment_attempt_id TEXT NOT NULL UNIQUE REFERENCES payment_attempts(id),
        refund_code TEXT NOT NULL UNIQUE,
        amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
        reason_type TEXT NOT NULL CHECK (reason_type IN ('CUSTOMER_CANCEL', 'LATE_PAYMENT_EXPIRED_HOLD', 'ADMIN_CANCEL')),
        reason_note TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_DEFINITE', 'UNKNOWN_NEEDS_RECONCILE')),
        provider_refund_id TEXT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NULL,
        last_error_message TEXT NULL,
        reconciled_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL,
        requested_by TEXT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id)`,
      `CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status)`,
      `CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL CHECK (job_type IN ('PROCESS_REFUND', 'SEND_EMAIL', 'EXPIRE_HOLDS')),
        dedup_key TEXT NOT NULL UNIQUE,
        payload_json JSONB NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'DEAD_LETTER')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ NULL,
        locked_by TEXT NULL,
        last_error TEXT NULL,
        completed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_background_jobs_runnable ON background_jobs(status, next_run_at)`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booking_id TEXT NULL REFERENCES bookings(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('BOOKING_CONFIRMED', 'BOOKING_EXPIRED', 'BOOKING_CANCELLED', 'REFUND_SUCCEEDED', 'REFUND_DELAYED', 'LATE_PAYMENT_REFUND')),
        title_vi TEXT NOT NULL,
        body_vi TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        email_delivery_status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (email_delivery_status IN ('QUEUED', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
        email_sent_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL REFERENCES users(id),
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        summary_vi TEXT NOT NULL,
        before_snapshot JSONB NULL,
        after_snapshot JSONB NULL,
        ip_address TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC)`,
    ],
  },
  {
    version: '002_coupons',
    name: 'Tạo bảng coupons quản lý mã giảm giá và bổ sung cột coupon vào bookings',
    sql: [
      `CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NULL,
        discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
        discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
        min_order_amount_vnd INTEGER NOT NULL DEFAULT 0,
        max_discount_amount_vnd INTEGER NULL,
        usage_limit INTEGER NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        valid_until TIMESTAMPTZ NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`,
      `CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status)`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_id TEXT NULL`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code_snapshot TEXT NULL`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount_vnd INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: '003_price_board_settings',
    name: 'Tạo bảng price_board_settings lưu cấu hình bảng giá thuê sân niêm yết',
    sql: [
      `CREATE TABLE IF NOT EXISTS price_board_settings (
        id TEXT PRIMARY KEY,
        tier_key TEXT NOT NULL UNIQUE,
        day_type TEXT NOT NULL,
        start_hour INTEGER NOT NULL,
        end_hour INTEGER NOT NULL,
        time_label TEXT NOT NULL,
        price_guest_vnd INTEGER NOT NULL,
        price_fixed_vnd INTEGER NOT NULL,
        student_guest_vnd INTEGER NULL,
        student_fixed_vnd INTEGER NULL,
        sub_label TEXT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_price_board_order ON price_board_settings(display_order ASC)`,
    ],
  },
  {
    version: '004_member_tiers',
    name: 'Bổ sung phân hạng hội viên (member_tier) và tổng chi tiêu tích lũy (total_spent_vnd) cho người dùng',
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS member_tier TEXT NOT NULL DEFAULT 'BRONZE' CHECK (member_tier IN ('BRONZE', 'SILVER', 'GOLD'))`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent_vnd INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS member_discount_vnd INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_users_member_tier ON users(member_tier)`,
    ],
  },
  {
    version: '005_equipment_services',
    name: 'Tạo bảng equipment_services lưu danh mục dụng cụ và dịch vụ cho thuê chuẩn e-commerce',
    sql: [
      `CREATE TABLE IF NOT EXISTS equipment_services (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('RENTAL', 'EQUIPMENT', 'BEVERAGE', 'FACILITY')),
        price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
        original_price_vnd INTEGER NULL CHECK (original_price_vnd IS NULL OR original_price_vnd >= 0),
        unit TEXT NOT NULL DEFAULT 'giờ',
        deposit_vnd INTEGER NOT NULL DEFAULT 0 CHECK (deposit_vnd >= 0),
        stock_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (stock_status IN ('AVAILABLE', 'OUT_OF_STOCK', 'MAINTENANCE')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        badge TEXT NULL,
        image_url TEXT NULL,
        description TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_equipment_services_category ON equipment_services(category, sort_order ASC)`,
      `CREATE INDEX IF NOT EXISTS idx_equipment_services_active ON equipment_services(is_active, sort_order ASC)`,
    ],
  },
  {
    version: '006_fixed_bookings_and_newsletter',
    name: 'Tạo bảng fixed_booking_requests lưu yêu cầu đặt sân cố định tháng và newsletter_subscriptions lưu đăng ký nhận tin',
    sql: [
      `CREATE TABLE IF NOT EXISTS fixed_booking_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT NOT NULL UNIQUE,
        user_id TEXT NULL REFERENCES users(id),
        customer_name TEXT NULL,
        contact_phone TEXT NOT NULL,
        fixed_days TEXT NOT NULL,
        fixed_hour TEXT NOT NULL,
        fixed_court TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'CONFIRMED', 'CANCELLED')),
        admin_note TEXT NULL,
        handled_by TEXT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_fixed_booking_requests_status ON fixed_booking_requests(status, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
        id TEXT PRIMARY KEY,
        contact TEXT NOT NULL UNIQUE,
        user_id TEXT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    ],
  },
  {
    version: '007_normalize_operating_hours_05_24',
    name: 'Đồng bộ giờ mở cửa 05:00 - 24:00 (khung giờ đến 23:00) cho toàn bộ cơ sở và 18 sân',
    sql: [
      `UPDATE centers SET open_hour = 5, close_hour = 24 WHERE open_hour > 5 OR close_hour < 24`,
      `UPDATE courts SET open_hour = 5, close_hour = 24 WHERE open_hour > 5 OR close_hour < 24`,
    ],
  },
  {
    version: '008_create_news_articles_table',
    name: 'Tạo bảng news_articles quản lý bài viết tin tức trực tiếp từ Admin Dashboard',
    sql: [
      `CREATE TABLE IF NOT EXISTS news_articles (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        badge_tone TEXT NOT NULL DEFAULT 'blue' CHECK (badge_tone IN ('red', 'blue', 'green', 'amber')),
        cover_image TEXT NOT NULL,
        image_alt TEXT NULL,
        cover_fit TEXT NOT NULL DEFAULT 'cover',
        content_html TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        author_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_news_articles_slug ON news_articles(slug)`,
      `CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(is_published, published_at DESC)`,
      `INSERT INTO news_articles (id, slug, title, summary, category, badge_tone, cover_image, image_alt, cover_fit, content_html, is_published, published_at, created_at, updated_at)
       VALUES
       (
         'news_seed_1',
         'le-2-9-be-badminton-hoat-dong-xuyen-le',
         'Lễ 2/9 – Be Badminton Vẫn Mở Cửa Hoạt Động Bình Thường Xuyên Lễ!',
         'Kỳ nghỉ lễ Quốc khánh 2/9 này, nếu chưa biết đi đâu thì xách vợt lên và đến Be Badminton thôi! Cụm 18 sân tiêu chuẩn thi đấu tại 262/1 Quang Trung mở cửa phục vụ xuyên suốt từ 06:00 – 24:00 hàng ngày đón các lông thủ.',
         'Thông báo hoạt động',
         'red',
         '/public/images/news-le-2-9.jpg',
         'Thông báo hoạt động Lễ 2/9 tại Hệ thống Sân Cầu Lông Be Badminton Gò Vấp',
         'cover',
         '<p class="body-text" style="font-size: 17px; line-height: 1.7; margin-bottom: 20px;">🇻🇳 <strong>LỄ 2/9 – BE BADMINTON VẪN MỞ CỬA HOẠT ĐỘNG BÌNH THƯỜNG!</strong> 🏸</p><p class="body-text" style="margin-bottom: 18px;">Kỳ nghỉ lễ Quốc khánh 2/9 này, nếu bạn và hội bạn bè, đồng nghiệp vẫn chưa biết đi đâu chơi xa thì hãy <strong>xách vợt lên và đến Be Badminton thôi!</strong> 😎 Một buổi giao lưu cầu lông sôi động vừa giúp xả stress, duy trì phong độ thể lực, vừa tạo cơ hội gắn kết tuyệt vời cùng đồng đội.</p><div style="background: #f8fafc; border-left: 4px solid #0052ff; border-radius: 0 12px 12px 0; padding: 20px 24px; margin: 24px 0;"><h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display:flex; align-items:center; gap:8px;">📌 THÔNG TIN HOẠT ĐỘNG XUYÊN LỄ TẠI BE BADMINTON</h3><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; font-size:15px; color:#334155;"><li>⏰ <strong>Khung giờ phục vụ:</strong> Mở cửa liên tục từ <strong>06:00 sáng đến 24:00 đêm</strong> tất cả các ngày trong kỳ nghỉ lễ.</li><li>📍 <strong>Địa chỉ cụm sân:</strong> 262/1 Quang Trung, Phường 10, Quận Gò Vấp, TP. Hồ Chí Minh.</li><li>☎️ <strong>Hotline / Zalo hỗ trợ:</strong> <strong>077 333 3371</strong></li><li>🏸 <strong>Quy mô sân bãi:</strong> Tổ hợp 18 sân thảm PVC xanh ngọc bích chuẩn thi đấu quốc tế, trần cao 13m thoáng đãng, hệ thống rèm bạt đen và đèn LED chống chói mắt tuyệt đối.</li><li>🚗 <strong>Bãi giữ xe:</strong> Khu vực đậu xe rộng rãi, thuận tiện cho cả xe máy và ô tô.</li><li>🥤 <strong>Tiện ích đi kèm:</strong> Quầy nước giải khát, khu vực khởi động giãn cơ & tập tạ miễn phí, ghế băng dài nghỉ ngơi có giá đỡ quay video trận đấu.</li></ul></div><p class="body-text" style="margin-bottom: 18px;">Các khung giờ \"giờ vàng\" buổi sáng và chiều tối ngày nghỉ lễ thường được khách hàng và các câu lạc bộ đặt rất sớm. Quý khách vui lòng tra cứu lịch trống trực tuyến trên hệ thống để chọn đúng sân yêu thích và giữ chỗ kịp thời.</p><p class="body-text" style="margin-bottom: 24px;">Kính chúc toàn thể Quý khách hàng, Quý hội viên và cộng đồng đam mê cầu lông có một kỳ nghỉ lễ Quốc khánh 2/9 thật nhiều niềm vui, sức khỏe và những trận cầu bùng nổ thăng hoa! 🎉</p>',
         TRUE,
         '2026-08-29 08:00:00+07',
         NOW(),
         NOW()
       ),
       (
         'news_seed_2',
         'be-badminton-tim-dong-doi-tuyen-dung',
         'Be Badminton tìm đồng đội – Tuyển nhân viên phục vụ & tư vấn',
         'Be Badminton tuyển nhân viên phục vụ tại Gò Vấp và nhân viên tư vấn tại Bình Thạnh, với ba ca làm việc linh hoạt, môi trường thể thao năng động.',
         'Tuyển dụng',
         'amber',
         '/public/images/news-tuyen-dung.jpg',
         'Thông báo Be Badminton tìm đồng đội – tuyển nhân viên phục vụ',
         'contain',
         '<p>Be Badminton đăng tin tuyển nhân viên phục vụ nam tại 262 Quang Trung, Phường 10, Gò Vấp và nhân viên tư vấn tại 327/7a Nơ Trang Long, Phường 25, Bình Thạnh.</p><h2 class=\"headline-sm\">Ca làm việc theo bài đăng</h2><ul><li>Ca 1: 06:00 – 12:00.</li><li>Ca 2: 12:00 – 18:00.</li><li>Ca 3: 18:00 – 24:00.</li><li>Mỗi tuần nghỉ một ngày, không nghỉ Thứ Bảy và Chủ Nhật.</li></ul><h2 class=\"headline-sm\">Cách ứng tuyển</h2><p>Ứng viên gửi CV đến <a href=\"mailto:tuyendung.becaulong@gmail.com\">tuyendung.becaulong@gmail.com</a>, ghi rõ vị trí ứng tuyển.</p><p class=\"news-archive-note\">Vui lòng liên hệ bộ phận nhân sự để xác nhận vị trí còn nhận hồ sơ.</p>',
         TRUE,
         '2026-05-27 09:00:00+07',
         NOW(),
         NOW()
       ),
       (
         'news_seed_3',
         'uu-dai-le-30-4-1-5-be-badminton',
         'Lễ 30/4 – 1/5: Be Badminton mở cửa, không tăng giá',
         'Chương trình chơi 1 giờ tặng 1 giờ, giá từ 50.000đ/giờ trong khung 06:00 – 18:00. Giữ nguyên giá ngày thường cho toàn thể hội viên.',
         'Ưu đãi dịp lễ',
         'red',
         '/public/images/news-le-30-4-1-5.jpg',
         'Ưu đãi dịp lễ 30/4 – 1/5: không tăng giá, chơi 1 giờ tặng 1 giờ từ 50K/giờ',
         'contain',
         '<p>Be Badminton thông báo vẫn phục vụ xuyên suốt kỳ nghỉ lễ và giữ nguyên giá như ngày thường.</p><h2 class=\"headline-sm\">Nội dung chương trình</h2><ul><li>Không nghỉ lễ, không tăng giá.</li><li>Chơi một giờ, tặng một giờ; giá chỉ từ 50.000đ/giờ.</li><li>Khung giờ áp dụng: 06:00 – 18:00.</li></ul><p>Địa chỉ: 262/1 Quang Trung, Phường 10, Gò Vấp. Hotline và Zalo: <a href=\"tel:0773333371\">0773 333 371</a>.</p>',
         TRUE,
         '2026-04-27 10:00:00+07',
         NOW(),
         NOW()
       )
       ON CONFLICT (slug) DO NOTHING`
    ],
  },
  {
    version: '009_add_booking_counter_dispatch_fields',
    name: 'Bổ sung các trường quản lý dụng cụ thuê, cọc quầy và ghi chú điều phối vào bảng bookings',
    sql: [
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS equipment_rented_summary TEXT NULL`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS equipment_deposit_vnd INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_refunded BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_refunded_at TIMESTAMPTZ NULL`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_refunded_by TEXT NULL REFERENCES users(id)`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS counter_note TEXT NULL`,
    ],
  },
  {
    version: '010_add_coupon_user_limit_and_public_suggestion',
    name: 'Bổ sung giới hạn lượt dùng mỗi tài khoản (max_uses_per_user) và hiển thị gợi ý (is_public_suggested) cho bảng coupons',
    sql: [
      `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses_per_user INTEGER NULL`,
      `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_public_suggested BOOLEAN NOT NULL DEFAULT TRUE`,
    ],
  },
  {
    version: '011_add_shift_handovers_and_customer_reviews',
    name: 'Tạo bảng shift_handovers (Biên bản bàn giao ca nhân sự) và customer_reviews (Quản lý đánh giá khách hàng)',
    sql: [
      `CREATE TABLE IF NOT EXISTS shift_handovers (
        id TEXT PRIMARY KEY,
        shift_date TEXT NOT NULL,
        shift_name TEXT NOT NULL,
        staff_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
        staff_name_snapshot TEXT NOT NULL,
        total_checkin_count INTEGER NOT NULL DEFAULT 0,
        walkin_collected_vnd INTEGER NOT NULL DEFAULT 0,
        pos_addon_collected_vnd INTEGER NOT NULL DEFAULT 0,
        deposit_holding_vnd INTEGER NOT NULL DEFAULT 0,
        deposit_refunded_vnd INTEGER NOT NULL DEFAULT 0,
        cash_in_drawer_vnd INTEGER NOT NULL DEFAULT 0,
        handover_note TEXT NULL,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'VERIFIED')),
        verified_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
        verified_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_shift_handovers_date ON shift_handovers(shift_date DESC, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS customer_reviews (
        id TEXT PRIMARY KEY,
        author_name TEXT NOT NULL,
        author_initials TEXT NOT NULL,
        author_avatar TEXT NULL,
        profile_url TEXT NULL,
        rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
        comment_text TEXT NOT NULL,
        owner_reply TEXT NULL,
        owner_replied_at TIMESTAMPTZ NULL,
        source_label TEXT NOT NULL DEFAULT 'Google Maps',
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `INSERT INTO customer_reviews (
        id, author_name, author_initials, author_avatar, profile_url, rating, comment_text, owner_reply, owner_replied_at, source_label, is_visible
      ) VALUES
      (
        'rev-seed-1',
        'Nam Bùi Hoài',
        'NH',
        'https://lh3.googleusercontent.com/a/ACg8ocJWmjNcdnNt0z9vxiAITtDeGR_BiskdxM6LabtYsYKBQkwq8Q=w45-h45-p-rp-mo-br100',
        'https://www.google.com/maps/contrib/108975803908029768254/reviews?hl=vi',
        5,
        'Nhân viên nhiệt tình. Mình ghé sân rất nhiều lần các bạn đều rất vui vẻ. Sân xịn giá cả hợp lý',
        'Cảm ơn bạn Nam đã luôn tin tưởng và ủng hộ cụm 18 sân Be Badminton Gò Vấp! Chúc bạn luôn có những pha cầu thật cháy nhé! 🏸',
        NOW(),
        'Google Maps',
        TRUE
      ),
      (
        'rev-seed-2',
        'Trần Bảo Anh Khoa',
        'AK',
        'https://lh3.googleusercontent.com/a/ACg8ocLkytTDT4um2E6KOSyevJr1F3j_C9KjmwjPTrrWFM4uApo4RA=w45-h45-p-rp-mo-br100',
        'https://www.google.com/maps/contrib/106210544608304925303/reviews?hl=vi',
        5,
        'sân sạch sẽ, thoáng mát nhân viên cực kỳ cực kỳ dễ thương, hoạt bát',
        'Be Badminton cảm ơn đánh giá 5 sao của bạn Anh Khoa! Đội ngũ nhân sự tại quầy luôn sẵn sàng phục vụ bạn chu đáo nhất.',
        NOW(),
        'Google Maps',
        TRUE
      ),
      (
        'rev-seed-3',
        'Tan Dao',
        'TD',
        'https://lh3.googleusercontent.com/a/ACg8ocLi0E_D3wImDqbje9lWnymKLiduEFUgUiqpvmBBF7zYW3ZIGQ=w45-h45-p-rp-mo-br100',
        'https://www.google.com/maps/contrib/101957999520718088297/reviews?hl=vi',
        5,
        'Sân cầu sạch sẽ ,nhân viên tận tâm ,vui vẻ',
        NULL,
        NULL,
        'Google Maps',
        TRUE
      ),
      (
        'rev-seed-4',
        'Thư Nguyễn Đăng',
        'TĐ',
        'https://lh3.googleusercontent.com/a/ACg8ocLfCXx3cViqtl_8gwmfEa3BnzIQGD8cdvwSLuj51s7JzCQ-NA=w45-h45-p-rp-mo-br100',
        'https://www.google.com/maps/contrib/118352000871804505620/reviews?hl=vi',
        5,
        'Sân nhiệt tình rộng',
        NULL,
        NULL,
        'Google Maps',
        TRUE
      )
      ON CONFLICT (id) DO NOTHING`,
    ],
  },
  {
    version: '012_apply_real_be_badminton_court_images',
    name: 'Cập nhật 3 ảnh thực tế Be Badminton Gò Vấp chuẩn thi đấu cho toàn bộ 18 sân',
    sql: [
      `DELETE FROM court_images`,
      `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
       SELECT
         'img-' || id || '-1',
         id,
         '/public/images/courts/be-badminton-court-1.jpg',
         'Chính diện sân thi đấu thảm PVC 5 lớp Be Badminton Gò Vấp',
         TRUE,
         1
       FROM courts`,
      `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
       SELECT
         'img-' || id || '-2',
         id,
         '/public/images/courts/be-badminton-court-2.jpg',
         'Góc nghiêng sân, ghế chờ vận động viên & bảng hiệu ShopVNB',
         FALSE,
         2
       FROM courts`,
      `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
       SELECT
         'img-' || id || '-3',
         id,
         '/public/images/courts/be-badminton-court-3.jpg',
         'Toàn cảnh cụm 18 sân thi đấu, trần cao 13m & hệ thống đèn LED chống chói',
         FALSE,
         3
       FROM courts`,
    ],
  },
  {
    version: '013_equipment_inventory',
    name: 'Tồn kho và sổ giao dịch dụng cụ',
    sql: [
      `ALTER TABLE equipment_services ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0)`,
      `CREATE TABLE equipment_movements (
        id TEXT PRIMARY KEY, equipment_id TEXT NOT NULL REFERENCES equipment_services(id),
        booking_id TEXT REFERENCES bookings(id) DEFERRABLE INITIALLY DEFERRED,
        kind TEXT NOT NULL CHECK(kind IN ('RENTAL','SALE')), quantity INTEGER NOT NULL CHECK(quantity > 0),
        state TEXT NOT NULL CHECK(state IN ('RESERVED','ISSUED','RETURNED','RELEASED')),
        reference TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE equipment_stock_adjustments (id TEXT PRIMARY KEY, equipment_id TEXT NOT NULL REFERENCES equipment_services(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE FUNCTION release_booking_equipment() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.booking_status IN ('CANCELLED','EXPIRED') AND OLD.booking_status IS DISTINCT FROM NEW.booking_status THEN
          WITH released AS (UPDATE equipment_movements SET state='RELEASED' WHERE booking_id=NEW.id AND state='RESERVED' RETURNING equipment_id,quantity),
          totals AS (SELECT equipment_id,SUM(quantity)::integer AS qty FROM released GROUP BY equipment_id)
          UPDATE equipment_services e SET stock_quantity=e.stock_quantity+t.qty FROM totals t WHERE e.id=t.equipment_id;
        ELSIF NEW.booking_status='CHECKED_IN' THEN
          UPDATE equipment_movements SET state='ISSUED' WHERE booking_id=NEW.id AND state='RESERVED';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`,
      `CREATE TRIGGER booking_equipment_lifecycle AFTER UPDATE OF booking_status ON bookings FOR EACH ROW EXECUTE FUNCTION release_booking_equipment()`
    ]
  },
  {
    version: '014_fixed_schedule_and_counter_refund',
    name: 'Khóa lịch cố định tháng qua court_blocks và hoàn tiền tại quầy theo mức %',
    sql: [
      `ALTER TABLE court_blocks ADD COLUMN IF NOT EXISTS block_type TEXT NOT NULL DEFAULT 'MAINTENANCE'
        CHECK (block_type IN ('MAINTENANCE', 'FIXED_MONTHLY'))`,
      `ALTER TABLE court_blocks ADD COLUMN IF NOT EXISTS fixed_request_id TEXT NULL REFERENCES fixed_booking_requests(id)`,
      `CREATE INDEX IF NOT EXISTS idx_court_blocks_fixed ON court_blocks(fixed_request_id)`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS weekdays TEXT NULL`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS start_hour INTEGER NULL`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS duration_hours INTEGER NULL`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS start_date TEXT NULL`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS end_date TEXT NULL`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS court_id TEXT NULL REFERENCES courts(id)`,
      `ALTER TABLE fixed_booking_requests ADD COLUMN IF NOT EXISTS locked_slot_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_reason_type_check`,
      `ALTER TABLE refunds ADD CONSTRAINT refunds_reason_type_check
        CHECK (reason_type IN ('CUSTOMER_CANCEL', 'LATE_PAYMENT_EXPIRED_HOLD', 'ADMIN_CANCEL', 'COUNTER_REFUND'))`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_method TEXT NOT NULL DEFAULT 'ORIGINAL_METHOD'
        CHECK (refund_method IN ('ORIGINAL_METHOD', 'CASH'))`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_rate_pct INTEGER NULL`,
    ],
  },
  {
    version: '015_user_profile',
    name: 'Avatar and personal profile',
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NULL`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT NULL`,
    ],
  }
,
  {
    version: '016_multi_ticket_cart',
    name: 'Payment groups, independent tickets and partial refunds',
    sql: [
      `CREATE TABLE payment_groups (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
        idempotency_key TEXT NOT NULL, slots_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'HOLD' CHECK(status IN ('HOLD','PENDING','PAID','EXPIRED','LATE_PAID')),
        total_amount_vnd INTEGER NOT NULL DEFAULT 0, coupon_code TEXT NULL,
        hold_expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id,idempotency_key))`,
      `CREATE TABLE booking_tickets (
        id TEXT PRIMARY KEY, payment_group_id TEXT NOT NULL REFERENCES payment_groups(id),
        primary_booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
        paid_amount_vnd INTEGER NOT NULL DEFAULT 0)`,
      `ALTER TABLE bookings ADD COLUMN ticket_id TEXT NULL REFERENCES booking_tickets(id)`,
      `ALTER TABLE bookings ADD COLUMN is_ticket_component BOOLEAN NOT NULL DEFAULT FALSE`,
      `CREATE INDEX idx_bookings_ticket ON bookings(ticket_id)`,
      `ALTER TABLE bookings DROP CONSTRAINT bookings_check`,
      `ALTER TABLE bookings ADD CONSTRAINT bookings_duration CHECK(end_hour > start_hour AND end_hour <= 24)`,
      `ALTER TABLE payment_attempts ADD COLUMN payment_group_id TEXT NULL REFERENCES payment_groups(id)`,
      `CREATE INDEX idx_attempts_group ON payment_attempts(payment_group_id)`,
      `ALTER TABLE refunds DROP CONSTRAINT refunds_payment_attempt_id_key`,
      `CREATE UNIQUE INDEX idx_refund_attempt_booking ON refunds(payment_attempt_id,booking_id)`,
      `CREATE FUNCTION sync_ticket_slots() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.ticket_id IS NOT NULL AND NOT NEW.is_ticket_component THEN
          UPDATE bookings SET booking_status=NEW.booking_status,payment_status=NEW.payment_status,
            hold_expires_at=NEW.hold_expires_at,confirmed_at=NEW.confirmed_at,
            checked_in_at=NEW.checked_in_at,checked_in_by=NEW.checked_in_by,
            completed_at=NEW.completed_at,completed_by=NEW.completed_by,
            cancelled_at=NEW.cancelled_at,cancelled_by=NEW.cancelled_by,cancel_reason=NEW.cancel_reason,
            expired_at=NEW.expired_at,court_id=NEW.court_id,court_name_snapshot=NEW.court_name_snapshot,contact_name=NEW.contact_name,contact_phone=NEW.contact_phone,
            contact_email=NEW.contact_email,updated_at=NEW.updated_at
          WHERE ticket_id=NEW.ticket_id AND is_ticket_component;
        END IF; RETURN NEW; END $$`,
      `CREATE TRIGGER sync_ticket_slots AFTER UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION sync_ticket_slots()`,
      `CREATE FUNCTION guard_refund_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE collected INTEGER; reserved BIGINT; BEGIN
          SELECT amount_vnd INTO collected FROM payment_attempts WHERE id=NEW.payment_attempt_id FOR UPDATE;
          SELECT COALESCE(SUM(amount_vnd),0) INTO reserved FROM refunds
            WHERE payment_attempt_id=NEW.payment_attempt_id AND id<>NEW.id;
          IF reserved+NEW.amount_vnd > collected THEN RAISE EXCEPTION 'Refund exceeds collected amount'; END IF;
          RETURN NEW;
        END $$`,
      `CREATE TRIGGER guard_refund_total BEFORE INSERT OR UPDATE OF amount_vnd ON refunds FOR EACH ROW EXECUTE FUNCTION guard_refund_total()`,
    ],
  },
  {
    version: '017_anti_money_laundering_sender_bank_info',
    name: 'Add sender bank account details to payment attempts and destination bank details to refunds for manual refund and AML compliance',
    sql: [
      `ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS sender_bank_code TEXT NULL`,
      `ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS sender_bank_name TEXT NULL`,
      `ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS sender_account_no TEXT NULL`,
      `ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS sender_account_name TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS destination_bank_code TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS destination_bank_name TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS destination_account_no TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS destination_account_name TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS is_manual_refund BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS manual_txn_ref TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS manual_refund_note TEXT NULL`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS manual_refunded_by TEXT NULL REFERENCES users(id)`,
      `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS manual_refunded_at TIMESTAMPTZ NULL`,
    ],
  },
  {
    version: '018_unit_hour_to_session',
    name: 'Chuyển đơn vị tính giờ thành ca chơi cho các dịch vụ và dụng cụ',
    sql: [
      `UPDATE equipment_services SET unit = 'cây / ca chơi' WHERE LOWER(unit) = 'cây / giờ'`,
      `UPDATE equipment_services SET unit = 'đôi / ca chơi' WHERE LOWER(unit) = 'đôi / giờ'`,
      `UPDATE equipment_services SET unit = 'ca chơi' WHERE LOWER(unit) = 'giờ'`,
    ],
  },
];

export async function runMigrations(db: DatabaseClient = getDb()): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedRes = await db.query<{ version: string }>(`SELECT version FROM schema_migrations`);
  const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue;

    await db.withTransaction(async (tx) => {
      for (const stmt of migration.sql) {
        await tx.query(stmt);
      }
      await tx.query(
        `INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW())`,
        [migration.version, migration.name]
      );
    });

    logger.info('DB_MIGRATION_APPLIED', `Đã áp dụng migration ${migration.version}: ${migration.name}`);
  }
}
