import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDatabase,
  closeDatabase,
  isBusyError,
  calculateBackoffDelay,
  withRetrySync,
  withRetry,
} from '../../src/storage/db.js';

describe('SQLite Concurrent Connection & Busy Retry Logic Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-retry-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isBusyError', () => {
    it('detects standard SQLite busy and locked error signatures', () => {
      expect(isBusyError(new Error('SQLITE_BUSY: database is locked'))).toBe(true);
      expect(isBusyError(new Error('database table is locked'))).toBe(true);
      expect(isBusyError(new Error('SQLITE_LOCKED'))).toBe(true);
      expect(isBusyError({ code: 'SQLITE_BUSY' })).toBe(true);
      expect(isBusyError('busy')).toBe(true);

      expect(isBusyError(new Error('no such table: checkpoints'))).toBe(false);
      expect(isBusyError(new Error('syntax error'))).toBe(false);
      expect(isBusyError(null)).toBe(false);
      expect(isBusyError(undefined)).toBe(false);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('calculates exponential delay with backoff multiplier and caps at maxDelayMs', () => {
      const opts = {
        maxRetries: 5,
        initialDelayMs: 20,
        maxDelayMs: 200,
        backoffFactor: 2,
        jitter: false,
      };

      expect(calculateBackoffDelay(0, opts)).toBe(20);
      expect(calculateBackoffDelay(1, opts)).toBe(40);
      expect(calculateBackoffDelay(2, opts)).toBe(80);
      expect(calculateBackoffDelay(3, opts)).toBe(160);
      expect(calculateBackoffDelay(4, opts)).toBe(200); // capped at max
    });

    it('applies jitter within bounded range when jitter is enabled', () => {
      const opts = {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffFactor: 2,
        jitter: true,
      };

      const delay = calculateBackoffDelay(0, opts);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(500);
    });
  });

  describe('withRetrySync and withRetry', () => {
    it('retries synchronous operation upon encountering busy errors until resolved', () => {
      let attempts = 0;
      const result = withRetrySync(
        () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('SQLITE_BUSY: database is locked');
          }
          return 'success_val';
        },
        { initialDelayMs: 5, maxRetries: 4, jitter: false }
      );

      expect(result).toBe('success_val');
      expect(attempts).toBe(3);
    });

    it('throws immediately when a non-busy error occurs without retrying', () => {
      let attempts = 0;
      expect(() => {
        withRetrySync(
          () => {
            attempts++;
            throw new Error('SQLITE_ERROR: syntax error');
          },
          { maxRetries: 5, initialDelayMs: 5 }
        );
      }).toThrow('syntax error');

      expect(attempts).toBe(1);
    });

    it('throws when maximum retry attempts are exhausted', () => {
      let attempts = 0;
      expect(() => {
        withRetrySync(
          () => {
            attempts++;
            throw new Error('SQLITE_BUSY: database is locked');
          },
          { maxRetries: 2, initialDelayMs: 5, jitter: false }
        );
      }).toThrow('SQLITE_BUSY');

      expect(attempts).toBe(3); // Initial try + 2 retries
    });

    it('retries asynchronous operations with backoff', async () => {
      let attempts = 0;
      const res = await withRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('SQLITE_LOCKED');
          }
          return 42;
        },
        { initialDelayMs: 5, maxRetries: 3, jitter: false }
      );

      expect(res).toBe(42);
      expect(attempts).toBe(2);
    });
  });

  describe('createDatabase concurrent connection handling', () => {
    it('configures busy_timeout = 5000 and WAL mode preventing lock failures', () => {
      const dbPath = join(tempDir, 'concurrent.db');
      const db1 = createDatabase(dbPath);
      const db2 = createDatabase(dbPath);

      try {
        db1.run('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
        db1.run('INSERT INTO items (name) VALUES (?)', ['item_from_db1']);

        const row = db2.prepare('SELECT name FROM items WHERE id = 1').get() as { name: string };
        expect(row.name).toBe('item_from_db1');

        // Both connections can write under WAL mode with busy_timeout
        db2.run('INSERT INTO items (name) VALUES (?)', ['item_from_db2']);
        const count = db1.prepare('SELECT count(*) as cnt FROM items').get() as { cnt: number };
        expect(count.cnt).toBe(2);
      } finally {
        closeDatabase(db1);
        closeDatabase(db2);
      }
    });
  });
});
