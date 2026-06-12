import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpRequestDispatcher, RATIO_TOOLS } from '../../src/server/dispatcher.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { initializeWorkspaceDatabase } from '../../src/storage/workspace.js';
import { closeDatabase } from '../../src/storage/db.js';
import { CheckpointRepository } from '../../src/storage/checkpoint-repo.js';
import { PendingWriteRepository } from '../../src/storage/pending-writes.js';
import { TrustScoreRepository } from '../../src/storage/trust-repo.js';

describe('McpRequestDispatcher Unit & High-Throughput Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-dispatcher-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('provides statically cached tool definitions with zero allocations', () => {
    const dispatcher1 = new McpRequestDispatcher();
    const dispatcher2 = new McpRequestDispatcher();

    const tools1 = dispatcher1.listTools();
    const tools2 = dispatcher2.listTools();

    // Must be identical frozen object references
    expect(tools1).toBe(tools2);
    expect(tools1.tools).toBe(RATIO_TOOLS);
    expect(Object.isFrozen(tools1)).toBe(true);
    expect(tools1.tools.length).toBe(3);
  });

  it('dispatches ratio_write_file for trivial and complex changes', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 5 });
    const dispatcher = new McpRequestDispatcher(stagingBuffer, scorer);

    const targetFile = join(tempDir, 'small.ts');

    // 1. Trivial write
    const trivialRes = await dispatcher.dispatch('ratio_write_file', {
      path: targetFile,
      content: 'export const a = 1;\n',
      rationale: 'Small helper',
    });

    expect(trivialRes.content).toHaveLength(1);
    const trivialJson = JSON.parse((trivialRes.content[0] as any).text);
    expect(trivialJson.status).toBe('write_permitted');

    // 2. Complex write
    const complexFile = join(tempDir, 'large.ts');
    const complexContent = Array.from({ length: 30 }, (_, i) => `export const val_${i} = ${i};`).join('\n');
    const complexRes = await dispatcher.dispatch('ratio_write_file', {
      path: complexFile,
      content: complexContent,
      rationale: 'Large feature addition',
    });

    const complexJson = JSON.parse((complexRes.content[0] as any).text);
    expect(complexJson.status).toBe('checkpoint_required');
    expect(complexJson.ticketId).toBeDefined();
    expect(complexJson.question).toBeDefined();
  });

  it('dispatches ratio_edit_file and stages modifications correctly', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 2 });
    const dispatcher = new McpRequestDispatcher(stagingBuffer, scorer);

    const targetFile = join(tempDir, 'edit_test.ts');
    await Bun.write(targetFile, 'function oldCode() { return 1; }\n');

    const res = await dispatcher.dispatch('ratio_edit_file', {
      path: targetFile,
      edits: [
        {
          oldText: 'function oldCode() { return 1; }',
          newText: 'function newCode() {\n  const a = 10;\n  const b = 20;\n  return a + b;\n}',
        },
      ],
      rationale: 'Refactoring old code',
    });

    const json = JSON.parse((res.content[0] as any).text);
    expect(json.status).toBe('checkpoint_required');
    expect(json.file).toBe(targetFile);
  });

  it('throws a descriptive error when unknown tool is dispatched', async () => {
    const dispatcher = new McpRequestDispatcher();
    expect(dispatcher.dispatch('nonexistent_tool', {})).rejects.toThrow(
      'Unknown tool requested: nonexistent_tool'
    );
  });

  it('integrates seamlessly with MCP Server instance via registerWithServer', async () => {
    const { db } = initializeWorkspaceDatabase(tempDir);
    const checkpointRepo = new CheckpointRepository(db);
    const pendingRepo = new PendingWriteRepository(db);
    const trustRepo = new TrustScoreRepository(db);

    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer();
    const dispatcher = new McpRequestDispatcher(stagingBuffer, scorer, {
      checkpointRepo,
      pendingRepo,
      trustRepo,
    });

    const server = new Server({ name: 'dispatcher-test', version: '1.0.0' }, { capabilities: { tools: {} } });
    dispatcher.registerWithServer(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'client', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const list = await client.listTools();
      expect(list.tools).toHaveLength(3);

      const filePath = join(tempDir, 'registered_write.ts');
      const callResult = await client.callTool({
        name: 'ratio_write_file',
        arguments: {
          path: filePath,
          content: 'export const hello = "world";',
          rationale: 'Greeting test',
        },
      });

      expect(callResult.isError).toBeFalsy();
      const payload = JSON.parse((callResult.content[0] as any).text);
      expect(payload.status).toBe('write_permitted');
    } finally {
      await client.close();
      await server.close();
      closeDatabase(db);
    }
  });

  it('handles 500 consecutive dispatched tool calls without performance degradation', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 50 });
    const dispatcher = new McpRequestDispatcher(stagingBuffer, scorer);

    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      const path = join(tempDir, `file_${i % 10}.ts`);
      const res = await dispatcher.dispatch('ratio_write_file', {
        path,
        content: `export const item_${i} = ${i};`,
        rationale: `High throughput run #${i}`,
      });
      const parsed = JSON.parse((res.content[0] as any).text);
      expect(parsed.status).toBe('write_permitted');
    }
  });
});
