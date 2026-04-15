import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { injectAgentRules } from '../../src/core/templates.js';
import { createRatioServer } from '../../src/server/index.js';
import { atomicWriteFile, fileExists, safeReadFile } from '../../src/storage/fs.js';
import type { CheckpointResponse } from '../../src/types/protocol.js';

describe('Agent Write Interception Flow Integration Test', () => {
  it('intercepts agent file write, returns checkpoint_required, and retains payload in staging buffer', async () => {
    const stagingBuffer = new StagingBuffer();
    const server = createRatioServer(
      stagingBuffer,
      new ComplexityScorer({ maxLinesAdded: 0, maxTotalLinesChanged: 0 })
    );
    const client = new Client(
      { name: 'claude-code-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const targetPath = 'src/auth/jwt-verifier.ts';
    const proposedContent = `import jwt from 'jsonwebtoken';\nexport function verify(token: string) { return jwt.verify(token, process.env.JWT_SECRET!); }`;
    const rationale = 'Implement JWT verification to protect authenticated API endpoints.';

    // 1. Agent calls ratio_write_file
    const rawResult = await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: targetPath,
        content: proposedContent,
        rationale,
      },
    });

    const content = rawResult.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');

    const checkpoint: CheckpointResponse = JSON.parse(content[0].text);
    expect(checkpoint.status).toBe('checkpoint_required');
    expect(checkpoint.file).toBe(targetPath);
    expect(checkpoint.ticketId).toMatch(/^chk_/);
    expect(checkpoint.question).toContain('Socratic Checkpoint:');
    expect(checkpoint.rationale).toBe(rationale);

    // 2. Verify staging buffer retention
    const staged = stagingBuffer.get(checkpoint.ticketId);
    expect(staged).toBeDefined();
    expect(staged?.ticketId).toBe(checkpoint.ticketId);
    expect(staged?.file).toBe(targetPath);
    expect(staged?.content).toBe(proposedContent);
    expect(staged?.operation).toBe('write');
    expect(staged?.status).toBe('pending');
    expect(staged?.rationale).toBe(rationale);

    // 3. Verify target file was NOT written directly to disk yet
    const onDiskBeforeApproval = await fileExists(targetPath);
    expect(onDiskBeforeApproval).toBe(false);

    // 4. Verify listPending contains the staged write
    const pendingList = stagingBuffer.listPending();
    expect(pendingList.map((w) => w.ticketId)).toContain(checkpoint.ticketId);

    await client.close();
    await server.close();
  });

  it('intercepts agent file edit, applies patch in memory, returns checkpoint, and retains patched content in buffer', async () => {
    const tempDir = join(tmpdir(), `ratio-test-${Date.now()}`);
    const targetFile = join(tempDir, 'routes.ts');

    const initialCode = `// API routes\nexport function setupRoutes(app: any) {\n  app.get("/status", getStatus);\n}\n`;
    await atomicWriteFile(targetFile, initialCode);

    const stagingBuffer = new StagingBuffer();
    const server = createRatioServer(
      stagingBuffer,
      new ComplexityScorer({ maxLinesAdded: 0, maxTotalLinesChanged: 0 })
    );
    const client = new Client(
      { name: 'cursor-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const editResult = await client.callTool({
      name: 'ratio_edit_file',
      arguments: {
        path: targetFile,
        edits: [
          {
            oldText: 'app.get("/status", getStatus);',
            newText: 'app.get("/status", getStatus);\n  app.post("/login", handleLogin);',
          },
        ],
        rationale: 'Add login endpoint to router',
      },
    });

    const content = editResult.content as Array<{ type: string; text: string }>;
    const checkpoint: CheckpointResponse = JSON.parse(content[0].text);
    expect(checkpoint.status).toBe('checkpoint_required');

    const staged = stagingBuffer.get(checkpoint.ticketId);
    expect(staged).toBeDefined();
    expect(staged?.operation).toBe('edit');
    expect(staged?.content).toContain('app.post("/login", handleLogin);');
    expect(staged?.status).toBe('pending');

    // Original file remains unchanged prior to approval
    const contentOnDisk = await safeReadFile(targetFile);
    expect(contentOnDisk).toBe(initialCode);

    // Simulate approval and commit flow
    stagingBuffer.approve(checkpoint.ticketId);
    expect(staged?.status).toBe('approved');

    await atomicWriteFile(targetFile, staged!.content);
    stagingBuffer.commit(checkpoint.ticketId);
    expect(staged?.status).toBe('committed');

    const updatedOnDisk = await safeReadFile(targetFile);
    expect(updatedOnDisk).toContain('app.post("/login", handleLogin);');

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    await client.close();
    await server.close();
  });

  it('injects agent rules templates into target workspace', async () => {
    const tempDir = join(tmpdir(), `ratio-rules-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const result = await injectAgentRules(tempDir);
    expect(await fileExists(result.claudeMdPath)).toBe(true);
    expect(await fileExists(result.cursorRulesPath)).toBe(true);
    expect(await fileExists(result.openCodeRulesPath)).toBe(true);

    const claudeContent = await safeReadFile(result.claudeMdPath);
    expect(claudeContent).toContain('ratio_write_file');
    expect(claudeContent).toContain('checkpoint_required');

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
