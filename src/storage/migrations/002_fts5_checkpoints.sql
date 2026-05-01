-- 002_fts5_checkpoints.sql
-- Full-Text Search (FTS5) for checkpoints question, concept, and student answers.

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
