import { describe, expect, it } from 'bun:test';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ComplexityScorer, LayerTransitionDetector } from '../../src/core/scorer/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { createRatioServer, SERVER_NAME, SERVER_VERSION } from '../../src/server/index.js';
import { RATIO_TOOLS } from '../../src/server/tools.js';
import type { CheckpointResponse } from '../../src/types/protocol.js';

describe('Ratio MCP Server Handshake & Tool Interception', () => {
  it('initializes the server instance with correct metadata and capabilities', () => {
    const server = createRatioServer();
    expect(server).toBeDefined();
  });

  it('performs standard JSON-RPC 2.0 initialize handshake over mock stdio streams', async () => {
    const serverStdin = new PassThrough();
    const serverStdout = new PassThrough();
    const transport = new StdioServerTransport(serverStdin, serverStdout);
    const server = createRatioServer();

    await server.connect(transport);

    const receivedChunks: string[] = [];
    serverStdout.on('data', (chunk) => {
      receivedChunks.push(chunk.toString());
    });

    const initRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'mock-agent-client',
            version: '1.0.0',
          },
        },
      }) + '\n';

    serverStdin.write(initRequest);

    // Give stdio processing a brief tick
    await new Promise((resolve) => setTimeout(resolve, 50));

    const fullResponse = receivedChunks.join('');
    const parsed = JSON.parse(fullResponse.trim());

    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed.result).toBeDefined();
    expect(parsed.result.serverInfo.name).toBe(SERVER_NAME);
    expect(parsed.result.serverInfo.version).toBe(SERVER_VERSION);
    expect(parsed.result.capabilities.tools).toBeDefined();

    await server.close();
  });

  it('enumerates registered tools matching ratio_write_file and ratio_edit_file', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createRatioServer();
    const client = new Client(
      { name: 'test-harness', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();

    expect(result.tools).toHaveLength(3);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('ratio_write_file');
    expect(toolNames).toContain('ratio_edit_file');
    expect(toolNames).toContain('ratio_submit_answer');

    const writeTool = result.tools.find((t) => t.name === 'ratio_write_file');
    expect(writeTool).toBeDefined();
    expect(writeTool?.inputSchema.properties).toHaveProperty('path');
    expect(writeTool?.inputSchema.properties).toHaveProperty('content');
    expect(writeTool?.inputSchema.properties).toHaveProperty('rationale');

    const editTool = result.tools.find((t) => t.name === 'ratio_edit_file');
    expect(editTool).toBeDefined();
    expect(editTool?.inputSchema.properties).toHaveProperty('path');
    expect(editTool?.inputSchema.properties).toHaveProperty('edits');

    const submitAnswerTool = result.tools.find((t) => t.name === 'ratio_submit_answer');
    expect(submitAnswerTool).toBeDefined();
    expect(submitAnswerTool?.inputSchema.properties).toHaveProperty('ticket_id');
    expect(submitAnswerTool?.inputSchema.properties).toHaveProperty('answer');

    await client.close();
    await server.close();
  });

  it('returns static checkpoint_required when invoking ratio_write_file over mock stdio', async () => {
    const serverStdin = new PassThrough();
    const serverStdout = new PassThrough();
    const transport = new StdioServerTransport(serverStdin, serverStdout);
    const server = createRatioServer(
      new StagingBuffer(),
      new ComplexityScorer({ maxLinesAdded: 0, maxTotalLinesChanged: 0 })
    );

    await server.connect(transport);

    const receivedChunks: string[] = [];
    serverStdout.on('data', (chunk) => {
      receivedChunks.push(chunk.toString());
    });

    // 1. Initialize
    const initRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent', version: '1.0' },
        },
      }) + '\n';
    serverStdin.write(initRequest);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // 2. Call ratio_write_file
    const targetFile = 'src/services/auth.ts';
    const callRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'ratio_write_file',
          arguments: {
            path: targetFile,
            content: 'export function verifyJwt() { return true; }',
            rationale: 'Adding JWT verification logic to auth service',
          },
        },
      }) + '\n';
    serverStdin.write(callRequest);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const responses = receivedChunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    const callResponse = responses.find((r) => r.id === 2);
    expect(callResponse).toBeDefined();
    expect(callResponse.result).toBeDefined();
    expect(callResponse.result.content).toHaveLength(1);
    expect(callResponse.result.content[0].type).toBe('text');

    const checkpoint: CheckpointResponse = JSON.parse(callResponse.result.content[0].text);
    expect(checkpoint.status).toBe('checkpoint_required');
    expect(checkpoint.file).toBe(targetFile);
    expect(checkpoint.ticketId).toMatch(/^chk_/);
    expect(checkpoint.question).toContain('Socratic Checkpoint:');
    expect(['ARCHITECTURAL_RATIONALE', 'MULTI_LAYER_CHANGE', 'AUTHENTICATION_ARCHITECTURE']).toContain(
      checkpoint.concept!
    );

    await server.close();
  });

  it('returns static checkpoint_required when invoking ratio_edit_file', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createRatioServer(
      new StagingBuffer(),
      new ComplexityScorer(
        { maxLinesAdded: 0, maxTotalLinesChanged: 0 },
        undefined,
        new LayerTransitionDetector()
      )
    );
    const client = new Client(
      { name: 'test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const targetFile = 'src/routes/api.ts';
    const callResult = await client.callTool({
      name: 'ratio_edit_file',
      arguments: {
        path: targetFile,
        edits: [
          {
            oldText: 'app.get("/users", handler);',
            newText: 'app.get("/users", authMiddleware, handler);',
          },
        ],
        rationale: 'Protect users endpoint with authentication middleware',
      },
    });

    const content = callResult.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    const firstItem = content[0];
    expect(firstItem.type).toBe('text');

    const checkpoint: CheckpointResponse = JSON.parse(firstItem.text);
    expect(checkpoint.status).toBe('checkpoint_required');
    expect(checkpoint.file).toBe(targetFile);
    expect(checkpoint.ticketId).toMatch(/^chk_/);
    expect(checkpoint.question).toContain('Socratic Checkpoint:');
    expect(checkpoint.concept).toBe('ARCHITECTURAL_RATIONALE');

    await client.close();
    await server.close();
  });

  it('throws an error when an unknown tool is called', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createRatioServer();
    const client = new Client(
      { name: 'test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(
      client.callTool({
        name: 'unknown_tool',
        arguments: {},
      })
    ).rejects.toThrow();

    await client.close();
    await server.close();
  });
});
