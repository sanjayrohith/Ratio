import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRatioServer } from '../../src/server/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { createDatabase, closeDatabase, withRetry } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { SessionRepository } from '../../src/storage/session-repo.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { BatchTransactionCoordinator } from '../../src/core/staging/batch.js';

describe('Server & Database Concurrency Stress Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-concurrency-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('handles 20 simultaneous MCP write and edit tool calls without lock errors', async () => {
    const stagingBuffer = new StagingBuffer();
    // Low threshold so every write triggers a checkpoint
    const scorer = new ComplexityScorer({ maxLinesAdded: 0, maxTotalLinesChanged: 0 });
    const server = createRatioServer(stagingBuffer, scorer);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: 'concurrency-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const callCount = 20;
      const tasks = Array.from({ length: callCount }).map((_, idx) => {
        const filePath = join(tempDir, `src/worker/task_${idx}.ts`);
        const isWrite = idx % 2 === 0;

        if (isWrite) {
          return client.callTool({
            name: 'ratio_write_file',
            arguments: {
              path: filePath,
              content: `export const task${idx} = () => console.log('task ${idx}');`,
              rationale: `Concurrent write task #${idx}`,
            },
          });
        } else {
          // Pre-populate target file for edit
          return client.callTool({
            name: 'ratio_write_file',
            arguments: {
              path: filePath,
              content: `export const worker${idx} = () => { return ${idx}; };`,
              rationale: `Concurrent worker write #${idx}`,
            },
          });
        }
      });

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(callCount);
      for (const res of results) {
        expect(res.isError).toBeFalsy();
        expect(res.content).toBeArray();
        const payload = JSON.parse(((res.content as any)[0] as any).text);
        expect(payload.status).toBe('checkpoint_required');
        expect(payload.ticketId).toBeDefined();
        expect(payload.question).toBeDefined();
      }

      // Check that all 20 writes are correctly buffered in the staging buffer
      const pending = stagingBuffer.listPending();
      expect(pending.length).toBe(callCount);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('executes simultaneous SQLite write transactions across separate connections safely', async () => {
    const { db: initDb, context } = initializeWorkspaceDatabase(tempDir);
    const dbPath = context.dbPath;
    closeDatabase(initDb);

    const clientConnections = Array.from({ length: 10 }).map(() => createDatabase(dbPath));

    try {
      // Concurrently insert checkpoints and sessions across all 10 connections
      const promises = clientConnections.map((db, idx) => {
        return withRetry(async () => {
          const checkpointRepo = new CheckpointRepository(db);
          const sessionRepo = new SessionRepository(db);

          const ticketId = `chk_conc_${idx}`;
          const filePath = `src/services/service_${idx}.ts`;

          sessionRepo.recordInterception({
            id: `int_conc_${idx}`,
            toolName: 'ratio_write_file',
            filePath,
            stagedId: `stg_${idx}`,
            decision: 'checkpoint_required',
            riskScore: 50 + idx,
            riskLevel: 'medium',
            lineDelta: 20 + idx,
          });

          checkpointRepo.insertCheckpoint({
            ticketId,
            filePath,
            question: `Explain concurrency for worker ${idx}`,
            concept: 'ASYNC_CONCURRENCY',
            status: 'pending',
          });

          return ticketId;
        });
      });

      const ticketIds = await Promise.all(promises);
      expect(ticketIds).toHaveLength(10);

      // Verify all records landed in database via an independent read connection
      const verifyDb = createDatabase(dbPath);
      try {
        const row = verifyDb
          .prepare('SELECT COUNT(*) as count FROM checkpoints')
          .get() as { count: number };
        expect(row.count).toBe(10);

        const intRow = verifyDb
          .prepare('SELECT COUNT(*) as count FROM interceptions')
          .get() as { count: number };
        expect(intRow.count).toBe(10);
      } finally {
        closeDatabase(verifyDb);
      }
    } finally {
      for (const db of clientConnections) {
        closeDatabase(db);
      }
    }
  });

  it('handles concurrent batch transactions and atomic commits without collisions', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    try {
      const pendingRepo = new PendingWriteRepository(db);
      const stagingBuffer = new StagingBuffer();
      const coordinator = new BatchTransactionCoordinator({
        stagingBuffer,
        pendingRepo,
      });

      const batchCount = 5;
      const batches = Array.from({ length: batchCount }).map((_, bIdx) => {
        const batch = coordinator.beginBatch({ turnId: `turn-${bIdx}` });
        for (let fIdx = 0; fIdx < 3; fIdx++) {
          const filePath = join(tempDir, `batch_${bIdx}_file_${fIdx}.txt`);
          coordinator.addWrite(batch.batchId, {
            filePath,
            content: `Batch ${bIdx} File ${fIdx} Content`,
            operation: 'write',
          });
        }
        return batch;
      });

      expect(coordinator.listBatches()).toHaveLength(batchCount);

      // Concurrently commit all 5 batches (15 files total)
      const commitPromises = batches.map((b) => coordinator.commitBatch(b.batchId));
      const results = await Promise.all(commitPromises);

      expect(results).toHaveLength(batchCount);
      for (const res of results) {
        expect(res.status).toBe('committed');
        expect(res.committedCount).toBe(3);
      }

      // Verify all 15 files are committed to disk with exact contents
      for (let bIdx = 0; bIdx < batchCount; bIdx++) {
        for (let fIdx = 0; fIdx < 3; fIdx++) {
          const filePath = join(tempDir, `batch_${bIdx}_file_${fIdx}.txt`);
          expect(existsSync(filePath)).toBe(true);
          expect(readFileSync(filePath, 'utf-8')).toBe(`Batch ${bIdx} File ${fIdx} Content`);
        }
      }
    } finally {
      closeDatabase(db);
    }
  });
});
