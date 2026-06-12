import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { runInterceptionBenchmark } from '../../bench/interception-latency.js';
import { createRatioServer } from '../../src/server/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';

describe('Interception Latency & Performance Regression Tests (<50ms SLA)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-latency-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('asserts that median end-to-end interception latency is strictly under 50ms SLA', async () => {
    // Run 30 iterations to verify performance while keeping test suite fast
    const results = await runInterceptionBenchmark({
      iterations: 30,
      warmup: 5,
      tempDir,
      silent: true,
    });

    expect(results.totalCalls).toBe(30);

    // Primary SLA requirement: Median overhead strictly under 50ms
    expect(results.endToEnd.median).toBeLessThan(50.0);
    // Also assert p95 is well within reasonable bounds (<50ms under local execution)
    expect(results.endToEnd.p95).toBeLessThan(50.0);

    // Component-level sub-budgets:
    // Heuristic scorer evaluation median should be fast (<10ms)
    expect(results.scorer.median).toBeLessThan(10.0);
    // SQLite logging median should be fast (<10ms)
    expect(results.dbLogging.median).toBeLessThan(10.0);
  });

  it('asserts that early-exit trivial writes execute well under 5ms', () => {
    const scorer = new ComplexityScorer({
      maxLinesAdded: 50,
      maxTotalLinesChanged: 100,
    });

    const filePath = join(tempDir, 'src/math.ts');
    const existingContent = 'export const add = (a: number, b: number) => a + b;\n';
    const newContent = 'export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n';

    // Warmup
    scorer.evaluate(filePath, existingContent, newContent);

    const latencies: number[] = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const res = scorer.evaluate(filePath, existingContent, newContent);
      const duration = performance.now() - start;
      latencies.push(duration);
      expect(res.exceedsThreshold).toBe(false);
    }

    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    expect(median).toBeLessThan(5.0);
  });

  it('asserts that ratio_edit_file tool interception remains strictly under 50ms median', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    const checkpointRepo = new CheckpointRepository(db);
    const pendingRepo = new PendingWriteRepository(db);
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 5, maxTotalLinesChanged: 10 });

    const server = createRatioServer(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-agent', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const latencies: number[] = [];
      const iterations = 25;

      for (let i = 0; i < iterations; i++) {
        const targetFile = join(tempDir, `src/service_${i}.ts`);
        await Bun.write(
          targetFile,
          'export class UserService {\n  findUser(id: string) { return null; }\n}\n'
        );

        const start = performance.now();
        const res = await client.callTool({
          name: 'ratio_edit_file',
          arguments: {
            path: targetFile,
            edits: [
              {
                oldText: 'findUser(id: string) { return null; }',
                newText: `findUser(id: string) {\n    // query user ${i}\n    return { id, active: true };\n  }`,
              },
            ],
            rationale: `Latency test edit #${i}`,
          },
        });
        const duration = performance.now() - start;
        latencies.push(duration);

        expect(res.isError).toBeFalsy();
      }

      latencies.sort((a, b) => a - b);
      const median = latencies[Math.floor(latencies.length / 2)];
      expect(median).toBeLessThan(50.0);
    } finally {
      await client.close();
      await server.close();
      closeDatabase(db);
    }
  });
});
