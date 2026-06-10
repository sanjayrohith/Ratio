import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BatchTransactionCoordinator,
  type BatchTransaction,
} from '../../src/core/staging/batch.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { Database } from 'bun:sqlite';

describe('BatchTransactionCoordinator Unit & Integration Tests', () => {
  let tempDir: string;
  let db: Database;
  let pendingRepo: PendingWriteRepository;
  let stagingBuffer: StagingBuffer;
  let coordinator: BatchTransactionCoordinator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-batch-test-'));
    const ws = initializeWorkspaceDatabase(tempDir);
    db = ws.db;
    pendingRepo = new PendingWriteRepository(db);
    stagingBuffer = new StagingBuffer();
    coordinator = new BatchTransactionCoordinator({
      stagingBuffer,
      pendingRepo,
    });
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes and manages a batch transaction lifecycle', () => {
    const batch = coordinator.beginBatch({ turnId: 'turn-123' });
    expect(batch.batchId).toStartWith('batch_');
    expect(batch.turnId).toBe('turn-123');
    expect(batch.status).toBe('active');
    expect(batch.items.length).toBe(0);

    const retrieved = coordinator.getBatch(batch.batchId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.batchId).toBe(batch.batchId);

    const byTurn = coordinator.getBatchByTurnId('turn-123');
    expect(byTurn).toBeDefined();
    expect(byTurn?.batchId).toBe(batch.batchId);

    expect(coordinator.listBatches().length).toBe(1);
  });

  it('computes cross-file layer impact accurately', () => {
    // 1. Empty files
    const emptyImpact = coordinator.computeCrossFileLayerImpact([]);
    expect(emptyImpact.totalFiles).toBe(0);
    expect(emptyImpact.impactScore).toBe(0);
    expect(emptyImpact.riskLevel).toBe('low');

    // 2. Single UI file
    const uiImpact = coordinator.computeCrossFileLayerImpact(['src/ui/components/Button.tsx']);
    expect(uiImpact.layersTouched).toContain('ui');
    expect(uiImpact.isMultiLayer).toBe(false);
    expect(uiImpact.riskLevel).toBe('low');

    // 3. Multi-layer (API + UI)
    const multiImpact = coordinator.computeCrossFileLayerImpact([
      'src/api/routes/users.ts',
      'src/ui/components/UserList.tsx',
    ]);
    expect(multiImpact.isMultiLayer).toBe(true);
    expect(multiImpact.layersTouched).toContain('api');
    expect(multiImpact.layersTouched).toContain('ui');
    expect(multiImpact.impactScore).toBeGreaterThan(uiImpact.impactScore);

    // 4. Sensitive cross-layer (Auth + DB)
    const sensitiveImpact = coordinator.computeCrossFileLayerImpact([
      'src/auth/jwt.ts',
      'src/db/migrations/001_auth.sql',
    ]);
    expect(sensitiveImpact.isMultiLayer).toBe(true);
    expect(sensitiveImpact.sensitiveLayers).toContain('auth');
    expect(sensitiveImpact.sensitiveLayers).toContain('db');
    expect(sensitiveImpact.riskLevel).toBe('critical');
    expect(sensitiveImpact.impactScore).toBeGreaterThanOrEqual(75);
  });

  it('stages multiple file writes and recomputes batch layer impact progressively', () => {
    const batch = coordinator.beginBatch();

    const file1 = join(tempDir, 'src/api/user.ts');
    const item1 = coordinator.addWrite(batch.batchId, {
      filePath: file1,
      content: 'export const getUser = () => {};',
      operation: 'write',
      rationale: 'User API endpoint',
    });

    expect(item1.ticketId).toBeDefined();
    expect(item1.layers).toContain('api');
    expect(batch.items.length).toBe(1);
    expect(batch.layerImpact.isMultiLayer).toBe(false);

    // Verify persisted into SQLite
    const inDb1 = pendingRepo.getByTicketId(item1.ticketId);
    expect(inDb1).toBeDefined();
    expect(inDb1?.file_path).toBe(file1);

    const file2 = join(tempDir, 'src/db/schema.ts');
    const item2 = coordinator.addWrite(batch.batchId, {
      filePath: file2,
      content: 'export interface User { id: string; }',
      operation: 'write',
      rationale: 'User DB schema',
    });

    expect(batch.items.length).toBe(2);
    expect(batch.layerImpact.isMultiLayer).toBe(true);
    expect(batch.layerImpact.layersTouched).toContain('api');
    expect(batch.layerImpact.layersTouched).toContain('db');
    expect(batch.layerImpact.sensitiveLayers).toContain('db');
  });

  it('commits all batch writes atomically to filesystem and updates records', async () => {
    const batch = coordinator.beginBatch();
    const fileA = join(tempDir, 'fileA.txt');
    const fileB = join(tempDir, 'fileB.txt');

    coordinator.addWrite(batch.batchId, {
      filePath: fileA,
      content: 'Hello File A',
      operation: 'write',
    });

    coordinator.addWrite(batch.batchId, {
      filePath: fileB,
      content: 'Hello File B',
      operation: 'write',
    });

    expect(existsSync(fileA)).toBe(false);
    expect(existsSync(fileB)).toBe(false);

    const commitRes = await coordinator.commitBatch(batch.batchId);
    expect(commitRes.status).toBe('committed');
    expect(commitRes.committedCount).toBe(2);
    expect(batch.status).toBe('committed');

    expect(existsSync(fileA)).toBe(true);
    expect(existsSync(fileB)).toBe(true);
    expect(readFileSync(fileA, 'utf-8')).toBe('Hello File A');
    expect(readFileSync(fileB, 'utf-8')).toBe('Hello File B');

    // SQLite records should be marked COMMITTED
    for (const item of batch.items) {
      const rec = pendingRepo.getByTicketId(item.ticketId);
      expect(rec?.status).toBe('COMMITTED');
    }
  });

  it('rolls back all batch writes leaving filesystem untouched', async () => {
    const batch = coordinator.beginBatch();
    const fileX = join(tempDir, 'fileX.txt');

    coordinator.addWrite(batch.batchId, {
      filePath: fileX,
      content: 'Should never be written',
      operation: 'write',
    });

    const rollbackRes = coordinator.rollbackBatch(batch.batchId, 'Comprehension test failed');
    expect(rollbackRes.status).toBe('rolled_back');
    expect(rollbackRes.rolledBackCount).toBe(1);
    expect(batch.status).toBe('rolled_back');

    expect(existsSync(fileX)).toBe(false);

    const rec = pendingRepo.getByTicketId(batch.items[0].ticketId);
    expect(rec?.status).toBe('REJECTED');
    expect(rec?.rejection_reason).toBe('Comprehension test failed');
  });

  it('rejects adding writes or double-committing completed batches', async () => {
    const batch = coordinator.beginBatch();
    const file = join(tempDir, 'file.txt');
    coordinator.addWrite(batch.batchId, {
      filePath: file,
      content: 'Content',
      operation: 'write',
    });

    await coordinator.commitBatch(batch.batchId);

    expect(() => {
      coordinator.addWrite(batch.batchId, {
        filePath: join(tempDir, 'file2.txt'),
        content: 'Content 2',
        operation: 'write',
      });
    }).toThrow('Cannot add write to already committed batch');

    expect(async () => {
      await coordinator.commitBatch(batch.batchId);
    }).toThrow();
  });
});
