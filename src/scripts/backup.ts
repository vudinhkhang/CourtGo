import fs from 'node:fs';
import path from 'node:path';
import { DatabaseClient, getDb } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { logger } from '../utils/logger.js';

const TABLES_IN_ORDER = [
  'users',
  'centers',
  'courts',
  'court_images',
  'court_amenities',
  'pricing_rules',
  'court_blocks',
  'bookings',
  'booking_events',
  'payment_attempts',
  'provider_webhook_events',
  'refunds',
  'background_jobs',
  'notifications',
  'admin_audit_logs',
] as const;

export async function createLogicalBackupSnapshot(
  outputDir: string = path.resolve(process.cwd(), 'backups'),
  db: DatabaseClient = getDb()
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const snapshot: Record<string, unknown[]> = {};

  for (const tbl of TABLES_IN_ORDER) {
    const res = await db.query(`SELECT * FROM ${tbl}`);
    snapshot[tbl] = res.rows;
  }

  const fileName = `courtgo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const fullPath = path.join(outputDir, fileName);
  fs.writeFileSync(
    fullPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        tables: snapshot,
      },
      null,
      2
    ),
    'utf8'
  );

  logger.info('DB_BACKUP_CREATED', `Đã tạo bản sao lưu dữ liệu tại ${fullPath}`);
  return fullPath;
}

if (import.meta.url.endsWith('backup.ts')) {
  const db = getDb();
  runMigrations(db)
    .then(() => createLogicalBackupSnapshot( undefined, db))
    .finally(() => db.close());
}
