import { Database } from 'bun:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface DatabaseOptions {
  wal?: boolean;
  foreignKeys?: boolean;
  synchronous?: 'NORMAL' | 'FULL' | 'OFF' | 'EXTRA';
  busyTimeout?: number;
}

const DEFAULT_OPTIONS: DatabaseOptions = {
  wal: true,
  foreignKeys: true,
  synchronous: 'NORMAL',
  busyTimeout: 5000,
};

/**
 * Creates and initializes a Bun SQLite database connection with standard performance and safety pragmas:
 * - WAL (Write-Ahead Logging) mode for concurrent readers and writer
 * - Foreign key constraint enforcement
 * - Configurable synchronous pragma (default: NORMAL for WAL mode)
 * - Configurable busy_timeout to prevent lock contention errors
 */
export function createDatabase(
  dbPath: string = ':memory:',
  options: DatabaseOptions = {}
): Database {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  if (mergedOptions.wal && dbPath !== ':memory:') {
    db.run('PRAGMA journal_mode = WAL;');
  }

  if (mergedOptions.foreignKeys) {
    db.run('PRAGMA foreign_keys = ON;');
  }

  if (mergedOptions.synchronous) {
    db.run(`PRAGMA synchronous = ${mergedOptions.synchronous};`);
  }

  if (mergedOptions.busyTimeout) {
    db.run(`PRAGMA busy_timeout = ${mergedOptions.busyTimeout};`);
  }

  return db;
}

/**
 * Safely closes an active SQLite database connection.
 */
export function closeDatabase(db: Database): void {
  try {
    db.close();
  } catch {
    // Ignore error if already closed
  }
}
