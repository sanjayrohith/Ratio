import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations/index.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { CheckpointQueryService } from '../../src/storage/queries.js';
import { Database } from 'bun:sqlite';

describe('Checkpoint Repository & FTS5 Search Integration Tests', () => {
  let db: Database;
  let checkpointRepo: CheckpointRepository;
  let sessionRepo: SessionRepository;
  let queryService: CheckpointQueryService;

  beforeEach(() => {
    db = createDatabase(':memory:');
    runMigrations(db);
    checkpointRepo = new CheckpointRepository(db);
    sessionRepo = new SessionRepository(db);
    queryService = new CheckpointQueryService(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('persists checkpoint records and retrieves them by ticket ID', () => {
    const session = sessionRepo.startSession('session-abc', { agentName: 'claude-code' });
    expect(session.id).toBe('session-abc');

    const created = checkpointRepo.insertCheckpoint({
      ticketId: 'chk-101',
      sessionId: 'session-abc',
      filePath: 'src/auth/jwt.ts',
      question: 'Why must JWT secret tokens not be committed to source control?',
      concept: 'security_secrets',
      expectedKeywords: ['environment', 'secret', 'leak', 'git'],
    });

    expect(created.ticket_id).toBe('chk-101');
    expect(created.status).toBe('pending');
    expect(created.concept).toBe('security_secrets');
    expect(created.expected_keywords).toEqual(['environment', 'secret', 'leak', 'git']);

    const retrieved = checkpointRepo.getByTicketId('chk-101');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.question).toContain('JWT secret tokens');
  });

  it('records student answers and transitions status upon resolution', () => {
    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-102',
      filePath: 'src/db/migrate.ts',
      question: 'Explain what an idempotent database migration is.',
      concept: 'db_migration',
    });

    const withAnswer = checkpointRepo.recordAnswer({
      ticketId: 'chk-102',
      studentAnswer: 'An idempotent migration can be run multiple times without causing errors or duplicate data.',
    });
    expect(withAnswer.student_answer).toContain('idempotent migration');
    expect(withAnswer.status).toBe('pending');

    const resolved = checkpointRepo.resolveCheckpoint({
      ticketId: 'chk-102',
      status: 'passed',
      evaluationScore: 0.95,
      evaluationReason: 'Accurate and concise definition of idempotency.',
    });
    expect(resolved.status).toBe('passed');
    expect(resolved.evaluation_score).toBe(0.95);
    expect(resolved.evaluation_reason).toContain('Accurate');
    expect(resolved.resolved_at).toBeDefined();
  });

  it('tracks session interceptions, calculates duration, and computes checkpoint counts', () => {
    sessionRepo.startSession('sess-1', { agentName: 'cursor' }, '2026-05-01T10:00:00.000Z');

    sessionRepo.recordInterception({
      id: 'int-1',
      sessionId: 'sess-1',
      toolName: 'ratio_write_file',
      filePath: 'src/routes/api.ts',
      stagedId: 'stg-1',
      decision: 'checkpoint_required',
      riskScore: 0.7,
      riskLevel: 'high',
      lineDelta: 85,
    });

    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-1',
      interceptionId: 'int-1',
      sessionId: 'sess-1',
      filePath: 'src/routes/api.ts',
      question: 'Why rate limit API routes?',
      concept: 'dos_protection',
    });

    checkpointRepo.resolveCheckpoint({
      ticketId: 'chk-1',
      status: 'passed',
    });

    checkpointRepo.insertCheckpoint({
      ticketId: 'chk-2',
      sessionId: 'sess-1',
      filePath: 'src/routes/api.ts',
      question: 'How do you handle expired tokens?',
      concept: 'jwt_expiration',
    });

    sessionRepo.endSession('sess-1', '2026-05-01T10:30:00.000Z');

    const stats = sessionRepo.getSessionStats('sess-1');
    expect(stats).not.toBeNull();
    expect(stats?.filesTouched).toEqual(['src/routes/api.ts']);
    expect(stats?.durationMs).toBe(30 * 60 * 1000); // 30 minutes
    expect(stats?.totalInterceptions).toBe(1);
    expect(stats?.totalCheckpoints).toBe(2);
    expect(stats?.passedCheckpoints).toBe(1);
    expect(stats?.pendingCheckpoints).toBe(1);
  });

  it('indexes questions and student answers in FTS5 and executes full-text keyword queries', () => {
    checkpointRepo.insertCheckpoint({
      ticketId: 'fts-1',
      filePath: 'src/crypto/hasher.ts',
      question: 'What is salt in cryptographic hashing and why is it essential for passwords?',
      concept: 'cryptography',
    });

    checkpointRepo.recordAnswer({
      ticketId: 'fts-1',
      studentAnswer: 'Salt adds random data to prevent rainbow table precomputation attacks.',
    });

    checkpointRepo.insertCheckpoint({
      ticketId: 'fts-2',
      filePath: 'src/cache/redis.ts',
      question: 'Explain cache invalidation and cache stamps stampede protection.',
      concept: 'caching',
    });

    checkpointRepo.recordAnswer({
      ticketId: 'fts-2',
      studentAnswer: 'Use probabilistic early expiration to avoid redis thundering herd problems.',
    });

    // Search by question keyword "cryptographic"
    const cryptoResult = queryService.query({ keyword: 'cryptographic' });
    expect(cryptoResult.total).toBe(1);
    expect(cryptoResult.data[0].ticket_id).toBe('fts-1');

    // Search by answer keyword "rainbow"
    const rainbowResult = queryService.query({ keyword: 'rainbow' });
    expect(rainbowResult.total).toBe(1);
    expect(rainbowResult.data[0].ticket_id).toBe('fts-1');

    // Search by answer keyword "thundering"
    const redisResult = queryService.query({ keyword: 'thundering' });
    expect(redisResult.total).toBe(1);
    expect(redisResult.data[0].ticket_id).toBe('fts-2');

    // Search non-existent keyword
    const emptyResult = queryService.query({ keyword: 'quantum_entanglement' });
    expect(emptyResult.total).toBe(0);
    expect(emptyResult.data.length).toBe(0);
  });

  it('supports paginated queries, file filtering, and status filtering', () => {
    for (let i = 1; i <= 25; i++) {
      const ticketId = `bulk-${i}`;
      checkpointRepo.insertCheckpoint({
        ticketId,
        filePath: i % 2 === 0 ? 'src/even.ts' : 'src/odd.ts',
        question: `Question index ${i}`,
        concept: i % 2 === 0 ? 'even_concept' : 'odd_concept',
        status: i > 20 ? 'passed' : 'pending',
      });
    }

    // Pagination: page 1 of 10 items
    const page1 = queryService.query({}, { page: 1, pageSize: 10 });
    expect(page1.total).toBe(25);
    expect(page1.data.length).toBe(10);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(3);
    expect(page1.hasNextPage).toBe(true);

    // Pagination: page 3 of 10 items
    const page3 = queryService.query({}, { page: 3, pageSize: 10 });
    expect(page3.data.length).toBe(5);
    expect(page3.hasNextPage).toBe(false);
    expect(page3.hasPrevPage).toBe(true);

    // Filtering by filePath
    const evenResults = queryService.query({ filePath: 'src/even.ts' }, { pageSize: 50 });
    expect(evenResults.total).toBe(12);

    // Filtering by status
    const passedResults = queryService.query({ status: 'passed' });
    expect(passedResults.total).toBe(5);
  });
});
