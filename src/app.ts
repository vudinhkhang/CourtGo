import { createCartCheckout, getPaymentGroup, groupCodeForBooking, initiateGroupPayment, normalizeCartSlots } from './services/multiTicketService.js';
import { renderCartPage, renderGroupCheckout } from './views/cartPages.js';
import { renderEquipmentCatalog } from './views/equipmentCatalog.js';
import { getPublicEquipmentCatalog } from './services/equipmentService.js';
import { renderAdminAccountsPage, renderAdminAccountDetail, AccountFilters } from './views/adminAccountsPage.js';
import {
  confirmFixedSchedule,
  releaseFixedSchedule,
  parseWeekdays,
  formatWeekdays,
} from './services/fixedScheduleService.js';
import { renderAdminScanQrPage } from './views/adminScanPage.js';
import { renderAdminOrderDetailPage } from './views/adminOrderDetailPage.js';
import { canPrintBookingTicket, renderBookingTicket } from './views/bookingTicket.js';
import { renderAdminFixedBookingDetailPage } from './views/adminFixedBookingPage.js';
import { bookingQuery, bookingHomeUrl } from './utils/bookingNavigation.js';
import { inventoryOperation, inventoryHistory } from './services/inventoryService.js';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config/env.js';
import { DatabaseClient, getDb } from './db/client.js';
import {
  adminChangeUserRole,
  adminSetUserMemberTier,
  adminSetUserStatus,
  adminSetUserPassword,
  changeUserPassword,
  completePasswordReset,
  getAdminMfaCurrentCodeForTestingOrSandbox,
  getSessionByRawToken,
  loginWithPassword,
  logoutByRawToken,
  registerCustomer,
  requestPasswordReset,
  SessionContext,
  updateUserProfile,
  UserRecord,
  verifyEmailWithToken,
  verifySessionAdminMfa,
} from './services/authService.js';
import {
  adminCreateCourt,
  adminCreateCourtBlock,
  adminReleaseCourtBlock,
  adminUpdateCourt,
  adminUpdateOfficialPriceBoard,
  adminUpsertPricingRule,
  BE_BADMINTON_ADDONS,
  getCenterInfo,
  expireOverdueHolds,
  getCourtDetail,
  getPriceBoardSettings,
  getScheduleAndAvailability,
} from './services/courtService.js';
import {
  counterCancelAndRefund,
  addCounterPosItemsToBooking,
  adminTransitionBookingStatus,
  BookingRecord,
  cancelBookingByCustomer,
  counterDispatchBookingOperation,
  createBatchBookingHolds,
  createOrReuseBookingHold,
  createWalkInCounterBooking,
  getBookingForViewer,
  initiatePaymentForBooking,
  processPaymentWebhook,
  transferBookingCourt,
} from './services/bookingService.js';
import {
  adminRetryOrReconcileRefund,
  processPendingBackgroundJobs,
} from './services/jobWorker.js';
import {
  createCustomerReview,
  createShiftHandover,
  deleteCustomerReview,
  generateBookingsCsvExport,
  getAdminOperationalMetrics,
  getDetailedRevenueAndShiftMetrics,
  getLiveCourtsMonitorData,
  listCustomerReviews,
  listShiftHandovers,
  listStaffAuditLogs,
  replyToCustomerReview,
  toggleCustomerReviewVisibility,
  verifyShiftHandover,
} from './services/adminService.js';
import {
  renderAdminLiveCourtMonitorPage,
  renderAdminReportsAndShiftPage,
  renderAdminReviewsPage,
} from './views/adminOperationsPages.js';
import { paymentGateway } from './integrations/paymentGateway.js';
import { renderPageLayout, HeaderNotificationItem } from './views/layout.js';
import { PUBLIC_DIR } from './views/icons.js';
import {
  renderAccountPage,
  renderBookingDetailPage,
  renderCheckoutPage,
  renderCourtDetailPage,
  renderForgotPasswordPage,
  renderHomeHeroBand,
  renderHomePage,
  renderLoginPage,
  renderMyBookingsPage,
  renderPaymentGuidePage,
  renderPolicyPage,
  renderRegisterPage,
} from './views/customerPages.js';
import {
  BE_BADMINTON_NEWS,
  renderNewsDetailPage,
  renderNewsListPage,
} from './views/newsPages.js';
import { getNewsService } from './services/newsService.js';
import {
  renderAdminNewsListPage,
  renderAdminNewsEditPage,
} from './views/adminNewsPages.js';
import { renderCounterDispatchStationPage } from './views/adminDispatchPages.js';
import {
  createCoupon,
  deleteCoupon,
  getActivePublicCoupons,
  listAllCoupons,
  toggleCouponStatus,
  validateAndCalculateCouponDiscount,
  incrementCouponUsage,
} from './services/couponService.js';
import {
  FixedBookingRequestRecord,
  renderAdminBookingsPage,
  renderAdminCouponsPage,
  renderAdminCourtsAndPricingPage,
  renderAdminDashboardPage,
  renderAdminPaymentsAndRefundsPage,
} from './views/adminPages.js';
import { renderAdminDashboardLayout } from './views/adminLayout.js';
import { renderAdminEquipmentPage } from './views/adminEquipmentPages.js';
import {
  adminCreateEquipmentService,
  adminDeleteEquipmentService,
  getEquipmentServiceById,
  getEquipmentServices,
  adminToggleEquipmentStatus,
  adminUpdateEquipmentService,
  getEquipmentMetrics,
  EquipmentCategory,
  EquipmentStockStatus,
} from './services/equipmentService.js';
import { renderSandboxGatewayPage } from './views/sandboxGatewayPage.js';
import { AppError } from './utils/errors.js';
import { rateLimiter, escapeHtml } from './utils/security.js';
import { formatSlotRange,
  formatVnd,
  getServerNow, parsePriceVnd, toVietnamDateString } from './utils/time.js';
import { logger } from './utils/logger.js';

const SESSION_COOKIE_NAME = 'courtgo_session';

declare module 'fastify' {
  interface FastifyRequest {
    sessionCtx: SessionContext | null;
    reqTraceId: string;
  }
}

function getFlashFromQuery(query: Record<string, any>): {
  type: 'success' | 'error' | 'info';
  text: string;
} | null {
  if (typeof query.thongBaoThanhCong === 'string' && query.thongBaoThanhCong.trim()) {
    return { type: 'success', text: query.thongBaoThanhCong.trim() };
  }
  if (typeof query.thongBaoLoi === 'string' && query.thongBaoLoi.trim()) {
    return { type: 'error', text: query.thongBaoLoi.trim() };
  }
  if (typeof query.thongBao === 'string' && query.thongBao.trim()) {
    return { type: 'info', text: query.thongBao.trim() };
  }
  return null;
}

function verifyCsrfToken(session: SessionContext | null, bodyToken: string | undefined, headerToken: string | undefined): void {
  if (!session) {
    throw new AppError({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
      publicMessage: 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại để tiếp tục.',
    });
  }
  const provided = (bodyToken || headerToken || '').trim();
  if (!provided || provided !== session.csrfToken) {
    throw new AppError({
      code: 'CSRF_INVALID',
      statusCode: 403,
      publicMessage: 'Phiên biểu mẫu không hợp lệ hoặc đã quá hạn. Bạn vui lòng tải lại trang và thực hiện lại.',
    });
  }
}

async function getUserNotificationData(userId: string | undefined, db: DatabaseClient): Promise<{
  unreadCount: number;
  recent: HeaderNotificationItem[];
}> {
  if (!userId) return { unreadCount: 0, recent: [] };
  const [countRes, recentRes] = await Promise.all([
    db.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    ),
    db.query<HeaderNotificationItem>(
      `SELECT n.id, n.booking_id, b.booking_code, n.type, n.title_vi, n.body_vi, n.is_read, n.created_at
       FROM notifications n
       LEFT JOIN bookings b ON n.booking_id = b.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 8`,
      [userId]
    ),
  ]);
  return {
    unreadCount: Number(countRes.rows[0]?.cnt || '0'),
    recent: recentRes.rows,
  };
}

