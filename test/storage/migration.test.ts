import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { runMigrations, getAppliedMigrations } from '../../src/storage/migrations/index.js';
import {
  findProjectRoot,
  ensureRatioDirectory,
  getWorkspaceContext,
  initializeWorkspaceDatabase,
  RATIO_DIR_NAME,
  LEDGER_DB_NAME,
} from '../../src/storage/workspace.js';

describe('SQLite Database & Migration Lifecycle Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-db-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('creates an in-memory database with expected pragmas enabled', () => {
    const db = createDatabase(':memory:');
    try {
      const foreignKeys = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
      expect(foreignKeys.foreign_keys).toBe(1);

      // In-memory sqlite ignores WAL mode and stays 'memory', which is expected
      const journalMode = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(journalMode.journal_mode).toBe('memory');
    } finally {
      closeDatabase(db);
    }
  });

  it('creates a disk-backed database with WAL mode enabled', () => {
    const dbPath = join(tempDir, 'test-wal.db');
    const db = createDatabase(dbPath);
    try {
      const journalMode = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(journalMode.journal_mode.toLowerCase()).toBe('wal');

      const foreignKeys = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
      expect(foreignKeys.foreign_keys).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it('runs initial migration and creates all required ledger tables', () => {
    const db = createDatabase(':memory:');
    try {
      const appliedFirstTime = runMigrations(db);
      expect(appliedFirstTime).toBe(3);

      const migrations = getAppliedMigrations(db);
      expect(migrations.length).toBe(3);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('001_initial_schema.sql');
      expect(migrations[1].version).toBe(2);
      expect(migrations[1].name).toBe('002_fts5_checkpoints.sql');
      expect(migrations[2].version).toBe(3);
      expect(migrations[2].name).toBe('003_pending_writes.sql');

      // Verify tables exist
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC;")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('schema_migrations');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('interceptions');
      expect(tableNames).toContain('checkpoints');
      expect(tableNames).toContain('trust_scores');
      expect(tableNames).toContain('pending_writes');

      // Running migrations again is idempotent (no-op)
      const appliedSecondTime = runMigrations(db);
      expect(appliedSecondTime).toBe(0);
    } finally {
      closeDatabase(db);
    }
  });

  it('verifies foreign key constraints and schema rules in migration tables', () => {
    const db = createDatabase(':memory:');
    try {
      runMigrations(db);

      // Create a session
      db.run("INSERT INTO sessions (id, metadata) VALUES ('session-1', '{\"user\":\"test\"}')");

      // Insert an interception associated with the session
      db.run(`
        INSERT INTO interceptions (id, session_id, tool_name, file_path, staged_id, decision, risk_score, risk_level, line_delta)
        VALUES ('int-1', 'session-1', 'ratio_write_file', 'src/app.ts', 'stage-1', 'checkpoint_required', 0.85, 'high', 45)
      `);

      // Insert a checkpoint associated with the interception
      db.run(`
        INSERT INTO checkpoints (ticket_id, interception_id, session_id, file_path, question, concept, status)
        VALUES ('chk-1', 'int-1', 'session-1', 'src/app.ts', 'What does this function do?', 'concurrency', 'pending')
      `);

      // Query relationships
      const chk = db.query("SELECT * FROM checkpoints WHERE ticket_id = 'chk-1'").get() as any;
      expect(chk.question).toBe('What does this function do?');
      expect(chk.concept).toBe('concurrency');
      expect(chk.status).toBe('pending');

      // Verify foreign key violation when inserting checkpoint with nonexistent interception
      expect(() => {
        db.run(`
          INSERT INTO checkpoints (ticket_id, interception_id, session_id, file_path, question, concept)
          VALUES ('chk-invalid', 'nonexistent-int', 'session-1', 'src/app.ts', '?', 'none')
        `);
      }).toThrow();

      // Trust scores table
      db.run("INSERT INTO trust_scores (file_path, score, total_passes, total_failures) VALUES ('src/app.ts', 0.75, 3, 1)");
      const scoreRow = db.query("SELECT * FROM trust_scores WHERE file_path = 'src/app.ts'").get() as any;
      expect(scoreRow.score).toBe(0.75);
      expect(scoreRow.total_passes).toBe(3);
      expect(scoreRow.total_failures).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it('workspace utilities locate root, manage .ratio dir, and initialize database', () => {
    // Current project root has package.json
    const root = findProjectRoot(tempDir);
    expect(existsSync(root)).toBe(true);

    // Create a mock isolated workspace in tempDir
    const mockRatioDir = ensureRatioDirectory(tempDir);
    expect(existsSync(mockRatioDir)).toBe(true);
    expect(mockRatioDir.endsWith(RATIO_DIR_NAME)).toBe(true);

    const context = getWorkspaceContext(tempDir);
    expect(context.ratioDir).toBe(join(context.rootDir, RATIO_DIR_NAME));
    expect(context.dbPath).toBe(join(context.ratioDir, LEDGER_DB_NAME));

    // initializeWorkspaceDatabase in isolated temp workspace
    // Create a marker in tempDir so it is identified as root
    Bun.write(join(tempDir, 'package.json'), JSON.stringify({ name: 'temp-project' }));

    const { db, context: initializedContext } = initializeWorkspaceDatabase(tempDir);
    try {
      expect(existsSync(initializedContext.dbPath)).toBe(true);

      // Verify tables were created via migrations
      const migrations = getAppliedMigrations(db);
      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0].version).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });
});
