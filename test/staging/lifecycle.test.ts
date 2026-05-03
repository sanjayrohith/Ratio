import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations/index.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { CommitTransactionExecutor } from '../../src/core/staging/executor.js';
import { StagedWriteRollbackHandler } from '../../src/core/staging/rollback.js';
import { Database } from 'bun:sqlite';

describe('Staged Write State Machine & Lifecycle Transitions', () => {
  let db: Database;
  let pendingRepo: PendingWriteRepository;
  let memoryBuffer: StagingBuffer;
  let executor: CommitTransactionExecutor;
  let rollbackHandler: StagedWriteRollbackHandler;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-staging-test-'));
    db = createDatabase(':memory:');
    runMigrations(db);
    pendingRepo = new PendingWriteRepository(db);
    memoryBuffer = new StagingBuffer();
    executor = new CommitTransactionExecutor(pendingRepo, memoryBuffer);
    rollbackHandler = new StagedWriteRollbackHandler(pendingRepo, memoryBuffer);
  });

  afterEach(() => {
    closeDatabase(db);
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('verifies happy path state transitions: PENDING -> APPROVED -> COMMITTED', async () => {
    const targetFile = join(tempDir, 'src', 'config.json');
    const proposedContent = JSON.stringify({ port: 8080, host: 'localhost' }, null, 2);

    // 1. Stage write in memory and SQLite
    const stagedMem = memoryBuffer.stage({
      file: targetFile,
      content: proposedContent,
      operation: 'write',
      question: 'Why parameterize host and port?',
      concept: 'configuration',
    });

    const pendingDb = pendingRepo.insert({
      ticketId: stagedMem.ticketId,
      filePath: targetFile,
      content: proposedContent,
      operation: 'write',
      question: stagedMem.question,
      concept: stagedMem.concept,
    });

    expect(pendingDb.status).toBe('PENDING');
    expect(stagedMem.status).toBe('pending');
    expect(existsSync(targetFile)).toBe(false);

    // 2. Approve write
    const approvedDb = executor.approve(stagedMem.ticketId);
    expect(approvedDb.status).toBe('APPROVED');
    expect(approvedDb.resolved_at).toBeDefined();
    expect(memoryBuffer.get(stagedMem.ticketId)?.status).toBe('approved');
    expect(existsSync(targetFile)).toBe(false);

    // 3. Commit write to disk atomically
    const commitResult = await executor.commit(stagedMem.ticketId);
    expect(commitResult.status).toBe('COMMITTED');
    expect(commitResult.filePath).toBe(targetFile);
    expect(commitResult.bytesWritten).toBeGreaterThan(0);

    // Verify disk state
    expect(existsSync(targetFile)).toBe(true);
    const diskContent = readFileSync(targetFile, 'utf-8');
    expect(diskContent).toBe(proposedContent);

    // Verify SQLite state
    const committedDb = pendingRepo.getByTicketId(stagedMem.ticketId);
    expect(committedDb?.status).toBe('COMMITTED');
    expect(memoryBuffer.get(stagedMem.ticketId)?.status).toBe('committed');
  });

  it('verifies rejection path state transitions: PENDING -> REJECTED without modifying disk', async () => {
    const targetFile = join(tempDir, 'src', 'protected.ts');
    const originalContent = 'export const SECURE_KEY = "constant";\n';
    await Bun.write(targetFile, originalContent);

    const proposedOverwritingContent = 'export const SECURE_KEY = "hacked_override";\n';

    // 1. Stage in memory and SQLite
    const stagedMem = memoryBuffer.stage({
      file: targetFile,
      content: proposedOverwritingContent,
      operation: 'write',
      question: 'What is the blast radius of modifying SECURE_KEY?',
      concept: 'security',
    });

    pendingRepo.insert({
      ticketId: stagedMem.ticketId,
      filePath: targetFile,
      content: proposedOverwritingContent,
      operation: 'write',
      question: stagedMem.question,
    });

    // 2. Reject write (e.g. shallow answer or user cancellation)
    const rollbackResult = rollbackHandler.rollback(
      stagedMem.ticketId,
      'Student could not explain key distribution impact.'
    );

    expect(rollbackResult.status).toBe('REJECTED');
    expect(rollbackResult.rejectionReason).toContain('key distribution');

    // 3. Disk file must remain strictly untouched
    const currentDisk = readFileSync(targetFile, 'utf-8');
    expect(currentDisk).toBe(originalContent);

    // 4. Record in SQLite must be REJECTED with rejection_reason
    const rejectedDb = pendingRepo.getByTicketId(stagedMem.ticketId);
    expect(rejectedDb?.status).toBe('REJECTED');
    expect(rejectedDb?.rejection_reason).toBe('Student could not explain key distribution impact.');

    // 5. Attempting to commit a rejected ticket must throw
    await expect(executor.commit(stagedMem.ticketId)).rejects.toThrow(
      'Cannot commit rejected write ticket'
    );
  });

  it('recovers pending writes from SQLite across simulated agent restarts', async () => {
    const targetFile = join(tempDir, 'src', 'recovered.ts');
    const persistentContent = 'console.log("recovered across restarts");\n';

    // Agent stages write to SQLite
    pendingRepo.insert({
      ticketId: 'chk_restart_1',
      filePath: targetFile,
      content: persistentContent,
      operation: 'write',
      question: 'Why restart safety?',
      concept: 'durability',
    });

    // Simulate agent restart: a new instance with fresh memory buffer connects to SQLite
    const freshMemoryBuffer = new StagingBuffer();
    expect(freshMemoryBuffer.size).toBe(0);

    const freshExecutor = new CommitTransactionExecutor(pendingRepo, freshMemoryBuffer);

    // Fetch pending from SQLite
    const pending = pendingRepo.getPendingForFile(targetFile);
    expect(pending).not.toBeNull();
    expect(pending?.ticket_id).toBe('chk_restart_1');
    expect(pending?.status).toBe('PENDING');

    // Approve and commit
    freshExecutor.approve('chk_restart_1');
    await freshExecutor.commit('chk_restart_1');

    // Verify written to disk correctly
    expect(existsSync(targetFile)).toBe(true);
    expect(readFileSync(targetFile, 'utf-8')).toBe(persistentContent);
  });
});
