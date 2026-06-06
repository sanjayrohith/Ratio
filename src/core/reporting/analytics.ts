import { Database } from 'bun:sqlite';
import {
  ReportExecutiveSummary,
  determineComprehensionRating,
} from './template.js';

export interface AnalyticsOptions {
  projectName?: string;
  generatedAt?: string;
}

/**
 * Computes high-level portfolio metrics, pass/fail ratios, independent
 * understanding percentages, and viva readiness scores from the SQLite ledger.
 */
export class ReportAnalytics {
  constructor(private readonly db: Database) {}

  /**
   * Calculates the executive summary and KPI ratings for the portfolio report.
   */
  computeSummary(options: AnalyticsOptions = {}): ReportExecutiveSummary {
    const projectName = options.projectName ?? 'workspace';
    const generatedAt = options.generatedAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19);

    // 1. Total lines authored across all intercepted writes
    const linesRow = this.db
      .prepare(`SELECT COALESCE(SUM(ABS(line_delta)), 0) as total_lines FROM interceptions`)
      .get() as { total_lines: number };
    const totalLinesWritten = linesRow?.total_lines ?? 0;

    // 2. Checkpoint statistics
    const cpRow = this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'bypassed' THEN 1 ELSE 0 END) as bypassed,
          AVG(
            CASE
              WHEN status IN ('passed', 'failed') AND concept_score IS NOT NULL THEN concept_score
              WHEN status IN ('passed', 'failed') AND evaluation_score IS NOT NULL THEN evaluation_score
              ELSE NULL
            END
          ) as avg_score
        FROM checkpoints
      `)
      .get() as {
        total: number;
        passed: number | null;
        failed: number | null;
        pending: number | null;
        bypassed: number | null;
        avg_score: number | null;
      };

    const totalCheckpoints = cpRow?.total ?? 0;
    const passedCheckpoints = cpRow?.passed ?? 0;
    const failedCheckpoints = cpRow?.failed ?? 0;
    const pendingCheckpoints = cpRow?.pending ?? 0;
    const bypassedCheckpoints = cpRow?.bypassed ?? 0;
    const avgScore = cpRow?.avg_score ?? (passedCheckpoints > 0 ? 80 : 0);

    const evaluatedCount = passedCheckpoints + failedCheckpoints;
    const passRate =
      evaluatedCount > 0
        ? Math.round((passedCheckpoints / evaluatedCount) * 1000) / 10
        : totalCheckpoints === 0
        ? 100.0
        : 0.0;

    // 3. Average trust score across tracked files
    const trustRow = this.db
      .prepare(`SELECT AVG(score) as avg_trust, COUNT(*) as file_count FROM trust_scores`)
      .get() as { avg_trust: number | null; file_count: number };
    const avgTrust = trustRow?.avg_trust !== null && trustRow?.avg_trust !== undefined
      ? Number(trustRow.avg_trust)
      : 1.0;
    const fileCount = trustRow?.file_count ?? 0;

    // 4. Independent understanding percentage
    // Measures the proportion of intercepted complexity that was successfully defended and understood.
    let independentUnderstandingPercentage = 100.0;
    if (evaluatedCount > 0) {
      // Blend pass rate (70% weight) and qualitative explanation score (30% weight)
      independentUnderstandingPercentage = Math.round(
        Math.min(100, Math.max(0, passRate * 0.7 + (avgScore ?? passRate) * 0.3)) * 10
      ) / 10;
    } else if (totalCheckpoints > 0 && pendingCheckpoints > 0) {
      independentUnderstandingPercentage = 50.0;
    }

    // 5. Viva readiness score calculation (0 - 100 index)
    // 50% pass rate + 30% file trust scores + 20% average explanation score
    let vivaReadinessScore = 100;
    if (evaluatedCount > 0) {
      vivaReadinessScore = Math.round(
        Math.min(
          100,
          Math.max(
            0,
            passRate * 0.5 + (avgTrust * 100) * 0.3 + (avgScore ?? passRate) * 0.2
          )
        )
      );
    } else if (fileCount > 0) {
      vivaReadinessScore = Math.round(avgTrust * 100);
    }

    const comprehensionRating = determineComprehensionRating(vivaReadinessScore);

    return {
      projectName,
      generatedAt,
      totalLinesWritten,
      totalCheckpoints,
      passedCheckpoints,
      failedCheckpoints,
      pendingCheckpoints,
      bypassedCheckpoints,
      passRate,
      vivaReadinessScore,
      comprehensionRating,
      independentUnderstandingPercentage,
    };
  }
}
