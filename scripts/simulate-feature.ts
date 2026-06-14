import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRatioServer } from '../src/server/index.js';
import { StagingBuffer } from '../src/core/staging/buffer.js';
import { ComplexityScorer } from '../src/core/scorer/index.js';
import { initializeWorkspaceDatabase } from '../src/storage/workspace.js';
import { closeDatabase } from '../src/storage/db.js';
import { CheckpointRepository } from '../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../src/storage/session-repo.js';
import { TrustScoreRepository } from '../src/storage/trust-repo.js';
import { PendingWriteRepository } from '../src/storage/pending-writes.js';
import { TrustScoreCoordinator } from '../src/core/trust/coordinator.js';
import { MockClaudeClient } from '../test/harness/mock-claude.js';
import type { CheckpointResponse } from '../src/types/protocol.js';

export interface SimulationOptions {
  workspaceDir?: string;
  verbose?: boolean;
  cleanup?: boolean;
}

export interface SimulationStepRecord {
  step: number;
  description: string;
  file: string;
  checkpointTriggered: boolean;
  ticketId?: string;
  question?: string;
  studentAnswer?: string;
  status: 'write_permitted' | 'checkpoint_required' | 'failed';
}

export interface SimulationReport {
  workspace: string;
  steps: SimulationStepRecord[];
  totalCheckpoints: number;
  totalCommittedFiles: number;
  durationMs: number;
}

/**
 * Executes an end-to-end full-stack feature simulation modeling the Ratio PRD demo flow:
 * An Express.js backend adding JWT authentication middleware, database user migrations,
 * and protected API routes while being intercepted and mentored by Ratio.
 */
