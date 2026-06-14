import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MockClaudeClient } from './mock-claude.js';
import { createRatioServer } from '../../src/server/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { ManagedStdioTransport } from '../../src/server/transport.js';

describe('Mock Claude Code Client Harness Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-mock-claude-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('connects to Ratio MCP server and lists available tools', async () => {
    const server = createRatioServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const claude = new MockClaudeClient();
    await server.connect(serverTransport);
    await claude.connect(clientTransport);

    try {
      const tools = await claude.listTools();
      expect(tools.tools).toBeArray();
      expect(tools.tools.length).toBe(3);
      const names = tools.tools.map((t) => t.name);
      expect(names).toContain('ratio_write_file');
      expect(names).toContain('ratio_edit_file');
      expect(names).toContain('ratio_submit_answer');
    } finally {
      await claude.close();
      await server.close();
    }
  });

  it('handles trivial write without triggering checkpoint', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 50 });
    const server = createRatioServer(stagingBuffer, scorer);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const claude = new MockClaudeClient();

    await server.connect(serverTransport);
    await claude.connect(clientTransport);

    try {
      const targetFile = join(tempDir, 'utils.ts');
      const res = await claude.writeFile(targetFile, 'export const PI = 3.14159;\n');

      expect(res.permitted).toBe(true);
      expect(res.checkpoint).toBeUndefined();
      expect(res.writeResult?.status).toBe('write_permitted');
      expect(claude.getRelayedQuestions()).toHaveLength(0);
      expect(claude.getCallHistory()).toHaveLength(1);
    } finally {
      await claude.close();
      await server.close();
    }
  });

  it('captures checkpoint and records relayed question when threshold is exceeded', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 3 });
    const server = createRatioServer(stagingBuffer, scorer);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const claude = new MockClaudeClient({ autoAnswer: false });

    await server.connect(serverTransport);
    await claude.connect(clientTransport);

    try {
      const targetFile = join(tempDir, 'complex.ts');
      const lines = Array.from({ length: 20 }, (_, i) => `export const x${i} = ${i};`).join('\n');
      const res = await claude.writeFile(targetFile, lines);

      expect(res.permitted).toBe(false);
      expect(res.checkpoint).toBeDefined();
      expect(res.checkpoint?.status).toBe('checkpoint_required');

      const relayed = claude.getRelayedQuestions();
      expect(relayed).toHaveLength(1);
      expect(relayed[0].file).toBe(targetFile);
      expect(relayed[0].ticketId).toBe(res.checkpoint!.ticketId);
    } finally {
      await claude.close();
      await server.close();
    }
  });

  it('supports auto-answering questions and completes write approval loop', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 3 });
    const server = createRatioServer(stagingBuffer, scorer, {
      matcher: {
        evaluate: () => ({
          passed: true,
          score: 95,
          isEvasive: false,
          conceptId: 'LINE_THRESHOLD',
          matchedKeywords: ['constants'],
          matchedMechanisms: ['constants'],
          missingMechanisms: [],
          feedback: 'Valid explanation',
        }),
      } as any,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const claude = new MockClaudeClient({
      autoAnswer: true,
      answerProvider: (cp) => `This file ${cp.file} establishes modular architecture for numeric constants.`,
    });

    await server.connect(serverTransport);
    await claude.connect(clientTransport);

    try {
      const targetFile = join(tempDir, 'auto-approved.ts');
      const lines = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i};`).join('\n');
      const res = await claude.writeFile(targetFile, lines);

      expect(res.permitted).toBe(true);
      expect(res.checkpoint).toBeDefined();
      expect(res.writeResult?.status).toBe('write_permitted');

      const history = claude.getCallHistory();
      expect(history.length).toBe(2); // ratio_write_file + ratio_submit_answer
      expect(history[0].tool).toBe('ratio_write_file');
      expect(history[1].tool).toBe('ratio_submit_answer');
    } finally {
      await claude.close();
      await server.close();
    }
  });

  it('operates smoothly over ManagedStdioTransport streams', async () => {
    const serverStdin = new PassThrough();
    const serverStdout = new PassThrough();
    const serverTransport = new ManagedStdioTransport(serverStdin, serverStdout);

    const clientStdin = new PassThrough();
    const clientStdout = new PassThrough();
    const clientTransport = new ManagedStdioTransport(clientStdin, clientStdout);

    // Cross-link streams: server stdout -> client stdin, client stdout -> server stdin
    serverStdout.pipe(clientStdin);
    clientStdout.pipe(serverStdin);

    const server = createRatioServer();
    const claude = new MockClaudeClient();

    await server.connect(serverTransport);
    await claude.connect(clientTransport);

    try {
      const tools = await claude.listTools();
      expect(tools.tools).toHaveLength(3);
    } finally {
      await claude.close();
      await server.close();
    }
  });
});
