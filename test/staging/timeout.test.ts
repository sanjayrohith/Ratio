import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';
import {
  TicketTimeoutManager,
  type DeadlockReport,
  type SweepResult,
} from '../../src/core/staging/timeout.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';

describe('TicketTimeoutManager Unit & Integration Tests', () => {
  let tempDir: string;
  let db: Database;
  let pendingRepo: PendingWriteRepository;
  let checkpointRepo: CheckpointRepository;
  let stagingBuffer: StagingBuffer;
  let timeoutManager: TicketTimeoutManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-timeout-test-'));
    const ws = initializeWorkspaceDatabase(tempDir);
    db = ws.db;
    pendingRepo = new PendingWriteRepository(db);
    checkpointRepo = new CheckpointRepository(db);
    stagingBuffer = new StagingBuffer();
    timeoutManager = new TicketTimeoutManager({
      stagingBuffer,
      pendingRepo,
      checkpointRepo,
      defaultTimeoutMs: 600_000, // 10 minutes
    });
  });

  afterEach(() => {
    timeoutManager.stopSweeper();
    closeDatabase(db);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('respects default 10-minute timeout and custom timeout configurations', () => {
    expect(timeoutManager.getTimeoutMs()).toBe(600_000);
    expect(timeoutManager.getTimeoutMs(120_000)).toBe(120_000);

    const now = Date.now();
    const freshDate = new Date(now - 60_000); // 1 minute old
    const expiredDate = new Date(now - 700_000); // 11.6 minutes old

    expect(timeoutManager.isExpired(freshDate)).toBe(false);
    expect(timeoutManager.isExpired(expiredDate)).toBe(true);
    expect(timeoutManager.isExpired(freshDate, 30_000)).toBe(true);
  });

  it('identifies expired tickets across SQLite ledger and in-memory buffer', () => {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 650_000).toISOString();
    const oneMinuteAgo = new Date(now - 60_000).toISOString();

    // Insert expired ticket
    pendingRepo.insert({
      ticketId: 'chk_expired_1',
      filePath: 'src/auth/jwt.ts',
      content: 'expired content',
      operation: 'write',
      question: 'Explain JWT secret safety',
      createdAt: tenMinutesAgo,
    });

    // Insert fresh ticket
    pendingRepo.insert({
      ticketId: 'chk_fresh_1',
      filePath: 'src/db/user.ts',
      content: 'fresh content',
      operation: 'write',
      question: 'Explain user schema',
      createdAt: oneMinuteAgo,
    });

    const expired = timeoutManager.findExpiredTickets();
    expect(expired.length).toBe(1);
    expect(expired[0].ticketId).toBe('chk_expired_1');
    expect(expired[0].filePath).toBe('src/auth/jwt.ts');
    expect(expired[0].ageMs).toBeGreaterThanOrEqual(650_000);
  });

  it('detects deadlocks caused by abandoned tickets and lock contention on the same file', () => {
    const now = Date.now();
    const longAgo = new Date(now - 700_000).toISOString();

    // Scenario 1: Expired ticket causes deadlock
    pendingRepo.insert({
      ticketId: 'chk_abandoned_lock',
      filePath: 'src/api/routes.ts',
      content: 'routes content',
      operation: 'write',
      question: 'Question',
      createdAt: longAgo,
    });

    let report: DeadlockReport = timeoutManager.detectDeadlocks();
    expect(report.hasDeadlocks).toBe(true);
    expect(report.deadlockedTickets).toContain('chk_abandoned_lock');
    expect(report.blockedFiles).toContain('src/api/routes.ts');
    expect(report.details.some((d) => d.severity === 'critical')).toBe(true);

    // Scenario 2: Multiple pending tickets on the same file path (conflict)
    pendingRepo.insert({
      ticketId: 'chk_conflicting_2',
      filePath: 'src/api/routes.ts',
      content: 'conflicting content',
      operation: 'write',
      question: 'Question 2',
      createdAt: new Date().toISOString(),
    });

    report = timeoutManager.detectDeadlocks();
    expect(report.hasDeadlocks).toBe(true);
    expect(report.deadlockedTickets).toContain('chk_conflicting_2');
    expect(report.details.some((d) => d.reason.includes('Multiple concurrent pending writes'))).toBe(true);
  });

  it('cleanly expires an abandoned ticket and resolves corresponding checkpoint', () => {
    const ticketId = 'chk_abandoned_single';
    const filePath = 'src/services/billing.ts';

    // Insert pending write and checkpoint
    pendingRepo.insert({
      ticketId,
      filePath,
      content: 'export const billing = () => {};',
      operation: 'write',
      question: 'Why isolate billing logic?',
      createdAt: new Date(Date.now() - 800_000).toISOString(),
    });

    checkpointRepo.insertCheckpoint({
      ticketId,
      filePath,
      question: 'Why isolate billing logic?',
      concept: 'SERVICE_ISOLATION',
      status: 'pending',
    });

    // Also add to memory buffer
    stagingBuffer.stage({
      file: filePath,
      content: 'export const billing = () => {};',
      operation: 'write',
      question: 'Why isolate billing logic?',
    });

    const expireResult = timeoutManager.expireTicket(ticketId, 'Agent turn timed out without answer');
    expect(expireResult.ticketId).toBe(ticketId);
    expect(expireResult.filePath).toBe(filePath);

    // Verify pending write marked REJECTED in SQLite
    const updatedPending = pendingRepo.getByTicketId(ticketId);
    expect(updatedPending?.status).toBe('REJECTED');
    expect(updatedPending?.rejection_reason).toContain('Agent turn timed out');

    // Verify checkpoint marked failed in SQLite
    const updatedCp = checkpointRepo.getByTicketId(ticketId);
    expect(updatedCp?.status).toBe('failed');
    expect(updatedCp?.evaluation_reason).toContain('EXPIRED');
  });

  it('sweeps all expired abandoned writes and releases blocked files', () => {
    const now = Date.now();
    const oldTime = new Date(now - 900_000).toISOString();

    pendingRepo.insert({
      ticketId: 'chk_sweep_1',
      filePath: 'src/file1.ts',
      content: 'c1',
      operation: 'write',
      question: 'q1',
      createdAt: oldTime,
    });

    pendingRepo.insert({
      ticketId: 'chk_sweep_2',
      filePath: 'src/file2.ts',
      content: 'c2',
      operation: 'write',
      question: 'q2',
      createdAt: oldTime,
    });

    pendingRepo.insert({
      ticketId: 'chk_sweep_fresh',
      filePath: 'src/file3.ts',
      content: 'c3',
      operation: 'write',
      question: 'q3',
      createdAt: new Date().toISOString(),
    });

    const sweepResult: SweepResult = timeoutManager.sweepExpired();
    expect(sweepResult.expiredCount).toBe(2);
    expect(sweepResult.releasedFiles).toContain('src/file1.ts');
    expect(sweepResult.releasedFiles).toContain('src/file2.ts');
    expect(sweepResult.releasedFiles).not.toContain('src/file3.ts');

    // Fresh ticket remains PENDING
    expect(pendingRepo.getByTicketId('chk_sweep_fresh')?.status).toBe('PENDING');
  });

  it('checkAndReleaseFile automatically cleans up expired write when new operation targets file', () => {
    const targetFile = 'src/controllers/order.ts';
    const oldTime = new Date(Date.now() - 650_000).toISOString();

    pendingRepo.insert({
      ticketId: 'chk_order_stuck',
      filePath: targetFile,
      content: 'old order code',
      operation: 'write',
      question: 'q',
      createdAt: oldTime,
    });

    expect(pendingRepo.getPendingForFile(targetFile)).toBeDefined();

    // checkAndReleaseFile should expire it
    const released = timeoutManager.checkAndReleaseFile(targetFile);
    expect(released).toBe(true);

    // Pending write should no longer be in PENDING status
    expect(pendingRepo.getPendingForFile(targetFile)).toBeNull();

    // Calling again returns false since there is no pending write
    const secondCall = timeoutManager.checkAndReleaseFile(targetFile);
    expect(secondCall).toBe(false);
  });

  it('starts and stops background sweeper without unhandled timer errors', () => {
    expect(() => {
      timeoutManager.startSweeper(100);
      timeoutManager.stopSweeper();
    }).not.toThrow();
  });
});
