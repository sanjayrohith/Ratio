import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

export const INITIAL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions: Groups tool calls and interactions into distinct coding sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  metadata TEXT -- JSON encoded metadata (files touched, tool call counts, etc.)
);

-- Interceptions: Detailed records of every intercepted tool call (ratio_write_file, ratio_edit_file)
CREATE TABLE IF NOT EXISTS interceptions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  staged_id TEXT NOT NULL,
  decision TEXT NOT NULL, -- 'checkpoint_required' | 'write_permitted'
  risk_score REAL NOT NULL DEFAULT 0.0,
  risk_level TEXT NOT NULL, -- 'low' | 'medium' | 'high' | 'critical'
  reasons TEXT, -- JSON array of string reasons
  layers TEXT, -- JSON array of layers touched
  new_dependencies TEXT, -- JSON array of new dependencies
  line_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interceptions_session ON interceptions(session_id);
CREATE INDEX IF NOT EXISTS idx_interceptions_file ON interceptions(file_path);
CREATE INDEX IF NOT EXISTS idx_interceptions_created_at ON interceptions(created_at);

-- Checkpoints: Socratic challenges, student answers, and pass/fail evaluation
CREATE TABLE IF NOT EXISTS checkpoints (
  ticket_id TEXT PRIMARY KEY,
  interception_id TEXT REFERENCES interceptions(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  question TEXT NOT NULL,
  concept TEXT NOT NULL,
  expected_keywords TEXT, -- JSON array of expected concept keywords
  student_answer TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'passed' | 'failed' | 'bypassed'
  evaluation_score REAL,
  evaluation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_interception ON checkpoints(interception_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_file ON checkpoints(file_path);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at);

-- Trust scores: Per-file scaffolding decay/recovery scores
CREATE TABLE IF NOT EXISTS trust_scores (
  file_path TEXT PRIMARY KEY,
  score REAL NOT NULL DEFAULT 1.0,
  total_passes INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_updated_at ON trust_scores(updated_at);
`;

export const FTS5_MIGRATION_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS checkpoints_fts USING fts5(
  ticket_id UNINDEXED,
  file_path,
  question,
  concept,
  student_answer,
  content='checkpoints',
  content_rowid='rowid'
);

-- Trigger: Insert into FTS on new checkpoint row
CREATE TRIGGER IF NOT EXISTS checkpoints_ai AFTER INSERT ON checkpoints BEGIN
  INSERT INTO checkpoints_fts(rowid, ticket_id, file_path, question, concept, student_answer)
  VALUES (new.rowid, new.ticket_id, new.file_path, new.question, new.concept, new.student_answer);
END;

-- Trigger: Delete from FTS on checkpoint deletion
CREATE TRIGGER IF NOT EXISTS checkpoints_ad AFTER DELETE ON checkpoints BEGIN
  INSERT INTO checkpoints_fts(checkpoints_fts, rowid, ticket_id, file_path, question, concept, student_answer)
  VALUES ('delete', old.rowid, old.ticket_id, old.file_path, old.question, old.concept, old.student_answer);
END;

-- Trigger: Update FTS on checkpoint update
CREATE TRIGGER IF NOT EXISTS checkpoints_au AFTER UPDATE ON checkpoints BEGIN
  INSERT INTO checkpoints_fts(checkpoints_fts, rowid, ticket_id, file_path, question, concept, student_answer)
  VALUES ('delete', old.rowid, old.ticket_id, old.file_path, old.question, old.concept, old.student_answer);
  INSERT INTO checkpoints_fts(rowid, ticket_id, file_path, question, concept, student_answer)
  VALUES (new.rowid, new.ticket_id, new.file_path, new.question, new.concept, new.student_answer);
END;
`;

export const PENDING_WRITES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS pending_writes (
  ticket_id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'write' | 'edit'
  question TEXT NOT NULL,
  concept TEXT,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'COMMITTED' | 'REJECTED'
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  metadata TEXT -- JSON encoded metadata
);

CREATE INDEX IF NOT EXISTS idx_pending_writes_file ON pending_writes(file_path);
CREATE INDEX IF NOT EXISTS idx_pending_writes_status ON pending_writes(status);
CREATE INDEX IF NOT EXISTS idx_pending_writes_created_at ON pending_writes(created_at);
`;

export const CHECKPOINT_METRICS_MIGRATION_SQL = `
ALTER TABLE checkpoints ADD COLUMN concept_score REAL;
ALTER TABLE checkpoints ADD COLUMN detected_keywords TEXT;
ALTER TABLE checkpoints ADD COLUMN is_evasive INTEGER NOT NULL DEFAULT 0;
`;

/**
 * Embedded migrations list fallback if running in bundled environment.
 */
const EMBEDDED_MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  {
    version: 1,
    name: '001_initial_schema.sql',
    sql: INITIAL_MIGRATION_SQL,
  },
  {
    version: 2,
    name: '002_fts5_checkpoints.sql',
    sql: FTS5_MIGRATION_SQL,
  },
  {
    version: 3,
    name: '003_pending_writes.sql',
    sql: PENDING_WRITES_MIGRATION_SQL,
  },
  {
    version: 4,
    name: '004_checkpoint_metrics.sql',
    sql: CHECKPOINT_METRICS_MIGRATION_SQL,
  },
];


/**
 * Applies pending schema migrations to the given SQLite database.
 */
export function runMigrations(db: Database, migrationsDir?: string): number {
  // Ensure schema_migrations exists
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db.query('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  let migrations: Array<{ version: number; name: string; sql: string }> = [];

  const targetDir =
    migrationsDir ??
    (existsSync(join(import.meta.dir, '001_initial_schema.sql')) ? import.meta.dir : undefined);

  if (targetDir && existsSync(targetDir)) {
    try {
      const files = readdirSync(targetDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      migrations = files.map((file) => {
        const match = file.match(/^(\d+)/);
        const version = match ? parseInt(match[1], 10) : 0;
        const sql = readFileSync(join(targetDir, file), 'utf-8');
        return { version, name: file, sql };
      });
    } catch {
      migrations = EMBEDDED_MIGRATIONS;
    }
  } else {
    migrations = EMBEDDED_MIGRATIONS;
  }

  let appliedCount = 0;

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.transaction(() => {
        db.run(migration.sql);
        db.run(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );
      })();
      appliedCount++;
    }
  }

  return appliedCount;
}

/**
 * Returns the list of applied migrations from the database.
 */
export function getAppliedMigrations(db: Database): MigrationRecord[] {
  try {
    return db.query('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC').all() as MigrationRecord[];
  } catch {
    return [];
  }
}
