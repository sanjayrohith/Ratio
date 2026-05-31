import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeLog, formatStatusBadge } from '../../src/cli/commands/log.js';
import { createProgram } from '../../src/cli/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';

describe('Ratio Log CLI Command Unit & Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-log-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('formatStatusBadge returns appropriate colorized badges', () => {
    expect(formatStatusBadge('passed')).toContain('[PASSED]');
    expect(formatStatusBadge('passed')).toContain('\x1b[32m');

    expect(formatStatusBadge('failed')).toContain('[FAILED]');
    expect(formatStatusBadge('failed')).toContain('\x1b[31m');

    expect(formatStatusBadge('pending')).toContain('[PENDING]');
    expect(formatStatusBadge('pending')).toContain('\x1b[33m');

    expect(formatStatusBadge('bypassed')).toContain('[BYPASSED]');
    expect(formatStatusBadge('bypassed')).toContain('\x1b[36m');

    expect(formatStatusBadge('unknown')).toBe('[UNKNOWN]');
  });

  it('handles uninitialized workspaces gracefully', async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      const result = await executeLog({ cwd: tempDir });
      expect(result.initialized).toBe(false);
      expect(result.count).toBe(0);
      expect(result.checkpoints.length).toBe(0);

      const stdout = output.join('\n');
      expect(stdout).toContain('Workspace not initialized');
      expect(stdout).toContain('ratio init');
    } finally {
      console.log = originalLog;
    }
  });

  it('reports empty ledger when no checkpoints exist', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      const result = await executeLog({ cwd: tempDir });
      expect(result.initialized).toBe(true);
      expect(result.count).toBe(0);
      expect(result.checkpoints.length).toBe(0);

      const stdout = output.join('\n');
      expect(stdout).toContain('No checkpoints found in ledger.');
    } finally {
      console.log = originalLog;
    }
  });

  it('renders checkpoint history with status badges, answers, and filters', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    try {
      const repo = new CheckpointRepository(db);

      // Checkpoint 1: passed
      repo.insertCheckpoint({
        ticketId: 't-auth-1',
        filePath: 'src/auth/jwt.ts',
        question: 'Why store JWT secret outside repo?',
        concept: 'JWT_SECRET_STORAGE',
        expectedKeywords: ['env', 'secret', 'leak'],
        createdAt: '2026-05-31T10:00:00.000Z',
      });
      repo.recordAnswer({
        ticketId: 't-auth-1',
        studentAnswer: 'Because committing secrets leaks credentials in version history.',
        conceptScore: 92,
        detectedKeywords: ['secret', 'leak'],
      });
      repo.resolveCheckpoint({
        ticketId: 't-auth-1',
        status: 'passed',
        evaluationScore: 92,
        evaluationReason: 'Clear explanation of credential leakage.',
      });

      // Checkpoint 2: failed
      repo.insertCheckpoint({
        ticketId: 't-db-1',
        filePath: 'src/db/migrate.ts',
        question: 'What happens without a migration transaction?',
        concept: 'DB_MIGRATION_TRANSACTION',
        expectedKeywords: ['atomic', 'rollback'],
        createdAt: '2026-05-31T11:00:00.000Z',
      });
      repo.recordAnswer({
        ticketId: 't-db-1',
        studentAnswer: 'idk just run again',
        conceptScore: 15,
        detectedKeywords: [],
        isEvasive: true,
      });
      repo.resolveCheckpoint({
        ticketId: 't-db-1',
        status: 'failed',
        evaluationScore: 15,
        evaluationReason: 'Evasive answer lacking rollback explanation.',
      });

      // Checkpoint 3: pending
      repo.insertCheckpoint({
        ticketId: 't-api-1',
        filePath: 'src/api/routes.ts',
        question: 'Why use pagination on collection endpoints?',
        concept: 'API_PAGINATION',
        status: 'pending',
        createdAt: '2026-05-31T12:00:00.000Z',
      });
    } finally {
      closeDatabase(db);
    }

    // 1. Unfiltered log
    const outputAll: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => outputAll.push(args.join(' '));

    try {
      const resultAll = await executeLog({ cwd: tempDir, verbose: true });
      expect(resultAll.count).toBe(3);
      expect(resultAll.checkpoints[0].ticket_id).toBe('t-api-1');
      expect(resultAll.checkpoints[1].ticket_id).toBe('t-db-1');
      expect(resultAll.checkpoints[2].ticket_id).toBe('t-auth-1');

      const stdout = outputAll.join('\n');
      expect(stdout).toContain('t-auth-1');
      expect(stdout).toContain('t-db-1');
      expect(stdout).toContain('t-api-1');
      expect(stdout).toContain('[PASSED]');
      expect(stdout).toContain('[FAILED]');
      expect(stdout).toContain('[PENDING]');
      expect(stdout).toContain('JWT_SECRET_STORAGE');
      expect(stdout).toContain('DB_MIGRATION_TRANSACTION');
      expect(stdout).toContain('Clear explanation of credential leakage');
      expect(stdout).toContain('Evasion Detected:');
    } finally {
      console.log = originalLog;
    }

    // 2. Limit filter
    const resultLimit = await executeLog({ cwd: tempDir, limit: 2 });
    expect(resultLimit.count).toBe(2);
    expect(resultLimit.checkpoints.length).toBe(2);

    // 3. Status filter
    const resultPassed = await executeLog({ cwd: tempDir, status: 'passed' });
    expect(resultPassed.count).toBe(1);
    expect(resultPassed.checkpoints[0].ticket_id).toBe('t-auth-1');

    // 4. File filter
    const resultFile = await executeLog({ cwd: tempDir, file: 'src/db/migrate.ts' });
    expect(resultFile.count).toBe(1);
    expect(resultFile.checkpoints[0].ticket_id).toBe('t-db-1');
  });

  it('runs log command via commander CLI dispatching', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    process.chdir(tempDir);
    const program = createProgram();

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      await program.parseAsync(['bun', 'ratio', 'log', '-n', '5']);
      const stdout = output.join('\n');
      expect(stdout).toContain('Ratio Checkpoint Ledger:');
      expect(stdout).toContain('Showing:   0 checkpoint(s)');
    } finally {
      console.log = originalLog;
    }
  });
});
