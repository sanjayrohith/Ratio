import { Database } from 'bun:sqlite';
import {
  DEFAULT_TRUST_SCORE_CONFIG,
  TrustScoreConfig,
  clampScore,
} from '../core/trust/model.js';

export interface TrustScoreRecord {
  file_path: string;
  score: number;
  total_passes: number;
  total_failures: number;
  updated_at: string;
}

export interface UpsertTrustScoreInput {
  filePath: string;
  score: number;
  totalPasses?: number;
  totalFailures?: number;
  updatedAt?: string;
}

export class TrustScoreRepository {
  constructor(
    private readonly db: Database,
    private readonly config: TrustScoreConfig = DEFAULT_TRUST_SCORE_CONFIG
  ) {}

  /**
   * Retrieves trust score record for a given file path.
   * If not yet tracked in the database, returns a default record with initialScore.
   */
  getOrCreate(filePath: string): TrustScoreRecord {
    const existing = this.get(filePath);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const defaultScore = this.config.initialScore;

    this.db.run(
      `
      INSERT INTO trust_scores (file_path, score, total_passes, total_failures, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO NOTHING
    `,
      [filePath, defaultScore, 0, 0, now]
    );

    return this.get(filePath) ?? {
      file_path: filePath,
      score: defaultScore,
      total_passes: 0,
      total_failures: 0,
      updated_at: now,
    };
  }

  /**
   * Retrieves trust score record if it exists in the database.
   */
  get(filePath: string): TrustScoreRecord | null {
    const stmt = this.db.prepare('SELECT * FROM trust_scores WHERE file_path = ?');
    const row = stmt.get(filePath) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Upserts or sets an explicit trust score record.
   */
  upsert(input: UpsertTrustScoreInput): TrustScoreRecord {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const clampedScore = clampScore(input.score);
    const passes = input.totalPasses ?? 0;
    const failures = input.totalFailures ?? 0;

    this.db.run(
      `
      INSERT INTO trust_scores (file_path, score, total_passes, total_failures, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        score = excluded.score,
        total_passes = excluded.total_passes,
        total_failures = excluded.total_failures,
        updated_at = excluded.updated_at
    `,
      [input.filePath, clampedScore, passes, failures, updatedAt]
    );

    const updated = this.get(input.filePath);
    if (!updated) {
      throw new Error(`Failed to upsert trust score for file: ${input.filePath}`);
    }
    return updated;
  }

  /**
   * Records a pass event on a file, incrementing passes, updating score, and recording timestamp.
   */
  recordPass(filePath: string, newScore: number): TrustScoreRecord {
    const current = this.getOrCreate(filePath);
    const clamped = clampScore(newScore);
    const now = new Date().toISOString();

    this.db.run(
      `
      UPDATE trust_scores
      SET score = ?, total_passes = total_passes + 1, updated_at = ?
      WHERE file_path = ?
    `,
      [clamped, now, filePath]
    );

    return this.get(filePath)!;
  }

  /**
   * Records a failure event on a file, incrementing failures, updating score, and recording timestamp.
   */
  recordFailure(filePath: string, newScore: number): TrustScoreRecord {
    const current = this.getOrCreate(filePath);
    const clamped = clampScore(newScore);
    const now = new Date().toISOString();

    this.db.run(
      `
      UPDATE trust_scores
      SET score = ?, total_failures = total_failures + 1, updated_at = ?
      WHERE file_path = ?
    `,
      [clamped, now, filePath]
    );

    return this.get(filePath)!;
  }

  /**
   * Lists all tracked file trust scores.
   */
  listAll(): TrustScoreRecord[] {
    const rows = this.db.prepare('SELECT * FROM trust_scores ORDER BY updated_at DESC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): TrustScoreRecord {
    return {
      file_path: row.file_path,
      score: row.score,
      total_passes: row.total_passes,
      total_failures: row.total_failures,
      updated_at: row.updated_at,
    };
  }
}
