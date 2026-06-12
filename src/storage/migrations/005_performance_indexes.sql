-- 005_performance_indexes.sql
-- Composite performance indexes for sub-millisecond checkpoint lookups,
-- trust score evaluation, and session history traversal.

-- 1. Trust scores composite index: fast lookups by file_path and updated_at
CREATE INDEX IF NOT EXISTS idx_trust_scores_file_updated ON trust_scores(file_path, updated_at);

-- 2. Checkpoints composite index: fast lookups by status and created_at
CREATE INDEX IF NOT EXISTS idx_checkpoints_status_created ON checkpoints(status, created_at);

-- 3. Checkpoints composite index: fast lookups by file_path and created_at
CREATE INDEX IF NOT EXISTS idx_checkpoints_file_created ON checkpoints(file_path, created_at);

-- 4. Interceptions composite index: fast lookups by file_path and created_at
CREATE INDEX IF NOT EXISTS idx_interceptions_file_created ON interceptions(file_path, created_at);

-- 5. Pending writes composite index: fast lookups by status and created_at
CREATE INDEX IF NOT EXISTS idx_pending_writes_status_created ON pending_writes(status, created_at);
