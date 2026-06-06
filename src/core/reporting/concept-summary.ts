import { Database } from 'bun:sqlite';
import { ConceptMasterySummary } from './template.js';
import { CONCEPT_DEFINITIONS, ConceptId } from '../concepts/taxonomy.js';

/**
 * Resolves the architectural layer category for a concept string.
 */
export function resolveConceptLayer(concept: string): string {
  const normalized = concept.toLowerCase().trim();

  // Direct enum match
  if (normalized in CONCEPT_DEFINITIONS) {
    return CONCEPT_DEFINITIONS[normalized as ConceptId].category;
  }

  // Keyword heuristic resolution
  if (normalized.includes('jwt') || normalized.includes('auth') || normalized.includes('password') || normalized.includes('cors')) {
    return 'auth';
  }
  if (normalized.includes('db') || normalized.includes('migration') || normalized.includes('sql') || normalized.includes('pool') || normalized.includes('index')) {
    return 'db';
  }
  if (normalized.includes('api') || normalized.includes('rate') || normalized.includes('waterfall') || normalized.includes('idempotency')) {
    return 'api';
  }
  if (normalized.includes('state') || normalized.includes('ui') || normalized.includes('render') || normalized.includes('boundary')) {
    return 'ui';
  }
  if (normalized.includes('job') || normalized.includes('worker') || normalized.includes('queue')) {
    return 'worker';
  }
  if (normalized.includes('env') || normalized.includes('config')) {
    return 'config';
  }

  return 'core';
}

/**
 * Generates architectural concept mastery summaries detailing tested patterns,
 * pass/fail outcomes, average explanation scores, and mastery statuses.
 */
export class ConceptSummaryReporter {
  constructor(private readonly db: Database) {}

  /**
   * Builds an array of ConceptMasterySummary records for all concepts present in the ledger.
   */
  generateConceptSummaries(): ConceptMasterySummary[] {
    const query = `
      SELECT
        concept,
        COUNT(*) as total_tested,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        AVG(
          CASE
            WHEN concept_score IS NOT NULL THEN concept_score
            WHEN evaluation_score IS NOT NULL THEN evaluation_score
            ELSE NULL
          END
        ) as avg_score
      FROM checkpoints
      WHERE concept IS NOT NULL AND TRIM(concept) != ''
      GROUP BY concept
      ORDER BY total_tested DESC, concept ASC
    `;

    const rows = this.db.prepare(query).all() as Array<{
      concept: string;
      total_tested: number;
      passed_count: number;
      failed_count: number;
      avg_score: number | null;
    }>;

    return rows.map((row) => {
      const concept = row.concept;
      const totalTested = Number(row.total_tested);
      const passedCount = Number(row.passed_count);
      const failedCount = Number(row.failed_count);
      const averageScore = Math.round(
        Number(row.avg_score !== null && row.avg_score !== undefined ? row.avg_score : passedCount > 0 ? 80 : 0)
      );

      let masteryStatus: 'Mastered' | 'Competent' | 'Vulnerable' = 'Competent';
      if (passedCount > 0 && failedCount === 0 && averageScore >= 75) {
        masteryStatus = 'Mastered';
      } else if (failedCount > passedCount || averageScore < 50) {
        masteryStatus = 'Vulnerable';
      }

      return {
        concept,
        layer: resolveConceptLayer(concept),
        totalTested,
        passedCount,
        failedCount,
        averageScore,
        masteryStatus,
      };
    });
  }
}
