import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectSessionSummary,
  formatSessionSummary,
  printSessionSummary,
  installExitSummaryHook,
} from '../../src/cli/summary.js';
import { closeDatabase } from '../../src/storage/db.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';

describe('Ratio CLI Local Session Summary Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-summary-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('returns null when workspace has no database', async () => {
    const summary = await collectSessionSummary(tempDir);
    expect(summary).toBeNull();
  });

  it('collects metrics from initialized ledger with checkpoints and trust scores', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    try {
      const checkpointRepo = new CheckpointRepository(db);
      const trustRepo = new TrustScoreRepository(db);

      // Insert interception
      db.prepare(`
        INSERT INTO interceptions (id, tool_name, file_path, staged_id, decision, risk_score, risk_level, line_delta)
        VALUES ('int-1', 'ratio_write_file', 'src/auth.ts', 'stage-1', 'checkpoint_required', 0.8, 'high', 45)
      `).run();

      // Insert checkpoints: 1 passed, 1 failed
      checkpointRepo.insertCheckpoint({
        ticketId: 't-1',
        interceptionId: 'int-1',
        filePath: 'src/auth.ts',
        question: 'Explain JWT storage safety.',
        concept: 'AUTH_JWT_SECRET',
        status: 'passed',
      });

      checkpointRepo.insertCheckpoint({
        ticketId: 't-2',
        interceptionId: 'int-1',
        filePath: 'src/db.ts',
        question: 'Explain DB migration locking.',
        concept: 'DB_MIGRATION',
        status: 'failed',
      });

      // Update trust score
      trustRepo.upsert({ filePath: 'src/auth.ts', score: 0.95 });
      trustRepo.upsert({ filePath: 'src/db.ts', score: 0.45 });
    } finally {
      closeDatabase(db);
    }

    const summary = await collectSessionSummary(tempDir);
    expect(summary).not.toBeNull();
    expect(summary!.totalInterceptions).toBe(1);
    expect(summary!.totalCheckpoints).toBe(2);
    expect(summary!.checkpointsCleared).toBe(1);
    expect(summary!.checkpointsFailed).toBe(1);
    expect(summary!.activeTrustScores.length).toBe(2);

    const formatted = formatSessionSummary(summary!);
    expect(formatted).toContain('Ratio Local Session Summary (telemetry-free):');
    expect(formatted).toContain('Total Interceptions:  1');
    expect(formatted).toContain('Checkpoints Cleared:  1 / 2 (50.0%)');
    expect(formatted).toContain('src/auth.ts');
    expect(formatted).toContain('src/db.ts');
  });

  it('prints session summary via custom stream function', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const logs: string[] = [];
    const printed = await printSessionSummary({
      workspaceRoot: tempDir,
      stream: (msg) => logs.push(msg),
    });

    expect(printed).toBe(true);
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('Checkpoints Cleared:  0 / 0 (0.0%)');
  });

  it('respects onlyIfInterceptions flag when no interceptions exist', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const logs: string[] = [];
    const printed = await printSessionSummary({
      workspaceRoot: tempDir,
      stream: (msg) => logs.push(msg),
      onlyIfInterceptions: true,
    });

    expect(printed).toBe(false);
    expect(logs.length).toBe(0);
  });

  it('installs and uninstalls process exit hook safely', () => {
    const unregister = installExitSummaryHook(tempDir);
    expect(typeof unregister).toBe('function');
    unregister();
  });
});
