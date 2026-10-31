import { DatabaseClient, getDb } from './client.js';
import { config } from '../config/env.js';
import { hashPassword } from '../utils/security.js';
import { logger } from '../utils/logger.js';

interface SeedHashes {
  admin: string;
  staff: string;
  customer: string;
  demo: string;
}

let cachedSeedHashes: SeedHashes | null = null;

function getSeedPasswordHashes(): SeedHashes {
  if (!cachedSeedHashes) {
    cachedSeedHashes = {
      admin: hashPassword('Admin@CourtGo2026'),
      staff: hashPassword('Staff@CourtGo2026'),
      customer: hashPassword('KhachHang@2026'),
      demo: hashPassword('123456'),
    };
  }
  return cachedSeedHashes;
}

const BE_BADMINTON_COURTS = Array.from({ length: 18 }, (_, i) => {
  const num = i + 1;
  const pad = String(num).padStart(2, '0');
  const imgIdx = ((num - 1) % 6) + 1;
  return {
    id: `court-${pad}`,
    code: `SAN-${pad}`,
    name: `Sân ${num}`,
    courtType: 'Sân thảm tiêu chuẩn Be Badminton',
    surfaceDesc: 'Thảm PVC xanh ngọc chuyên dụng chống trơn trượt, độ bám cao',
    lightingDesc: 'Đèn LED chiếu sáng dọc hai biên kèm rèm bạt đen chống chói mắt trần 13m',
    description:
      'Sân cầu lông tiêu chuẩn thuộc tổ hợp 18 sân Be Badminton Gò Vấp (262/1 Quang Trung). Trang bị thảm PVC xanh ngọc, trần cao 13m, rèm đen chống chói, ghế băng dài, giá đỡ điện thoại quay clip và khu khởi động giãn cơ.',
    usageNotes:
      'Bắt buộc mang giày cầu lông chuyên dụng đế kếp sạch. Có mặt tại quầy lễ tân trước 5–10 phút để nhận sân.',
    basePrice: 120000,
    weekdayMorning: 120000,
    weekdayDay: 100000,
    weekdayPeak: 140000,
    weekdayNight: 120000,
    weekendPrice: 130000,
    imageUrl: `/public/images/courts/san-0${imgIdx}.jpg`,
    imageCaption: `Ảnh thực tế Sân ${num} tại Be Badminton Gò Vấp (262/1 Quang Trung)`,
    amenities: [
      'Thảm PVC xanh ngọc chuẩn thi đấu',
      'Rèm đen chống chói trần 13m',
      'Giá đỡ điện thoại quay clip',
      'Ghế băng dài & bàn ngồi',
      'Khu khởi động & giãn cơ miễn phí',
    ],
    sortOrder: num,
  };
});

