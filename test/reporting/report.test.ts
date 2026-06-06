import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderMarkdownReport,
  determineComprehensionRating,
  ReportData,
} from '../../src/core/reporting/template.js';
import { ReportAnalytics } from '../../src/core/reporting/analytics.js';
import { FileSummaryReporter } from '../../src/core/reporting/file-summary.js';
import { ConceptSummaryReporter, resolveConceptLayer } from '../../src/core/reporting/concept-summary.js';
import { executeReport } from '../../src/cli/commands/report.js';
import { createProgram } from '../../src/cli/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';

describe('Ratio Portfolio Report Generator Unit & Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-report-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Template & Rating Unit Tests', () => {
    it('determineComprehensionRating categorizes viva readiness scores correctly', () => {
      expect(determineComprehensionRating(95)).toBe('Master');
      expect(determineComprehensionRating(90)).toBe('Master');
      expect(determineComprehensionRating(85)).toBe('Proficient');
      expect(determineComprehensionRating(75)).toBe('Proficient');
      expect(determineComprehensionRating(70)).toBe('Competent');
      expect(determineComprehensionRating(60)).toBe('Competent');
      expect(determineComprehensionRating(50)).toBe('Developing');
      expect(determineComprehensionRating(40)).toBe('Developing');
      expect(determineComprehensionRating(30)).toBe('Needs Review');
      expect(determineComprehensionRating(0)).toBe('Needs Review');
    });

    it('resolveConceptLayer correctly identifies architectural layers', () => {
      expect(resolveConceptLayer('jwt_secret_hygiene')).toBe('auth');
      expect(resolveConceptLayer('JWT_SECRET_STORAGE')).toBe('auth');
      expect(resolveConceptLayer('db_migration_idempotency')).toBe('db');
      expect(resolveConceptLayer('DB_MIGRATION_TRANSACTION')).toBe('db');
      expect(resolveConceptLayer('sql_injection_prevention')).toBe('db');
      expect(resolveConceptLayer('api_idempotency')).toBe('api');
      expect(resolveConceptLayer('RATE_LIMITING')).toBe('api');
      expect(resolveConceptLayer('state_render_loop')).toBe('ui');
      expect(resolveConceptLayer('ERROR_BOUNDARY')).toBe('ui');
      expect(resolveConceptLayer('background_job_retry_idempotency')).toBe('worker');
      expect(resolveConceptLayer('env_secret_isolation')).toBe('config');
      expect(resolveConceptLayer('unknown_custom_pattern')).toBe('core');
    });

    it('renderMarkdownReport renders full markdown document matching expected structure', () => {
      const sampleData: ReportData = {
        summary: {
          projectName: 'my-express-app',
          generatedAt: '2026-06-06 12:00:00',
          totalLinesWritten: 320,
          totalCheckpoints: 4,
          passedCheckpoints: 3,
          failedCheckpoints: 1,
          pendingCheckpoints: 0,
          bypassedCheckpoints: 0,
          passRate: 75.0,
          vivaReadinessScore: 82,
          comprehensionRating: 'Proficient',
          independentUnderstandingPercentage: 80.5,
        },
        files: [
          {
            filePath: 'src/auth/jwt.ts',
            linesWritten: 120,
            checkpointsTriggered: 2,
            questionsAnswered: 2,
            passRate: 100.0,
            trustScore: 0.9,
            scaffoldingStatus: 'High Trust',
          },
          {
            filePath: 'src/db/migrations/001_users.sql',
            linesWritten: 200,
            checkpointsTriggered: 2,
            questionsAnswered: 2,
            passRate: 50.0,
            trustScore: 0.65,
            scaffoldingStatus: 'Moderate Trust',
          },
        ],
        concepts: [
          {
            concept: 'jwt_secret_hygiene',
            layer: 'auth',
            totalTested: 2,
            passedCount: 2,
            failedCount: 0,
            averageScore: 92,
            masteryStatus: 'Mastered',
          },
          {
            concept: 'db_migration_idempotency',
            layer: 'db',
            totalTested: 2,
            passedCount: 1,
            failedCount: 1,
            averageScore: 55,
            masteryStatus: 'Competent',
          },
        ],
        evidence: [
          {
            ticketId: 't-101',
            filePath: 'src/auth/jwt.ts',
            concept: 'jwt_secret_hygiene',
            question: 'Why load secret from environment?',
            studentAnswer: 'Because hardcoding in code commits it to git history.',
            status: 'passed',
            score: 95,
            timestamp: '2026-06-06 10:00:00',
          },
        ],
      };

      const markdown = renderMarkdownReport(sampleData);

      expect(markdown).toContain('# Ratio Portfolio Audit: Understanding Ledger');
      expect(markdown).toContain('`my-express-app`');
      expect(markdown).toContain('## 1. Executive Summary & Viva Readiness');
      expect(markdown).toContain('**82 / 100**');
      expect(markdown).toContain('**Proficient**');
      expect(markdown).toContain('**80.5%**');
      expect(markdown).toContain('**75.0%**');
      expect(markdown).toContain('## 2. Per-File Understanding Ledger');
      expect(markdown).toContain('`src/auth/jwt.ts`');
      expect(markdown).toContain('`src/db/migrations/001_users.sql`');
      expect(markdown).toContain('High Trust');
      expect(markdown).toContain('Moderate Trust');
      expect(markdown).toContain('## 3. Architectural Concept Mastery');
      expect(markdown).toContain('**jwt_secret_hygiene**');
      expect(markdown).toContain('**db_migration_idempotency**');
      expect(markdown).toContain('Mastered');
      expect(markdown).toContain('## 4. Socratic Verification Evidence Trail');
      expect(markdown).toContain('Checkpoint `t-101`');
      expect(markdown).toContain('Because hardcoding in code commits it to git history.');
      expect(markdown).toContain('Audited by Ratio');
    });
  });

  describe('Report Analytics and Reporters Integration Tests', () => {
    it('computes metrics from populated SQLite ledger database', () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      try {
        const sessionRepo = new SessionRepository(db);
        const checkpointRepo = new CheckpointRepository(db);
        const trustRepo = new TrustScoreRepository(db);

        // Record interceptions (lines written)
        sessionRepo.recordInterception({
          id: 'int-1',
          toolName: 'ratio_write_file',
          filePath: 'src/auth/jwt.ts',
          stagedId: 'stg-1',
          decision: 'checkpoint_required',
          riskScore: 65,
          riskLevel: 'high',
          lineDelta: 85,
        });

        sessionRepo.recordInterception({
          id: 'int-2',
          toolName: 'ratio_write_file',
          filePath: 'src/db/migrate.ts',
          stagedId: 'stg-2',
          decision: 'checkpoint_required',
          riskScore: 70,
          riskLevel: 'high',
          lineDelta: 115,
        });

        // Checkpoint 1: passed
        checkpointRepo.insertCheckpoint({
          ticketId: 't-1',
          filePath: 'src/auth/jwt.ts',
          question: 'Why load secrets from environment variables?',
          concept: 'jwt_secret_hygiene',
          createdAt: '2026-06-06T10:00:00Z',
        });
        checkpointRepo.recordAnswer({ ticketId: 't-1', studentAnswer: 'Prevents credential leaks in git repos' });
        checkpointRepo.resolveCheckpoint({ ticketId: 't-1', status: 'passed', evaluationScore: 90 });

        // Checkpoint 2: failed
        checkpointRepo.insertCheckpoint({
          ticketId: 't-2',
          filePath: 'src/db/migrate.ts',
          question: 'What happens if a migration fails halfway?',
          concept: 'db_migration_idempotency',
          createdAt: '2026-06-06T11:00:00Z',
        });
        checkpointRepo.recordAnswer({ ticketId: 't-2', studentAnswer: 'idk' });
        checkpointRepo.resolveCheckpoint({ ticketId: 't-2', status: 'failed', evaluationScore: 20 });

        // Trust scores
        trustRepo.upsert({ filePath: 'src/auth/jwt.ts', score: 0.9 });
        trustRepo.upsert({ filePath: 'src/db/migrate.ts', score: 0.6 });

        // Test ReportAnalytics
        const analytics = new ReportAnalytics(db);
        const summary = analytics.computeSummary({ projectName: 'test-project' });

        expect(summary.projectName).toBe('test-project');
        expect(summary.totalLinesWritten).toBe(200); // 85 + 115
        expect(summary.totalCheckpoints).toBe(2);
        expect(summary.passedCheckpoints).toBe(1);
        expect(summary.failedCheckpoints).toBe(1);
        expect(summary.passRate).toBe(50.0);
        expect(summary.vivaReadinessScore).toBeGreaterThan(40);
        expect(summary.vivaReadinessScore).toBeLessThanOrEqual(100);
        expect(summary.comprehensionRating).toBeDefined();

        // Test FileSummaryReporter
        const fileReporter = new FileSummaryReporter(db);
        const files = fileReporter.generateFileSummaries();
        expect(files.length).toBe(2);

        const jwtFile = files.find((f) => f.filePath === 'src/auth/jwt.ts');
        expect(jwtFile).toBeDefined();
        expect(jwtFile!.linesWritten).toBe(85);
        expect(jwtFile!.checkpointsTriggered).toBe(1);
        expect(jwtFile!.questionsAnswered).toBe(1);
        expect(jwtFile!.passRate).toBe(100.0);
        expect(jwtFile!.trustScore).toBe(0.9);
        expect(jwtFile!.scaffoldingStatus).toBe('High Trust');

        const dbFile = files.find((f) => f.filePath === 'src/db/migrate.ts');
        expect(dbFile).toBeDefined();
        expect(dbFile!.linesWritten).toBe(115);
        expect(dbFile!.checkpointsTriggered).toBe(1);
        expect(dbFile!.questionsAnswered).toBe(1);
        expect(dbFile!.passRate).toBe(0.0);
        expect(dbFile!.trustScore).toBe(0.6);
        expect(dbFile!.scaffoldingStatus).toBe('Moderate Trust');

        // Test ConceptSummaryReporter
        const conceptReporter = new ConceptSummaryReporter(db);
        const concepts = conceptReporter.generateConceptSummaries();
        expect(concepts.length).toBe(2);

        const jwtConcept = concepts.find((c) => c.concept === 'jwt_secret_hygiene');
        expect(jwtConcept).toBeDefined();
        expect(jwtConcept!.layer).toBe('auth');
        expect(jwtConcept!.totalTested).toBe(1);
        expect(jwtConcept!.passedCount).toBe(1);
        expect(jwtConcept!.failedCount).toBe(0);
        expect(jwtConcept!.masteryStatus).toBe('Mastered');

        const dbConcept = concepts.find((c) => c.concept === 'db_migration_idempotency');
        expect(dbConcept).toBeDefined();
        expect(dbConcept!.layer).toBe('db');
        expect(dbConcept!.totalTested).toBe(1);
        expect(dbConcept!.passedCount).toBe(0);
        expect(dbConcept!.failedCount).toBe(1);
        expect(dbConcept!.masteryStatus).toBe('Vulnerable');
      } finally {
        closeDatabase(db);
      }
    });
  });

  describe('executeReport CLI Command Tests', () => {
    it('fails gracefully when workspace is uninitialized', async () => {
      const result = await executeReport({ cwd: tempDir });
      expect(result.initialized).toBe(false);
      expect(result.reportContent).toBe('');
    });

    it('generates RATIO_REPORT.md by default in initialized workspace', async () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      closeDatabase(db);

      const result = await executeReport({ cwd: tempDir });
      expect(result.initialized).toBe(true);
      expect(result.outputPath).toBe(join(tempDir, 'RATIO_REPORT.md'));
      expect(existsSync(result.outputPath!)).toBe(true);

      const content = readFileSync(result.outputPath!, 'utf-8');
      expect(content).toContain('# Ratio Portfolio Audit: Understanding Ledger');
      expect(content).toContain('Viva Readiness Score');
      expect(content).toContain('Per-File Understanding Ledger');
      expect(content).toContain('Architectural Concept Mastery');
    });

    it('respects custom output file and --stdout options', async () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      closeDatabase(db);

      // Custom output path
      const customOut = 'docs/custom-report.md';
      const resultCustom = await executeReport({ cwd: tempDir, output: customOut });
      expect(resultCustom.initialized).toBe(true);
      expect(resultCustom.outputPath).toBe(join(tempDir, customOut));
      expect(existsSync(resultCustom.outputPath!)).toBe(true);

      // Stdout option
      const stdoutLines: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => stdoutLines.push(args.join(' '));

      try {
        const resultStdout = await executeReport({ cwd: tempDir, stdout: true });
        expect(resultStdout.initialized).toBe(true);
        const logged = stdoutLines.join('\n');
        expect(logged).toContain('# Ratio Portfolio Audit: Understanding Ledger');
      } finally {
        console.log = originalLog;
      }
    });

    it('executes report command through commander program', async () => {
      const { db } = initializeWorkspaceDatabase(tempDir);
      closeDatabase(db);

      process.chdir(tempDir);
      const program = createProgram();

      await program.parseAsync(['bun', 'ratio', 'report', '-o', 'CLI_REPORT.md']);
      expect(existsSync(join(tempDir, 'CLI_REPORT.md'))).toBe(true);

      const content = readFileSync(join(tempDir, 'CLI_REPORT.md'), 'utf-8');
      expect(content).toContain('# Ratio Portfolio Audit: Understanding Ledger');
    });
  });
});
