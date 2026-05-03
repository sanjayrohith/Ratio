-- 003_pending_writes.sql
-- Persistent pending writes table for atomic transaction safety across agent restarts.

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