export async function seedDatabaseIfNeeded(db: DatabaseClient = getDb()): Promise<void> {
  if (config.nodeEnv === 'production' || !config.allowSeedData) {
    return;
  }

  const centerRes = await db.query<{ id: string; slug: string }>(`SELECT id, slug FROM centers LIMIT 1`);
  const courtCountRes = await db.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM courts`);
  const courtCount = Number(courtCountRes.rows[0]?.cnt || '0');
  if (
    centerRes.rows.length > 0 &&
    centerRes.rows[0].slug === 'be-badminton-go-vap' &&
    courtCount >= 18
  ) {
    await db.query(`UPDATE centers SET max_active_holds_per_user = GREATEST(max_active_holds_per_user, 18)`);
    await syncTestUsers(db);
    await seedInitialCoupons(db);
    await seedInitialPriceBoard(db);
    await seedMemberTiers(db);
    await seedEquipmentServices(db);
    return;
  }

  const isUpgradeFromLegacySeed = centerRes.rows.length > 0;
  logger.info(
    'DB_SEED_START',
    isUpgradeFromLegacySeed
      ? 'Cập nhật dữ liệu trung tâm, hình ảnh và bảng giá chuẩn theo hệ thống Be Badminton (262/1 Quang Trung, Gò Vấp)...'
      : 'Khởi tạo dữ liệu cơ sở Be Badminton cho môi trường phát triển/kiểm thử...'
  );

  await db.withTransaction(async (tx) => {
    const centerId = 'center-courtgo-01';
    const centerName = 'Hệ thống Sân Cầu Lông Be Badminton — Cơ sở Gò Vấp';
    const centerAddress = '262/1 Đường Quang Trung, Phường 10';
    const centerDistrict = 'Quận Gò Vấp';
    const centerCity = 'TP. Hồ Chí Minh';
    const centerPhone = '0773 333 371';
    const centerEmail = 'hotro@bebadminton.vn';
    const centerDesc =
      'Tổ hợp 18 sân cầu lông tiêu chuẩn tại 262/1 Quang Trung, Phường 10, Quận Gò Vấp (quẹo phải hẻm 262 nằm ngay bên tay phải). Trần cao 13m thoáng mát, thảm PVC xanh ngọc chống trượt, rèm bạt đen chống chói giữa các dãy sân, trang bị băng ghế dài, giá đỡ điện thoại quay pha cầu đẹp, khu khởi động – giãn cơ, bàn bi lắc và phòng tắm nước nóng đầy đủ sữa tắm, dầu gội, máy sấy tóc.';

    if (isUpgradeFromLegacySeed) {
      await tx.query(
        `UPDATE centers
         SET slug = 'be-badminton-go-vap',
             name = $2,
             address = $3,
             district = $4,
             city = $5,
             phone = $6,
             email = $7,
             open_hour = 5,
             close_hour = 24,
             description = $8,
             updated_at = NOW()
         WHERE id = $1`,
        [centerId, centerName, centerAddress, centerDistrict, centerCity, centerPhone, centerEmail, centerDesc]
      );
    } else {
      await tx.query(
        `INSERT INTO centers (
          id, slug, name, address, district, city, phone, email,
          open_hour, close_hour, timezone, description,
          cancellation_policy_version, cancellation_min_hours, hold_duration_seconds, max_active_holds_per_user
        ) VALUES ($1, 'be-badminton-go-vap', $2, $3, $4, $5, $6, $7, 5, 24, 'Asia/Ho_Chi_Minh', $8, 'v1-12h-100pct', 12, 300, 18)`,
        [centerId, centerName, centerAddress, centerDistrict, centerCity, centerPhone, centerEmail, centerDesc]
      );
    }

    for (const c of BE_BADMINTON_COURTS) {
      await tx.query(
        `INSERT INTO courts (
          id, center_id, code, name, court_type, surface_desc, lighting_desc,
          description, usage_notes, status, open_hour, close_hour, base_price_vnd, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', 5, 24, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          court_type = EXCLUDED.court_type,
          surface_desc = EXCLUDED.surface_desc,
          lighting_desc = EXCLUDED.lighting_desc,
          description = EXCLUDED.description,
          usage_notes = EXCLUDED.usage_notes,
          open_hour = EXCLUDED.open_hour,
          close_hour = EXCLUDED.close_hour,
          base_price_vnd = EXCLUDED.base_price_vnd,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()`,
        [
          c.id,
          centerId,
          c.code,
          c.name,
          c.courtType,
          c.surfaceDesc,
          c.lightingDesc,
          c.description,
          c.usageNotes,
          c.basePrice,
          c.sortOrder,
        ]
      );

      await tx.query(`DELETE FROM court_images WHERE court_id = $1`, [c.id]);
      await tx.query(
        `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
         VALUES
           ($1, $2, '/public/images/courts/be-badminton-court-1.jpg', 'Chính diện sân thi đấu thảm PVC 5 lớp Be Badminton Gò Vấp', TRUE, 1),
           ($3, $2, '/public/images/courts/be-badminton-court-2.jpg', 'Góc nghiêng sân, ghế chờ vận động viên & bảng hiệu ShopVNB', FALSE, 2),
           ($4, $2, '/public/images/courts/be-badminton-court-3.jpg', 'Toàn cảnh cụm 18 sân thi đấu, trần cao 13m & đèn LED chống chói', FALSE, 3)`,
        [`img-${c.id}-1`, c.id, `img-${c.id}-2`, `img-${c.id}-3`]
      );

      await tx.query(`DELETE FROM court_amenities WHERE court_id = $1`, [c.id]);
      for (let i = 0; i < c.amenities.length; i++) {
        await tx.query(
          `INSERT INTO court_amenities (id, court_id, name, icon_symbol, sort_order)
           VALUES ($1, $2, $3, '■', $4)`,
          [`am-${c.id}-${i + 1}`, c.id, c.amenities[i], i + 1]
        );
      }

      // Bảng giá chính thức của Be Badminton (Áp dụng theo bảng giá niêm yết tại 262/1 Quang Trung, P.10, Gò Vấp):
      // - Thứ 2 – Thứ 6 (05:00 – 09:00): Vãng lai 120.000 ₫/giờ (Cố định 110.000 ₫/giờ)
      // - Thứ 2 – Thứ 6 (09:00 – 17:00): Vãng lai 100.000 ₫/giờ (Cố định 90.000 ₫/giờ · HS/SV: 80–90k)
      // - Thứ 2 – Thứ 6 Cao điểm (17:00 – 22:00): Vãng lai 140.000 ₫/giờ (Cố định 130.000 ₫/giờ)
      // - Thứ 2 – Thứ 6 Khung đêm (22:00 – 24:00): Vãng lai 120.000 ₫/giờ (Cố định 110.000 ₫/giờ)
      // - Thứ 7, Chủ Nhật & Ngày Lễ (05:00 – 24:00): Đồng giá 130.000 ₫/giờ
      await tx.query(`DELETE FROM pricing_rules WHERE court_id = $1`, [c.id]);
      const rules = [
        {
          id: `pr-${c.id}-wd-morning`,
          dayType: 'WEEKDAY',
          startHour: 5,
          endHour: 9,
          priceVnd: c.weekdayMorning,
          label: 'Thứ 2 – Thứ 6 Sáng (05:00 – 09:00 · Cố định 110k)',
        },
        {
          id: `pr-${c.id}-wd-day`,
          dayType: 'WEEKDAY',
          startHour: 9,
          endHour: 17,
          priceVnd: c.weekdayDay,
          label: 'Thứ 2 – Thứ 6 Ban ngày (09:00 – 17:00 · Cố định 90k)',
        },
        {
          id: `pr-${c.id}-wd-peak`,
          dayType: 'WEEKDAY',
          startHour: 17,
          endHour: 22,
          priceVnd: c.weekdayPeak,
          label: 'Thứ 2 – Thứ 6 Giờ vàng (17:00 – 22:00 · Cố định 130k)',
        },
        {
          id: `pr-${c.id}-wd-night`,
          dayType: 'WEEKDAY',
          startHour: 22,
          endHour: 24,
          priceVnd: c.weekdayNight,
          label: 'Thứ 2 – Thứ 6 Đêm (22:00 – 24:00 · Cố định 110k)',
        },
        {
          id: `pr-${c.id}-weekend`,
          dayType: 'WEEKEND',
          startHour: 5,
          endHour: 24,
          priceVnd: c.weekendPrice,
          label: 'Thứ 7, Chủ Nhật & Lễ (Cả ngày 05:00 – 24:00)',
        },
      ];

      for (const r of rules) {
        await tx.query(
          `INSERT INTO pricing_rules (id, court_id, day_type, start_hour, end_hour, price_vnd, label, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
          [r.id, c.id, r.dayType, r.startHour, r.endHour, r.priceVnd, r.label]
        );
      }
    }

    if (!isUpgradeFromLegacySeed) {
      const hashes = getSeedPasswordHashes();
      await tx.query(
        `INSERT INTO users (id, email, password_hash, full_name, phone, role, status, email_verified_at, mfa_enabled, mfa_secret)
         VALUES
         ('user-admin-01', 'khang@gmail.com', $1, 'Vũ Đình Khang', '0901000111', 'ADMIN', 'ACTIVE', NOW(), TRUE, 'COURTGO-ADMIN-MFA-SECRET-2026'),
         ('user-staff-01', 'luong@gmail.com', $2, 'Quách Khánh Lương', '0901000222', 'STAFF', 'ACTIVE', NOW(), FALSE, NULL),
         ('user-cust-01', 'huy@gmail.com', $3, 'Huỳnh Quốc Huy', '0908123456', 'CUSTOMER', 'ACTIVE', NOW(), FALSE, NULL)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [hashes.admin, hashes.staff, hashes.customer]
      );
    }
  });

  await syncTestUsers(db);
  await seedInitialCoupons(db);
  await seedInitialPriceBoard(db);
  await seedMemberTiers(db);
  await seedEquipmentServices(db);

  logger.info('DB_SEED_COMPLETED', 'Đã khởi tạo dữ liệu chuẩn Be Badminton (262/1 Quang Trung, Gò Vấp).');
}

async function syncTestUsers(db: DatabaseClient): Promise<void> {
  const hashes = getSeedPasswordHashes();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, phone, role, status, email_verified_at, mfa_enabled, mfa_secret)
     VALUES
     ('user-admin-01', 'quanly@courtgo.vn', $1, 'Nguyễn Quản Trị', '0901999888', 'ADMIN', 'ACTIVE', NOW(), TRUE, 'COURTGO-ADMIN-MFA-SECRET-2026'),
     ('user-staff-01', 'vanhanh@courtgo.vn', $2, 'Trần Điều Phối', '0901888999', 'STAFF', 'ACTIVE', NOW(), FALSE, NULL),
     ('user-cust-01', 'khachhang@courtgo.vn', $3, 'Lê Minh Tuấn', '0908888999', 'CUSTOMER', 'ACTIVE', NOW(), FALSE, NULL),
     ('user-cust-02', 'ngoclan@courtgo.vn', $3, 'Phạm Ngọc Lan', '0908777666', 'CUSTOMER', 'ACTIVE', NOW(), FALSE, NULL),
     ('user-admin-demo', 'khang@gmail.com', $4, 'Vũ Đình Khang', '0901000111', 'ADMIN', 'ACTIVE', NOW(), TRUE, 'COURTGO-ADMIN-MFA-SECRET-2026'),
     ('user-staff-demo', 'luong@gmail.com', $4, 'Quách Khánh Lương', '0901000222', 'STAFF', 'ACTIVE', NOW(), FALSE, NULL),
     ('user-cust-demo', 'huy@gmail.com', $4, 'Huỳnh Quốc Huy', '0908123456', 'CUSTOMER', 'ACTIVE', NOW(), FALSE, NULL)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       phone = EXCLUDED.phone,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [hashes.admin, hashes.staff, hashes.customer, hashes.demo]
  );
}

async function seedInitialPriceBoard(db: DatabaseClient): Promise<void> {
  const tiers = [
    {
      id: 'tier-wd-morning',
      tierKey: 'wd_morning',
      dayType: 'WEEKDAY',
      startHour: 5,
      endHour: 9,
      timeLabel: '05:00 - 09:00',
      priceGuestVnd: 120000,
      priceFixedVnd: 110000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: null,
      displayOrder: 1,
    },
    {
      id: 'tier-wd-day',
      tierKey: 'wd_day',
      dayType: 'WEEKDAY',
      startHour: 9,
      endHour: 17,
      timeLabel: '09:00 - 17:00',
      priceGuestVnd: 100000,
      priceFixedVnd: 90000,
      studentGuestVnd: 90000,
      studentFixedVnd: 80000,
      subLabel: 'Ưu đãi HS/SV',
      displayOrder: 2,
    },
    {
      id: 'tier-wd-peak',
      tierKey: 'wd_peak',
      dayType: 'WEEKDAY',
      startHour: 17,
      endHour: 22,
      timeLabel: '17:00 - 22:00',
      priceGuestVnd: 140000,
      priceFixedVnd: 130000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: 'Khung giờ vàng cao điểm',
      displayOrder: 3,
    },
    {
      id: 'tier-wd-night',
      tierKey: 'wd_night',
      dayType: 'WEEKDAY',
      startHour: 22,
      endHour: 24,
      timeLabel: '22:00 - 24:00',
      priceGuestVnd: 120000,
      priceFixedVnd: 110000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: null,
      displayOrder: 4,
    },
    {
      id: 'tier-weekend',
      tierKey: 'weekend',
      dayType: 'WEEKEND',
      startHour: 5,
      endHour: 24,
      timeLabel: 'CẢ NGÀY (05:00 - 24:00)',
      priceGuestVnd: 130000,
      priceFixedVnd: 130000,
      studentGuestVnd: null,
      studentFixedVnd: null,
      subLabel: 'Đồng giá T7, CN & Lễ',
      displayOrder: 5,
    },
  ];

  for (const t of tiers) {
    await db.query(
      `INSERT INTO price_board_settings (id, tier_key, day_type, start_hour, end_hour, time_label, price_guest_vnd, price_fixed_vnd, student_guest_vnd, student_fixed_vnd, sub_label, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (tier_key) DO NOTHING`,
      [t.id, t.tierKey, t.dayType, t.startHour, t.endHour, t.timeLabel, t.priceGuestVnd, t.priceFixedVnd, t.studentGuestVnd, t.studentFixedVnd, t.subLabel, t.displayOrder]
    );
  }
}

async function seedInitialCoupons(db: DatabaseClient): Promise<void> {
  const initialCoupons = [
    {
      id: 'cp-bebadminton10',
      code: 'BEBADMINTON10',
      title: 'Giảm 10% chào mừng hội viên mới',
      description: 'Áp dụng cho mọi khung giờ khi đặt sân từ 100.000đ, giảm tối đa 50.000đ',
      discountType: 'PERCENT',
      discountValue: 10,
      minOrderAmountVnd: 100000,
      maxDiscountAmountVnd: 50000,
      usageLimit: 500,
    },
    {
      id: 'cp-chaomung20k',
      code: 'CHAOMUNG20K',
      title: 'Tặng 20.000đ trực tiếp khi đặt sân',
      description: 'Giảm ngay 20.000đ cho đơn đặt sân bất kỳ từ 80.000đ',
      discountType: 'FIXED',
      discountValue: 20000,
      minOrderAmountVnd: 80000,
      maxDiscountAmountVnd: null,
      usageLimit: 300,
    },
    {
      id: 'cp-hssv15',
      code: 'HSSV15',
      title: 'Ưu đãi Học sinh – Sinh viên 15%',
      description: 'Giảm 15% tối đa 40.000đ khi đặt khung giờ ban ngày hoặc cuối tuần',
      discountType: 'PERCENT',
      discountValue: 15,
      minOrderAmountVnd: 80000,
      maxDiscountAmountVnd: 40000,
      usageLimit: 200,
    },
  ];

  for (const cp of initialCoupons) {
    await db.query(
      `INSERT INTO coupons (id, code, title, description, discount_type, discount_value, min_order_amount_vnd, max_discount_amount_vnd, usage_limit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
       ON CONFLICT (code) DO NOTHING`,
      [cp.id, cp.code, cp.title, cp.description, cp.discountType, cp.discountValue, cp.minOrderAmountVnd, cp.maxDiscountAmountVnd, cp.usageLimit]
    );
  }
}

async function seedMemberTiers(db: DatabaseClient): Promise<void> {
  await db.query(`UPDATE users SET member_tier = 'GOLD', total_spent_vnd = 3500000 WHERE id = 'user-admin-01'`);
  await db.query(`UPDATE users SET member_tier = 'SILVER', total_spent_vnd = 1450000 WHERE id = 'user-staff-01'`);
  await db.query(`UPDATE users SET member_tier = 'BRONZE', total_spent_vnd = 500000 WHERE id = 'user-cust-01'`);
}

async function seedEquipmentServices(db: DatabaseClient): Promise<void> {
  const items = [
    {
      id: 'eq-racket-01',
      code: 'VOT-YONEX-01',
      name: 'Thuê Vợt Yonex / Lining Cao Cấp',
      category: 'RENTAL',
      priceVnd: 30000,
      originalPriceVnd: 50000,
      unit: 'cây / ca chơi',
      depositVnd: 200000,
      stockQuantity: 50,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'HOT RENTAL',
      imageUrl: '/public/assets/images/addons/vot-cau-long.png',
      description: 'Vợt thi đấu cao cấp trợ lực căng sẵn 10.5kg - 11kg, quấn cán mới sạch sẽ.',
      sortOrder: 1,
    },
    {
      id: 'eq-shoes-01',
      code: 'GIAY-CHUYEN-THAM-01',
      name: 'Thuê Giày Cầu Lông Chuyên Dụng Bám Thảm',
      category: 'RENTAL',
      priceVnd: 30000,
      originalPriceVnd: 45000,
      unit: 'đôi / ca chơi',
      depositVnd: 150000,
      stockQuantity: 40,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'KHUYÊN DÙNG',
      imageUrl: '/public/assets/images/addons/giay-cau-long.png',
      description: 'Đế kếp bám thảm PVC chống lật cổ chân, đủ size Nam / Nữ 36 - 44, khử khuẩn sạch sẽ.',
      sortOrder: 2,
    },
    {
      id: 'eq-shuttle-tube-01',
      code: 'CAU-ONG-12',
      name: 'Ống Cầu Lông Thi Đấu Hải Yến (12 Trái)',
      category: 'EQUIPMENT',
      priceVnd: 240000,
      originalPriceVnd: 270000,
      unit: 'ống 12 trái',
      depositVnd: 0,
      stockQuantity: 100,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'CHUẨN THI ĐẤU',
      imageUrl: '/public/assets/images/addons/ong-cau-long.png',
      description: 'Cầu lông lông vũ chuẩn thi đấu tốc độ 77, đường bay đầm, độ bền cao.',
      sortOrder: 3,
    },
    {
      id: 'eq-shuttle-single-01',
      code: 'CAU-LE-QUAN-CAN-01',
      name: 'Cầu Lông Lẻ & Quấn Cán Chống Trơn',
      category: 'EQUIPMENT',
      priceVnd: 25000,
      originalPriceVnd: 35000,
      unit: 'combo',
      depositVnd: 0,
      stockQuantity: 200,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'BỔ SUNG TỨC THÌ',
      imageUrl: '/public/assets/images/addons/cau-le-quan-can.png',
      description: '1 quả cầu Hải Yến mới + 1 quấn cán thấm hút mồ hôi tay cực tốt.',
      sortOrder: 4,
    },
    {
      id: 'eq-boxlock-01',
      code: 'TU-DO-BOXLOCK-01',
      name: 'Thuê Tủ Khóa Cá Nhân Box-Lock & Khăn',
      category: 'FACILITY',
      priceVnd: 20000,
      originalPriceVnd: 30000,
      unit: 'tủ / ca chơi',
      depositVnd: 50000,
      stockQuantity: 30,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'AN TÂM 100%',
      imageUrl: '/public/assets/images/addons/tu-do-boxlock.png',
      description: 'Tủ có khóa riêng an toàn tuyệt đối cho túi xách, laptop, ví tiền + khăn thể thao.',
      sortOrder: 5,
    },
    {
      id: 'eq-drink-01',
      code: 'NUOC-KHOANG-01',
      name: 'Nước Khoáng Lavie & Điện Giải Ướp Lạnh',
      category: 'BEVERAGE',
      priceVnd: 15000,
      originalPriceVnd: 20000,
      unit: 'chai 500ml',
      depositVnd: 0,
      stockQuantity: 500,
      stockStatus: 'AVAILABLE',
      isActive: true,
      badge: 'ƯỚP LẠNH SẴN',
      imageUrl: '/public/assets/images/addons/nuoc-khoang-bu-khoang.png',
      description: 'Bù nước và khoáng chất tức thì giúp duy trì thể lực dẻo dai trên sân.',
      sortOrder: 6,
    },
  ];

  for (const item of items) {
    await db.query(
      `INSERT INTO equipment_services (
        id, code, name, category, price_vnd, original_price_vnd, unit, deposit_vnd, stock_quantity, stock_status, is_active, badge, image_url, description, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (code) DO UPDATE SET
        stock_quantity = EXCLUDED.stock_quantity,
        stock_status = 'AVAILABLE',
        is_active = TRUE,
        price_vnd = EXCLUDED.price_vnd,
        original_price_vnd = EXCLUDED.original_price_vnd,
        name = EXCLUDED.name,
        unit = EXCLUDED.unit,
        deposit_vnd = EXCLUDED.deposit_vnd`,
      [
        item.id,
        item.code,
        item.name,
        item.category,
        item.priceVnd,
        item.originalPriceVnd,
        item.unit,
        item.depositVnd,
        item.stockQuantity,
        item.stockStatus,
        item.isActive,
        item.badge,
        item.imageUrl,
        item.description,
        item.sortOrder,
      ]
    );
  }
  await db.query(`UPDATE equipment_services SET stock_quantity = GREATEST(stock_quantity, 30), stock_status = 'AVAILABLE', is_active = TRUE WHERE stock_quantity <= 0 OR stock_status != 'AVAILABLE'`);
}
