import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MockOpenCodeClient } from './mock-opencode.js';
import { MockClaudeClient } from './mock-claude.js';
import { createRatioServer } from '../../src/server/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';

describe('Mock OpenCode Client & Dual-Agent Verification Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-mock-opencode-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('performs standard JSON-RPC 2.0 initialize handshake and lists tools', async () => {
    const server = createRatioServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const opencode = new MockOpenCodeClient({ agentName: 'opencode-cli', agentVersion: '2.1.0' });
    await server.connect(serverTransport);
    await opencode.connect(clientTransport);

    try {
      const tools = await opencode.listTools();
      expect(tools).toBeArray();
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('ratio_write_file');
      expect(toolNames).toContain('ratio_edit_file');
      expect(toolNames).toContain('ratio_submit_answer');
    } finally {
      await opencode.close();
      await server.close();
    }
  });

  it('triggers checkpoint on complex writes and returns valid ticket', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 5 });
    const server = createRatioServer(stagingBuffer, scorer);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const opencode = new MockOpenCodeClient({ autoRelayAnswers: false });

    await server.connect(serverTransport);
    await opencode.connect(clientTransport);

    try {
      const targetFile = join(tempDir, 'schema.ts');
      const largeContent = Array.from({ length: 25 }, (_, i) => `export interface Model${i} { id: string; }`).join('\n');

      const res = await opencode.writeFile(targetFile, largeContent);
      expect(res.status).toBe('checkpoint_required');
      expect(res.ticketId).toBeDefined();
      expect(res.question).toBeDefined();

      const log = opencode.getCallLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[log.length - 1].latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await opencode.close();
      await server.close();
    }
  });

  it('demonstrates identical interception parity between Claude Code and OpenCode clients', async () => {
    const stagingBuffer = new StagingBuffer();
    const scorer = new ComplexityScorer({ maxLinesAdded: 10 });
    const server = createRatioServer(stagingBuffer, scorer);

    // 1. Test Claude Code client
    const [claudeClientTransport, claudeServerTransport] = InMemoryTransport.createLinkedPair();
    const claude = new MockClaudeClient();
    await server.connect(claudeServerTransport);
    await claude.connect(claudeClientTransport);

    const claudeFile = join(tempDir, 'claude_file.ts');
    const claudeRes = await claude.writeFile(claudeFile, 'export const name = "claude";\n');

    await claude.close();
    await server.close();

    // 2. Test OpenCode client on fresh server with same rules
    const server2 = createRatioServer(stagingBuffer, scorer);
    const [openClientTransport, openServerTransport] = InMemoryTransport.createLinkedPair();
    const opencode = new MockOpenCodeClient();
    await server2.connect(openServerTransport);
    await opencode.connect(openClientTransport);

    const openFile = join(tempDir, 'opencode_file.ts');
    const openRes = await opencode.writeFile(openFile, 'export const name = "opencode";\n');

    await opencode.close();
    await server2.close();

    // Both clients should experience identical protocol behavior (both auto-approved)
    expect(claudeRes.permitted).toBe(true);
    expect(openRes.status).toBe('write_permitted');
  });

  it('rejects unknown tool invocation with standard JSON-RPC error', async () => {
    const server = createRatioServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const opencode = new MockOpenCodeClient();

    await server.connect(serverTransport);
    await opencode.connect(clientTransport);

    try {
      expect(opencode.callTool('invalid_unknown_tool', {})).rejects.toThrow(
        /Unknown tool requested|JSON-RPC Error/
      );
    } finally {
      await opencode.close();
      await server.close();
    }
  });
});
