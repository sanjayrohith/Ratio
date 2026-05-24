import { CheckpointRepository } from '../../storage/checkpoint-repo.js';
import { TrustScoreRepository, TrustScoreRecord } from '../../storage/trust-repo.js';
import {
  calculateTrustScore,
  TrustScoreConfig,
  DEFAULT_TRUST_SCORE_CONFIG,
} from './model.js';
import { DynamicThresholdScaler, DEFAULT_SCALER_CONFIG } from './scaler.js';
import { ScoringThresholds, DEFAULT_SCORING_THRESHOLDS } from '../scorer/types.js';

export interface ResolveAnswerOptions {
  ticketId: string;
  status: 'passed' | 'failed' | 'bypassed';
  evaluationScore?: number | null;
  evaluationReason?: string | null;
  conceptScore?: number | null;
  detectedKeywords?: string[] | null;
  isEvasive?: boolean;
  customTrustDelta?: number;
}

export interface TrustResolutionResult {
  checkpoint: any;
  trustScore: TrustScoreRecord;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
}

/**
 * TrustScoreCoordinator coordinates between checkpoint evaluation events,
 * updating file trust scores in the database, and providing dynamic scoring thresholds.
 */
export class TrustScoreCoordinator {
  private readonly scaler: DynamicThresholdScaler;

  constructor(
    private readonly checkpointRepo: CheckpointRepository,
    private readonly trustRepo: TrustScoreRepository,
    private readonly config: TrustScoreConfig = DEFAULT_TRUST_SCORE_CONFIG
  ) {
    this.scaler = new DynamicThresholdScaler(DEFAULT_SCALER_CONFIG);
  }

  /**
   * Resolves a student's answer to a checkpoint, records the status in the checkpoint ledger,
   * and immediately computes and commits the decayed or recovered trust score for the file.
   */
  resolveCheckpointAnswer(options: ResolveAnswerOptions): TrustResolutionResult {
    const checkpoint = this.checkpointRepo.getByTicketId(options.ticketId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for ticket: ${options.ticketId}`);
    }

    // Resolve checkpoint in repository
    const resolvedCheckpoint = this.checkpointRepo.resolveCheckpoint({
      ticketId: options.ticketId,
      status: options.status,
      evaluationScore: options.evaluationScore,
      evaluationReason: options.evaluationReason,
      conceptScore: options.conceptScore ?? (options.evaluationScore !== undefined ? options.evaluationScore : undefined),
      detectedKeywords: options.detectedKeywords,
      isEvasive: options.isEvasive,
    });


    // Fetch current file trust score
    const currentTrustRecord = this.trustRepo.getOrCreate(checkpoint.file_path);
    const previousScore = currentTrustRecord.score;

    let newScore = previousScore;
    let updatedTrustRecord = currentTrustRecord;

    if (options.status === 'passed') {
      newScore = calculateTrustScore(
        previousScore,
        'passed',
        this.config,
        options.customTrustDelta
      );
      updatedTrustRecord = this.trustRepo.recordPass(checkpoint.file_path, newScore);
    } else if (options.status === 'failed') {
      newScore = calculateTrustScore(
        previousScore,
        'failed',
        this.config,
        options.customTrustDelta
      );
      updatedTrustRecord = this.trustRepo.recordFailure(checkpoint.file_path, newScore);
    }

    return {
      checkpoint: resolvedCheckpoint,
      trustScore: updatedTrustRecord,
      previousScore,
      newScore,
      scoreDelta: Math.round((newScore - previousScore) * 10000) / 10000,
    };
  }

  /**
   * Retrieves the dynamic scoring thresholds for a specific file based on its trust score.
   */
  getDynamicThresholdsForFile(
    filePath: string,
    baseThresholds: ScoringThresholds = DEFAULT_SCORING_THRESHOLDS
  ): ScoringThresholds {
    const trustRecord = this.trustRepo.getOrCreate(filePath);
    return this.scaler.scaleThresholds(baseThresholds, trustRecord.score);
  }

  /**
   * Directly fetches the trust record for a file.
   */
  getFileTrustScore(filePath: string): TrustScoreRecord {
    return this.trustRepo.getOrCreate(filePath);
  }

  /**
   * Applies the outcome of an answer evaluation to both the checkpoint ledger
   * and the per-file trust score repository.
   */
  public applyEvaluationOutcome(
    ticketId: string,
    evaluation: {
      passed: boolean;
      score: number;
      feedback?: string;
      matchedKeywords?: string[];
      isEvasive?: boolean;
    },
    customDelta?: number
  ): TrustResolutionResult {
    return this.resolveCheckpointAnswer({
      ticketId,
      status: evaluation.passed ? 'passed' : 'failed',
      evaluationScore: evaluation.score,
      evaluationReason: evaluation.feedback ?? null,
      conceptScore: evaluation.score,
      detectedKeywords: evaluation.matchedKeywords,
      isEvasive: evaluation.isEvasive,
      customTrustDelta: customDelta,
    });
  }
}
