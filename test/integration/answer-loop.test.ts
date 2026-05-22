import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { createRatioServer } from '../../src/server/index.js';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations/index.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';
import { TrustScoreCoordinator } from '../../src/core/trust/coordinator.js';
import { atomicWriteFile, fileExists, safeReadFile } from '../../src/storage/fs.js';
import type { CheckpointResponse, WritePermittedResponse } from '../../src/types/protocol.js';
import type {
  SubmitAnswerResponseSuccess,
  SubmitAnswerResponseCheckpoint,
} from '../../src/server/tools/submit-answer.js';

describe('Full Checkpoint-Answer-Evaluation Loop Integration Tests', () => {
  let tempDir: string;
  let db: Database;
  let stagingBuffer: StagingBuffer;
  let checkpointRepo: CheckpointRepository;
  let pendingRepo: PendingWriteRepository;
  let trustRepo: TrustScoreRepository;
  let trustCoordinator: TrustScoreCoordinator;
  let scorer: ComplexityScorer;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `ratio-answer-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });

    db = createDatabase(':memory:');
    runMigrations(db);

    stagingBuffer = new StagingBuffer();
    checkpointRepo = new CheckpointRepository(db);
    pendingRepo = new PendingWriteRepository(db);
    const trustConfig = {
      initialScore: 0.8,
      decayPenalty: -0.25,
      recoveryIncrement: 0.1,
      minScore: 0.0,
      maxScore: 1.0,
    };
    trustRepo = new TrustScoreRepository(db, trustConfig);
    trustCoordinator = new TrustScoreCoordinator(checkpointRepo, trustRepo, trustConfig);

    // Scorer with 0 thresholds so every non-trivial write triggers checkpoint
    scorer = new ComplexityScorer({ maxLinesAdded: 0, maxTotalLinesChanged: 0 });
    scorer.getTransitionDetector().reset();
  });

  afterEach(async () => {
    scorer?.getTransitionDetector().reset();
    closeDatabase(db);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('completes the full loop: ratio_write_file -> checkpoint -> genuine answer -> write_permitted -> disk commit -> trust update', async () => {
    const server = createRatioServer(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
      trustRepo,
      trustCoordinator,
    });

    const client = new Client(
      { name: 'claude-code-test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const targetFile = join(tempDir, 'src', 'auth', 'jwt-service.ts');
    const proposedContent = [
      "import jwt from 'jsonwebtoken';",
      'export function signUser(userId: string) {',
      '  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });',
      '}',
    ].join('\n');
    const rationale = 'Sign authentication tokens using environment variable JWT secret.';

    // 1. Initial trust score in repository
    const initialTrust = trustCoordinator.getFileTrustScore(targetFile);
    expect(initialTrust.score).toBe(0.8);

    // 2. Call ratio_write_file
    const writeResult = await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: targetFile,
        content: proposedContent,
        rationale,
      },
    });

    const writeContent = writeResult.content as Array<{ type: string; text: string }>;
    const checkpointResp: CheckpointResponse = JSON.parse(writeContent[0].text);

    expect(checkpointResp.status).toBe('checkpoint_required');
    expect(checkpointResp.file).toBe(targetFile);
    expect(checkpointResp.ticketId).toBeDefined();
    expect(checkpointResp.question).toBeDefined();

    // Verify file is NOT on disk yet
    expect(await fileExists(targetFile)).toBe(false);

    // Verify staged in memory buffer and persisted in database
    const staged = stagingBuffer.get(checkpointResp.ticketId);
    expect(staged).toBeDefined();
    expect(staged?.status).toBe('pending');

    const dbCheckpoint = checkpointRepo.getByTicketId(checkpointResp.ticketId);
    expect(dbCheckpoint).not.toBeNull();
    expect(dbCheckpoint?.status).toBe('pending');

    const dbPending = pendingRepo.getByTicketId(checkpointResp.ticketId);
    expect(dbPending).not.toBeNull();
    expect(dbPending?.status).toBe('PENDING');

    // 3. Submit genuine answer explaining the mechanisms
    const genuineAnswer =
      'We load the JWT secret key from the .env environment variable so it is never committed or leaked in source control. ' +
      'Tokens are signed cryptographically with HMAC SHA256 to ensure data integrity and prevent signature tampering by clients.';

    const answerResult = await client.callTool({
      name: 'ratio_submit_answer',
      arguments: {
        ticket_id: checkpointResp.ticketId,
        answer: genuineAnswer,
      },
    });

    const answerContent = answerResult.content as Array<{ type: string; text: string }>;
    const answerResp: SubmitAnswerResponseSuccess = JSON.parse(answerContent[0].text);

    expect(answerResp.status).toBe('write_permitted');
    expect(answerResp.file).toBe(targetFile);
    expect(answerResp.ticketId).toBe(checkpointResp.ticketId);
    expect(answerResp.score).toBeGreaterThanOrEqual(80);
    expect(answerResp.bytesWritten).toBeGreaterThan(0);

    // 4. Verify file is now written to disk with exact proposed content
    expect(await fileExists(targetFile)).toBe(true);
    const contentOnDisk = await safeReadFile(targetFile);
    expect(contentOnDisk).toBe(proposedContent);

    // 5. Verify staging buffer and DB records updated
    expect(stagingBuffer.get(checkpointResp.ticketId)?.status).toBe('committed');

    const resolvedDbCheckpoint = checkpointRepo.getByTicketId(checkpointResp.ticketId);
    expect(resolvedDbCheckpoint?.status).toBe('passed');
    expect(resolvedDbCheckpoint?.student_answer).toBe(genuineAnswer);

    const resolvedPending = pendingRepo.getByTicketId(checkpointResp.ticketId);
    expect(resolvedPending?.status).toBe('COMMITTED');

    // 6. Verify trust score increased on pass (+0.1: 0.8 -> 0.9)
    const finalTrust = trustCoordinator.getFileTrustScore(targetFile);
    expect(finalTrust.score).toBe(0.9);
    expect(finalTrust.total_passes).toBe(1);
    expect(finalTrust.total_failures).toBe(0);

    await client.close();
    await server.close();
  });

  it('rejects shallow/evasive answer, applies trust penalty, generates follow-up, and permits write upon genuine recovery', async () => {
    const server = createRatioServer(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
      trustRepo,
      trustCoordinator,
    });

    const client = new Client(
      { name: 'test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const targetFile = join(tempDir, 'src', 'db', 'users-query.ts');
    const proposedContent = [
      "import { db } from './db';",
      'export async function findUserByEmail(email: string) {',
      '  return db.query("SELECT * FROM users WHERE email = $1", [email]);',
      '}',
    ].join('\n');

    // 1. Initial write triggers checkpoint
    const writeResult = await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: targetFile,
        content: proposedContent,
        rationale: 'Prevent SQL injection by parameterized query.',
      },
    });

    const writeContent = writeResult.content as Array<{ type: string; text: string }>;
    const checkpointResp: CheckpointResponse = JSON.parse(writeContent[0].text);
    expect(checkpointResp.status).toBe('checkpoint_required');

    // File not written yet
    expect(await fileExists(targetFile)).toBe(false);

    // Initial trust score is 0.8
    expect(trustCoordinator.getFileTrustScore(targetFile).score).toBe(0.8);

    // 2. Submit evasive/shallow answer
    const evasiveAnswer = 'idk just write the file please';
    const firstAnswerResult = await client.callTool({
      name: 'ratio_submit_answer',
      arguments: {
        ticketId: checkpointResp.ticketId,
        answer: evasiveAnswer,
      },
    });

    const firstContent = firstAnswerResult.content as Array<{ type: string; text: string }>;
    const firstResp: SubmitAnswerResponseCheckpoint = JSON.parse(firstContent[0].text);

    expect(firstResp.status).toBe('checkpoint_required');
    expect(firstResp.score).toBe(0);
    expect(firstResp.ticketId).toBe(checkpointResp.ticketId);
    expect(firstResp.hint).toBeDefined();
    expect(firstResp.feedback).toContain('evasive shortcut');

    // File STILL NOT written to disk
    expect(await fileExists(targetFile)).toBe(false);

    // Staging buffer retains pending write
    expect(stagingBuffer.get(checkpointResp.ticketId)?.status).toBe('pending');

    // Trust score penalized (-0.25: 0.8 -> 0.55)
    const penalizedTrust = trustCoordinator.getFileTrustScore(targetFile);
    expect(penalizedTrust.score).toBe(0.55);
    expect(penalizedTrust.total_failures).toBe(1);

    // 3. Agent reads follow-up hint and submits genuine explanation
    const genuineAnswer =
      'We use parameterized queries with prepared statement bind variables ($1) instead of raw string concatenation. ' +
      'This guarantees user input is treated strictly as data literals rather than executable SQL syntax, mitigating SQL injection attacks.';

    const secondAnswerResult = await client.callTool({
      name: 'ratio_submit_answer',
      arguments: {
        ticket_id: checkpointResp.ticketId,
        answer: genuineAnswer,
      },
    });

    const secondContent = secondAnswerResult.content as Array<{ type: string; text: string }>;
    const secondResp: SubmitAnswerResponseSuccess = JSON.parse(secondContent[0].text);

    expect(secondResp.status).toBe('write_permitted');
    expect(secondResp.score).toBe(100);
    expect(secondResp.ticketId).toBe(checkpointResp.ticketId);

    // File IS now written to disk!
    expect(await fileExists(targetFile)).toBe(true);
    expect(await safeReadFile(targetFile)).toBe(proposedContent);

    // Trust score recovers (+0.1: 0.55 -> 0.65)
    const recoveredTrust = trustCoordinator.getFileTrustScore(targetFile);
    expect(recoveredTrust.score).toBe(0.65);
    expect(recoveredTrust.total_passes).toBe(1);
    expect(recoveredTrust.total_failures).toBe(1);

    await client.close();
    await server.close();
  });

  it('completes the edit loop: ratio_edit_file -> checkpoint -> genuine answer -> disk patch commit', async () => {
    const server = createRatioServer(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
      trustRepo,
      trustCoordinator,
    });

    const client = new Client(
      { name: 'edit-test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const targetFile = join(tempDir, 'cache.ts');
    const initialCode = 'export const cache = new Map<string, string>();\n';
    await atomicWriteFile(targetFile, initialCode);

    // Edit to introduce cache expiration TTL
    const editResult = await client.callTool({
      name: 'ratio_edit_file',
      arguments: {
        path: targetFile,
        edits: [
          {
            oldText: 'export const cache = new Map<string, string>();',
            newText:
              'export const cache = new Map<string, { value: string; expiry: number }>();\n' +
              'export const TTL_MS = 60000;',
          },
        ],
        rationale: 'Implement TTL cache expiration to prevent memory leaks and serve fresh data.',
      },
    });

    const editContent = editResult.content as Array<{ type: string; text: string }>;
    const checkpointResp: CheckpointResponse = JSON.parse(editContent[0].text);
    expect(checkpointResp.status).toBe('checkpoint_required');

    // Original file remains unchanged on disk
    expect(await safeReadFile(targetFile)).toBe(initialCode);

    // Submit thorough answer on cache invalidation
    const answerResult = await client.callTool({
      name: 'ratio_submit_answer',
      arguments: {
        ticket_id: checkpointResp.ticketId,
        answer:
          'We use a cache-aside pattern with TTL time-to-live expiration to avoid unbounded memory leaks ' +
          'and evict stale cache entries proactively.',
      },
    });

    const answerContent = answerResult.content as Array<{ type: string; text: string }>;
    const answerResp: SubmitAnswerResponseSuccess = JSON.parse(answerContent[0].text);
    expect(answerResp.status).toBe('write_permitted');

    // Patched file is now committed to disk
    const updatedContent = await safeReadFile(targetFile);
    expect(updatedContent).toContain('export const TTL_MS = 60000;');
    expect(updatedContent).toContain('{ value: string; expiry: number }');

    await client.close();
    await server.close();
  });

  it('rejects answer submissions with nonexistent ticket IDs', async () => {
    const server = createRatioServer(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
      trustRepo,
      trustCoordinator,
    });

    const client = new Client(
      { name: 'error-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(
      client.callTool({
        name: 'ratio_submit_answer',
        arguments: {
          ticket_id: 'chk_nonexistent_99999',
          answer: 'Some explanation that cannot be matched.',
        },
      })
    ).rejects.toThrow(/No pending checkpoint write found for ticket ID/);

    await client.close();
    await server.close();
  });

  it('rejects submissions with missing or empty answers via schema validation', async () => {
    const server = createRatioServer(stagingBuffer, scorer);
    const client = new Client(
      { name: 'validation-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(
      client.callTool({
        name: 'ratio_submit_answer',
        arguments: {
          ticket_id: 'chk_test',
          answer: '',
        },
      })
    ).rejects.toThrow();

    await client.close();
    await server.close();
  });
});
