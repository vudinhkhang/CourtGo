import { getDb } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const db = getDb();
  try {
    await runMigrations(db);
    logger.info('CLI_MIGRATE_DONE', 'Đã hoàn tất chạy migration cơ sở dữ liệu.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
