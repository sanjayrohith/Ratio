import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
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

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

export interface BenchmarkResults {
  totalCalls: number;
  endToEnd: LatencyStats;
  scorer: LatencyStats;
  dbLogging: LatencyStats;
  toolDispatch: LatencyStats;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  tempDir?: string;
  silent?: boolean;
}

export function calculateStats(durations: number[]): LatencyStats {
  if (durations.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  const getPercentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * count), count - 1);
    return sorted[idx];
  };

  return {
    count,
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted[count - 1].toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(getPercentile(50).toFixed(3)),
    p95: Number(getPercentile(95).toFixed(3)),
    p99: Number(getPercentile(99).toFixed(3)),
  };
}

export async function runInterceptionBenchmark(
  options: BenchmarkOptions = {}
): Promise<BenchmarkResults> {
  const iterations = options.iterations ?? 100;
  const warmup = options.warmup ?? 10;
  const createdTemp = !options.tempDir;
  const targetDir = options.tempDir ?? mkdtempSync(join(tmpdir(), 'ratio-bench-'));

  const { db, context } = initializeWorkspaceDatabase(targetDir);
  const checkpointRepo = new CheckpointRepository(db);
  const sessionRepo = new SessionRepository(db);
  const trustRepo = new TrustScoreRepository(db);
  const pendingRepo = new PendingWriteRepository(db);

  const stagingBuffer = new StagingBuffer();
  const scorer = new ComplexityScorer({
    maxLinesAdded: 15,
    maxTotalLinesChanged: 30,
  });

  const server = createRatioServer(stagingBuffer, scorer, {
    checkpointRepo,
    sessionRepo,
    trustRepo,
    pendingRepo,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'bench-agent', version: '1.0.0' },
    { capabilities: {} }
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const endToEndLatencies: number[] = [];
  const scorerLatencies: number[] = [];
  const dbLoggingLatencies: number[] = [];
  const dispatchLatencies: number[] = [];

  try {
    // 1. Warmup runs
    for (let i = 0; i < warmup; i++) {
      const filePath = join(targetDir, `src/bench/warmup_${i}.ts`);
      await client.callTool({
        name: 'ratio_write_file',
        arguments: {
          path: filePath,
          content: `export const warmup${i} = () => ${i};`,
          rationale: 'Warmup invocation',
        },
      });
    }

    // 2. Measured benchmark runs
    for (let i = 0; i < iterations; i++) {
      const filePath = join(targetDir, `src/bench/test_module_${i}.ts`);
      const existingContent = i % 2 === 0 ? '' : `// Existing file header\nexport const x = ${i};\n`;
      const newContent = `${existingContent}export function processOrder${i}(id: string, amount: number) {\n  const tax = amount * 0.15;\n  return { id, total: amount + tax, timestamp: Date.now() };\n}\n`;

      // Measure isolated scorer latency
      const tScorerStart = performance.now();
      const evalResult = scorer.evaluate(filePath, existingContent, newContent);
      const tScorerEnd = performance.now();
      scorerLatencies.push(tScorerEnd - tScorerStart);

      // Measure isolated DB logging latency
      const tDbStart = performance.now();
      const testTicketId = `bench-ticket-${i}`;
      pendingRepo.insert({
        ticketId: testTicketId,
        filePath,
        content: newContent,
        operation: 'write',
        question: evalResult.suggestedQuestion ?? 'Bench question',
        concept: evalResult.concept,
        rationale: 'Bench test rationale',
        metadata: { lineDelta: evalResult.lineDelta },
      });
      checkpointRepo.insertCheckpoint({
        ticketId: testTicketId,
        filePath,
        question: 'Bench question',
        concept: 'ARCHITECTURAL_RATIONALE',
      });
      const tDbEnd = performance.now();
      dbLoggingLatencies.push(tDbEnd - tDbStart);

      // Measure end-to-end tool dispatch latency through MCP client-server
      const tE2EStart = performance.now();
      await client.callTool({
        name: 'ratio_write_file',
        arguments: {
          path: filePath,
          content: newContent,
          rationale: `Interception benchmark call #${i}`,
        },
      });
      const tE2EEnd = performance.now();
      const e2eDuration = tE2EEnd - tE2EStart;
      endToEndLatencies.push(e2eDuration);

      // Dispatch-only overhead roughly = E2E - Scorer - DB
      const dispatchOverhead = Math.max(0, e2eDuration - (tScorerEnd - tScorerStart) - (tDbEnd - tDbStart));
      dispatchLatencies.push(dispatchOverhead);
    }
  } finally {
    await client.close();
    await server.close();
    closeDatabase(db);
    if (createdTemp) {
      rmSync(targetDir, { recursive: true, force: true });
    }
  }

  const results: BenchmarkResults = {
    totalCalls: iterations,
    endToEnd: calculateStats(endToEndLatencies),
    scorer: calculateStats(scorerLatencies),
    dbLogging: calculateStats(dbLoggingLatencies),
    toolDispatch: calculateStats(dispatchLatencies),
  };

  if (!options.silent) {
    printBenchmarkSummary(results);
  }

  return results;
}

export function printBenchmarkSummary(results: BenchmarkResults): void {
  console.log('\n======================================================');
  console.log('       Ratio MCP Interceptor Latency Benchmark        ');
  console.log('======================================================');
  console.log(`Total calls measured: ${results.totalCalls}`);
  console.log('------------------------------------------------------');
  console.log('Component        | Min (ms) | Mean (ms)| p50 (ms) | p95 (ms) | p99 (ms) | Max (ms)');
  console.log('-----------------+----------+----------+----------+----------+----------+---------');

  const formatRow = (name: string, stats: LatencyStats) => {
    const colName = name.padEnd(16, ' ');
    const min = stats.min.toFixed(2).padStart(8, ' ');
    const mean = stats.mean.toFixed(2).padStart(8, ' ');
    const p50 = stats.median.toFixed(2).padStart(8, ' ');
    const p95 = stats.p95.toFixed(2).padStart(8, ' ');
    const p99 = stats.p99.toFixed(2).padStart(8, ' ');
    const max = stats.max.toFixed(2).padStart(8, ' ');
    return `${colName} | ${min} | ${mean} | ${p50} | ${p95} | ${p99} | ${max}`;
  };

  console.log(formatRow('Scorer Heuristics', results.scorer));
  console.log(formatRow('SQLite Logging', results.dbLogging));
  console.log(formatRow('Transport/RPC', results.toolDispatch));
  console.log('-----------------+----------+----------+----------+----------+----------+---------');
  console.log(formatRow('End-to-End Interc', results.endToEnd));
  console.log('======================================================');
  const targetThreshold = 50.0;
  const passes = results.endToEnd.median < targetThreshold;
  console.log(
    `Overall Median Status: ${results.endToEnd.median}ms ${
      passes ? '✓ (< 50ms SLA PASS)' : '✗ (>= 50ms SLA FAIL)'
    }\n`
  );
}

if (import.meta.main) {
  runInterceptionBenchmark({ iterations: 100, warmup: 10, silent: false }).catch((err) => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  });
}
