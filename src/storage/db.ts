import { Database } from 'bun:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
}

export interface DatabaseOptions {
  wal?: boolean;
  foreignKeys?: boolean;
  synchronous?: 'NORMAL' | 'FULL' | 'OFF' | 'EXTRA';
  busyTimeout?: number;
  retry?: RetryOptions;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 50,
  maxDelayMs: 1000,
  backoffFactor: 2,
  jitter: true,
};

const DEFAULT_OPTIONS: DatabaseOptions = {
  wal: true,
  foreignKeys: true,
  synchronous: 'NORMAL',
  busyTimeout: 5000,
  retry: DEFAULT_RETRY_OPTIONS,
};

/**
 * Checks whether an error is caused by SQLite lock contention or busy status.
 */
export function isBusyError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code;
  return (
    code === 'SQLITE_BUSY' ||
    code === 'SQLITE_LOCKED' ||
    msg.includes('SQLITE_BUSY') ||
    msg.includes('SQLITE_LOCKED') ||
    msg.includes('database is locked') ||
    msg.includes('database table is locked') ||
    msg.includes('busy')
  );
}

/**
 * Synchronous sleep helper using Atomics.wait on a shared buffer.
 */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

/**
 * Calculates exponential backoff delay with optional random jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  options: Required<RetryOptions> = DEFAULT_RETRY_OPTIONS
): number {
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffFactor, attempt);
  const cappedDelay = Math.min(baseDelay, options.maxDelayMs);
  if (!options.jitter) {
    return cappedDelay;
  }
  // Random jitter between 0.5x and 1.5x
  const jitterFactor = 0.5 + Math.random();
  return Math.min(options.maxDelayMs, Math.round(cappedDelay * jitterFactor));
}

/**
 * Executes a synchronous database operation with exponential backoff retry on SQLITE_BUSY.
 */
export function withRetrySync<T>(
  fn: () => T,
  options: RetryOptions = {}
): T {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (err: any) {
      if (attempt >= opts.maxRetries || !isBusyError(err)) {
        throw err;
      }
      const delay = calculateBackoffDelay(attempt, opts);
      sleepSync(delay);
      attempt++;
    }
  }
}

/**
 * Executes an asynchronous database operation with exponential backoff retry on SQLITE_BUSY.
 */
export async function withRetry<T>(
  fn: () => Promise<T> | T,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt >= opts.maxRetries || !isBusyError(err)) {
        throw err;
      }
      const delay = calculateBackoffDelay(attempt, opts);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

/**
 * Creates and initializes a Bun SQLite database connection with standard performance and safety pragmas:
 * - Immediate 5000ms busy_timeout to prevent lock contention errors under concurrency
 * - WAL (Write-Ahead Logging) mode for concurrent readers and writer
 * - Foreign key constraint enforcement
 * - Configurable synchronous pragma (default: NORMAL for WAL mode)
 * - Automatic retry with exponential backoff if initial connection encounters SQLITE_BUSY
 */
export function createDatabase(
  dbPath: string = ':memory:',
  options: DatabaseOptions = {}
): Database {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const retryOpts = { ...DEFAULT_RETRY_OPTIONS, ...(options.retry ?? {}) };

  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }
  }

  return withRetrySync(() => {
    const db = new Database(dbPath);

    // Apply busy_timeout first so SQLite's native busy handler is active immediately
    if (mergedOptions.busyTimeout) {
      db.run(`PRAGMA busy_timeout = ${mergedOptions.busyTimeout};`);
    }

    if (mergedOptions.wal && dbPath !== ':memory:') {
      db.run('PRAGMA journal_mode = WAL;');
    }

    if (mergedOptions.foreignKeys) {
      db.run('PRAGMA foreign_keys = ON;');
    }

    if (mergedOptions.synchronous) {
      db.run(`PRAGMA synchronous = ${mergedOptions.synchronous};`);
    }

    return db;
  }, retryOpts);
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