export async function buildApp(customDb?: DatabaseClient): Promise<FastifyInstance> {
  const db = customDb || getDb();
  const app = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024,
  });

  await app.register(fastifyCookie, {
    secret: config.sessionSecret,
  });
  await app.register(fastifyFormbody, {
    bodyLimit: 50 * 1024 * 1024,
  });
  if (fs.existsSync(PUBLIC_DIR)) {
    await app.register(fastifyStatic, {
      root: PUBLIC_DIR,
      prefix: '/public/',
      decorateReply: false,
    });
  }

  app.decorateRequest('sessionCtx', null);
  app.decorateRequest('reqTraceId', '');

  app.addHook('onRequest', async (request, reply) => {
    const traceId = (request.headers['x-request-id'] as string) || crypto.randomUUID().slice(0, 12);
    request.reqTraceId = traceId;
    reply.header('X-Request-Id', traceId);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    const rawToken = request.cookies[SESSION_COOKIE_NAME];
    request.sessionCtx = await getSessionByRawToken(rawToken, db);
  });

  // Bộ xử lý lỗi tập trung: phân biệt rõ phản hồi công khai tiếng Việt và log kỹ thuật nội bộ
  app.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
    const isApi = request.url.startsWith('/api/');
    if (error instanceof AppError) {
      logger.warn(error.code, error.publicMessage, {
        statusCode: error.statusCode,
        url: request.url,
        ...(error.internalDetail || {}),
      }, request.reqTraceId);

      if (isApi) {
        return reply.status(error.statusCode).send({
          ok: false,
          code: error.code,
          message: error.publicMessage,
          requestId: request.reqTraceId,
        });
      }

      const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
      const html = renderPageLayout({
        title: 'Thông báo xử lý',
        session: request.sessionCtx,
        unreadNotificationsCount: notifData.unreadCount,
        recentNotifications: notifData.recent,
        flashMessage: { type: 'error', text: error.publicMessage },
        bodyHtml: `
          <div class="ink-border-panel" style="max-width: 680px; margin: 20px auto;">
            <div class="section-eyebrow-lockup">
              <span class="eyebrow-bar"></span>
              <h1 class="eyebrow-text">${error.statusCode === 403 ? 'KHÔNG CÓ QUYỀN TRUY CẬP' : 'THÔNG BÁO TỪ HỆ THỐNG'}</h1>
            </div>
            <p class="body-text" style="margin-bottom: 16px;">${escapeHtml(error.publicMessage)}</p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <a href="/#lich-san-nhanh" class="btn-pill-dark">Đặt sân</a>
              <a href="/" class="btn-pill-outline">Về trang chủ</a>
            </div>
          </div>
        `,
      });
      return reply.status(error.statusCode).type('text/html; charset=utf-8').send(html);
    }

    logger.error('UNHANDLED_SERVER_ERROR', String(error?.message || error), {
      url: request.url,
      method: request.method,
    }, request.reqTraceId);

    const safePublicMessage =
      'Hệ thống đang bận xử lý yêu cầu. Bạn vui lòng tải lại trang hoặc thử lại sau ít giây nhé.';

    if (isApi) {
      return reply.status(500).send({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: safePublicMessage,
        requestId: request.reqTraceId,
      });
    }

    const html = renderPageLayout({
      title: 'Tạm gián đoạn',
      session: request.sessionCtx,
      flashMessage: { type: 'error', text: safePublicMessage },
      bodyHtml: `
        <div class="flat-panel" style="max-width: 640px; margin: 20px auto;">
          <h1 class="headline-md" style="margin-bottom: 10px;">Không thể hoàn tất thao tác lúc này</h1>
          <p class="body-sm" style="margin-bottom: 16px;">${escapeHtml(safePublicMessage)}</p>
          <a href="/" class="btn-pill-dark">Quay lại trang chủ</a>
        </div>
      `,
    });
    return reply.status(500).type('text/html; charset=utf-8').send(html);
  });

  app.setNotFoundHandler(async (request, reply) => {
    const isApiOrStatic =
      request.url.startsWith('/api/') ||
      request.url.startsWith('/public/') ||
      (request.headers.accept || '').includes('application/json');

    if (isApiOrStatic) {
      return reply.status(404).send({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Không tìm thấy tài nguyên yêu cầu.',
      });
    }

    const html = renderPageLayout({
      title: 'Không tìm thấy trang (404)',
      session: request.sessionCtx,
      bodyHtml: `
        <div class="ink-border-panel" style="max-width: 680px; margin: 36px auto; text-align: center; padding: 40px 28px;">
          <div style="font-size: 48px; margin-bottom: 12px;">🏸</div>
          <h1 class="headline-lg" style="margin-bottom: 10px;">Không tìm thấy trang yêu cầu (404)</h1>
          <p class="body-text" style="margin-bottom: 24px;">
            Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển. Vui lòng kiểm tra lại địa chỉ hoặc quay về bảng lịch 18 sân Be Badminton Gò Vấp.
          </p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <a href="/#lich-san-nhanh" class="btn-pill-dark">Đặt sân</a>
            <a href="/" class="btn-pill-outline">Về trang chủ</a>
          </div>
        </div>
      `,
    });
    return reply.status(404).type('text/html; charset=utf-8').send(html);
  });

  // ─── 1. HEALTH CHECK & VẬN HÀNH ───
  app.get('/api/health', async (_request, reply) => {
    const dbCheck = await db.query<{ ok: number }>(`SELECT 1 AS ok`);
    const jobStats = await db.query<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*)::text AS cnt FROM background_jobs GROUP BY status`
    );
    return reply.send({
      ok: dbCheck.rows[0]?.ok === 1,
      service: 'courtgo',
      environment: config.nodeEnv,
      paymentMode: config.paymentMode,
      databaseDriver: db.getDriverType(),
      serverTimeIso: getServerNow().toISOString(),
      backgroundJobs: Object.fromEntries(jobStats.rows.map((r) => [r.status, Number(r.cnt)])),
    });
  });

  // ─── 2. TRANG CHỦ, LỊCH SÂN, CHI TIẾT SÂN, CHÍNH SÁCH ───
  app.get('/', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const filters = Object.fromEntries(bookingQuery(q));
    const hasSelectedDate = Boolean(q.date && q.date.trim() !== '');
    const hourNum = filters.hour !== undefined ? Number(filters.hour) : null;
    const [schedule, notifData, priceBoard, equipmentItems, newsArticles, visibleReviews, publicCoupons] = await Promise.all([
      getScheduleAndAvailability(
        {
          date: filters.date,
          search: filters.search,
          courtId: filters.courtId,
          hour: hourNum,
          minPrice: filters.minPrice ? Number(filters.minPrice) : null,
          maxPrice: filters.maxPrice ? Number(filters.maxPrice) : null,
          sortBy: (filters.sortBy || 'court_order') as 'court_order' | 'time_asc' | 'price_asc' | 'price_desc',
          viewerUserId: request.sessionCtx?.user.id || null,
        },
        db
      ),
      getUserNotificationData(request.sessionCtx?.user.id, db),
      getPriceBoardSettings(db),
      getEquipmentServices({ activeOnly: true }, db),
      getNewsService(db).listPublishedNews(3),
      listCustomerReviews({ visibleOnly: true }, db),
      getActivePublicCoupons(6, db, request.sessionCtx?.user.id),
    ]);
    const activeCourtOptions=(await db.query<{id:string;name:string}>("SELECT id,name FROM courts WHERE status='ACTIVE' ORDER BY sort_order,name")).rows;
    const html = renderPageLayout({
      title: 'Đặt Sân Cầu Lông Be Badminton Gò Vấp | 18 Sân Chuẩn Thi Đấu 05:00 - 24:00',
      description: 'Hệ thống đặt sân cầu lông Be Badminton Gò Vấp trực tuyến. Cụm 18 sân thảm PVC tiêu chuẩn thi đấu, trần cao 13m, đèn LED chống chói, mở cửa 05:00 - 24:00 hàng ngày.',
      activeNav: 'home',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      fullBleedTopHtml: renderHomeHeroBand({
        activeCourtOptions,
        bookingFilters: filters,
        center: schedule.center,
        selectedDate: schedule.selectedDate,
        hasSelectedDate,
        selectedSearch: filters.search || '',
        selectedHour: hourNum,
        hoursRange: schedule.hoursRange,
        courts: schedule.courts,
        availableSlotCount: schedule.availableSlotCount,
        priceBoard,
      }),
      bodyHtml: renderHomePage({
        center: schedule.center,
        selectedDate: schedule.selectedDate,
        hasSelectedDate,
        selectedSearch: filters.search || '',
        selectedHour: hourNum,
        hoursRange: schedule.hoursRange,
        courts: schedule.courts,
        availableSlotCount: schedule.availableSlotCount,
        session: request.sessionCtx,
        priceBoard,
        equipmentItems,
        articles: newsArticles,
        reviews: visibleReviews,
        coupons: publicCoupons,
        bookingFilters: filters,
        filteredSlots: schedule.filteredSlots,
        suggestedAlternatives: schedule.suggestedAlternatives,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/dung-cu',async(request,reply)=>{
    const query=(request.query||{}) as Record<string,string>;
    const [catalog,notif]=await Promise.all([getPublicEquipmentCatalog(query,db),getUserNotificationData(request.sessionCtx?.user.id,db)]);
    return reply.type('text/html; charset=utf-8').send(renderPageLayout({title:'Dụng cụ & phụ kiện | Be Badminton',activeNav:'services',session:request.sessionCtx,unreadNotificationsCount:notif.unreadCount,recentNotifications:notif.recent,bodyHtml:renderEquipmentCatalog(catalog)}));
  });

  app.get('/lich-san', async (request, reply) => {
    return reply.redirect(bookingHomeUrl((request.query || {}) as Record<string, unknown>), 302);
  });

  app.get('/api/schedule', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const hourNum = q.hour !== undefined && q.hour !== '' ? Number(q.hour) : null;
    const minPriceNum = q.minPrice !== undefined && q.minPrice !== '' ? Number(q.minPrice) : null;
    const maxPriceNum = q.maxPrice !== undefined && q.maxPrice !== '' ? Number(q.maxPrice) : null;
    const schedule = await getScheduleAndAvailability(
      {
        date: q.date,
        search: q.search,
        hour: hourNum,
        minPrice: minPriceNum,
        maxPrice: maxPriceNum,
        sortBy: (q.sortBy as any) || 'court_order',
        viewerUserId: request.sessionCtx?.user.id || null,
      },
      db
    );
    // Không cache cứng dữ liệu khả năng cung cấp để khách không thao tác trên dữ liệu cũ
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      ok: true,
      selectedDate: schedule.selectedDate,
      availableSlotCount: schedule.availableSlotCount,
      courts: schedule.courts,
      filteredSlots: schedule.filteredSlots,
      suggestedAlternatives: schedule.suggestedAlternatives,
    });
  });

  app.get('/san/:courtId', async (request, reply) => {
    const params = request.params as { courtId: string };
    const q = (request.query || {}) as Record<string, string>;
    const hasSelectedDate = Boolean(q.date && q.date.trim() !== '');
    const detail = await getCourtDetail(params.courtId, q.date, request.sessionCtx?.user.id || null, db);
    const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
    const html = renderPageLayout({
      title: `${detail.court.name} - Đặt Sân Cầu Lông Tiêu Chuẩn Thi Đấu | Be Badminton Gò Vấp`,
      description: `Thông tin chi tiết ${detail.court.name} tại Be Badminton Gò Vấp: thảm PVC xanh ngọc bích, đèn LED chống lóa, trần cao 13m thoáng khí. Đặt sân theo khung giờ linh hoạt.`,
      activeNav: 'schedule',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderCourtDetailPage({
        ...detail,
        hasSelectedDate,
        session: request.sessionCtx,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/chinh-sach', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const center = await getCenterInfo(db);
    const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
    const html = renderPageLayout({
      title: 'Chính Sách Đặt Sân, Hủy Đơn & Hoàn Tiền Tự Động 100% | Be Badminton Gò Vấp',
      description: 'Quy định đặt sân, chính sách hủy đơn hoàn tiền tự động 100% trước 12 giờ, nội quy sử dụng sân và hỗ trợ khách hàng tại Be Badminton Gò Vấp.',
      activeNav: 'policy',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderPolicyPage(center),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/huong-dan-thanh-toan', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const center = await getCenterInfo(db);
    const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
    const html = renderPageLayout({
      title: 'Hướng Dẫn Đặt Sân & Thanh Toán Cổng Sandbox | Be Badminton Gò Vấp',
      description: 'Hướng dẫn chi tiết 4 bước đặt sân cầu lông trực tuyến từ 05:00 - 24:00, quét mã VietQR / VNPAY-QR và cách sử dụng cổng thanh toán Sandbox thử nghiệm.',
      activeNav: 'guide',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderPaymentGuidePage(center),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/tin-tuc', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
    const articles = await getNewsService(db).listPublishedNews(50);
    const html = renderPageLayout({
      title: 'Tin Tức, Hoạt Động & Sự Kiện Thể Thao | Be Badminton Gò Vấp',
      description: 'Cập nhật tin tức hoạt động, thông báo mở cửa ngày lễ, các giải đấu phong trào và chương trình ưu đãi mới nhất tại Be Badminton 262/1 Quang Trung.',
      activeNav: 'news',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderNewsListPage(articles),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/tin-tuc/:slug', async (request, reply) => {
    const params = request.params as { slug: string };
    const q = (request.query || {}) as Record<string, string>;
    const article = await getNewsService(db).getNewsBySlug(params.slug);

    if (!article) {
      return reply.redirect('/tin-tuc');
    }

    const notifData = await getUserNotificationData(request.sessionCtx?.user.id, db);
    const html = renderPageLayout({
      title: `${article.title} | Be Badminton Gò Vấp`,
      description: article.summary,
      activeNav: 'news',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderNewsDetailPage(article),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // ─── 2B. ĐĂNG KÝ LỊCH CỐ ĐỊNH THÁNG & ĐĂNG KÝ NHẬN TIN TỪ CHÚNG TÔI ───
  app.post('/dat-san/co-dinh-thang', async (request, reply) => {
    const body = (request.body || {}) as Record<string, any>;
    const contactPhone = String(body.contactPhone || '').trim();
    const customerName = String(body.customerName || request.sessionCtx?.user.full_name || '').trim() || null;

    if (!contactPhone || contactPhone.length < 8) {
      return reply.redirect(
        `/?thongBaoLoi=${encodeURIComponent(
          'Vui lòng nhập số điện thoại hoặc Zalo hợp lệ để bộ phận quản lý sân liên hệ xếp lịch cố định tháng.'
        )}`
      );
    }

    // Xử lý weekdays
    let weekdaysArr: number[] = [];
    if (body.weekdays) {
      weekdaysArr = parseWeekdays(body.weekdays);
    }
    const weekdaysStr = weekdaysArr.length > 0 ? weekdaysArr.join(',') : null;
    const fixedDays = weekdaysArr.length > 0 ? formatWeekdays(weekdaysArr) : String(body.fixedDays || 'Thứ 2 - Thứ 4 - Thứ 6').trim();

    // Xử lý startHour & duration
    const startHourNum = body.startHour !== undefined && body.startHour !== '' ? Number(body.startHour) : null;
    const durationNum = body.durationHours !== undefined && body.durationHours !== '' ? Number(body.durationHours) : (body.duration !== undefined ? Number(body.duration) : null);
    let fixedHour = String(body.fixedHour || '').trim();
    if (!fixedHour && startHourNum !== null && durationNum !== null) {
      fixedHour = `${formatSlotRange(startHourNum, startHourNum + durationNum)}`;
    }
    if (!fixedHour) fixedHour = '17:00 – 22:00';

    // Xử lý courtId
    const courtId = body.courtId ? String(body.courtId).trim() : null;
    let fixedCourt = String(body.fixedCourt || '').trim();
    if (!fixedCourt && courtId) {
      const cRes = await db.query<{ name: string }>('SELECT name FROM courts WHERE id = $1', [courtId]);
      if (cRes.rows[0]) fixedCourt = cRes.rows[0].name;
    }
    if (!fixedCourt) fixedCourt = 'Sân trống bất kỳ phù hợp';

    const startDate = body.startDate ? String(body.startDate).trim() : toVietnamDateString(getServerNow());

    const reqId = `fbr-${crypto.randomUUID()}`;
    const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const requestCode = `CD-${compactDate}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    await db.query(
      `INSERT INTO fixed_booking_requests (
        id, request_code, user_id, customer_name, contact_phone,
        fixed_days, fixed_hour, fixed_court, status,
        weekdays, start_hour, duration_hours, start_date, court_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NEW', $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        reqId,
        requestCode,
        request.sessionCtx?.user.id || null,
        customerName,
        contactPhone,
        fixedDays,
        fixedHour,
        fixedCourt,
        weekdaysStr,
        startHourNum,
        durationNum,
        startDate,
        courtId,
      ]
    );

    const msg = `Đã ghi nhận yêu cầu Đặt lịch cố định tháng mã ${requestCode} (${fixedDays} · Khung ${fixedHour} · ${fixedCourt}) cho SĐT ${contactPhone}. Quản lý Be Badminton (0773 333 371) sẽ liên hệ xác nhận ưu đãi giảm 10.000₫/ca chơi & tặng tủ Box-Lock miễn phí!`;
    return reply.redirect(`/?thongBaoThanhCong=${encodeURIComponent(msg)}`);
  });

  app.post('/dang-ky-nhan-tin', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    const contact = (body.contact || '').trim();

    if (!contact || contact.length < 5) {
      return reply.redirect(
        `/?thongBaoLoi=${encodeURIComponent(
          'Vui lòng nhập địa chỉ Email hoặc Số điện thoại hợp lệ để nhận thông tin ưu đãi từ Be Badminton.'
        )}`
      );
    }

    await db.query(
      `INSERT INTO newsletter_subscriptions (id, contact, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (contact) DO UPDATE SET updated_at = NOW()`,
      [`news-${crypto.randomUUID()}`, contact, request.sessionCtx?.user.id || null]
    );

    const msg = `Cảm ơn bạn (${contact}) đã đăng ký nhận bản tin! Be Badminton sẽ gửi thông báo khuyến mãi, giải đấu và khung giờ ưu đãi sớm nhất đến bạn.`;
    return reply.redirect(`/?thongBaoThanhCong=${encodeURIComponent(msg)}`);
  });

  function parsePendingSlotsFromBody(body: Record<string, string>): Array<{ courtId: string; bookingDate: string; startHour: number }> {
    let slotItems: Array<{ courtId: string; bookingDate: string; startHour: number }> = [];
    if (body.selectedSlotsJson) {
      try {
        const parsed = JSON.parse(body.selectedSlotsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          slotItems = parsed
            .map((s: any) => ({
              courtId: String(s.courtId || '').trim(),
              bookingDate: String(s.date || s.bookingDate || '').trim(),
              startHour: Number(s.startHour),
            }))
            .filter((s) => s.courtId && s.bookingDate && Number.isInteger(s.startHour));
        }
      } catch {}
    }
    if (slotItems.length === 0 && body.courtId && (body.date || body.bookingDate) && body.startHour !== undefined && body.startHour !== '') {
      slotItems.push({
        courtId: body.courtId.trim(),
        bookingDate: (body.date || body.bookingDate).trim(),
        startHour: Number(body.startHour),
      });
    }
    return slotItems;
  }

  // ─── 3. TÀI KHOẢN, ĐĂNG KÝ, ĐĂNG NHẬP, KHÔI PHỤC MẬT KHẨU ───
  app.get('/tai-khoan/dang-nhap', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const pendingBooking =
      q.courtId && q.date && q.startHour !== undefined
        ? {
            courtId: q.courtId,
            date: q.date,
            startHour: q.startHour,
            selectedSlotsJson: q.selectedSlotsJson || undefined,
          }
        : null;
    const html = renderPageLayout({
      title: 'Đăng Nhập Tài Khoản Đặt Sân Cầu Lông | Be Badminton Gò Vấp',
      description: 'Đăng nhập hệ thống đặt sân Be Badminton để tích điểm hội viên VIP, quản lý lịch đặt sân và nhận ưu đãi giảm giá độc quyền.',
      activeNav: 'account',
      session: request.sessionCtx,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderLoginPage({ pendingBooking, emailPrefill: q.email, returnUrl: q.returnUrl }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/tai-khoan/dang-nhap', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    const rl = rateLimiter.check(`login:${request.ip}:${body.email || ''}`, 10, 60 * 1000);
    if (!rl.allowed) {
      throw new AppError({
        code: 'RATE_LIMIT_LOGIN',
        statusCode: 429,
        publicMessage: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi ${rl.retryAfterSeconds} giây rồi thử lại.`,
      });
    }

    try {
      const loginRes = await loginWithPassword(
        {
          email: body.email || '',
          password: body.password || '',
          mfaCode: body.mfaCode,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
        db
      );

      reply.setCookie(SESSION_COOKIE_NAME, loginRes.rawSessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 7 * 24 * 3600,
      });

      // Nếu khách đang chọn đặt sân (1 sân hoặc combo nhiều sân) trước khi đăng nhập -> kiểm tra lại khả năng cung cấp và giữ chỗ ngay!
      const pendingSlots = parsePendingSlotsFromBody(body);
      if (pendingSlots.length > 0) {
        try {
          const batchRes = await createBatchBookingHolds(
            {
              user: loginRes.user,
              slots: pendingSlots,
            },
            db
          );
          return reply.redirect(`/thanh-toan/${encodeURIComponent(batchRes.primaryBooking.booking_code)}`);
        } catch (slotErr: any) {
          const msg =
            slotErr instanceof AppError
              ? slotErr.publicMessage
              : 'Khung giờ bạn chọn vừa có người đặt. Bạn chọn giờ khác nhé.';
          const first = pendingSlots[0];
          return reply.redirect(
            `/?date=${encodeURIComponent(first.bookingDate)}&hour=${encodeURIComponent(String(first.startHour))}&thongBaoLoi=${encodeURIComponent(msg)}#lich-san-nhanh`
          );
        }
      }

      if (body.returnUrl && body.returnUrl.startsWith('/')) {
        return reply.redirect(body.returnUrl);
      }

      if (loginRes.user.role === 'ADMIN' || loginRes.user.role === 'STAFF') {
        return reply.redirect('/quan-tri');
      }
      return reply.redirect('/');
    } catch (err: any) {
      const msg = err instanceof AppError ? err.publicMessage : 'Đăng nhập không thành công.';
      const slotsCarry = body.selectedSlotsJson ? `&selectedSlotsJson=${encodeURIComponent(body.selectedSlotsJson)}` : '';
      const returnCarry = body.returnUrl ? `&returnUrl=${encodeURIComponent(body.returnUrl)}` : '';
      const carry =
        body.courtId && body.date && body.startHour !== undefined
          ? `&courtId=${encodeURIComponent(body.courtId)}&date=${encodeURIComponent(body.date)}&startHour=${encodeURIComponent(body.startHour)}${slotsCarry}${returnCarry}`
          : returnCarry;
      return reply.redirect(
        `/tai-khoan/dang-nhap?thongBaoLoi=${encodeURIComponent(msg)}&email=${encodeURIComponent(body.email || '')}${carry}`
      );
    }
  });

  app.get('/tai-khoan/dang-ky', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const pendingBooking =
      q.courtId && q.date && q.startHour !== undefined
        ? {
            courtId: q.courtId,
            date: q.date,
            startHour: q.startHour,
            selectedSlotsJson: q.selectedSlotsJson || undefined,
          }
        : null;
    const html = renderPageLayout({
      title: 'Đăng Ký Thành Viên Nhận Ưu Đãi Đặt Sân | Be Badminton Gò Vấp',
      description: 'Tạo tài khoản thành viên Be Badminton miễn phí để nhận ngay ưu đãi đặt sân, tích lũy điểm thăng hạng Bạc - Vàng và giữ chỗ nhanh chóng.',
      activeNav: 'account',
      session: request.sessionCtx,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderRegisterPage({ pendingBooking }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/tai-khoan/dang-ky', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    try {
      await registerCustomer(
        {
          email: body.email || '',
          password: body.password || '',
          fullName: body.fullName || '',
          phone: body.phone || '',
        },
        db
      );
      await processPendingBackgroundJobs(db);

      const loginRes = await loginWithPassword(
        {
          email: body.email || '',
          password: body.password || '',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
        db
      );

      reply.setCookie(SESSION_COOKIE_NAME, loginRes.rawSessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 7 * 24 * 3600,
      });

      const pendingSlots = parsePendingSlotsFromBody(body);
      if (pendingSlots.length > 0) {
        try {
          const batchRes = await createBatchBookingHolds(
            {
              user: loginRes.user,
              slots: pendingSlots,
            },
            db
          );
          return reply.redirect(`/thanh-toan/${encodeURIComponent(batchRes.primaryBooking.booking_code)}`);
        } catch (slotErr: any) {
          const msg =
            slotErr instanceof AppError
              ? slotErr.publicMessage
              : 'Khung giờ bạn chọn vừa có người đặt. Bạn chọn giờ khác nhé.';
          const first = pendingSlots[0];
          return reply.redirect(
            `/?date=${encodeURIComponent(first.bookingDate)}&hour=${encodeURIComponent(String(first.startHour))}&thongBaoLoi=${encodeURIComponent(msg)}#lich-san-nhanh`
          );
        }
      }

      return reply.redirect(
        `/tai-khoan?thongBaoThanhCong=${encodeURIComponent('Đăng ký tài khoản thành công. Chào mừng bạn đến với CourtGo!')}`
      );
    } catch (err: any) {
      const msg = err instanceof AppError ? err.publicMessage : 'Không thể đăng ký tài khoản.';
      const slotsCarry = body.selectedSlotsJson ? `&selectedSlotsJson=${encodeURIComponent(body.selectedSlotsJson)}` : '';
      const carry =
        body.courtId && body.date && body.startHour !== undefined
          ? `&courtId=${encodeURIComponent(body.courtId)}&date=${encodeURIComponent(body.date)}&startHour=${encodeURIComponent(body.startHour)}${slotsCarry}`
          : '';
      return reply.redirect(`/tai-khoan/dang-ky?thongBaoLoi=${encodeURIComponent(msg)}${carry}`);
    }
  });

  app.post('/tai-khoan/dang-xuat', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    if (request.sessionCtx) {
      verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);
    }
    await logoutByRawToken(request.cookies[SESSION_COOKIE_NAME], db);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.redirect('/?thongBaoThanhCong=' + encodeURIComponent('Bạn đã đăng xuất an toàn.'));
  });

  app.get('/tai-khoan/quen-mat-khau', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const html = renderPageLayout({
      title: 'Khôi Phục Mật Khẩu Tài Khoản | Be Badminton Gò Vấp',
      description: 'Khôi phục mật khẩu tài khoản đặt sân cầu lông Be Badminton an toàn qua email xác thực.',
      activeNav: 'account',
      session: request.sessionCtx,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderForgotPasswordPage({ resetTokenPrefill: q.token }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/tai-khoan/quen-mat-khau', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    const rl = rateLimiter.check(`pwdreset:${request.ip}`, 5, 60 * 1000);
    if (!rl.allowed) {
      throw new AppError({
        code: 'RATE_LIMIT_EMAIL',
        statusCode: 429,
        publicMessage: `Vui lòng đợi ${rl.retryAfterSeconds} giây trước khi yêu cầu gửi lại hướng dẫn.`,
      });
    }
    const res = await requestPasswordReset(body.email || '', db);
    await processPendingBackgroundJobs(db);
    // Phản hồi công khai luôn giống nhau để không tiết lộ email có tồn tại hay không!
    return reply.redirect(`/tai-khoan/quen-mat-khau?thongBao=${encodeURIComponent(res.publicNotice)}`);
  });

  app.post('/tai-khoan/dat-lai-mat-khau', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    await completePasswordReset(
      {
        token: body.token || '',
        newPassword: body.newPassword || '',
      },
      db
    );
    return reply.redirect(
      `/tai-khoan/dang-nhap?thongBaoThanhCong=${encodeURIComponent('Đặt lại mật khẩu mới thành công. Vui lòng đăng nhập.')}`
    );
  });

  app.get('/tai-khoan', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap?thongBao=' + encodeURIComponent('Vui lòng đăng nhập để quản lý tài khoản.'));
    }
    const q = (request.query || {}) as Record<string, string>;
    const notifData = await getUserNotificationData(request.sessionCtx.user.id, db);

    const html = renderPageLayout({
      title: 'Quản Lý Tài Khoản & Thẻ Hội Viên VIP | Be Badminton Gò Vấp',
      description: 'Xem thông tin cá nhân, hạng hội viên VIP (Đồng, Bạc, Vàng), lịch sử tích lũy chi tiêu và các ưu đãi hoàn tiền độc quyền tại Be Badminton.',
      activeNav: 'account',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAccountPage({
        session: request.sessionCtx,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/api/thong-bao/doc-tat-ca', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.status(401).send({ ok: false, error: 'UNAUTHORIZED' });
    }
    await db.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [
      request.sessionCtx.user.id,
    ]);
    return reply.send({ ok: true, success: true });
  });

  app.get('/api/thong-bao', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.status(401).send({ ok: false, error: 'UNAUTHORIZED' });
    }
    const notifData = await getUserNotificationData(request.sessionCtx.user.id, db);
    return reply.send({ ok: true, ...notifData });
  });

  app.post('/tai-khoan/cap-nhat', async (request, reply) => {
    if (!request.sessionCtx) return reply.redirect('/tai-khoan/dang-nhap');
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);
    await updateUserProfile(
      request.sessionCtx.user.id,
      { fullName: body.fullName || '', phone: body.phone || '', address: body.address, birthDate: body.birthDate, avatarData: body.avatarData },
      db
    );
    return reply.redirect('/tai-khoan?thongBaoThanhCong=' + encodeURIComponent('Đã cập nhật thông tin cá nhân.'));
  });

  app.post('/tai-khoan/doi-mat-khau', async (request, reply) => {
    if (!request.sessionCtx) return reply.redirect('/tai-khoan/dang-nhap');
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);
    if (body.confirmPassword && body.confirmPassword !== body.newPassword) {
      throw new AppError({
        code: 'PASSWORD_MISMATCH',
        statusCode: 400,
        publicMessage: 'Mật khẩu nhập lại lần 2 không trùng khớp với mật khẩu mới. Bạn kiểm tra lại nhé.',
      });
    }
    await changeUserPassword(
      request.sessionCtx.user.id,
      request.sessionCtx.sessionId,
      { currentPassword: body.currentPassword || '', newPassword: body.newPassword || '' },
      db
    );
    return reply.redirect('/tai-khoan?thongBaoThanhCong=' + encodeURIComponent('Đã đổi mật khẩu thành công.'));
  });

  app.post('/tai-khoan/xac-minh-email', async (request, reply) => {
    if (!request.sessionCtx) return reply.redirect('/tai-khoan/dang-nhap');
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);
    await verifyEmailWithToken(body.token || '', db);
    return reply.redirect('/tai-khoan?thongBaoThanhCong=' + encodeURIComponent('Đã xác minh địa chỉ email thành công.'));
  });

  // ─── 4. ĐẶT SÂN, GIỮ CHỖ, CHECKOUT, THANH TOÁN & HỦY ĐƠN ───
  app.get('/gio-hang', async (request, reply) => {
    const q=(request.query||{}) as Record<string,string>;
    return reply.type('text/html').send(renderPageLayout({title:'Giỏ vé đặt sân | Be Badminton',activeNav:'bookings',session:request.sessionCtx,flashMessage:getFlashFromQuery(q),bodyHtml:renderCartPage(request.sessionCtx)}));
  });

  app.post('/api/gio-hang/kiem-tra', async (request, reply) => {
    const body=(request.body||{}) as {slots:unknown};
    const slots=normalizeCartSlots(body.slots);
    const results=[];
    const checkoutCodes=new Set<string>();
    for (const date of [...new Set(slots.map(s=>s.bookingDate))]) {
      const schedule=await getScheduleAndAvailability({date,viewerUserId:request.sessionCtx?.user.id},db);
      for(const slot of slots.filter(s=>s.bookingDate===date)) {
        const court=schedule.courts.find(c=>c.id===slot.courtId);
        const found=court?.slots.find(s=>s.startHour===slot.startHour);
        if(found?.myHoldBookingCode) {
          const groupCode=await groupCodeForBooking(found.myHoldBookingCode,db);
          if(groupCode) checkoutCodes.add(groupCode);
        }
        results.push({courtId:slot.courtId,date,startHour:slot.startHour,courtName:court?.name||'Sân không còn phục vụ',priceVnd:found?.priceVnd||0,available:found?.state==='AVAILABLE',reason:found?.stateLabelVi||'Không còn phục vụ'});
      }
    }
    return reply.send({slots:results,checkoutCodes:[...checkoutCodes]});
  });

  app.post('/gio-hang/thanh-toan',async(request,reply)=>{
    if(!request.sessionCtx)return reply.redirect('/tai-khoan/dang-nhap');
    const body=(request.body||{}) as Record<string,string>;
    verifyCsrfToken(request.sessionCtx,body._csrf,request.headers['x-csrf-token'] as string);
    const rl=rateLimiter.check(`hold:${request.sessionCtx.user.id}`,25,60000);
    if(!rl.allowed)throw new AppError({code:'RATE_LIMIT_HOLD',statusCode:429,publicMessage:'Vui lòng đợi ít giây trước khi thử lại.'});
    try {
      const result=await createCartCheckout(request.sessionCtx.user,JSON.parse(body.slots||'[]'),body.idempotencyKey||'',db);
      return reply.redirect(`/thanh-toan/nhom/${encodeURIComponent(result.group.code)}`);
    } catch(error) {
      if(error instanceof AppError)return reply.redirect('/gio-hang?thongBaoLoi='+encodeURIComponent(error.publicMessage));
      if(error instanceof SyntaxError)return reply.redirect('/gio-hang?thongBaoLoi='+encodeURIComponent('Giỏ không hợp lệ. Vui lòng tải lại.'));
      throw error;
    }
  });

  app.get('/thanh-toan/nhom/:groupCode',async(request,reply)=>{
    if(!request.sessionCtx)return reply.redirect('/tai-khoan/dang-nhap');
    await expireOverdueHolds(db);
    const {groupCode}=request.params as {groupCode:string};
    const {group,tickets}=await getPaymentGroup(groupCode,request.sessionCtx.user,db);
    const equipment=await getEquipmentServices({activeOnly:true},db);
    const coupons=await getActivePublicCoupons(6,db,request.sessionCtx.user.id);
    return reply.type('text/html').send(renderPageLayout({title:`${group.code} | Vé đặt sân`,activeNav:'bookings',session:request.sessionCtx,flashMessage:getFlashFromQuery((request.query||{}) as Record<string,string>),bodyHtml:renderGroupCheckout(group,tickets,request.sessionCtx,equipment,coupons)}));
  });

  app.post('/thanh-toan/nhom/:groupCode/khoi-tao',async(request,reply)=>{
    if(!request.sessionCtx)return reply.redirect('/tai-khoan/dang-nhap');
    const {groupCode}=request.params as {groupCode:string};
    const body=(request.body||{}) as Record<string,string>;
    verifyCsrfToken(request.sessionCtx,body._csrf,request.headers['x-csrf-token'] as string);
    const addons:Record<string,Array<{equipmentId:string;quantity:number}>>={};
    for(const [key,value] of Object.entries(body)) {
      if(!key.startsWith('addon:'))continue;
      const [,code,...id]=key.split(':'); const quantity=Number(value);
      if(!Number.isInteger(quantity)||quantity<0)throw new AppError({code:'INVALID_QUANTITY',statusCode:400,publicMessage:'Số lượng dịch vụ không hợp lệ.'});
      if(quantity) (addons[code]||=[]).push({equipmentId:id.join(':'),quantity});
    }
    try {
      const payment=await initiateGroupPayment(groupCode,request.sessionCtx.user,{contactName:body.contactName,contactPhone:body.contactPhone,contactEmail:body.contactEmail,couponCode:body.couponCode,addons},db);
      const method=['QR_PAY','ATM_CARD','INT_CARD'].includes(body.paymentMethod)?body.paymentMethod:'QR_PAY';
      return reply.redirect(payment.checkoutUrl+(payment.checkoutUrl.includes('?')?'&':'?')+'paymentMethod='+method);
    } catch(error) {
      if(error instanceof AppError)return reply.redirect(`/thanh-toan/nhom/${encodeURIComponent(groupCode)}?thongBaoLoi=${encodeURIComponent(error.publicMessage)}`);
      throw error;
    }
  });

  app.post('/dat-san/giu-cho', async (request, reply) => {
    const body = (request.body || {}) as Record<string, string>;
    const courtId = (body.courtId || '').trim();
    const bookingDate = (body.bookingDate || '').trim();
    const startHour = body.startHour;

    let slotItems: Array<{ courtId: string; bookingDate: string; startHour: number }> = [];
    if (body.selectedSlotsJson) {
      try {
        const parsed = JSON.parse(body.selectedSlotsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          slotItems = parsed.map((s: any) => ({
            courtId: String(s.courtId || '').trim(),
            bookingDate: String(s.date || s.bookingDate || '').trim(),
            startHour: Number(s.startHour),
          })).filter((s) => s.courtId && s.bookingDate && Number.isInteger(s.startHour));
        }
      } catch {}
    }

    if (slotItems.length === 0) {
      slotItems.push({
        courtId,
        bookingDate,
        startHour: Number(startHour),
      });
    }

    // Nếu khách chưa đăng nhập -> giữ lại toàn bộ lựa chọn của khách (kể cả combo nhiều sân) và chuyển sang trang đăng nhập
    if (!request.sessionCtx) {
      const first = slotItems[0];
      const slotsParam =
        slotItems.length > 1
          ? `&selectedSlotsJson=${encodeURIComponent(
              JSON.stringify(slotItems.map((s) => ({ courtId: s.courtId, date: s.bookingDate, startHour: s.startHour })))
            )}`
          : '';
      return reply.redirect(
        `/tai-khoan/dang-nhap?tiepTucDatSan=1&courtId=${encodeURIComponent(first.courtId)}&date=${encodeURIComponent(first.bookingDate)}&startHour=${encodeURIComponent(first.startHour)}${slotsParam}`
      );
    }

    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);

    const rl = rateLimiter.check(`hold:${request.sessionCtx.user.id}`, 25, 60 * 1000);
    if (!rl.allowed) {
      throw new AppError({
        code: 'RATE_LIMIT_HOLD',
        statusCode: 429,
        publicMessage: 'Bạn đang thao tác giữ chỗ quá nhanh. Vui lòng đợi ít giây rồi thử lại.',
      });
    }

    const batchRes = await createBatchBookingHolds(
      {
        user: request.sessionCtx.user,
        slots: slotItems,
        idempotencyKey: slotItems.length === 1 ? body.idempotencyKey : undefined,
      },
      db
    );

    return reply.redirect(`/thanh-toan/${encodeURIComponent(batchRes.primaryBooking.booking_code)}`);
  });

  app.post('/api/bookings/hold', async (request, reply) => {
    if (!request.sessionCtx) {
      throw new AppError({
        code: 'AUTH_REQUIRED',
        statusCode: 401,
        publicMessage: 'Vui lòng đăng nhập để giữ chỗ đặt sân.',
      });
    }
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);

    const res = await createOrReuseBookingHold(
      {
        user: request.sessionCtx.user,
        courtId: String(body.courtId || ''),
        bookingDate: String(body.bookingDate || ''),
        startHour: Number(body.startHour),
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        notes: body.notes,
        idempotencyKey: body.idempotencyKey,
      },
      db
    );
    return reply.status(res.reusedExistingHold ? 200 : 201).send({
      ok: true,
      reusedExistingHold: res.reusedExistingHold,
      booking: res.booking,
    });
  });

  app.get('/thanh-toan/:bookingCode', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }
    const params = request.params as { bookingCode: string };
    const groupCode = await groupCodeForBooking(params.bookingCode, db);
    if(groupCode) return reply.redirect('/thanh-toan/nhom/'+encodeURIComponent(groupCode));
    const q = (request.query || {}) as Record<string, string>;
    const detail = await getBookingForViewer(params.bookingCode, request.sessionCtx.user, db);
    const center = await getCenterInfo(db);

    if (detail.booking.booking_status === 'CONFIRMED') {
      return reply.redirect(`/don-dat/${encodeURIComponent(detail.booking.booking_code)}`);
    }

    const notifData = await getUserNotificationData(request.sessionCtx.user.id, db);
    const availableCoupons = await getActivePublicCoupons(6, db, request.sessionCtx.user.id);
    const equipmentItems = await getEquipmentServices({ activeOnly: true }, db);
    const html = renderPageLayout({
      title: `Thanh Toán Đơn Đặt Sân ${detail.booking.booking_code} | Be Badminton Gò Vấp`,
      description: `Cổng thanh toán trực tuyến an toàn cho đơn đặt sân ${detail.booking.booking_code}. Hỗ trợ VietQR chuyển khoản ngân hàng, ví điện tử MoMo/ZaloPay và thẻ thanh toán.`,
      activeNav: 'bookings',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderCheckoutPage({
        booking: detail.booking,
        center,
        session: request.sessionCtx,
        coupons: availableCoupons,
        equipmentItems,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/thanh-toan/:bookingCode/khoi-tao', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);

    let calculatedServiceFee = 0;
    const summaryList: string[] = [];
    let parsedAddons: Record<string,number> = {};
    try { parsedAddons = JSON.parse(body.addonsJson || '{}'); } catch { throw new AppError({code:'INVALID_ADDONS',statusCode:400,publicMessage:'Danh sách dụng cụ không hợp lệ.'}); }
    if (!parsedAddons || Array.isArray(parsedAddons) || typeof parsedAddons!=='object') throw new AppError({code:'INVALID_ADDONS',statusCode:400,publicMessage:'Danh sách dụng cụ không hợp lệ.'});
    const addons = Object.entries(parsedAddons).map(([equipmentId, quantity])=>({equipmentId,quantity}));
    const catalog = await getEquipmentServices({activeOnly:true},db);
    for(const entry of addons) {
      const item=catalog.find(i=>i.id===entry.equipmentId);
      if(!item || !Number.isSafeInteger(entry.quantity) || entry.quantity<=0) throw new AppError({code:'INVALID_ADDONS',statusCode:400,publicMessage:'Dụng cụ hoặc số lượng không hợp lệ.'});
      calculatedServiceFee+=item.priceVnd*entry.quantity;
      summaryList.push(item.name);
    }

    let couponDiscountVnd = 0;
    let appliedCouponCode: string | undefined = undefined;
    if (body.couponCode) {
      const bkgRes = await db.query<{ quoted_price_vnd: number }>(
        `SELECT quoted_price_vnd FROM bookings WHERE booking_code = $1`,
        [params.bookingCode]
      );
      const basePrice = bkgRes.rows[0]?.quoted_price_vnd || 0;
      const orderAmountVnd = basePrice + calculatedServiceFee;
      const couponCheck = await validateAndCalculateCouponDiscount(
        body.couponCode,
        orderAmountVnd,
        db,
        request.sessionCtx.user.id
      );
      if (couponCheck.valid) {
        couponDiscountVnd = couponCheck.discountVnd;
        appliedCouponCode = couponCheck.coupon?.code;
        // Lưu ý: Lượt dùng coupon (used_count) chỉ được trừ trong processPaymentWebhook khi thanh toán thành công!
      }
    }

    const paymentInit = await initiatePaymentForBooking(
      params.bookingCode,
      request.sessionCtx.user,
      {
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        notes: body.notes,
        addons,
        serviceFeeVnd: calculatedServiceFee,
        selectedAddonsSummary: summaryList.length > 0 ? `Dịch vụ kèm theo: ${summaryList.join(', ')}` : undefined,
        couponCode: appliedCouponCode,
        discountAmountVnd: couponDiscountVnd,
      },
      db
    );

    const paymentMethod = (body.paymentMethod || 'QR_PAY').trim();
    const bankCode = (body.bankCode || 'VNPAYQR').trim();
    const sep = paymentInit.checkoutUrl.includes('?') ? '&' : '?';
    return reply.redirect(
      `${paymentInit.checkoutUrl}${sep}paymentMethod=${encodeURIComponent(paymentMethod)}&bankCode=${encodeURIComponent(bankCode)}`
    );
  });

  // Return URL từ cổng thanh toán:
  // TUYỆT ĐỐI KHÔNG xác nhận thanh toán chỉ vì trình duyệt quay về URL này!
  // Chỉ đọc trạng thái thực tế của đơn từ máy chủ và hiển thị cho khách.
  app.get('/thanh-toan/ket-qua', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string>;
    const bookingCode = (q.bookingCode || '').trim();
    if (!bookingCode) {
      return reply.redirect('/don-dat');
    }
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }

    if(bookingCode.startsWith('TT-')) return reply.redirect('/thanh-toan/nhom/'+encodeURIComponent(bookingCode));
    const detail = await getBookingForViewer(bookingCode, request.sessionCtx.user, db);
    const b = detail.booking;

    if (b.booking_status === 'CONFIRMED' && b.payment_status === 'PAID') {
      return reply.redirect(
        `/don-dat/${encodeURIComponent(b.booking_code)}?thongBaoThanhCong=${encodeURIComponent('Thanh toán đã được xác thực thành công. Lịch đặt sân của bạn đã được xác nhận!')}`
      );
    }

    if (b.payment_status === 'LATE_PAID_CONFLICT') {
      return reply.redirect(
        `/don-dat/${encodeURIComponent(b.booking_code)}?thongBaoLoi=${encodeURIComponent('Khoản thanh toán đến sau khi thời gian giữ chỗ 5 phút đã hết hạn. Hệ thống đã ghi nhận và tự động tạo lệnh hoàn tiền 100% cho bạn.')}`
      );
    }

    if (b.payment_status === 'FAILED') {
      return reply.redirect(
        `/thanh-toan/${encodeURIComponent(b.booking_code)}?thongBaoLoi=${encodeURIComponent('Giao dịch thanh toán chưa thành công. Bạn có thể thử thanh toán lại nếu còn thời gian giữ chỗ.')}`
      );
    }

    return reply.redirect(
      `/don-dat/${encodeURIComponent(b.booking_code)}?thongBao=${encodeURIComponent('Hệ thống đang đọc trạng thái xác thực giao dịch từ cổng thanh toán.')}`
    );
  });

  // Kênh thông báo IPN / Webhook đáng tin cậy từ nhà cung cấp thanh toán
  app.post('/api/payments/webhook', async (request, reply) => {
    const body = (request.body || {}) as Record<string, any>;
    const result = await processPaymentWebhook(
      {
        merchantTxnRef: String(body.merchantTxnRef || ''),
        providerTxnNo: String(body.providerTxnNo || ''),
        amountVnd: Number(body.amountVnd || 0),
        currency: String(body.currency || ''),
        responseCode: String(body.responseCode || ''),
        paidAtIso: body.paidAtIso ? String(body.paidAtIso) : undefined,
        signature: String(body.signature || ''),
      },
      db
    );

    // Chạy tác vụ nền (ví dụ hoàn tiền tự động nếu thanh toán trễ hoặc gửi thông báo email)
    await processPendingBackgroundJobs(db);

    return reply.send({
      ok: true,
      outcome: result.outcome,
      bookingCode: result.bookingCode,
    });
  });

  // Bộ mô phỏng cổng thanh toán (Sandbox):
  // Cô lập hoàn toàn, tuyệt đối không xuất hiện nếu chạy ở chế độ production!
  app.get('/cong-thanh-toan-sandbox', async (request, reply) => {
    if (config.paymentMode === 'production' || config.nodeEnv === 'production') {
      return reply.status(404).send('Không tồn tại trên môi trường production.');
    }
    const q = (request.query || {}) as Record<string, string>;
    const html = renderSandboxGatewayPage({
      merchantId: q.merchantId || config.paymentMerchantId,
      merchantTxnRef: q.merchantTxnRef || '',
      bookingCode: q.bookingCode || '',
      amountVnd: Number(q.amountVnd || '0'),
      currency: q.currency || 'VND',
      expiresAtIso: q.expiresAt || '',
      returnUrl: q.returnUrl || `/don-dat/${encodeURIComponent(q.bookingCode || '')}`,
      signature: q.signature || '',
      paymentMethod: q.paymentMethod || 'QR_PAY',
      bankCode: q.bankCode || 'VNPAYQR',
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/cong-thanh-toan-sandbox/xu-ly', async (request, reply) => {
    if (config.paymentMode === 'production' || config.nodeEnv === 'production') {
      return reply.status(404).send('Không tồn tại trên môi trường production.');
    }
    const body = (request.body || {}) as Record<string, string>;
    const isSuccess = body.action === 'SUCCESS';
    const responseCode = isSuccess ? '00' : '24';
    const providerTxnNo = `VNP-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const amountVnd = Number(body.amountVnd || '0');
    const currency = body.currency || 'VND';
    const merchantTxnRef = body.merchantTxnRef || '';

    const webhookSig = paymentGateway.signWebhookPayload({
      merchantTxnRef,
      providerTxnNo,
      amountVnd,
      currency,
      responseCode,
    });

    const senderBankName = (body.senderBankName || 'MB Bank (Quân Đội)').trim();
    const senderBankCode = (body.senderBankCode || 'MB').trim();
    const senderAccountNo = (body.senderAccountNo || '0987654321').trim();
    const senderAccountName = (body.senderAccountName || 'NGUYEN VAN A').trim().toUpperCase();

    await processPaymentWebhook(
      {
        merchantTxnRef,
        providerTxnNo,
        amountVnd,
        currency,
        responseCode,
        signature: webhookSig,
        senderBankName,
        senderBankCode,
        senderAccountNo,
        senderAccountName,
      },
      db
    );
    await processPendingBackgroundJobs(db);

    const targetUrl = body.returnUrl || `/thanh-toan/ket-qua?bookingCode=${encodeURIComponent(body.bookingCode || '')}`;
    return reply.redirect(targetUrl);
  });

  // Danh sách đơn đặt và Chi tiết đơn đặt
  app.get('/don-dat', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }
    const q = (request.query || {}) as Record<string, string>;
    const statusFilter = (q.status || '').trim();
    const page = Math.max(1, Number(q.page || '1') || 1);
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    await processPendingBackgroundJobs(db);

    const params: unknown[] = [request.sessionCtx.user.id];
    let whereSql = `WHERE user_id = $1 AND NOT is_ticket_component`;
    if (statusFilter) {
      params.push(statusFilter);
      whereSql += ` AND booking_status = $${params.length}`;
    }

    const countRes = await db.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM bookings ${whereSql}`, params);
    const totalCount = Number(countRes.rows[0]?.cnt || '0');
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const listRes = await db.query<BookingRecord>(
      `SELECT b.*, pg.code AS payment_group_code
       FROM bookings b
       LEFT JOIN booking_tickets bt ON bt.id = b.ticket_id
       LEFT JOIN payment_groups pg ON pg.id = bt.payment_group_id
       ${whereSql.replace(/\buser_id\b/g, 'b.user_id').replace(/\bbooking_status\b/g, 'b.booking_status').replace(/\bis_ticket_component\b/g, 'b.is_ticket_component')}
       ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const notifData = await getUserNotificationData(request.sessionCtx.user.id, db);
    const html = renderPageLayout({
      title: 'Lịch Sử & Quản Lý Đơn Đặt Sân Của Tôi | Be Badminton Gò Vấp',
      description: 'Theo dõi tất cả đơn đặt sân cầu lông, mã QR vé nhận sân check-in và trạng thái hoàn tiền tại Be Badminton Gò Vấp.',
      activeNav: 'bookings',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderMyBookingsPage({
        bookings: listRes.rows,
        statusFilter,
        page,
        totalPages,
        totalCount,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/don-dat/:bookingCode/in-ve', async (request, reply) => {
    if (!request.sessionCtx) return reply.redirect('/tai-khoan/dang-nhap');
    const { bookingCode } = request.params as { bookingCode: string };
    const { booking } = await getBookingForViewer(bookingCode, request.sessionCtx.user, db);
    reply.header('Cache-Control', 'private, no-store');
    if (!canPrintBookingTicket(booking)) return reply.status(409).type('text/html; charset=utf-8').send('<p>Chỉ in vé cho đơn đã thanh toán và còn hiệu lực hoặc đã hoàn tất.</p>');
    return reply.type('text/html; charset=utf-8').send(renderBookingTicket(booking));
  });

  app.get('/don-dat/:bookingCode', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }
    const params = request.params as { bookingCode: string };
    const q = (request.query || {}) as Record<string, string>;

    await processPendingBackgroundJobs(db);
    const detail = await getBookingForViewer(params.bookingCode, request.sessionCtx.user, db);
    const notifData = await getUserNotificationData(request.sessionCtx.user.id, db);

    const html = renderPageLayout({
      title: `Chi Tiết Vé Đặt Sân ${detail.booking.booking_code} | Be Badminton Gò Vấp`,
      description: `Mã vé điện tử và thông tin chi tiết lịch thi đấu đơn ${detail.booking.booking_code} tại Be Badminton Gò Vấp.`,
      activeNav: 'bookings',
      session: request.sessionCtx,
      unreadNotificationsCount: notifData.unreadCount,
      recentNotifications: notifData.recent,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderBookingDetailPage({
        ...detail,
        session: request.sessionCtx,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/don-dat/:bookingCode/huy', async (request, reply) => {
    if (!request.sessionCtx) {
      return reply.redirect('/tai-khoan/dang-nhap');
    }
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);

    const cancelRes = await cancelBookingByCustomer(
      params.bookingCode,
      request.sessionCtx.user,
      body.reason || 'Khách hàng chủ động hủy đơn',
      db
    );

    // Kích hoạt chạy tác vụ nền ngay sau khi đã ghi nhận hủy bền vững
    await processPendingBackgroundJobs(db);

    const msg = cancelRes.refundQueued
      ? 'Đơn đã được hủy. Chúng tôi đang xử lý khoản hoàn.'
      : 'Đã hủy lượt giữ chỗ chưa thanh toán và giải phóng sân.';

    return reply.redirect(
      `/don-dat/${encodeURIComponent(cancelRes.booking.booking_code)}?thongBaoThanhCong=${encodeURIComponent(msg)}`
    );
  });

  app.post('/api/bookings/:bookingCode/cancel', async (request, reply) => {
    if (!request.sessionCtx) {
      throw new AppError({
        code: 'AUTH_REQUIRED',
        statusCode: 401,
        publicMessage: 'Vui lòng đăng nhập để hủy đơn đặt sân.',
      });
    }
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(request.sessionCtx, body._csrf, request.headers['x-csrf-token'] as string);

    const cancelRes = await cancelBookingByCustomer(
      params.bookingCode,
      request.sessionCtx.user,
      body.reason || 'Hủy qua API',
      db
    );
    await processPendingBackgroundJobs(db);
    const updatedDetail = await getBookingForViewer(params.bookingCode, request.sessionCtx.user, db);

    return reply.send({
      ok: true,
      booking: updatedDetail.booking,
      refundQueued: cancelRes.refundQueued,
      refundAmountVnd: cancelRes.refundAmountVnd,
    });
  });

  // ─── 5. KHU VỰC QUẢN TRỊ (/quan-tri/*) ───
  function assertStaffOrAdmin(session: SessionContext | null): SessionContext {
    if (!session) {
      throw new AppError({
        code: 'AUTH_REQUIRED',
        statusCode: 401,
        publicMessage: 'Vui lòng đăng nhập bằng tài khoản nhân sự hoặc quản trị viên để truy cập khu vực này.',
      });
    }
    if (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF') {
      throw new AppError({
        code: 'FORBIDDEN_ADMIN_AREA',
        statusCode: 403,
        publicMessage: 'Tài khoản khách hàng không có quyền truy cập khu vực quản trị vận hành của trung tâm.',
      });
    }
    return session;
  }

  app.get('/quan-tri', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    await processPendingBackgroundJobs(db);

    const metrics = await getAdminOperationalMetrics({ fromDate: q.fromDate, toDate: q.toDate }, db);
    const logsRes = await db.query<{
      id: string;
      actor_role: string;
      action: string;
      summary_vi: string;
      created_at: string | Date;
    }>(`SELECT id, actor_role, action, summary_vi, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 20`);
    const priceBoard = await getPriceBoardSettings(db);

    const html = renderAdminDashboardLayout({
      title: 'Trung Tâm Điều Hành & Quản Trị Vận Hành | Be Badminton Gò Vấp',
      description: 'Hệ thống quản trị CourtGo cho Be Badminton: điều hành 18 sân thi đấu, doanh thu, đơn đặt sân, bảng giá niêm yết và hội viên.',
      activeNav: 'overview',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminDashboardPage({
        session,
        metrics,
        recentAuditLogs: logsRes.rows,
        priceBoard,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/quan-tri/san-va-gia', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    const schedule = await getScheduleAndAvailability({ date: q.date, includeInactiveCourts: true }, db);
    const blocksRes = await db.query<{
      id: string;
      court_id: string;
      court_name: string;
      block_date: string;
      start_hour: number;
      end_hour: number;
      reason: string;
      created_at: string | Date;
    }>(
      `SELECT cb.id, cb.court_id, c.name AS court_name, cb.block_date, cb.start_hour, cb.end_hour, cb.reason, cb.created_at
       FROM court_blocks cb
       JOIN courts c ON c.id = cb.court_id
       WHERE cb.is_active = TRUE
       ORDER BY cb.block_date ASC, cb.start_hour ASC`
    );

    const priceBoard = await getPriceBoardSettings(db);
    const html = renderAdminDashboardLayout({
      title: 'Sân & giá | Be Badminton',
      description: 'Phân hệ quản trị 18 sân thi đấu Be Badminton: chỉnh sửa bảng giá niêm yết theo khung giờ, khóa lịch bảo trì và cấu hình sân.',
      activeNav: 'courts',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminCourtsAndPricingPage({
        session,
        courts: schedule.courts,
        priceBoard,
        activeBlocks: blocksRes.rows,
        selectedDate: schedule.selectedDate,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/san/:courtId/cap-nhat', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { courtId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const amenities = (body.amenitiesCsv || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let images: Array<{ imageUrl: string; caption: string; isPrimary: boolean }> | undefined;
    if (body.imagesJson && body.imagesJson.trim()) {
      try {
        const parsed = JSON.parse(body.imagesJson) as Array<{ url?: string; imageUrl?: string; caption?: string; isPrimary?: boolean }>;
        if (Array.isArray(parsed)) {
          images = parsed
            .map((item, idx) => ({
              imageUrl: (item.url || item.imageUrl || '').trim(),
              caption: (item.caption || `Hình ảnh sân ${body.name || ''} (${idx + 1})`).trim(),
              isPrimary: idx === 0 || Boolean(item.isPrimary),
            }))
            .filter((img) => Boolean(img.imageUrl));
        }
      } catch {
        // Fall back to rawImagesText
      }
    }
    if (images === undefined) {
      const rawImagesText = body.imageUrlsText || '';
      images = rawImagesText.trim()
        ? rawImagesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const parts = line.split('|').map((p) => p.trim());
              return {
                imageUrl: parts[0],
                caption: parts[1] || `Hình ảnh sân ${body.name || ''} (${idx + 1})`,
                isPrimary: idx === 0,
              };
            })
        : undefined;
    }

    await adminUpdateCourt(
      session,
      params.courtId,
      {
        name: body.name || '',
        courtType: body.courtType || '',
        surfaceDesc: body.surfaceDesc || '',
        lightingDesc: body.lightingDesc || '',
        description: body.description || '',
        usageNotes: body.usageNotes || '',
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        basePriceVnd: parsePriceVnd(body.basePriceVnd || '0'),
        amenities,
        images,
      },
      db
    );

    return reply.redirect(
      `/quan-tri/san-va-gia?thongBaoThanhCong=${encodeURIComponent('Đã cập nhật thông tin sân và giá áp dụng thành công.')}`
    );
  });

  app.post('/api/quan-tri/tai-anh-san', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const base64Data = (body.base64Data || '').trim();
    if (!base64Data || !base64Data.includes(',')) {
      return reply.status(400).send({ ok: false, message: 'Dữ liệu ảnh không hợp lệ.' });
    }

    const courtId = (body.courtId || '').trim();
    if (!courtId || !(await db.query('SELECT id FROM courts WHERE id=$1', [courtId])).rows.length) {
      return reply.status(400).send({ ok: false, message: 'Không tìm thấy sân cần cập nhật ảnh.' });
    }

    try {
      const match = base64Data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) {
        return reply.status(400).send({ ok: false, message: 'Định dạng ảnh không được hỗ trợ.' });
      }

      let ext = match[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'svg+xml') ext = 'svg';

      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ok:false,message:'Ảnh phải có dung lượng từ 1 byte đến 10 MB.'});
      }
      const filename = `be-court-upload-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
      const saveDir = path.join(PUBLIC_DIR, 'images', 'courts');
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      const filePath = path.join(saveDir, filename);
      fs.writeFileSync(filePath, buffer);

      const imageUrl = `/public/images/courts/${filename}`;

      // Nếu có courtId, tự động lưu ngay vào DB cho sân tương ứng
      if (courtId) {
        const countRes = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM court_images WHERE court_id = $1`,
          [courtId]
        );
        const count = parseInt(countRes.rows[0]?.count || '0', 10);
        const isPrimary = count === 0;
        const sortOrder = count + 1;
        await db.query(
          `INSERT INTO court_images (id, court_id, image_url, caption, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`img-${crypto.randomUUID()}`, courtId, imageUrl, `Ảnh sân`, isPrimary, sortOrder]
        );
      }

      return reply.send({
        ok: true,
        imageUrl,
        filename,
        caption: `Ảnh sân`,
      });
    } catch (err: any) {
      return reply.status(500).send({ ok: false, message: err.message || 'Lỗi khi lưu ảnh sân.' });
    }
  });

  app.post('/api/quan-tri/anh-chinh-san', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);
    const courtId = (body.courtId || '').trim(), imageUrl = (body.imageUrl || '').trim();
    const found = await db.query('SELECT id FROM court_images WHERE court_id=$1 AND image_url=$2', [courtId, imageUrl]);
    if (!found.rows.length) return reply.status(404).send({ok:false,message:'Không tìm thấy ảnh của sân.'});
    await db.withTransaction(async tx => {
      await tx.query('UPDATE court_images SET is_primary=(image_url=$2), sort_order=CASE WHEN image_url=$2 THEN 0 ELSE sort_order+1 END WHERE court_id=$1', [courtId,imageUrl]);
    });
    return reply.send({ok:true});
  });

  app.post('/api/quan-tri/xoa-anh-san', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const courtId = (body.courtId || '').trim();
    const imageUrl = (body.imageUrl || '').trim();
    if (!courtId || !imageUrl) {
      return reply.status(400).send({ ok: false, message: 'Thiếu thông tin sân hoặc ảnh cần xóa.' });
    }

    try {
      await db.query(
        `DELETE FROM court_images WHERE court_id = $1 AND image_url = $2`,
        [courtId, imageUrl]
      );

      // Đảm bảo sân luôn có một ảnh chính nếu danh sách ảnh còn lại
      const remaining = await db.query<{ id: string; is_primary: boolean }>(
        `SELECT id, is_primary FROM court_images WHERE court_id = $1 ORDER BY sort_order ASC`,
        [courtId]
      );
      if (remaining.rows.length > 0 && !remaining.rows.some((r) => r.is_primary)) {
        await db.query(`UPDATE court_images SET is_primary = TRUE WHERE id = $1`, [remaining.rows[0].id]);
      }

      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(500).send({ ok: false, message: err.message || 'Lỗi khi xóa ảnh sân.' });
    }
  });

  app.post('/quan-tri/san/them-moi', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const amenities = (body.amenitiesCsv || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let images: Array<{ imageUrl: string; caption: string; isPrimary: boolean }> | undefined;
    if (body.imagesJson && body.imagesJson.trim()) {
      try {
        const parsed = JSON.parse(body.imagesJson) as Array<{ url?: string; imageUrl?: string; caption?: string; isPrimary?: boolean }>;
        if (Array.isArray(parsed)) {
          images = parsed
            .map((item, idx) => ({
              imageUrl: (item.url || item.imageUrl || '').trim(),
              caption: (item.caption || `Hình ảnh sân ${body.name || ''} (${idx + 1})`).trim(),
              isPrimary: idx === 0 || Boolean(item.isPrimary),
            }))
            .filter((img) => Boolean(img.imageUrl));
        }
      } catch {
        // Fall back to rawImagesText
      }
    }
    if (images === undefined) {
      const rawImagesText = body.imageUrlsText || '';
      images = rawImagesText.trim()
        ? rawImagesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const parts = line.split('|').map((p) => p.trim());
              return {
                imageUrl: parts[0],
                caption: parts[1] || `Hình ảnh sân ${body.name || ''} (${idx + 1})`,
                isPrimary: idx === 0,
              };
            })
        : undefined;
    }

    await adminCreateCourt(
      session,
      {
        code: body.code || '',
        name: body.name || '',
        courtType: body.courtType || 'Tiêu chuẩn thi đấu',
        surfaceDesc: body.surfaceDesc || 'Thảm PVC tiêu chuẩn',
        lightingDesc: body.lightingDesc || 'Đèn LED chống chói',
        description: body.description || 'Sân cầu lông trong nhà tiêu chuẩn.',
        usageNotes: body.usageNotes || 'Bắt buộc mang giày chuyên dụng cầu lông.',
        basePriceVnd: parsePriceVnd(body.basePriceVnd || '130000'),
        amenities,
        images,
      },
      db
    );

    return reply.redirect(
      `/quan-tri/san-va-gia?thongBaoThanhCong=${encodeURIComponent('Đã thêm sân cầu lông mới vào hệ thống.')}`
    );
  });

  app.post('/quan-tri/quy-tac-gia', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      await adminUpsertPricingRule(
        session,
        {
          ruleId: body.ruleId || undefined,
          courtId: body.courtId || '',
          dayType: (body.dayType as any) || 'WEEKDAY',
          startHour: Number(body.startHour),
          endHour: Number(body.endHour),
          priceVnd: parsePriceVnd(body.priceVnd),
          label: body.label || 'Khung giờ cập nhật',
        },
        db
      );

      return reply.redirect(
        `/quan-tri/san-va-gia?thongBaoThanhCong=${encodeURIComponent('Đã lưu quy tắc giá mới và đồng bộ bảng giá thành công!')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/san-va-gia?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi cập nhật quy tắc giá.')}`
      );
    }
  });

  app.post('/quan-tri/bang-gia-niem-yet', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const returnUrl = body.returnUrl && body.returnUrl.startsWith('/quan-tri') ? body.returnUrl : '/quan-tri/san-va-gia';
    const sep = returnUrl.includes('?') ? '&' : '?';

    try {
      const tierKeys = ['wd_morning', 'wd_day', 'wd_peak', 'wd_night', 'weekend'];
      const tiers = tierKeys.map((tk) => ({
        tierKey: tk,
        priceGuestVnd: parsePriceVnd(body[`priceGuest_${tk}`]),
        priceFixedVnd: parsePriceVnd(body[`priceFixed_${tk}`]),
        studentGuestVnd: body[`studentGuest_${tk}`] ? parsePriceVnd(body[`studentGuest_${tk}`]) : null,
        studentFixedVnd: body[`studentFixed_${tk}`] ? parsePriceVnd(body[`studentFixed_${tk}`]) : null,
        subLabel: body[`subLabel_${tk}`] !== undefined ? body[`subLabel_${tk}`] : null,
      }));

      await adminUpdateOfficialPriceBoard(session, { tiers }, db);

      return reply.redirect(
        `${returnUrl}${sep}thongBaoThanhCong=${encodeURIComponent('Đã cập nhật bảng giá niêm yết và đồng bộ thành công vào toàn bộ 18 sân Be Badminton!')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `${returnUrl}${sep}thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi cập nhật bảng giá niêm yết.')}`
      );
    }
  });

  app.post('/quan-tri/khoa-lich', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    await adminCreateCourtBlock(
      session,
      {
        courtId: body.courtId || '',
        blockDate: body.blockDate || '',
        startHour: Number(body.startHour),
        reason: body.reason || '',
      },
      db
    );

    return reply.redirect(
      `/quan-tri/san-va-gia?thongBaoThanhCong=${encodeURIComponent('Đã khóa khung giờ bảo trì thành công.')}`
    );
  });

  app.post('/quan-tri/mo-khoa-lich', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    await adminReleaseCourtBlock(session, body.blockId || '', db);
    return reply.redirect(
      `/quan-tri/san-va-gia?thongBaoThanhCong=${encodeURIComponent('Đã mở lại khung giờ bảo trì để khách đặt sân.')}`
    );
  });

  app.get('/quan-tri/don-dat', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    await processPendingBackgroundJobs(db);

    const search = (q.search || '').trim();
    const courtId = (q.courtId || '').trim();
    const date = (q.date || '').trim();
    const status = (q.status || '').trim();

    const params: unknown[] = [];
    const conds: string[] = ['NOT is_ticket_component'];

    if (search) {
      params.push(`%${search}%`);
      conds.push(
        `(booking_code ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR contact_phone ILIKE $${params.length})`
      );
    }
    if (courtId) {
      params.push(courtId);
      conds.push(`court_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conds.push(`booking_date = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conds.push(`booking_status = $${params.length}`);
    }

    const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const bookingsRes = await db.query<BookingRecord>(
      `SELECT * FROM bookings ${whereClause} ORDER BY created_at DESC LIMIT 60`,
      params
    );
    const courtsRes = await db.query<{ id: string; name: string }>(`SELECT id, name FROM courts ORDER BY sort_order ASC`);
    const fixedReqsRes = await db.query<FixedBookingRequestRecord>(
      `SELECT * FROM fixed_booking_requests ORDER BY created_at DESC LIMIT 50`
    );

    const html = renderAdminDashboardLayout({
      title: 'Đơn đặt | Be Badminton',
      description: 'Theo dõi danh sách đơn đặt sân cầu lông, tra cứu mã đơn, xác nhận check-in và hỗ trợ khách hàng tiếp đón tại sân.',
      activeNav: 'bookings',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminBookingsPage({
        session,
        bookings: bookingsRes.rows,
        fixedRequests: fixedReqsRes.rows,
        courts: courtsRes.rows,
        filters: { search, courtId, date, status },
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/co-dinh-thang/:id/trang-thai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const allowedStatuses = ['NEW', 'CONTACTED', 'CONFIRMED', 'CANCELLED'];
    const targetStatus = allowedStatuses.includes(body.status) ? body.status : 'CONTACTED';
    const adminNote = (body.adminNote || '').trim() || null;

    const updatedRes = await db.query<FixedBookingRequestRecord>(
      `UPDATE fixed_booking_requests
       SET status = $1, admin_note = $2, handled_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [targetStatus, adminNote, session.user.id, params.id]
    );

    if (updatedRes.rows[0]) {
      const reqRow = updatedRes.rows[0];
      await db.query(
        `INSERT INTO admin_audit_logs (
          id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, ip_address, created_at
        ) VALUES ($1, $2, $3, 'UPDATE_FIXED_BOOKING_REQUEST', 'FIXED_BOOKING_REQUEST', $4, $5, $6, NOW())`,
        [
          `audit-${crypto.randomUUID()}`,
          session.user.id,
          session.user.role,
          reqRow.id,
          `Cập nhật yêu cầu đặt lịch cố định tháng ${reqRow.request_code} (SĐT ${reqRow.contact_phone}) sang trạng thái ${targetStatus}`,
          request.ip,
        ]
      );
    }

    return reply.redirect(
      `/quan-tri/don-dat?thongBaoThanhCong=${encodeURIComponent('Đã cập nhật trạng thái xử lý yêu cầu đặt sân cố định tháng.')}#yeu-cau-co-dinh-thang`
    );
  });

  app.post('/quan-tri/don-dat/:bookingCode/trang-thai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const targetStatus = body.targetStatus as 'CHECKED_IN' | 'COMPLETED';
    await adminTransitionBookingStatus(session, params.bookingCode, targetStatus, body.note, db);

    return reply.redirect(
      `/quan-tri/don-dat?thongBaoThanhCong=${encodeURIComponent(`Đã cập nhật trạng thái vận hành cho đơn ${params.bookingCode}.`)}`
    );
  });

  app.post('/quan-tri/don-dat/check-in-nhanh', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const input = (body.bookingCodeOrPhone || '').trim();
    if (!input) {
      return reply.redirect(
        `/quan-tri/don-dat?thongBaoLoi=${encodeURIComponent('Vui lòng nhập Mã đơn đặt hoặc Số điện thoại của khách.')}`
      );
    }

    try {
      let bookingCode = input;
      // Nếu không bắt đầu bằng tiền tố CG-, tìm theo SĐT
      if (!input.toUpperCase().startsWith('CG-')) {
        const findRes = await db.query<{ booking_code: string; booking_status: string }>(
          `SELECT b.booking_code, b.booking_status
           FROM bookings b
           LEFT JOIN users u ON u.id = b.user_id
           WHERE (b.contact_phone = $1 OR u.phone = $1)
             AND b.booking_status IN ('CONFIRMED', 'CHECKED_IN')
           ORDER BY CASE WHEN b.booking_status = 'CONFIRMED' THEN 1 ELSE 2 END, b.booking_date ASC, b.start_hour ASC
           LIMIT 1`,
          [input]
        );

        if (findRes.rows.length === 0) {
          return reply.redirect(
            `/quan-tri/don-dat?thongBaoLoi=${encodeURIComponent(`Không tìm thấy đơn đặt sân hợp lệ nào cho SĐT [${input}].`)}&search=${encodeURIComponent(input)}`
          );
        }

        if (findRes.rows[0].booking_status === 'CHECKED_IN') {
          return reply.redirect(
            `/quan-tri/don-dat?thongBaoThanhCong=${encodeURIComponent(`Đơn [${findRes.rows[0].booking_code}] của SĐT ${input} đã nhận sân trước đó.`)}&search=${encodeURIComponent(findRes.rows[0].booking_code)}`
          );
        }

        bookingCode = findRes.rows[0].booking_code;
      }

      await adminTransitionBookingStatus(session, bookingCode, 'CHECKED_IN', 'Khách check-in nhanh tại quầy lễ tân', db);

      return reply.redirect(
        `/quan-tri/don-dat?thongBaoThanhCong=${encodeURIComponent(`✓ Check-in thành công! Khách đã nhận sân cho đơn [${bookingCode}].`)}&search=${encodeURIComponent(bookingCode)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/don-dat?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể thực hiện check-in cho đơn này.')}&search=${encodeURIComponent(input)}`
      );
    }
  });

  // ─── TRANG QUÉT QR SOÁT VÉ & TÌM ĐƠN CHO NHÂN VIÊN / ADMIN ───
  app.get('/quan-tri/quet-qr', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;

    const html = renderAdminDashboardLayout({
      title: 'Quét Mã QR Soát Vé & Nhận Sân | Be Badminton Quản Trị',
      activeNav: 'bookings',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminScanQrPage({
        session,
        errorMessage: q.thongBaoLoi,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // ─── CHI TIẾT ĐƠN ĐẶT SÂN RIÊNG BIỆT DÀNH CHO ADMIN & NHÂN VIÊN QUẦY ───
  app.get('/quan-tri/don-dat/:bookingCode', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { bookingCode: string };
    const q = (request.query || {}) as Record<string, string>;

    const bookingRes = await db.query<BookingRecord>(
      `SELECT * FROM bookings WHERE booking_code = $1 OR id = $1 LIMIT 1`,
      [params.bookingCode]
    );

    if (bookingRes.rows.length === 0) {
      return reply.redirect(
        `/quan-tri/don-dat?thongBaoLoi=${encodeURIComponent(`Không tìm thấy đơn đặt sân [${params.bookingCode}].`)}`
      );
    }

    const detail=await getBookingForViewer(params.bookingCode,session.user,db);
    const booking = detail.booking;

    const eventsRes = await db.query<{
      id: string;
      event_type: string;
      message_vi: string;
      actor_role: string;
      created_at: string;
    }>(
      `SELECT id, event_type, message_vi, actor_role, created_at
       FROM booking_events
       WHERE booking_id = $1
       ORDER BY created_at DESC`,
      [booking.id]
    );

    const attemptsRes = await db.query<{ amount_vnd: number; status: string }>(
      `SELECT amount_vnd, status FROM payment_attempts WHERE booking_id = $1 AND status = 'SUCCEEDED' LIMIT 1`,
      [booking.id]
    );
    const verifiedPaidAmountVnd = detail.paymentAttempts.find(p=>p.status==='SUCCEEDED')?.amount_vnd || booking.total_amount_vnd;

    const html = renderAdminDashboardLayout({
      title: `Chi tiết đơn ${booking.booking_code} | Quản Trị Be Badminton`,
      activeNav: 'bookings',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminOrderDetailPage({
        session,
        booking,
        events: eventsRes.rows,
        verifiedPaidAmountVnd,
      }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  // ─── THAO TÁC HỦY & HOÀN TIỀN TẠI QUẦY (XÉT DUYỆT BỞI NHÂN VIÊN) ───
  app.post('/quan-tri/don-dat/:bookingCode/huy-hoan', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const ratePct = Number(body.ratePct);
      const reason = String(body.reason || '').trim();
      const method = body.method === 'CASH' ? 'CASH' : 'ORIGINAL_METHOD';

      const res = await counterCancelAndRefund(
        session,
        params.bookingCode,
        { ratePct, reason, method },
        db
      );

      const successMsg = res.refundAmountVnd > 0
        ? `✓ Đã hủy đơn thành công và ghi nhận hoàn ${ratePct}% (${res.refundAmountVnd.toLocaleString('vi-VN')} ₫) qua ${method === 'CASH' ? 'tiền mặt tại quầy' : 'phương thức thanh toán gốc'}!`
        : `✓ Đã hủy đơn thành công theo yêu cầu tại quầy (không phát sinh hoàn tiền).`;

      return reply.redirect(
        `/quan-tri/don-dat/${encodeURIComponent(params.bookingCode)}?thongBaoThanhCong=${encodeURIComponent(successMsg)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/don-dat/${encodeURIComponent(params.bookingCode)}?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Lỗi khi hủy và hoàn tiền tại quầy.')}`
      );
    }
  });

  // ─── CHI TIẾT & CHỐT LỊCH CỐ ĐỊNH THÁNG (KHÓA LỊCH FULL SÂN) ───
  app.get('/quan-tri/co-dinh-thang/:id', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const q = (request.query || {}) as Record<string, string>;

    const reqRes = await db.query<any>('SELECT * FROM fixed_booking_requests WHERE id = $1', [params.id]);
    if (!reqRes.rows[0]) {
      return reply.redirect(`/quan-tri/don-dat?thongBaoLoi=${encodeURIComponent('Không tìm thấy yêu cầu đặt lịch cố định.')}#yeu-cau-co-dinh-thang`);
    }

    const courtsRes = await db.query<{ id: string; name: string }>('SELECT id, name FROM courts ORDER BY sort_order ASC');
    const blocksRes = await db.query<{ block_date: string; start_hour: number }>(
      'SELECT block_date, start_hour FROM court_blocks WHERE fixed_request_id = $1 AND is_active = TRUE ORDER BY block_date ASC, start_hour ASC',
      [params.id]
    );

    const html = renderAdminDashboardLayout({
      title: `Xử lý yêu cầu cố định ${reqRes.rows[0].request_code} | Be Badminton Quản Trị`,
      activeNav: 'bookings',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminFixedBookingDetailPage({
        session,
        request: reqRes.rows[0],
        courts: courtsRes.rows,
        lockedBlocks: blocksRes.rows,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/co-dinh-thang/:id/chot', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const weekdays = parseWeekdays(body.weekdays);
      const startHour = Number(body.startHour);
      const durationHours = Number(body.durationHours || 2);
      const startDate = String(body.startDate || '').trim();
      const endDate = String(body.endDate || '').trim();
      const courtId = String(body.courtId || '').trim();
      const skipConflicts = body.skipConflicts === '1' || body.skipConflicts === true;
      const note = body.adminNote ? String(body.adminNote).trim() : null;

      const outcome = await confirmFixedSchedule(
        session,
        params.id,
        {
          courtId,
          weekdays,
          startHour,
          durationHours,
          startDate,
          endDate,
          skipConflicts,
          note,
        },
        db
      );

      const msg = `✓ Đã chốt lịch cố định tháng thành công! Đã khóa full ${outcome.locked} khung giờ trên lịch sân thi đấu.${outcome.conflicts.length > 0 ? ` (Bỏ qua ${outcome.conflicts.length} ô bị trùng lịch trước)` : ''}`;
      return reply.redirect(`/quan-tri/co-dinh-thang/${encodeURIComponent(params.id)}?thongBaoThanhCong=${encodeURIComponent(msg)}`);
    } catch (err: any) {
      return reply.redirect(`/quan-tri/co-dinh-thang/${encodeURIComponent(params.id)}?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Lỗi khi chốt lịch cố định.')}`);
    }
  });

  app.post('/quan-tri/co-dinh-thang/:id/huy-chot', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const outcome = await releaseFixedSchedule(session, params.id, db);
      return reply.redirect(`/quan-tri/co-dinh-thang/${encodeURIComponent(params.id)}?thongBaoThanhCong=${encodeURIComponent(`✓ Đã hủy chốt lịch cố định và giải phóng ${outcome.released} khung giờ trên sân!`)}`);
    } catch (err: any) {
      return reply.redirect(`/quan-tri/co-dinh-thang/${encodeURIComponent(params.id)}?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Lỗi khi hủy chốt lịch.')}`);
    }
  });

  // ─── TRẠM SOÁT VÉ & TIẾP ĐÓN KHÁCH TẠI QUẦY (SCAN QR PASS) ───
  app.get('/quan-tri/soat-ve/:bookingCode', async (request, reply) => {
    const params = request.params as { bookingCode: string };

    // Nếu chưa đăng nhập
    if (!request.sessionCtx) {
      return reply.redirect(
        `/tai-khoan/dang-nhap?thongBaoCanhBao=${encodeURIComponent(
          `Vui lòng đăng nhập tài khoản Nhân viên hoặc Quản lý để thực hiện soát vé cho đơn ${params.bookingCode}.`
        )}&returnUrl=${encodeURIComponent('/quan-tri/soat-ve/' + params.bookingCode)}`
      );
    }

    // Nếu là CUSTOMER tự quét mã -> chuyển hướng xem vé điện tử cá nhân
    if (request.sessionCtx.user.role === 'CUSTOMER') {
      return reply.redirect(`/don-dat/${encodeURIComponent(params.bookingCode)}`);
    }

    try {
      const session = assertStaffOrAdmin(request.sessionCtx);
      const bRes = await db.query<BookingRecord>(
        `SELECT * FROM bookings WHERE booking_code = $1`,
        [params.bookingCode]
      );
      if (bRes.rows.length === 0) {
        return reply.status(404).type('text/html; charset=utf-8').send(
          renderPageLayout({
            title: 'Không Tìm Thấy Đơn Đặt Sân | Be Badminton',
            session,
            bodyHtml: `<div class="content-container error-card"><p>Không tìm thấy mã đơn ${escapeHtml(params.bookingCode)}.</p></div>`,
          })
        );
      }
      const detail=await getBookingForViewer(params.bookingCode,session.user,db);
      const booking = detail.booking;
      const eventsRes = await db.query<any>(
        `SELECT * FROM booking_events WHERE booking_id = $1 ORDER BY created_at DESC`,
        [booking.id]
      );

      const html = renderPageLayout({
        title: `Trạm Soát Vé & Tiếp Đón · ${booking.booking_code} | Be Badminton`,
        session,
        bodyHtml: renderCounterDispatchStationPage({
          session,
          booking,
          events: eventsRes.rows,
        }),
      });
      return reply.type('text/html; charset=utf-8').send(html);
    } catch (err: any) {
      logger.error('SOAT_VE_ERROR', err.message, err.stack);
      throw err;
    }
  });

  app.post('/quan-tri/soat-ve/:bookingCode/thao-tac', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { bookingCode: string };
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const action = body.action as any;

    try {
      await counterDispatchBookingOperation(
        session,
        params.bookingCode,
        {
          action,
          equipmentRentedSummary: body.equipmentRentedSummary,
          equipmentDepositVnd: body.equipmentDepositVnd ? Number(body.equipmentDepositVnd) : undefined,
          counterNote: body.counterNote,
        },
        db
      );

      let successMsg = `Đã cập nhật trạng thái vận hành thành công cho đơn ${params.bookingCode}.`;
      if (action === 'CHECK_IN') successMsg = `✓ Khách đã nhận sân thành công cho đơn [${params.bookingCode}]!`;
      if (action === 'HANDOVER_EQUIPMENT') successMsg = `✓ Đã ghi nhận bàn giao dụng cụ và tiền cọc quầy!`;
      if (action === 'REFUND_DEPOSIT') successMsg = `✓ Đã xác nhận nhận lại đồ và hoàn cọc cho khách!`;
      if (action === 'COMPLETE') successMsg = `✓ Ca chơi đã kết thúc và sân đã được giải phóng hoàn tất!`;
      if (action === 'SAVE_NOTE') successMsg = `✓ Đã lưu ghi chú vận hành quầy!`;

      return reply.redirect(
        `/quan-tri/soat-ve/${encodeURIComponent(params.bookingCode)}?thongBaoThanhCong=${encodeURIComponent(successMsg)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/soat-ve/${encodeURIComponent(params.bookingCode)}?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Lỗi khi thực hiện thao tác.')}`
      );
    }
  });

  app.get('/quan-tri/thanh-toan-hoan-tien', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    await processPendingBackgroundJobs(db);

    const refundsRes = await db.query<{
      id: string;
      booking_id: string;
      booking_code: string;
      payment_attempt_id: string;
      merchant_txn_ref: string;
      provider_txn_no: string | null;
      refund_code: string;
      amount_vnd: number;
      reason_type: string;
      reason_note: string;
      status: string;
      provider_refund_id: string | null;
      attempt_count: number;
      last_error_code: string | null;
      last_error_message: string | null;
      completed_at: string | Date | null;
      created_at: string | Date;
      destination_bank_name: string | null;
      destination_bank_code: string | null;
      destination_account_no: string | null;
      destination_account_name: string | null;
      sender_bank_name: string | null;
      sender_bank_code: string | null;
      sender_account_no: string | null;
      sender_account_name: string | null;
      is_manual_refund: boolean;
      manual_txn_ref: string | null;
      manual_refund_note: string | null;
      manual_refunded_at: string | Date | null;
      manual_refunded_by_name: string | null;
    }>(
      `SELECT r.*, b.booking_code, pa.merchant_txn_ref, pa.provider_txn_no,
              pa.sender_bank_name, pa.sender_bank_code, pa.sender_account_no, pa.sender_account_name,
              u.full_name AS manual_refunded_by_name
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       JOIN payment_attempts pa ON pa.id = r.payment_attempt_id
       LEFT JOIN users u ON u.id = r.manual_refunded_by
       ORDER BY r.created_at DESC LIMIT 50`
    );

    const paymentsRes = await db.query<{
      id: string;
      booking_code: string;
      provider: string;
      merchant_txn_ref: string;
      provider_txn_no: string | null;
      amount_vnd: number;
      status: string;
      signature_verified: boolean;
      paid_at: string | Date | null;
      created_at: string | Date;
      sender_bank_name: string | null;
      sender_bank_code: string | null;
      sender_account_no: string | null;
      sender_account_name: string | null;
    }>(
      `SELECT pa.id, b.booking_code, pa.provider, pa.merchant_txn_ref, pa.provider_txn_no,
              pa.amount_vnd, pa.status, pa.signature_verified, pa.paid_at, pa.created_at,
              pa.sender_bank_name, pa.sender_bank_code, pa.sender_account_no, pa.sender_account_name
       FROM payment_attempts pa
       JOIN bookings b ON b.id = pa.booking_id
       ORDER BY pa.created_at DESC LIMIT 50`
    );

    const html = renderAdminDashboardLayout({
      title: 'Đối Soát Thanh Toán & Hoàn Tiền Tự Động | Be Badminton Gò Vấp',
      description: 'Phân hệ đối soát giao dịch VietQR, ví điện tử, thẻ và xử lý hoàn tiền tự động cho khách hàng Be Badminton.',
      activeNav: 'payments',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminPaymentsAndRefundsPage({
        session,
        refunds: refundsRes.rows,
        payments: paymentsRes.rows,
      }),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/hoan-tien/:refundId/thu-lai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { refundId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const res = await adminRetryOrReconcileRefund(session, params.refundId, db);
    return reply.redirect(
      `/quan-tri/thanh-toan-hoan-tien?thongBaoThanhCong=${encodeURIComponent(res.messageVi)}`
    );
  });

  app.post('/quan-tri/hoan-tien/:refundId/hoan-thu-cong', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { refundId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    const manualTxnRef = (body.manualTxnRef || '').trim();
    if (!manualTxnRef) {
      throw new AppError({
        code: 'MISSING_MANUAL_TXN_REF',
        statusCode: 400,
        publicMessage: 'Vui lòng nhập Mã giao dịch ngân hàng / Ủy nhiệm chi để lưu vết đối soát AML.',
      });
    }

    const manualNote = (body.manualRefundNote || 'Đã chuyển hoàn thủ công đúng tài khoản nguồn theo quy định AML').trim();
    const now = getServerNow();

    await db.withTransaction(async (tx) => {
      const rfdRes = await tx.query<{
        id: string;
        booking_id: string;
        refund_code: string;
        amount_vnd: number;
        status: string;
        payment_attempt_id: string;
        destination_bank_name: string | null;
        destination_account_no: string | null;
        destination_account_name: string | null;
      }>(`SELECT * FROM refunds WHERE id = $1 FOR UPDATE`, [params.refundId]);

      if (rfdRes.rows.length === 0) {
        throw new AppError({
          code: 'REFUND_NOT_FOUND',
          statusCode: 404,
          publicMessage: 'Không tìm thấy bản ghi hoàn tiền cần xử lý.',
        });
      }

      const rfd = rfdRes.rows[0];
      if (rfd.status === 'SUCCEEDED') {
        throw new AppError({
          code: 'ALREADY_REFUNDED',
          statusCode: 400,
          publicMessage: 'Khoản tiền này đã được xác nhận hoàn tất trước đó.',
        });
      }

      await tx.query(
        `UPDATE refunds
         SET status = 'SUCCEEDED',
             is_manual_refund = TRUE,
             manual_txn_ref = $1,
             manual_refund_note = $2,
             manual_refunded_by = $3,
             manual_refunded_at = $4,
             completed_at = $4,
             updated_at = $4
         WHERE id = $5`,
        [manualTxnRef, manualNote, session.user.id, now.toISOString(), rfd.id]
      );

      await tx.query(
        `UPDATE bookings
         SET refund_status = 'REFUNDED',
             updated_at = $1
         WHERE id = $2`,
        [now.toISOString(), rfd.booking_id]
      );

      await tx.query(
        `UPDATE background_jobs
         SET status = 'SUCCEEDED',
             completed_at = $1,
             updated_at = $1
         WHERE dedup_key = $2`,
        [now.toISOString(), `refund-${rfd.payment_attempt_id}`]
      );

      await tx.query(
        `INSERT INTO booking_events (id, booking_id, event_type, actor_user_id, actor_role, message_vi, created_at)
         VALUES ($1, $2, 'MANUAL_REFUND_COMPLETED', $3, $4, $5, $6)`,
        [
          `evt-${crypto.randomUUID()}`,
          rfd.booking_id,
          session.user.id,
          session.user.role,
          `Xác nhận chuyển hoàn thủ công ${formatVnd(rfd.amount_vnd)} vào đúng tài khoản nguồn (${rfd.destination_bank_name || 'NH'} - ${rfd.destination_account_no || 'STK'}). Mã GD: ${manualTxnRef}. Tuân thủ AML.`,
          now.toISOString(),
        ]
      );

      await tx.query(
        `INSERT INTO admin_audit_logs (
          id, actor_user_id, actor_role, action, target_type, target_id, summary_vi, after_snapshot, created_at
        ) VALUES ($1, $2, $3, 'MANUAL_REFUND_AML', 'REFUND', $4, $5, $6, $7)`,
        [
          `aud-${crypto.randomUUID()}`,
          session.user.id,
          session.user.role,
          rfd.id,
          `Xác nhận hoàn tiền thủ công ${rfd.refund_code} (${formatVnd(rfd.amount_vnd)}). Mã GD: ${manualTxnRef}. AML: Đã kiểm tra đúng tài khoản nguồn.`,
          JSON.stringify({
            manualTxnRef,
            manualNote,
            refundedBy: session.user.id,
            amountVnd: rfd.amount_vnd,
            destinationAccount: rfd.destination_account_no,
          }),
          now.toISOString(),
        ]
      );
    });

    return reply.redirect(
      `/quan-tri/thanh-toan-hoan-tien?thongBaoThanhCong=${encodeURIComponent(`Đã xác nhận hoàn tiền thủ công (Mã GD: ${manualTxnRef}) thành công theo đúng quy định chống rửa tiền.`)}`
    );
  });

  app.get('/quan-tri/tai-khoan', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    if (session.user.role !== 'ADMIN') {
      throw new AppError({
        code: 'FORBIDDEN_ADMIN_ONLY',
        statusCode: 403,
        publicMessage: 'Chỉ Quản trị viên cấp cao mới có quyền quản lý tài khoản và cấu hình phân quyền.',
      });
    }
    const q = (request.query || {}) as Record<string, string>;
    const filters:AccountFilters = {search:(q.search||'').trim().slice(0,100),role:['ADMIN','STAFF','CUSTOMER'].includes(q.role)?q.role:'',tier:['BRONZE','SILVER','GOLD'].includes(q.tier)?q.tier:'',status:['ACTIVE','LOCKED'].includes(q.status)?q.status:'',page:Math.min(100000,Math.max(1,Math.floor(Number(q.page)||1)))};
    const params:string[]=[];const conditions:string[]=[];
    if(filters.search){params.push('%'+filters.search+'%');conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);}
    for(const [column,value] of [['role',filters.role],['member_tier',filters.tier],['status',filters.status]]){if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
    const total=Number((await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM users${where}`,params)).rows[0].count);
    filters.page=Math.min(filters.page,Math.max(1,Math.ceil(total/20)));
    const usersRes=await db.query<UserRecord>(`SELECT id,email,full_name,phone,role,status,member_tier,total_spent_vnd,created_at FROM users${where} ORDER BY created_at DESC,id LIMIT 20 OFFSET ${(filters.page-1)*20}`,params);
    const counts=(await db.query<{total:number;active:number;locked:number}>(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='ACTIVE')::int AS active,COUNT(*) FILTER(WHERE status='LOCKED')::int AS locked FROM users`)).rows[0];

    const html = renderAdminDashboardLayout({
      title: 'Tài khoản | Be Badminton',
      description: 'Quản lý danh sách người dùng, nâng hạng hội viên VIP (Đồng, Bạc, Vàng), phân quyền nhân sự vận hành và quản trị viên.',
      activeNav: 'accounts',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminAccountsPage({session,users:usersRes.rows,filters,total,counts}),
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  const requireAccountAdmin=(session:SessionContext|null|undefined, sensitive=false)=>{
    const actor=assertStaffOrAdmin(session ?? null);
    if(actor.user.role!=='ADMIN') throw new AppError({code:'FORBIDDEN',statusCode:403,publicMessage:'Chỉ quản trị viên có quyền quản lý tài khoản.'});
    if(sensitive&&actor.user.mfa_enabled&&!actor.mfaVerified) throw new AppError({code:'ADMIN_MFA_REQUIRED',statusCode:403,publicMessage:'Vui lòng xác thực hai lớp trước khi thay đổi tài khoản.'});
    return actor;
  };
  app.get('/quan-tri/tai-khoan/:userId',async(request,reply)=>{
    const session=requireAccountAdmin(request.sessionCtx);const {userId}=request.params as {userId:string};
    const user=(await db.query<UserRecord>(`SELECT id,email,full_name,phone,role,status,email_verified_at,mfa_enabled,member_tier,total_spent_vnd,address,birth_date,created_at FROM users WHERE id=$1`,[userId])).rows[0];
    if(!user) throw new AppError({code:'USER_NOT_FOUND',statusCode:404,publicMessage:'Không tìm thấy tài khoản.'});
    const bookings=(await db.query<BookingRecord>(`SELECT * FROM bookings WHERE user_id=$1 AND NOT is_ticket_component ORDER BY created_at DESC LIMIT 10`,[userId])).rows;
    const audit=(await db.query<{summary_vi:string;created_at:string}>(`SELECT summary_vi,created_at FROM admin_audit_logs WHERE target_type='USER' AND target_id=$1 ORDER BY created_at DESC LIMIT 20`,[userId])).rows;
    const sessionCount=(await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM sessions WHERE user_id=$1 AND expires_at>NOW()`,[userId])).rows[0].count;
    const bookingCount=(await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM bookings WHERE user_id=$1 AND NOT is_ticket_component`,[userId])).rows[0].count;
    return reply.type('text/html; charset=utf-8').send(renderAdminDashboardLayout({title:'Hồ sơ tài khoản | Be Badminton',activeNav:'accounts',session,flashMessage:getFlashFromQuery((request.query||{}) as Record<string,string>),bodyHtml:renderAdminAccountDetail({session,user,bookings,audit,sessionCount,bookingCount})}));
  });
  for(const operation of ['ho-so','dang-xuat-phien','mat-khau']){
    app.post('/quan-tri/tai-khoan/:userId/'+operation,async(request,reply)=>{
      const actor=requireAccountAdmin(request.sessionCtx,true);const {userId}=request.params as {userId:string};const body=(request.body||{}) as Record<string,string>;
      verifyCsrfToken(actor,body._csrf,request.headers['x-csrf-token'] as string);
      const target=(await db.query<UserRecord>('SELECT id,email,full_name,phone,address,birth_date FROM users WHERE id=$1',[userId])).rows[0];
      if(!target)throw new AppError({code:'USER_NOT_FOUND',statusCode:404,publicMessage:'Không tìm thấy tài khoản.'});
      if(operation==='dang-xuat-phien'&&(actor.user.id===userId||!body.reason||body.reason.trim().length<5)) throw new AppError({code:'INVALID_ACTION',statusCode:400,publicMessage:'Không thể đóng phiên đang sử dụng. Cần lý do ít nhất 5 ký tự.'});
      if(operation==='ho-so') await updateUserProfile(userId,{fullName:body.fullName||'',phone:body.phone||'',address:body.address,birthDate:body.birthDate},db);
      if(operation==='mat-khau') await adminSetUserPassword(actor,userId,body.newPassword||'',body.reason||'',db);
      await db.withTransaction(async tx=>{
        if(operation==='dang-xuat-phien')await tx.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
        if(operation!=='mat-khau') await tx.query(`INSERT INTO admin_audit_logs(id,actor_user_id,actor_role,action,target_type,target_id,summary_vi,created_at) VALUES($1,$2,'ADMIN',$3,'USER',$4,$5,NOW())`,['aud-'+crypto.randomUUID(),actor.user.id,operation==='ho-so'?'UPDATE_USER_PROFILE':'REVOKE_USER_SESSIONS',userId,operation==='ho-so'?`Cập nhật hồ sơ ${target.email}`:`Đăng xuất các phiên của ${target.email}. Lý do: ${(body.reason||'').slice(0,300)}`]);
      });
      return reply.redirect('/quan-tri/tai-khoan/'+encodeURIComponent(userId)+'?thongBaoThanhCong='+encodeURIComponent(operation==='mat-khau'?'Đã đổi mật khẩu và đăng xuất các phiên của tài khoản.':'Đã cập nhật tài khoản.'));
    });
  }

  app.post('/quan-tri/xac-thuc-mfa', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    await verifySessionAdminMfa(session.sessionId, session.user.id, body.mfaCode || '', db);
    return reply.redirect(
      `/quan-tri/tai-khoan?thongBaoThanhCong=${encodeURIComponent('Đã xác thực mã MFA hai yếu tố cho phiên quản trị hiện tại.')}`
    );
  });

  app.post('/quan-tri/tai-khoan/:userId/trang-thai', async (request, reply) => {
    const session = requireAccountAdmin(request.sessionCtx,true);
    const params = request.params as { userId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    if(!['ACTIVE','LOCKED'].includes(body.status)||!body.reason||body.reason.trim().length<5)throw new AppError({code:'INVALID_STATUS',statusCode:400,publicMessage:'Chọn trạng thái và nhập lý do ít nhất 5 ký tự.'});
    const nextStatus = body.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE';
    await adminSetUserStatus(session, params.userId, nextStatus, body.reason || 'Thao tác quản trị', db);

    return reply.redirect(
      `/quan-tri/tai-khoan/${encodeURIComponent(params.userId)}?thongBaoThanhCong=${encodeURIComponent('Đã cập nhật trạng thái tài khoản (các đơn đã xác nhận hợp lệ được giữ nguyên).')}`
    );
  });

  app.post('/quan-tri/tai-khoan/:userId/vai-tro', async (request, reply) => {
    const session = requireAccountAdmin(request.sessionCtx,true);
    const params = request.params as { userId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    if(!['CUSTOMER','STAFF','ADMIN'].includes(body.role))throw new AppError({code:'INVALID_ROLE',statusCode:400,publicMessage:'Vai trò không hợp lệ.'});
    const nextRole = (body.role as 'CUSTOMER' | 'STAFF' | 'ADMIN') || 'CUSTOMER';
    await adminChangeUserRole(session, params.userId, nextRole, db);

    return reply.redirect(
      `/quan-tri/tai-khoan/${encodeURIComponent(params.userId)}?thongBaoThanhCong=${encodeURIComponent('Đã cập nhật phân quyền tài khoản.')}`
    );
  });

  app.post('/quan-tri/tai-khoan/:userId/hoi-vien', async (request, reply) => {
    const session = requireAccountAdmin(request.sessionCtx,true);
    const params = request.params as { userId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    if(!['BRONZE','SILVER','GOLD'].includes(body.tier))throw new AppError({code:'INVALID_TIER',statusCode:400,publicMessage:'Hạng hội viên không hợp lệ.'});
    if(!(await db.query('SELECT id FROM users WHERE id=$1',[params.userId])).rows.length)throw new AppError({code:'USER_NOT_FOUND',statusCode:404,publicMessage:'Không tìm thấy tài khoản.'});
    const nextTier = (body.tier as 'BRONZE' | 'SILVER' | 'GOLD') || 'BRONZE';
    await adminSetUserMemberTier(session, params.userId, nextTier, db);

    return reply.redirect(
      `/quan-tri/tai-khoan/${encodeURIComponent(params.userId)}?thongBaoThanhCong=${encodeURIComponent('Đã cập nhật hạng hội viên thành công.')}`
    );
  });

  // API kiểm tra mã giảm giá (Coupon) từ trang thanh toán
  app.post('/api/coupons/kiem-tra', async (request, reply) => {
    const body = (request.body || {}) as { code?: string; orderAmountVnd?: number };
    const code = (body.code || '').trim();
    const orderAmountVnd = Number(body.orderAmountVnd) || 0;
    const result = await validateAndCalculateCouponDiscount(
      code,
      orderAmountVnd,
      db,
      request.sessionCtx?.user.id
    );
    return reply.send(result);
  });

  // ─── 5.5. QUẢN LÝ KHUYẾN MẠI & MÃ COUPON (/quan-tri/khuyen-mai) ───
  app.get('/quan-tri/khuyen-mai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    const coupons = await listAllCoupons(q.status, db);
    const pageHtml = renderAdminCouponsPage({
      coupons,
      statusFilter: q.status || '',
      session,
      successMessage: q.thongBaoThanhCong,
      errorMessage: q.thongBaoLoi,
    });
    return reply.type('text/html; charset=utf-8').send(
      renderAdminDashboardLayout({
        title: 'Mã ưu đãi | Be Badminton',
        description: 'Tạo và quản lý các mã khuyến mại coupon, ưu đãi đặt sân giờ vàng và chiết khấu cho khách hàng Be Badminton.',
        activeNav: 'coupons',
        session,
        flashMessage: getFlashFromQuery(q),
        bodyHtml: pageHtml,
      })
    );
  });

  app.post('/quan-tri/khuyen-mai/tao-moi', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const discountType = body.discountType === 'FIXED' ? 'FIXED' : 'PERCENT';
      const discountVal = Number(body.discountValue);
      const minOrder = Number(body.minOrderAmountVnd) || 0;
      const maxDiscount = body.maxDiscountAmountVnd ? Number(body.maxDiscountAmountVnd) : null;
      const usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
      const maxUsesPerUser = body.maxUsesPerUser ? Number(body.maxUsesPerUser) : null;
      const isPublicSuggested = body.isPublicSuggested !== '0' && body.isPublicSuggested !== 'false';

      const created = await createCoupon(
        {
          code: body.code,
          title: body.title,
          description: body.description,
          discountType,
          discountValue: discountVal,
          minOrderAmountVnd: minOrder,
          maxDiscountAmountVnd: maxDiscount,
          usageLimit,
          maxUsesPerUser,
          isPublicSuggested,
          validFrom: body.validFrom || undefined,
          validUntil: body.validUntil || null,
          status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        },
        session.user.id,
        db
      );

      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoThanhCong=${encodeURIComponent(`Đã tạo thành công mã giảm giá ${created.code}.`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi tạo mã giảm giá.')}`
      );
    }
  });

  app.post('/quan-tri/khuyen-mai/:couponId/trang-thai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { couponId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const updated = await toggleCouponStatus(params.couponId, session.user.id, db);
      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoThanhCong=${encodeURIComponent(`Đã chuyển trạng thái mã ${updated.code} sang ${updated.status === 'ACTIVE' ? 'KÍCH HOẠT' : 'TẠM NGƯNG'}.`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi cập nhật trạng thái coupon.')}`
      );
    }
  });

  app.post('/quan-tri/khuyen-mai/:couponId/xoa', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { couponId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      await deleteCoupon(params.couponId, session.user.id, db);
      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoThanhCong=${encodeURIComponent('Đã xóa mã giảm giá thành công.')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/khuyen-mai?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi xóa mã giảm giá.')}`
      );
    }
  });

  // ─── 5.6. QUẢN LÝ DỊCH VỤ CHO THUÊ DỤNG CỤ (/quan-tri/dich-vu-dung-cu) ───
  app.get('/quan-tri/dich-vu-dung-cu', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;

    const items = await getEquipmentServices({ category: q.category as any, search: q.search }, db);
    const metrics = await getEquipmentMetrics(db);
    const editingItem = q.edit ? await getEquipmentServiceById(q.edit, db) : null;

    const categories: { id: EquipmentCategory; label: string }[] = [
      { id: 'RENTAL', label: 'Cho thuê dụng cụ' },
      { id: 'EQUIPMENT', label: 'Thiết bị & Phụ kiện' },
      { id: 'BEVERAGE', label: 'Nước & Bù khoáng' },
      { id: 'FACILITY', label: 'Tiện ích sân bãi' },
    ];

    const pageHtml = renderAdminEquipmentPage({
      items,
      csrfToken: session.csrfToken,
      categories,
      editingItem,
      history: await inventoryHistory(db),
      metrics,
    });

    return reply.type('text/html; charset=utf-8').send(
      renderAdminDashboardLayout({
        title: 'Dụng cụ & tồn kho',
        description: 'Đăng tin, cấu hình giá thuê theo giờ, cọc và tồn kho các dụng cụ thể thao chuẩn sàn thương mại.',
        activeNav: 'equipment',
        session,
        flashMessage: getFlashFromQuery(q),
        bodyHtml: pageHtml,
      })
    );
  });

  app.post('/quan-tri/dich-vu-dung-cu/:id/kho',async(request,reply)=>{
    const session=assertStaffOrAdmin(request.sessionCtx);
    const body=(request.body||{}) as Record<string,string>;
    verifyCsrfToken(session,body._csrf,request.headers['x-csrf-token'] as string);
    try {
      await inventoryOperation(session,(request.params as {id:string}).id,{action:body.action,quantity:body.quantity,reference:body.reference,movementId:body.movement_id},db);
      return reply.redirect('/quan-tri/dich-vu-dung-cu?thongBaoThanhCong='+encodeURIComponent('Đã cập nhật kho.'));
    } catch(err:any) {return reply.redirect('/quan-tri/dich-vu-dung-cu?thongBaoLoi='+encodeURIComponent(err.message));}
  });
  app.post('/quan-tri/dich-vu-dung-cu/dang-tin', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const code = (body.code || '').trim().toUpperCase();
      const name = (body.name || '').trim();
      const category = (body.category as EquipmentCategory) || 'RENTAL';
      const priceVnd = Number(body.price_vnd) || 0;
      const originalPriceVnd = body.original_price_vnd ? Number(body.original_price_vnd) : undefined;
      const unit = (body.unit || 'GIỜ').trim().toUpperCase();
      const depositVnd = Number(body.deposit_vnd) || 0;
      const stockStatus = (body.stock_status as EquipmentStockStatus) || 'AVAILABLE';
      const isActive = body.is_active === '1';
      const badge = (body.badge || '').trim();
      const imageUrl = (body.image_url || '').trim() || '/public/assets/images/addons/giay-cau-long.png';
      const description = (body.description || '').trim();
      const sortOrder = Number(body.sort_order) || 0;

      await adminCreateEquipmentService(session, {
        code,
        name,
        category,
        priceVnd,
        originalPriceVnd,
        unit,
        depositVnd,
        stockStatus,
        isActive,
        badge,
        imageUrl,
        description,
        sortOrder,
      }, db);

      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoThanhCong=${encodeURIComponent(`Đã đăng tin dụng cụ [${name}] thành công!`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi đăng tin dụng cụ.')}`
      );
    }
  });

  app.post('/quan-tri/dich-vu-dung-cu/:id/cap-nhat', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const name = (body.name || '').trim();
      const category = (body.category as EquipmentCategory) || 'RENTAL';
      const priceVnd = Number(body.price_vnd) || 0;
      const originalPriceVnd = body.original_price_vnd ? Number(body.original_price_vnd) : undefined;
      const unit = (body.unit || 'GIỜ').trim().toUpperCase();
      const depositVnd = Number(body.deposit_vnd) || 0;
      const stockStatus = (body.stock_status as EquipmentStockStatus) || 'AVAILABLE';
      const isActive = body.is_active === '1';
      const badge = (body.badge || '').trim();
      const imageUrl = (body.image_url || '').trim() || '/public/assets/images/addons/giay-cau-long.png';
      const description = (body.description || '').trim();
      const sortOrder = Number(body.sort_order) || 0;

      await adminUpdateEquipmentService(session, params.id, {
        name,
        category,
        priceVnd,
        originalPriceVnd,
        unit,
        depositVnd,
        stockStatus,
        isActive,
        badge,
        imageUrl,
        description,
        sortOrder,
      }, db);

      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoThanhCong=${encodeURIComponent(`Đã cập nhật dịch vụ [${name}] thành công!`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi cập nhật dịch vụ dụng cụ.')}`
      );
    }
  });

  app.post('/quan-tri/dich-vu-dung-cu/:id/trang-thai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const nextActive = body.is_active === '1';
      await adminToggleEquipmentStatus(session, params.id, nextActive, undefined, db);
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoThanhCong=${encodeURIComponent(`Đã thay đổi trạng thái hiển thị thành công!`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi thay đổi trạng thái.')}`
      );
    }
  });

  app.post('/quan-tri/dich-vu-dung-cu/:id/xoa', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      await adminDeleteEquipmentService(session, params.id, db);
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoThanhCong=${encodeURIComponent(`Đã xóa dịch vụ dụng cụ thành công.`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dich-vu-dung-cu?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi xóa dịch vụ.')}`
      );
    }
  });

  // ─── 8. QUẢN TRỊ TIN TỨC & BÀI VIẾT HOẠT ĐỘNG ───
  app.get('/quan-tri/tin-tuc', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    const newsService = getNewsService(db);
    const articles = await newsService.listAllNewsForAdmin();

    const html = renderAdminDashboardLayout({
      title: 'Tin tức | Be Badminton',
      activeNav: 'news',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminNewsListPage({ session, articles }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/quan-tri/tin-tuc/tao-moi', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;

    const html = renderAdminDashboardLayout({
      title: 'Đăng Bài Viết Mới | Be Badminton Quản Trị',
      activeNav: 'news',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminNewsEditPage({ session, isNew: true }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/tin-tuc/tao-moi', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const title = (body.title || '').trim();
      const summary = (body.summary || '').trim();
      const contentHtml = (body.contentHtml || '').trim();
      const category = (body.category || 'Thông báo hoạt động').trim();
      const badgeTone = body.badgeTone || 'blue';
      const coverImage = (body.coverImage || '').trim();
      const imageAlt = (body.imageAlt || '').trim();
      const coverFit = body.coverFit || 'cover';
      const slug = (body.slug || '').trim();
      const isPublished = body.isPublished === 'true' || body.isPublished === 'on';

      if (!title || !summary || !contentHtml || !coverImage) {
        return reply.redirect(
          `/quan-tri/tin-tuc/tao-moi?thongBaoLoi=${encodeURIComponent('Vui lòng điền đầy đủ Tiêu đề, Tóm tắt, Ảnh bìa và Nội dung.')}`
        );
      }

      const newsService = getNewsService(db);
      await newsService.createNewsArticle(
        {
          title,
          slug,
          summary,
          category,
          badgeTone,
          coverImage,
          imageAlt,
          coverFit,
          contentHtml,
          isPublished,
        },
        session.user.id
      );

      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoThanhCong=${encodeURIComponent(`Đã đăng bài viết [${title}] thành công!`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/tin-tuc/tao-moi?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi tạo bài viết.')}`
      );
    }
  });

  app.get('/quan-tri/tin-tuc/:id/sua', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const q = (request.query || {}) as Record<string, string>;

    const newsService = getNewsService(db);
    const article = await newsService.getNewsById(params.id);
    if (!article) {
      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoLoi=${encodeURIComponent('Không tìm thấy bài viết cần chỉnh sửa.')}`
      );
    }

    const html = renderAdminDashboardLayout({
      title: `Chỉnh sửa: ${article.title} | Be Badminton Quản Trị`,
      activeNav: 'news',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminNewsEditPage({ session, article, isNew: false }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/tin-tuc/:id/sua', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, any>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const title = (body.title || '').trim();
      const summary = (body.summary || '').trim();
      const contentHtml = (body.contentHtml || '').trim();
      const category = (body.category || 'Thông báo hoạt động').trim();
      const badgeTone = body.badgeTone || 'blue';
      const coverImage = (body.coverImage || '').trim();
      const imageAlt = (body.imageAlt || '').trim();
      const coverFit = body.coverFit || 'cover';
      const slug = (body.slug || '').trim();
      const isPublished = body.isPublished === 'true' || body.isPublished === 'on';

      if (!title || !summary || !contentHtml || !coverImage) {
        return reply.redirect(
          `/quan-tri/tin-tuc/${encodeURIComponent(params.id)}/sua?thongBaoLoi=${encodeURIComponent('Vui lòng điền đầy đủ Tiêu đề, Tóm tắt, Ảnh bìa và Nội dung.')}`
        );
      }

      const newsService = getNewsService(db);
      const ok = await newsService.updateNewsArticle(params.id, {
        title,
        slug,
        summary,
        category,
        badgeTone,
        coverImage,
        imageAlt,
        coverFit,
        contentHtml,
        isPublished,
      });

      if (!ok) {
        return reply.redirect(
          `/quan-tri/tin-tuc?thongBaoLoi=${encodeURIComponent('Không tìm thấy bài viết để cập nhật.')}`
        );
      }

      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoThanhCong=${encodeURIComponent(`Đã cập nhật bài viết [${title}] thành công!`)}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/tin-tuc/${encodeURIComponent(params.id)}/sua?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi cập nhật bài viết.')}`
      );
    }
  });

  app.post('/quan-tri/tin-tuc/:id/trang-thai', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const newsService = getNewsService(db);
      await newsService.togglePublishNews(params.id);
      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoThanhCong=${encodeURIComponent('Đã thay đổi trạng thái xuất bản bài viết!')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi chuyển trạng thái bài viết.')}`
      );
    }
  });

  app.post('/quan-tri/tin-tuc/:id/xoa', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const newsService = getNewsService(db);
      await newsService.deleteNewsArticle(params.id);
      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoThanhCong=${encodeURIComponent('Đã xóa bài viết thành công!')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/tin-tuc?thongBaoLoi=${encodeURIComponent(err.message || 'Lỗi khi xóa bài viết.')}`
      );
    }
  });

  // ─── 11. ĐIỀU PHỐI 18 SÂN THỜI GIAN THỰC (LIVE POS & COUNTER OPERATIONS) ───
  app.get('/quan-tri/dieu-phoi-18-san', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;
    const hourNum = q.hour !== undefined && q.hour !== '' ? Number(q.hour) : undefined;

    const [monitor, equipmentItems] = await Promise.all([
      getLiveCourtsMonitorData(
        {
          date: q.date || undefined,
          hour: hourNum !== undefined && Number.isFinite(hourNum) ? hourNum : undefined,
        },
        db
      ),
      getEquipmentServices({ activeOnly: true }, db),
    ]);

    const html = renderAdminDashboardLayout({
      title: 'Điều phối | Be Badminton',
      activeNav: 'live_pos',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminLiveCourtMonitorPage({
        session,
        monitor,
        equipmentItems,
        preselectCourtId: q.courtId || undefined,
      }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/dieu-phoi-18-san/dat-nhanh-tai-quay', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const booking = await createWalkInCounterBooking(
        session,
        {
          courtId: body.courtId || '',
          bookingDate: body.bookingDate || body.playDate || '',
          startHour: Number(body.startHour),
          contactName: body.contactName || body.customerName || 'Khách vãng lai tại quầy',
          contactPhone: body.contactPhone || body.customerPhone || '0908000111',
          paymentMethod: body.paymentMethod === 'QR_COUNTER' ? 'QR_COUNTER' : 'CASH_COUNTER',
          autoCheckIn: body.autoCheckIn !== '0' && body.autoCheckIn !== 'false',
          counterNote: body.counterNote || body.note || '',
        },
        db
      );

      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(booking.booking_date)}&hour=${booking.start_hour}&thongBaoThanhCong=${encodeURIComponent(
          `Đã tạo đơn đặt nhanh tại quầy #${booking.booking_code} (${booking.contact_name}) thành công!`
        )}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể tạo đơn đặt nhanh tại quầy.')}`
      );
    }
  });

  app.post('/quan-tri/dieu-phoi-18-san/ban-them-phu-kien', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const bookingCodeOrId = (body.bookingCode || body.bookingCodeOrId || '').trim();
      const equipmentId = (body.equipmentId || body.itemId || '').trim();
      const quantity = Number(body.quantity);

      const updated = await addCounterPosItemsToBooking(
        session,
        bookingCodeOrId,
        [{ equipmentId, quantity }],
        db
      );

      const retDate = body.returnDate || updated.booking_date;
      const retHour = body.returnHour || String(updated.start_hour);

      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(retDate)}&hour=${encodeURIComponent(retHour)}&thongBaoThanhCong=${encodeURIComponent(
          `Đã cộng thêm phụ kiện/nước uống (x${quantity}) vào đơn #${updated.booking_code}!`
        )}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể cộng thêm phụ kiện vào đơn.')}`
      );
    }
  });

  app.post('/quan-tri/dieu-phoi-18-san/chuyen-san', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const bookingCodeOrId = (body.bookingCode || body.bookingCodeOrId || '').trim();
      const updated = await transferBookingCourt(
        session,
        bookingCodeOrId,
        body.targetCourtId || '',
        body.reason || 'Điều phối nhanh tại quầy lễ tân',
        db
      );

      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?date=${encodeURIComponent(updated.booking_date)}&hour=${updated.start_hour}&thongBaoThanhCong=${encodeURIComponent(
          `Đã đổi sân thành công cho đơn #${updated.booking_code} sang ${updated.court_name_snapshot}!`
        )}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/dieu-phoi-18-san?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể đổi sân cho đơn đặt.')}`
      );
    }
  });

  // ─── 12. BÁO CÁO DOANH THU CHUYÊN SÂU, CHỐT CA NHÂN SỰ & XUẤT EXCEL CSV ───
  app.get('/quan-tri/bao-cao-chot-ca', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;

    const [metrics, breakdown, handovers, auditLogs] = await Promise.all([
      getAdminOperationalMetrics(
        {
          fromDate: q.fromDate || undefined,
          toDate: q.toDate || undefined,
        },
        db
      ),
      getDetailedRevenueAndShiftMetrics(
        {
          fromDate: q.fromDate || undefined,
          toDate: q.toDate || undefined,
        },
        db
      ),
      listShiftHandovers(30, db),
      listStaffAuditLogs(
        {
          role: q.role || undefined,
          actionKeyword: q.actionKeyword || undefined,
          limit: 60,
        },
        db
      ),
    ]);

    const html = renderAdminDashboardLayout({
      title: 'Báo cáo & chốt ca | Be Badminton',
      activeNav: 'reports',
      session,
      flashMessage: getFlashFromQuery(q),
      bodyHtml: renderAdminReportsAndShiftPage({
        session,
        metrics,
        breakdown,
        handovers,
        auditLogs,
        roleFilter: q.role || '',
        actionFilter: q.actionKeyword || '',
      }),
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/quan-tri/bao-cao-chot-ca/luu-ca', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      const handover = await createShiftHandover(
        session,
        {
          shiftDate: body.shiftDate || undefined,
          shiftName: body.shiftName || body.shiftCode || 'CA_NGAY',
          cashInDrawerVnd: Number(body.cashInDrawerVnd ?? body.cashActualHandoverVnd ?? 0),
          handoverNote: body.handoverNote || '',
        },
        db
      );

      return reply.redirect(
        `/quan-tri/bao-cao-chot-ca?thongBaoThanhCong=${encodeURIComponent(
          `Đã lưu biên bản bàn giao ca (${handover.shift_date} - ${handover.shift_name}) thành công!`
        )}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/bao-cao-chot-ca?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể lưu biên bản bàn giao ca.')}`
      );
    }
  });

  app.post('/quan-tri/bao-cao-chot-ca/:handoverId/duyet', async (request, reply) => {
    const session = assertStaffOrAdmin(request.sessionCtx);
    const params = request.params as { handoverId: string };
    const body = (request.body || {}) as Record<string, string>;
    verifyCsrfToken(session, body._csrf, request.headers['x-csrf-token'] as string);

    try {
      await verifyShiftHandover(session, params.handoverId, db);
      return reply.redirect(
        `/quan-tri/bao-cao-chot-ca?thongBaoThanhCong=${encodeURIComponent('Đã xác nhận duyệt biên bản bàn giao ca và két tiền!')}`
      );
    } catch (err: any) {
      return reply.redirect(
        `/quan-tri/bao-cao-chot-ca?thongBaoLoi=${encodeURIComponent(err.publicMessage || err.message || 'Không thể duyệt biên bản ca.')}`
      );
    }
  });

  app.get('/quan-tri/xuat-bao-cao/don-dat.csv', async (request, reply) => {
    assertStaffOrAdmin(request.sessionCtx);
    const q = (request.query || {}) as Record<string, string>;

    const exported = await generateBookingsCsvExport(
      {
        fromDate: q.fromDate || undefined,
        toDate: q.toDate || undefined,
      },
      db
    );

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${exported.filename}"`)
      .send(exported.csvContent);
  });

  // ─── 13. ĐÁNH GIÁ KHÁCH HÀNG (ĐÃ BỎ THEO YÊU CẦU QUẢN TRỊ) ───
  app.get('/quan-tri/danh-gia', async (_request, reply) => {
    return reply.redirect('/quan-tri');
  });

  return app;
}

