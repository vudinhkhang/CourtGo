import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { config } from '../config/env.js';

export interface QueryResult<T = Record<string, any>> {
  rows: T[];
  rowCount: number;
}

export interface DbExecutor {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface DatabaseClient extends DbExecutor {
  withTransaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R>;
  close(): Promise<void>;
  getDriverType(): 'pglite' | 'pg';
}

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  public async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => resolve(() => this.release()));
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

class PGliteDatabaseClient implements DatabaseClient {
  private pglite: PGlite;
  private mutex = new AsyncMutex();

  constructor(dataDir?: string) {
    if (dataDir && dataDir !== 'memory') {
      const resolved = path.resolve(process.cwd(), dataDir);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      this.pglite = new PGlite(resolved);
    } else {
      this.pglite = new PGlite();
    }
  }

  public getDriverType(): 'pglite' {
    return 'pglite';
  }

  private async rawQuery<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.pglite.query<T>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  public async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const release = await this.mutex.acquire();
    try {
      return await this.rawQuery<T>(sql, params);
    } finally {
      release();
    }
  }

  public async withTransaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    const release = await this.mutex.acquire();
    try {
      await this.pglite.exec('BEGIN');
      const txExecutor: DbExecutor = {
        query: <T = Record<string, any>>(sql: string, params: unknown[] = []) => this.rawQuery<T>(sql, params),
      };
      try {
        const result = await fn(txExecutor);
        await this.pglite.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          await this.pglite.exec('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        throw err;
      }
    } finally {
      release();
    }
  }

  public async execSqlScript(sqlScript: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.pglite.exec(sqlScript);
    } finally {
      release();
    }
  }

  public async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.pglite.close();
    } finally {
      release();
    }
  }
}

class PgPoolDatabaseClient implements DatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  public getDriverType(): 'pg' {
    return 'pg';
  }

  public async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  }

  public async withTransaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txExecutor: DbExecutor = {
        query: async <T = Record<string, any>>(sql: string, params: unknown[] = []) => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as T[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
      };
      try {
        const result = await fn(txExecutor);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        throw err;
      }
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDatabaseClient(databaseUrl: string = config.databaseUrl): DatabaseClient {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return new PgPoolDatabaseClient(databaseUrl);
  }
  const pglitePath = databaseUrl.replace(/^pglite:\/\//, '');
  return new PGliteDatabaseClient(pglitePath);
}

let activeDb: DatabaseClient | null = null;

export function getDb(): DatabaseClient {
  if (!activeDb) {
    activeDb = createDatabaseClient(config.databaseUrl);
  }
  return activeDb;
}

export async function setDbForTesting(customDb: DatabaseClient | null): Promise<void> {
  if (activeDb && activeDb !== customDb) {
    await activeDb.close();
  }
  activeDb = customDb;
}
