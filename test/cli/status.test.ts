import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeStatus } from '../../src/cli/commands/status.js';
import { createProgram } from '../../src/cli/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';

describe('Ratio Status CLI Command Unit & Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-status-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('handles uninitialized workspaces gracefully', async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      const result = await executeStatus({ cwd: tempDir });
      expect(result.initialized).toBe(false);
      expect(result.metrics.totalCheckpoints).toBe(0);
      expect(result.metrics.passRate).toBe(0);
      expect(result.fileTrustBreakdown.length).toBe(0);

      const stdout = output.join('\n');
      expect(stdout).toContain('Workspace not initialized');
      expect(stdout).toContain('ratio init');
    } finally {
      console.log = originalLog;
    }
  });

  it('reports zero metrics for freshly initialized workspace', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const result = await executeStatus({ cwd: tempDir });
    expect(result.initialized).toBe(true);
    expect(result.metrics.totalCheckpoints).toBe(0);
    expect(result.metrics.passedCheckpoints).toBe(0);
    expect(result.metrics.failedCheckpoints).toBe(0);
    expect(result.metrics.passRate).toBe(0);
    expect(result.metrics.activeSessions).toBe(0);
    expect(result.metrics.totalSessions).toBe(0);
    expect(result.metrics.trackedFilesCount).toBe(0);
    expect(result.fileTrustBreakdown.length).toBe(0);
  });

  it('computes accurate pass rate, session count, and trust score table', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    try {
      const sessionRepo = new SessionRepository(db);
      const checkpointRepo = new CheckpointRepository(db);
      const trustRepo = new TrustScoreRepository(db);

      // Session 1: completed
      const s1 = sessionRepo.startSession('session-1', {}, '2026-05-30T10:00:00Z');
      sessionRepo.endSession(s1.id, '2026-05-30T11:00:00Z');

      // Session 2: active
      sessionRepo.startSession('session-2', {}, '2026-05-31T08:00:00Z');

      // Checkpoint 1: passed on jwt.ts
      checkpointRepo.insertCheckpoint({
        ticketId: 't-1',
        sessionId: 'session-1',
        filePath: 'src/auth/jwt.ts',
        question: 'Why store secrets in environment variables?',
        concept: 'JWT_SECRET_STORAGE',
      });
      checkpointRepo.recordAnswer({ ticketId: 't-1', studentAnswer: 'Prevents leaking secrets in git repo' });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-1', status: 'passed', evaluationScore: 90 });

      // Checkpoint 2: failed on jwt.ts
      checkpointRepo.insertCheckpoint({
        ticketId: 't-2',
        sessionId: 'session-1',
        filePath: 'src/auth/jwt.ts',
        question: 'What happens if a token signature is not verified?',
        concept: 'JWT_SECRET_STORAGE',
      });
      checkpointRepo.recordAnswer({ ticketId: 't-2', studentAnswer: 'idk' });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-2', status: 'failed', evaluationScore: 10 });

      // Checkpoint 3: pending on db.ts
      checkpointRepo.insertCheckpoint({
        ticketId: 't-3',
        sessionId: 'session-2',
        filePath: 'src/db/migrate.ts',
        question: 'Why wrap schema changes in transactions?',
        concept: 'DB_MIGRATION_TRANSACTION',
        status: 'pending',
      });

      // Checkpoint 4: passed on db.ts
      checkpointRepo.insertCheckpoint({
        ticketId: 't-4',
        sessionId: 'session-2',
        filePath: 'src/db/migrate.ts',
        question: 'How do rollback migrations work?',
        concept: 'DB_MIGRATION_TRANSACTION',
      });
      checkpointRepo.recordAnswer({ ticketId: 't-4', studentAnswer: 'Runs the down sql statement' });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-4', status: 'passed', evaluationScore: 85 });

      // Checkpoint 5: bypassed
      checkpointRepo.insertCheckpoint({
        ticketId: 't-5',
        sessionId: 'session-2',
        filePath: 'src/ui/Button.tsx',
        question: 'Why use memoization here?',
        concept: 'STATE_RENDER_LOOP',
      });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-5', status: 'bypassed' });

      // Trust scores
      trustRepo.upsert({
        filePath: 'src/auth/jwt.ts',
        score: 0.8,
        totalPasses: 1,
        totalFailures: 1,
      });
      trustRepo.upsert({
        filePath: 'src/db/migrate.ts',
        score: 0.5,
        totalPasses: 1,
        totalFailures: 0,
      });
    } finally {
      closeDatabase(db);
    }

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      const result = await executeStatus({ cwd: tempDir, verbose: true });

      expect(result.initialized).toBe(true);
      expect(result.metrics.totalCheckpoints).toBe(5);
      expect(result.metrics.passedCheckpoints).toBe(2);
      expect(result.metrics.failedCheckpoints).toBe(1);
      expect(result.metrics.pendingCheckpoints).toBe(1);
      expect(result.metrics.bypassedCheckpoints).toBe(1);
      // 2 passed out of 3 evaluated (2 passed, 1 failed) -> 66.7%
      expect(result.metrics.passRate).toBe(66.7);
      expect(result.metrics.totalSessions).toBe(2);
      expect(result.metrics.activeSessions).toBe(1);
      expect(result.metrics.trackedFilesCount).toBeGreaterThanOrEqual(2);

      // Trust breakdown checks
      expect(result.fileTrustBreakdown.length).toBe(2);
      const jwtEntry = result.fileTrustBreakdown.find((f) => f.filePath === 'src/auth/jwt.ts');
      expect(jwtEntry).toBeDefined();
      expect(jwtEntry!.trustScore).toBe(0.8);
      expect(jwtEntry!.effectiveLinesAdded).toBeGreaterThan(0);
      expect(jwtEntry!.effectiveLinesRemoved).toBeGreaterThan(0);
      expect(jwtEntry!.totalPasses).toBe(1);
      expect(jwtEntry!.totalFailures).toBe(1);

      const stdout = output.join('\n');
      expect(stdout).toContain('Ratio Repository Status:');
      expect(stdout).toContain('Metrics Summary:');
      expect(stdout).toContain('66.7%');
      expect(stdout).toContain('src/auth/jwt.ts');
      expect(stdout).toContain('src/db/migrate.ts');
    } finally {
      console.log = originalLog;
    }
  });

  it('runs status command via commander CLI dispatching', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    process.chdir(tempDir);
    const program = createProgram();

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      await program.parseAsync(['bun', 'ratio', 'status']);
      const stdout = output.join('\n');
      expect(stdout).toContain('Ratio Repository Status:');
      expect(stdout).toContain('Metrics Summary:');
    } finally {
      console.log = originalLog;
    }
  });
});
