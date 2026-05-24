-- 004_checkpoint_metrics.sql
-- Add explanation quality scoring metrics to checkpoints table:
-- concept_score (0-100), detected_keywords (JSON array of matched terms), and is_evasive indicator.

ALTER TABLE checkpoints ADD COLUMN concept_score REAL;
ALTER TABLE checkpoints ADD COLUMN detected_keywords TEXT;
ALTER TABLE checkpoints ADD COLUMN is_evasive INTEGER NOT NULL DEFAULT 0;
