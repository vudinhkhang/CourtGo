import { getDb } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { seedDatabaseIfNeeded } from '../db/seed.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const db = getDb();
  try {
    await runMigrations(db);
    await seedDatabaseIfNeeded(db);
    logger.info('CLI_SEED_DONE', 'Đã hoàn tất kiểm tra và khởi tạo dữ liệu mẫu.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
