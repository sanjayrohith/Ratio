import { Database } from 'bun:sqlite';
import { FileAuditSummary } from './template.js';

/**
 * Generates per-file understanding ledger summaries detailing lines written,
 * checkpoints triggered, questions answered, pass rates, and trust scores.
 */
export class FileSummaryReporter {
  constructor(private readonly db: Database) {}

  /**
   * Builds an array of FileAuditSummary items for all tracked files.
   */
  generateFileSummaries(): FileAuditSummary[] {
    const query = `
      SELECT
        f.file_path,
        COALESCE(i.lines_written, 0) as lines_written,
        COALESCE(c.total_checkpoints, 0) as checkpoints_triggered,
        COALESCE(c.answered_count, 0) as questions_answered,
        COALESCE(c.passed_count, 0) as passed_count,
        COALESCE(c.failed_count, 0) as failed_count,
        COALESCE(t.score, 1.0) as trust_score
      FROM (
        SELECT file_path FROM trust_scores
        UNION
        SELECT file_path FROM checkpoints
        UNION
        SELECT file_path FROM interceptions
      ) f
      LEFT JOIN (
        SELECT file_path, SUM(ABS(line_delta)) as lines_written
        FROM interceptions
        GROUP BY file_path
      ) i ON f.file_path = i.file_path
      LEFT JOIN (
        SELECT
          file_path,
          COUNT(*) as total_checkpoints,
          SUM(CASE WHEN student_answer IS NOT NULL THEN 1 ELSE 0 END) as answered_count,
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
        FROM checkpoints
        GROUP BY file_path
      ) c ON f.file_path = c.file_path
      LEFT JOIN trust_scores t ON f.file_path = t.file_path
      ORDER BY f.file_path ASC
    `;

    const rows = this.db.prepare(query).all() as Array<{
      file_path: string;
      lines_written: number;
      checkpoints_triggered: number;
      questions_answered: number;
      passed_count: number;
      failed_count: number;
      trust_score: number;
    }>;

    return rows.map((row) => {
      const linesWritten = Number(row.lines_written);
      const checkpointsTriggered = Number(row.checkpoints_triggered);
      const questionsAnswered = Number(row.questions_answered);
      const passedCount = Number(row.passed_count);
      const failedCount = Number(row.failed_count);
      const trustScore = Math.round(Number(row.trust_score) * 100) / 100;

      const evaluated = passedCount + failedCount;
      const passRate =
        evaluated > 0
          ? Math.round((passedCount / evaluated) * 1000) / 10
          : checkpointsTriggered === 0
          ? 100.0
          : 0.0;

      let scaffoldingStatus: 'High Trust' | 'Moderate Trust' | 'Tight Scaffolding' | 'Untracked' = 'High Trust';
      if (checkpointsTriggered === 0 && linesWritten === 0) {
        scaffoldingStatus = 'Untracked';
      } else if (trustScore >= 0.8) {
        scaffoldingStatus = 'High Trust';
      } else if (trustScore >= 0.5) {
        scaffoldingStatus = 'Moderate Trust';
      } else {
        scaffoldingStatus = 'Tight Scaffolding';
      }

      return {
        filePath: row.file_path,
        linesWritten,
        checkpointsTriggered,
        questionsAnswered,
        passRate,
        trustScore,
        scaffoldingStatus,
      };
    });
  }
}
