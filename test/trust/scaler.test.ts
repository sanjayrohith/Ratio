import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations/index.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';
import { TrustScoreCoordinator } from '../../src/core/trust/coordinator.js';
import { DynamicThresholdScaler } from '../../src/core/trust/scaler.js';
import { DEFAULT_SCORING_THRESHOLDS } from '../../src/core/scorer/types.js';
import { Database } from 'bun:sqlite';

describe('Dynamic Threshold Scaler & Progressive Scaffolding Integration Tests', () => {
  let db: Database;
  let checkpointRepo: CheckpointRepository;
  let trustRepo: TrustScoreRepository;
  let coordinator: TrustScoreCoordinator;
  let scaler: DynamicThresholdScaler;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    checkpointRepo = new CheckpointRepository(db);
    trustRepo = new TrustScoreRepository(db);
    coordinator = new TrustScoreCoordinator(checkpointRepo, trustRepo);
    scaler = new DynamicThresholdScaler();
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('computes expected threshold scaling based on trust score levels', () => {
    // Score 1.0 (Full Trust / Faded Scaffolding): full limits
    const fullThresholds = scaler.scaleThresholds(DEFAULT_SCORING_THRESHOLDS, 1.0);
    expect(fullThresholds.maxLinesAdded).toBe(50);
    expect(fullThresholds.maxTotalLinesChanged).toBe(60);

    // Score 0.5 (Intermediate Trust): 62.5% of limit
    const halfThresholds = scaler.scaleThresholds(DEFAULT_SCORING_THRESHOLDS, 0.5);
    expect(halfThresholds.maxLinesAdded).toBe(31); // 50 * (0.25 + 0.75 * 0.5 = 0.625) = 31.25 -> 31

    // Score 0.0 (Zero Trust / Strict Scaffolding): 25% of limit
    const zeroThresholds = scaler.scaleThresholds(DEFAULT_SCORING_THRESHOLDS, 0.0);
    expect(zeroThresholds.maxLinesAdded).toBe(13); // 50 * 0.25 = 12.5 -> 13
    expect(zeroThresholds.maxTotalLinesChanged).toBe(15); // 60 * 0.25 = 15
  });

  it('progressively tightens diff thresholds across repeated shallow or failed answers', () => {
    const targetFile = 'src/services/payment.ts';

    // Step 1: Initially untracked file has score 1.0 and base threshold 50 lines
    const initialTrust = coordinator.getFileTrustScore(targetFile);
    expect(initialTrust.score).toBe(1.0);
    expect(coordinator.getDynamicThresholdsForFile(targetFile).maxLinesAdded).toBe(50);

    // Step 2: First checkpoint fails (shallow explanation)
    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-pay-1',
      filePath: targetFile,
      question: 'Why idempotency keys in Stripe payments?',
      concept: 'payment_idempotency',
    });

    const res1 = coordinator.resolveCheckpointAnswer({
      ticketId: 'chk-pay-1',
      status: 'failed',
      evaluationReason: 'Did not explain replay attack prevention or network retries.',
    });

    expect(res1.previousScore).toBe(1.0);
    expect(res1.newScore).toBe(0.75);
    expect(res1.scoreDelta).toBe(-0.25);

    // Threshold tightens from 50 to 41 lines
    const thresh1 = coordinator.getDynamicThresholdsForFile(targetFile);
    expect(thresh1.maxLinesAdded).toBe(41); // 50 * (0.25 + 0.75 * 0.75) = 40.625 -> 41

    // Step 3: Second checkpoint fails on the same file
    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-pay-2',
      filePath: targetFile,
      question: 'How do webhook signatures work?',
      concept: 'webhook_security',
    });

    const res2 = coordinator.resolveCheckpointAnswer({
      ticketId: 'chk-pay-2',
      status: 'failed',
      evaluationReason: 'Student lacked understanding of HMAC signature verification.',
    });

    expect(res2.previousScore).toBe(0.75);
    expect(res2.newScore).toBe(0.5);

    // Threshold tightens further to 31 lines
    const thresh2 = coordinator.getDynamicThresholdsForFile(targetFile);
    expect(thresh2.maxLinesAdded).toBe(31);

    // Step 4: Third checkpoint succeeds with strong explanation (recovery)
    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-pay-3',
      filePath: targetFile,
      question: 'What is the purpose of stripe signature timestamp tolerance?',
      concept: 'replay_attacks',
    });

    const res3 = coordinator.resolveCheckpointAnswer({
      ticketId: 'chk-pay-3',
      status: 'passed',
      evaluationReason: 'Clear and thorough explanation of timestamp validation.',
    });

    expect(res3.previousScore).toBe(0.5);
    expect(res3.newScore).toBe(0.6); // +0.1 recovery
    expect(res3.scoreDelta).toBe(0.1);

    // Threshold relaxes back upwards
    const thresh3 = coordinator.getDynamicThresholdsForFile(targetFile);
    expect(thresh3.maxLinesAdded).toBe(35); // 50 * (0.25 + 0.75 * 0.6) = 35

    // Verify record in trustRepo reflects stats correctly
    const finalRecord = trustRepo.get(targetFile);
    expect(finalRecord?.total_passes).toBe(1);
    expect(finalRecord?.total_failures).toBe(2);
    expect(finalRecord?.score).toBe(0.6);
  });
});
