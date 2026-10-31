import { config } from './config/env.js';
import { getDb } from './db/client.js';
import { runMigrations } from './db/migrations.js';
import { seedDatabaseIfNeeded } from './db/seed.js';
import { buildApp } from './app.js';
import { processPendingBackgroundJobs } from './services/jobWorker.js';
import { logger } from './utils/logger.js';

async function startServer(): Promise<void> {
  const db = getDb();

  await runMigrations(db);
  await seedDatabaseIfNeeded(db);

  // Khôi phục và chạy các tác vụ nền còn tồn đọng khi khởi động lại tiến trình
  await processPendingBackgroundJobs(db, { recoverStuck: true });

  const app = await buildApp(db);

  // Vòng lặp định kỳ xử lý hết hạn giữ chỗ và tác vụ hoàn tiền / thông báo
  const workerTimer = setInterval(async () => {
    try {
      await processPendingBackgroundJobs(db);
    } catch (err: any) {
      logger.error('WORKER_TICK_ERROR', String(err?.message || err));
    }
  }, 5000);
  workerTimer.unref();

  const address = await app.listen({
    host: config.host,
    port: config.port,
  });

  logger.info('SERVER_STARTED', `Hệ thống đặt sân cầu lông CourtGo đang chạy tại ${address}`, {
    env: config.nodeEnv,
    paymentMode: config.paymentMode,
    databaseDriver: db.getDriverType(),
  });
}

startServer().catch((err) => {
  logger.error('SERVER_STARTUP_FATAL', String(err?.message || err));
  process.exit(1);
});
