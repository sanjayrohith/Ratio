import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRatioServer } from '../../src/server/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { TrustScoreCoordinator } from '../../src/core/trust/coordinator.js';
import { MockClaudeClient } from '../harness/mock-claude.js';
import { executeReport } from '../../src/cli/commands/report.js';
import { GitWatcher } from '../../src/core/sync/git-watcher.js';

describe('Hackathon Repository Dogfooding Simulation (End-to-End)', () => {
  let tempDir: string;
  let dbRef: any;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-dogfood-hackathon-'));
    try {
      execSync('git init -b main', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Dogfood Bot"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "bot@ratio.test"', { cwd: tempDir, stdio: 'ignore' });
    } catch {
      // Fallback
    }
  });

  afterEach(() => {
    if (dbRef) {
      try {
        closeDatabase(dbRef);
      } catch {
        // Ignore
      }
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('builds a full-stack hackathon project and triggers between 5 and 15 checkpoints', async () => {
    // 1. Initialize SQLite Ledger Database
    const { db, context } = initializeWorkspaceDatabase(tempDir);
    dbRef = db;

    const checkpointRepo = new CheckpointRepository(db);
    const sessionRepo = new SessionRepository(db);
    const trustRepo = new TrustScoreRepository(db);
    const pendingRepo = new PendingWriteRepository(db);
    const trustCoordinator = new TrustScoreCoordinator(checkpointRepo, trustRepo);

    sessionRepo.startSession('session_hackathon_001', {
      project: 'DevPulse Hackathon Leaderboard',
      agent: 'mock-claude-agent',
    });

    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({
      maxLinesAdded: 30,
      maxTotalLinesChanged: 45,
    });

    // Semantic concept answer evaluator
    const matcher = {
      evaluate: (concept: string, answer: string) => {
        const lower = answer.toLowerCase();
        const keywords = ['jwt', 'bcrypt', 'database', 'sqlite', 'middleware', 'token', 'schema', 'auth', 'hash', 'session'];
        const matches = keywords.filter((kw) => lower.includes(kw));
        const passed = matches.length >= 1 && answer.length > 20;

        return {
          passed,
          score: passed ? 90 : 35,
          isEvasive: !passed,
          conceptId: concept,
          matchedKeywords: matches,
          missingMechanisms: passed ? [] : ['cryptographic verification', 'architectural layering'],
          feedback: passed
            ? 'Architecture verified and understood.'
            : 'Explain the technical mechanism in more detail.',
        };
      },
    };

    const server = createRatioServer(
      stagingBuffer,
      scorer,
      {
        stagingBuffer,
        pendingRepo,
        checkpointRepo,
        trustRepo,
        trustCoordinator,
        matcher: matcher as any,
      },
      'hackathon_turn',
      tempDir
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new MockClaudeClient({ autoAnswer: false });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Architectural steps representing a full-stack hackathon application
    const steps = [
      // 1. Package manifest with dependencies -> Checkpoint 1 (New dependencies added)
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'devpulse-hackathon',
            version: '1.0.0',
            type: 'module',
            dependencies: {
              express: '^4.19.2',
              'better-sqlite3': '^11.1.2',
              jsonwebtoken: '^9.0.2',
              bcryptjs: '^2.4.3',
              dotenv: '^16.4.5',
            },
          },
          null,
          2
        ),
        answer: 'Adding express, sqlite, jsonwebtoken, and bcrypt dependencies to manage API routing, DB persistence, and secure token authentication.',
      },

      // 2. Simple project readme -> Trivial write (Auto-approved, 0 checkpoints)
      {
        path: 'README.md',
        content: '# DevPulse Hackathon Leaderboard\nReal-time developer activity aggregation and project showcase.\n\n## Quickstart\nRun `npm install` and `npm start`.\n',
        answer: '',
      },

      // 3. Database configuration -> Checkpoint 2 (>30 lines)
      {
        path: 'src/config/database.ts',
        content: `import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DatabaseConfig {
  filename: string;
  verbose?: boolean;
}

export function createDatabaseConnection(config: DatabaseConfig): Database.Database {
  const dir = dirname(config.filename);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(config.filename, {
    verbose: config.verbose ? console.log : undefined,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export const defaultDb = createDatabaseConnection({
  filename: process.env.DATABASE_PATH || 'data/devpulse.db',
});
`,
        answer: 'Configuring better-sqlite3 with WAL journal mode and foreign keys enabled to ensure atomic transactions and safe concurrent reads.',
      },

      // 4. Database schema & tables -> Checkpoint 3 (>30 lines)
      {
        path: 'src/db/schema.sql',
        content: `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'hacker',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  demo_url TEXT,
  score REAL DEFAULT 0.0,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_score ON submissions(score DESC);
`,
        answer: 'Creating relational SQLite database schema for users and project submissions with foreign keys and index on score for efficient leaderboards.',
      },

      // 5. User Model & Repository -> Checkpoint 4 (>30 lines)
      {
        path: 'src/models/user.ts',
        content: `import type { Database } from 'better-sqlite3';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export class UserRepository {
  constructor(private db: Database) {}

  public findByUsername(username: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  }

  public create(user: Omit<User, 'created_at'>): void {
    const stmt = this.db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    stmt.run(user.id, user.username, user.password_hash, user.role);
  }

  public listAll(): User[] {
    const stmt = this.db.prepare('SELECT id, username, role, created_at FROM users');
    return stmt.all() as User[];
  }
}
`,
        answer: 'Implementing UserRepository to encapsulate database queries for user retrieval and insertion using prepared SQL statements.',
      },

      // 6. Security & Hashing Utilities -> Checkpoint 5 (>30 lines)
      {
        path: 'src/utils/security.ts',
        content: `import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function sanitizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
`,
        answer: 'Using bcrypt salt and hashing with 12 rounds to securely hash and compare user passwords against brute force attacks.',
      },

      // 7. JWT Authentication Service -> Checkpoint 6 (>30 lines)
      {
        path: 'src/services/jwt.ts',
        content: `import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'devpulse-super-secret-key-2026';
const TOKEN_EXPIRY = '24h';

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired authentication token');
  }
}
`,
        answer: 'Implementing HMAC-SHA256 JWT token generation and verification with secret key to manage stateless authenticated agent sessions.',
      },

      // 8. Authentication Middleware -> Checkpoint 7 (>30 lines)
      {
        path: 'src/middleware/auth.ts',
        content: `import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../services/jwt.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or invalid format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Token verification failed' });
  }
}
`,
        answer: 'Express authentication middleware checking Bearer token in headers, decoding payload, and attaching user to request.',
      },

      // 9. Rate Limiter Middleware -> Checkpoint 8 (>30 lines)
      {
        path: 'src/middleware/rate-limiter.ts',
        content: `import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const windowMs = 60 * 1000;
const maxRequests = 100;
const clientHits = new Map<string, RateLimitRecord>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || '127.0.0.1';
  const now = Date.now();
  const record = clientHits.get(ip);

  if (!record || now > record.resetTime) {
    clientHits.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (record.count >= maxRequests) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  record.count += 1;
  next();
}
`,
        answer: 'In-memory sliding window rate limiter middleware per IP address to throttle spam and prevent abuse during hackathon demo.',
      },

      // 10. Submissions Model & Evaluation Service -> Checkpoint 9 (>30 lines)
      {
        path: 'src/services/submission.ts',
        content: `import type { Database } from 'better-sqlite3';

export interface Submission {
  id: string;
  user_id: string;
  title: string;
  repo_url: string;
  demo_url?: string;
  score: number;
}

export class SubmissionService {
  constructor(private db: Database) {}

  public submitProject(sub: Submission): void {
    const stmt = this.db.prepare(
      'INSERT INTO submissions (id, user_id, title, repo_url, demo_url, score) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(sub.id, sub.user_id, sub.title, sub.repo_url, sub.demo_url ?? null, sub.score);
  }

  public getLeaderboard(limit = 10): Submission[] {
    const stmt = this.db.prepare(
      'SELECT * FROM submissions ORDER BY score DESC, submitted_at ASC LIMIT ?'
    );
    return stmt.all(limit) as Submission[];
  }
}
`,
        answer: 'Business logic service for inserting hackathon submissions and querying top scores from the database with ranking order.',
      },

      // 11. Auth API Routes -> Checkpoint 10 (>30 lines)
      {
        path: 'src/routes/auth.routes.ts',
        content: `import { Router } from 'express';
import { UserRepository } from '../models/user.js';
import { hashPassword, verifyPassword, sanitizeUsername } from '../utils/security.js';
import { generateToken } from '../services/jwt.js';

export function createAuthRouter(userRepo: UserRepository): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const cleanUser = sanitizeUsername(username || '');
    if (!cleanUser || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const existing = userRepo.findByUsername(cleanUser);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashed = await hashPassword(password);
    const id = 'usr_' + Date.now();
    userRepo.create({ id, username: cleanUser, password_hash: hashed, role: 'hacker' });

    const token = generateToken({ userId: id, username: cleanUser, role: 'hacker' });
    return res.status(201).json({ token, userId: id });
  });

  return router;
}
`,
        answer: 'Express authentication router implementing user registration, credential hashing, and JWT token issuance.',
      },

      // 12. Helper file -> Small trivial write (Auto-approved, 0 checkpoints)
      {
        path: 'src/utils/helpers.ts',
        content: `export function formatScore(score: number): string {\n  return score.toFixed(2);\n}\n`,
        answer: '',
      },

      // 13. Main application entrypoint -> Checkpoint 11 (>30 lines)
      {
        path: 'src/index.ts',
        content: `import express from 'express';
import { defaultDb } from './config/database.js';
import { UserRepository } from './models/user.js';
import { SubmissionService } from './services/submission.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { rateLimiter } from './middleware/rate-limiter.js';

const app = express();
app.use(express.json());
app.use(rateLimiter);

const userRepo = new UserRepository(defaultDb);
const subService = new SubmissionService(defaultDb);

app.use('/api/auth', createAuthRouter(userRepo));

app.get('/api/leaderboard', (req, res) => {
  const board = subService.getLeaderboard(20);
  res.json({ leaderboard: board });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
export const server = app.listen(PORT, () => {
  console.log(\`DevPulse server running on port \${PORT}\`);
});
export default app;
`,
        answer: 'Main server entry bootstrapping Express, rate limiting, SQLite repositories, auth endpoints, and leaderboard query routes.',
      },

      // 14. Configuration edit -> Small targeted edit (Auto-approved, 0 checkpoints)
      {
        path: 'src/config/database.ts',
        edit: true,
        edits: [
          {
            oldText: "filename: process.env.DATABASE_PATH || 'data/devpulse.db'",
            newText: "filename: process.env.DATABASE_PATH || 'data/devpulse_v2.db'",
          },
        ],
        answer: '',
      },
    ];

    let checkpointCount = 0;
    let autoApprovedCount = 0;

    for (const step of steps) {
      const fullPath = join(tempDir, step.path);

      let res: any;
      if (step.edit) {
        res = await client.editFile(fullPath, step.edits!);
      } else {
        res = await client.writeFile(fullPath, step.content!);
      }

      if (res.checkpoint) {
        checkpointCount++;
        expect(res.checkpoint.ticketId).toBeDefined();
        expect(res.checkpoint.question).toBeDefined();

        const answerText = step.answer && step.answer.length > 0
          ? step.answer
          : `Architectural documentation and configuration update for ${step.path} in sqlite and express architecture.`;

        // Answer the Socratic checkpoint with genuine architecture reasoning
        const submitRes = await client.submitAnswer(res.checkpoint.ticketId, answerText);
        expect(submitRes.status).toBe('write_permitted');
        expect(submitRes.score).toBeGreaterThanOrEqual(70);
      } else {
        autoApprovedCount++;
        expect(res.permitted).toBe(true);
        expect(res.writeResult?.status).toBe('write_permitted');
      }

      // Verify file now exists on disk
      expect(existsSync(fullPath)).toBe(true);
    }

    // Verify checkpoint bounds: must trigger between 5 and 15 checkpoints
    expect(checkpointCount).toBeGreaterThanOrEqual(5);
    expect(checkpointCount).toBeLessThanOrEqual(15);
    expect(autoApprovedCount).toBeGreaterThanOrEqual(2);

    // Verify SQLite Ledger DB persistence
    const totalRecorded = checkpointRepo.listCheckpoints().length;
    expect(totalRecorded).toBe(checkpointCount);

    // Verify GitWatcher detects tracked state
    const watcher = new GitWatcher({ workspaceRoot: tempDir });
    const bypassed = await watcher.detectBypassedWrites(['src/index.ts', 'package.json']);
    expect(bypassed).toBeArray();

    // Verify report generation succeeds against the dogfooded repository
    const reportResult = await executeReport({
      cwd: tempDir,
      stdout: false,
    });
    expect(reportResult.initialized).toBe(true);
    expect(reportResult.reportContent).toContain('Ratio Portfolio Audit');
    expect(existsSync(join(tempDir, 'RATIO_REPORT.md'))).toBe(true);

    await client.close();
    await server.close();
  });
});