export async function runFeatureSimulation(
  options: SimulationOptions = {}
): Promise<SimulationReport> {
  const startTime = performance.now();
  const verbose = options.verbose ?? true;
  const isTemp = !options.workspaceDir;
  const workspace = options.workspaceDir ?? mkdtempSync(join(tmpdir(), 'ratio-prd-simulation-'));

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  log('\n======================================================================');
  log('   Ratio PRD Demo Simulation: Express + JWT Auth & DB Migration');
  log('======================================================================');
  log(`Workspace: ${workspace}\n`);

  // 1. Initialize SQLite Ledger Database
  const { db, context } = initializeWorkspaceDatabase(workspace);
  const checkpointRepo = new CheckpointRepository(db);
  const sessionRepo = new SessionRepository(db);
  const trustRepo = new TrustScoreRepository(db);
  const pendingRepo = new PendingWriteRepository(db);
  const trustCoordinator = new TrustScoreCoordinator(checkpointRepo, trustRepo);

  const sessionId = 'session_prd_demo_001';
  sessionRepo.startSession(sessionId, { feature: 'jwt_authentication', framework: 'express' });

  const stagingBuffer = new StagingBuffer();
  // Threshold configured so multi-layer and large changes trigger checkpoints
  const scorer = new ComplexityScorer({
    maxLinesAdded: 10,
    maxTotalLinesChanged: 20,
  });

  const matcher = {
    evaluate: (concept: string, answer: string) => {
      const lower = answer.toLowerCase();
      const isGenuine =
        lower.includes('secret') ||
        lower.includes('migration') ||
        lower.includes('middleware') ||
        lower.includes('token') ||
        lower.includes('contract') ||
        lower.includes('schema') ||
        lower.includes('bcrypt') ||
        lower.includes('express');

      return {
        passed: isGenuine && answer.length > 30,
        score: isGenuine ? 92 : 30,
        isEvasive: !isGenuine,
        conceptId: concept,
        matchedKeywords: ['security', 'architecture', 'mechanism'],
        matchedMechanisms: ['isolation', 'validation'],
        missingMechanisms: [],
        feedback: isGenuine
          ? 'Comprehensive architectural explanation provided.'
          : 'Answer was too shallow.',
      };
    },
  };

  const server = createRatioServer(stagingBuffer, scorer, {
    checkpointRepo,
    sessionRepo,
    trustRepo,
    trustCoordinator,
    pendingRepo,
    matcher: matcher as any,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Student mechanistic answers for simulated checkpoints
  const studentAnswers: Record<string, string> = {
    deps:
      'We install express for HTTP routing, jsonwebtoken for stateless token authentication, and bcrypt for salted password hashing.',
    db:
      'We create a migration for the users table with unique email, bcrypt password hash, and timestamps. ' +
      'Migrations ensure schema evolution is version-controlled and reproducible across environments.',
    auth:
      'The JWT secret key must be loaded from an environment variable (JWT_SECRET) so it is never committed ' +
      'to version control. The middleware extracts the Bearer token from the Authorization header and verifies ' +
      'its cryptographic signature using jsonwebtoken before attaching the user payload to req.user.',
    route:
      'We attach the authenticateJwt middleware to the protected /api/profile endpoint, maintaining clean contract ' +
      'boundaries between public and authenticated routes and returning 401 Unauthorized status when no valid token is provided.',
  };

  const claude = new MockClaudeClient({
    name: 'claude-code-demo',
    autoAnswer: true,
    answerProvider: (cp: CheckpointResponse) => {
      log(`   [Agent] Checkpoint intercepted on: ${cp.file}`);
      log(`   [Ratio Question] "${cp.question}"`);

      let answer = studentAnswers.auth;
      if (cp.file.includes('package.json')) {
        answer = studentAnswers.deps;
      } else if (cp.file.includes('db') || cp.file.includes('migration')) {
        answer = studentAnswers.db;
      } else if (cp.file.includes('route') || cp.file.includes('api')) {
        answer = studentAnswers.route;
      }

      log(`   [Student Explanation] "${answer}"`);
      return answer;
    },
  });

  await server.connect(serverTransport);
  await claude.connect(clientTransport);

  const steps: SimulationStepRecord[] = [];

  try {
    // -------------------------------------------------------------
    // Step 1: Initial package.json setup (Small / Trivial)
    // -------------------------------------------------------------
    log('Step 1: Setting up Express project manifest (package.json)...');
    const pkgPath = join(workspace, 'package.json');
    const pkgContent = JSON.stringify(
      {
        name: 'express-demo-api',
        version: '1.0.0',
        dependencies: {
          express: '^4.18.2',
          jsonwebtoken: '^9.0.2',
          bcrypt: '^5.1.1',
        },
      },
      null,
      2
    );

    const step1Res = await claude.writeFile(pkgPath, pkgContent, 'Initialize project dependencies');
    log(`   -> Status: ${step1Res.permitted ? 'PERMITTED (Trivial)' : 'CHECKPOINT'}`);
    steps.push({
      step: 1,
      description: 'Setup package.json with express, jsonwebtoken, bcrypt',
      file: pkgPath,
      checkpointTriggered: !step1Res.permitted,
      status: step1Res.permitted ? 'write_permitted' : 'checkpoint_required',
    });

    // -------------------------------------------------------------
    // Step 2: Database Migration for Users Table (exceeds threshold -> Checkpoint)
    // -------------------------------------------------------------
    log('\nStep 2: Creating database migration for users table...');
    const migrationPath = join(workspace, 'src/db/migrations/001_create_users.sql');
    const migrationContent = [
      '-- Database migration: 001_create_users.sql',
      'CREATE TABLE IF NOT EXISTS users (',
      '  id TEXT PRIMARY KEY,',
      '  email TEXT NOT NULL UNIQUE,',
      '  password_hash TEXT NOT NULL,',
      '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
      '  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
      'CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);',
    ].join('\n');

    const step2Res = await claude.writeFile(
      migrationPath,
      migrationContent,
      'Add user table migration with password hashing and timestamps'
    );
    log(`   -> Final Status: ${step2Res.permitted ? 'PERMITTED (Checkpoint Approved)' : 'FAILED'}`);
    steps.push({
      step: 2,
      description: 'Add SQLite users migration schema',
      file: migrationPath,
      checkpointTriggered: true,
      ticketId: step2Res.checkpoint?.ticketId,
      question: step2Res.checkpoint?.question,
      studentAnswer: studentAnswers.db,
      status: step2Res.permitted ? 'write_permitted' : 'failed',
    });

    // -------------------------------------------------------------
    // Step 3: Adding JWT Authentication Middleware (Multi-layer -> Checkpoint)
    // -------------------------------------------------------------
    log('\nStep 3: Creating JWT Authentication Middleware (src/auth/jwt.ts)...');
    const authPath = join(workspace, 'src/auth/jwt.ts');
    const authContent = [
      "import jwt from 'jsonwebtoken';",
      "import type { Request, Response, NextFunction } from 'express';",
      '',
      'export interface AuthenticatedUser {',
      '  id: string;',
      '  email: string;',
      '}',
      '',
      'export function authenticateJwt(req: Request, res: Response, next: NextFunction) {',
      "  const authHeader = req.headers.authorization;",
      "  if (!authHeader || !authHeader.startsWith('Bearer ')) {",
      "    return res.status(401).json({ error: 'Missing or malformed bearer token' });",
      '  }',
      "  const token = authHeader.split(' ')[1];",
      '  try {',
      "    const secret = process.env.JWT_SECRET || 'dev-secret-key';",
      '    const payload = jwt.verify(token, secret) as AuthenticatedUser;',
      '    (req as any).user = payload;',
      '    return next();',
      '  } catch (err) {',
      "    return res.status(403).json({ error: 'Invalid or expired token signature' });",
      '  }',
      '}',
    ].join('\n');

    const step3Res = await claude.writeFile(
      authPath,
      authContent,
      'Implement JWT token verification middleware'
    );
    log(`   -> Final Status: ${step3Res.permitted ? 'PERMITTED (Checkpoint Approved)' : 'FAILED'}`);
    steps.push({
      step: 3,
      description: 'Implement JWT authentication middleware',
      file: authPath,
      checkpointTriggered: true,
      ticketId: step3Res.checkpoint?.ticketId,
      question: step3Res.checkpoint?.question,
      studentAnswer: studentAnswers.auth,
      status: step3Res.permitted ? 'write_permitted' : 'failed',
    });

    // -------------------------------------------------------------
    // Step 4: Protecting Express API route with middleware (src/routes/api.ts)
    // -------------------------------------------------------------
    log('\nStep 4: Wiring protected routes into Express API router (src/routes/api.ts)...');
    const routePath = join(workspace, 'src/routes/api.ts');
    const routeContent = [
      "import { Router } from 'express';",
      "import { authenticateJwt } from '../auth/jwt.js';",
      '',
      'export const apiRouter = Router();',
      '',
      "apiRouter.get('/public/health', (req, res) => {",
      "  res.json({ status: 'ok' });",
      '});',
      '',
      "apiRouter.get('/protected/profile', authenticateJwt, (req, res) => {",
      '  res.json({ profile: (req as any).user });',
      '});',
    ].join('\n');

    const step4Res = await claude.writeFile(
      routePath,
      routeContent,
      'Attach authenticateJwt to protected profile route'
    );
    log(`   -> Final Status: ${step4Res.permitted ? 'PERMITTED' : 'FAILED'}`);
    steps.push({
      step: 4,
      description: 'Protect profile endpoint with authenticateJwt',
      file: routePath,
      checkpointTriggered: step4Res.checkpoint !== undefined,
      ticketId: step4Res.checkpoint?.ticketId,
      question: step4Res.checkpoint?.question,
      studentAnswer: step4Res.checkpoint ? studentAnswers.route : undefined,
      status: step4Res.permitted ? 'write_permitted' : 'failed',
    });

    sessionRepo.endSession(sessionId, {
      filesCommitted: steps.filter((s) => s.status === 'write_permitted').length,
      checkpointsCount: steps.filter((s) => s.checkpointTriggered).length,
    });
  } finally {
    await claude.close();
    await server.close();
    closeDatabase(db);
  }

  const durationMs = performance.now() - startTime;
  const committedFiles = steps.filter((s) => s.status === 'write_permitted').length;
  const checkpointsCount = steps.filter((s) => s.checkpointTriggered).length;

  log('\n======================================================================');
  log(`✓ PRD Demo Simulation Completed in ${durationMs.toFixed(2)}ms`);
  log(`  Files Written:        ${committedFiles}/${steps.length}`);
  log(`  Checkpoints Cleared:  ${checkpointsCount}`);
  log('======================================================================\n');

  if (isTemp && options.cleanup) {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }

  return {
    workspace,
    steps,
    totalCheckpoints: checkpointsCount,
    totalCommittedFiles: committedFiles,
    durationMs,
  };
}

if (import.meta.main) {
  runFeatureSimulation({ verbose: true, cleanup: false }).catch((err) => {
    console.error('Feature simulation failed:', err);
    process.exit(1);
  });
}
