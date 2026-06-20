import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeReport } from '../../src/cli/commands/report.js';
import { createProgram, ExitCode } from '../../src/cli/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';
import type { ReportData } from '../../src/core/reporting/template.js';

describe('Ratio CLI Report --json Integration & Schema Compliance Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-report-json-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.exitCode = 0;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('fails gracefully and returns initialized: false on uninitialized workspace', async () => {
    const output: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => output.push(args.join(' '));

    try {
      const res = await executeReport({ json: true, cwd: tempDir });
      expect(res.initialized).toBe(false);
      expect(existsSync(join(tempDir, 'RATIO_REPORT.json'))).toBe(false);

      const stderr = output.join('\n');
      expect(stderr).toContain('Workspace not initialized');
    } finally {
      console.error = originalError;
    }
  });

  it('generates RATIO_REPORT.json by default in initialized empty workspace', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const res = await executeReport({ json: true, cwd: tempDir });
    expect(res.initialized).toBe(true);

    const expectedPath = join(tempDir, 'RATIO_REPORT.json');
    expect(res.outputPath).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);

    const raw = readFileSync(expectedPath, 'utf-8');
    const parsed: ReportData = JSON.parse(raw);

    // Schema assertions
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('files');
    expect(parsed).toHaveProperty('concepts');
    expect(parsed).toHaveProperty('evidence');

    expect(parsed.summary.totalCheckpoints).toBe(0);
    expect(parsed.summary.passRate).toBe(100);
    expect(parsed.summary.vivaReadinessScore).toBe(100);
    expect(parsed.files).toBeArray();
    expect(parsed.concepts).toBeArray();
    expect(parsed.evidence).toBeArray();
  });

  it('respects custom --output destination with nested subdirectories', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const customDest = 'exports/ci/audit-result.json';
    const res = await executeReport({
      json: true,
      output: customDest,
      cwd: tempDir,
    });

    expect(res.initialized).toBe(true);
    const expectedPath = join(tempDir, customDest);
    expect(res.outputPath).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);

    const parsed: ReportData = JSON.parse(readFileSync(expectedPath, 'utf-8'));
    expect(parsed.summary).toBeDefined();
  });

  it('streams valid JSON report to stdout without writing file when --stdout is passed', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    closeDatabase(db);

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(' '));

    try {
      const res = await executeReport({
        json: true,
        stdout: true,
        cwd: tempDir,
      });

      expect(res.initialized).toBe(true);
      expect(existsSync(join(tempDir, 'RATIO_REPORT.json'))).toBe(false);

      const stdout = output.join('\n');
      const parsed: ReportData = JSON.parse(stdout);
      expect(parsed.summary.totalCheckpoints).toBe(0);
      expect(parsed.summary.comprehensionRating).toBe('Master');
    } finally {
      console.log = originalLog;
    }
  });

  it('computes accurate metrics from populated database and verifies JSON schema compliance', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    try {
      const sessionRepo = new SessionRepository(db);
      const checkpointRepo = new CheckpointRepository(db);
      const trustRepo = new TrustScoreRepository(db);

      sessionRepo.recordInterception({
        id: 'int-1',
        toolName: 'ratio_write_file',
        filePath: 'src/auth/jwt.ts',
        stagedId: 'stg-1',
        decision: 'checkpoint_required',
        riskScore: 60,
        riskLevel: 'medium',
        lineDelta: 70,
      });

      sessionRepo.recordInterception({
        id: 'int-2',
        toolName: 'ratio_write_file',
        filePath: 'src/db/migrate.ts',
        stagedId: 'stg-2',
        decision: 'checkpoint_required',
        riskScore: 80,
        riskLevel: 'high',
        lineDelta: 120,
      });

      checkpointRepo.insertCheckpoint({
        ticketId: 't-101',
        filePath: 'src/auth/jwt.ts',
        question: 'Why load secrets from environment variables?',
        concept: 'jwt_secret_hygiene',
        createdAt: '2026-06-06T10:00:00Z',
      });
      checkpointRepo.recordAnswer({
        ticketId: 't-101',
        studentAnswer: 'To prevent hardcoding sensitive credentials in version control.',
      });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-101', status: 'passed', evaluationScore: 95 });

      checkpointRepo.insertCheckpoint({
        ticketId: 't-102',
        filePath: 'src/db/migrate.ts',
        question: 'What happens if a migration fails halfway without a transaction?',
        concept: 'db_migration_idempotency',
        createdAt: '2026-06-06T11:00:00Z',
      });
      checkpointRepo.recordAnswer({
        ticketId: 't-102',
        studentAnswer: 'It breaks everything.',
      });
      checkpointRepo.resolveCheckpoint({ ticketId: 't-102', status: 'failed', evaluationScore: 25 });

      trustRepo.upsert({ filePath: 'src/auth/jwt.ts', score: 0.95 });
      trustRepo.upsert({ filePath: 'src/db/migrate.ts', score: 0.55 });
    } finally {
      closeDatabase(db);
    }

    const res = await executeReport({ json: true, cwd: tempDir });
    expect(res.initialized).toBe(true);

    const reportPath = join(tempDir, 'RATIO_REPORT.json');
    const parsed: ReportData = JSON.parse(readFileSync(reportPath, 'utf-8'));

    // 1. Verify summary metrics
    expect(parsed.summary.totalCheckpoints).toBe(2);
    expect(parsed.summary.passedCheckpoints).toBe(1);
    expect(parsed.summary.failedCheckpoints).toBe(1);
    expect(parsed.summary.passRate).toBe(50.0);
    expect(parsed.summary.totalLinesWritten).toBe(190);
    expect(parsed.summary.independentUnderstandingPercentage).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.vivaReadinessScore).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.vivaReadinessScore).toBeLessThanOrEqual(100);

    // 2. Verify file summaries
    expect(parsed.files.length).toBe(2);
    const authFile = parsed.files.find((f) => f.filePath === 'src/auth/jwt.ts');
    expect(authFile).toBeDefined();
    expect(authFile!.trustScore).toBe(0.95);
    expect(authFile!.checkpointsTriggered).toBe(1);
    expect(authFile!.questionsAnswered).toBe(1);
    expect(authFile!.passRate).toBe(100);
    expect(authFile!.scaffoldingStatus).toBe('High Trust');

    const dbFile = parsed.files.find((f) => f.filePath === 'src/db/migrate.ts');
    expect(dbFile).toBeDefined();
    expect(dbFile!.trustScore).toBe(0.55);
    expect(dbFile!.checkpointsTriggered).toBe(1);
    expect(dbFile!.questionsAnswered).toBe(1);
    expect(dbFile!.passRate).toBe(0);
    expect(dbFile!.scaffoldingStatus).toBe('Moderate Trust');

    // 3. Verify concept summaries
    expect(parsed.concepts.length).toBe(2);
    const jwtConcept = parsed.concepts.find((c) => c.concept === 'jwt_secret_hygiene');
    expect(jwtConcept).toBeDefined();
    expect(jwtConcept!.layer).toBe('auth');
    expect(jwtConcept!.totalTested).toBe(1);
    expect(jwtConcept!.passedCount).toBe(1);
    expect(jwtConcept!.masteryStatus).toBe('Mastered');

    const dbConcept = parsed.concepts.find((c) => c.concept === 'db_migration_idempotency');
    expect(dbConcept).toBeDefined();
    expect(dbConcept!.layer).toBe('db');
    expect(dbConcept!.totalTested).toBe(1);
    expect(dbConcept!.failedCount).toBe(1);
    expect(dbConcept!.masteryStatus).toBe('Vulnerable');

    // 4. Verify evidence trail
    expect(parsed.evidence!.length).toBe(2);
    const entry1 = parsed.evidence!.find((e) => e.ticketId === 't-101');
    expect(entry1).toBeDefined();
    expect(entry1!.filePath).toBe('src/auth/jwt.ts');
    expect(entry1!.status).toBe('passed');
    expect(entry1!.score).toBe(95);
    expect(entry1!.studentAnswer).toContain('version control');
  });

  describe('Commander CLI Dispatching', () => {
    it('executes ratio report --json via commander program CLI dispatching', async () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      closeDatabase(db);

      process.chdir(tempDir);
      const program = createProgram();

      await program.parseAsync(['bun', 'ratio', 'report', '--json']);

      const reportPath = join(tempDir, 'RATIO_REPORT.json');
      expect(existsSync(reportPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(reportPath, 'utf-8'));
      expect(parsed.summary).toBeDefined();
    });

    it('executes ratio report --json --stdout via commander program CLI dispatching', async () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      closeDatabase(db);

      process.chdir(tempDir);
      const program = createProgram();

      const output: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => output.push(args.join(' '));

      try {
        await program.parseAsync(['bun', 'ratio', 'report', '--json', '--stdout']);
        const stdout = output.join('\n');
        const parsed = JSON.parse(stdout);
        expect(parsed.summary).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('sets USER_ERROR exit code when executing report on uninitialized workspace', async () => {
      process.chdir(tempDir);
      const program = createProgram();

      await program.parseAsync(['bun', 'ratio', 'report', '--json']);
      expect(process.exitCode).toBe(ExitCode.USER_ERROR);
    });
  });
});
