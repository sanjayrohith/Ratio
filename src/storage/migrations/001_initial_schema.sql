-- 001_initial_schema.sql
-- Initial schema definition for Ratio ledger, sessions, checkpoints, and trust scores.

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
