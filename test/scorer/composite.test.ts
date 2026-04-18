import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompositeScorer } from '../../src/core/scorer/composite.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';
import { LayerTagger } from '../../src/core/scorer/layers.js';
import { LayerTransitionDetector } from '../../src/core/scorer/transitions.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { createRatioServer } from '../../src/server/index.js';
import { fileExists, safeReadFile } from '../../src/storage/fs.js';
import type { CheckpointResponse, WritePermittedResponse } from '../../src/types/protocol.js';

describe('Composite Complexity Scorer Integration Tests', () => {
  it('allows single-layer small diffs to pass through transparently without triggering checkpoints', () => {
    const scorer = new CompositeScorer();

    const original = `export function getStatus() { return "ok"; }\n`;
    const proposed = `export function getStatus() { return "healthy"; }\n`;

    const evaluation = scorer.evaluate({
      filePath: 'src/routes/health.ts',
      originalContent: original,
      proposedContent: proposed,
      turnFiles: ['src/routes/health.ts'],
    });

    expect(evaluation.exceedsThreshold).toBe(false);
    expect(evaluation.triggers).toHaveLength(0);
    expect(evaluation.riskScore).toBeLessThan(45);
    expect(evaluation.riskLevel).toBe('low');
    expect(evaluation.layerTransitions.isMultiLayer).toBe(false);
    expect(evaluation.layers).toEqual(['api']);
  });

  it('triggers checkpoint when a change crosses architectural layer boundaries in the same turn', () => {
    const tagger = new LayerTagger();
    const transitionDetector = new LayerTransitionDetector(tagger);
    const scorer = new CompositeScorer({}, tagger, transitionDetector);

    // Turn touched both a DB migration and an API route
    const turnFiles = [
      'migrations/001_create_posts_table.sql',
      'src/routes/posts.ts',
    ];

    const evaluation = scorer.evaluate({
      filePath: 'src/routes/posts.ts',
      originalContent: '',
      proposedContent: 'export const getPosts = () => [];\n',
      turnFiles,
    });

    expect(evaluation.exceedsThreshold).toBe(true);
    expect(evaluation.layerTransitions.isMultiLayer).toBe(true);
    expect(evaluation.layerTransitions.layersTouched).toContain('db');
    expect(evaluation.layerTransitions.layersTouched).toContain('api');
    expect(evaluation.primaryConcept).toBe('MULTI_LAYER_CROSSING');
    expect(evaluation.suggestedQuestion).toContain('multiple architectural layers');
  });

  it('evaluates critical risk when touching multiple sensitive layers (auth + db + api)', () => {
    const tagger = new LayerTagger();
    const transitionDetector = new LayerTransitionDetector(tagger);
    const scorer = new CompositeScorer({}, tagger, transitionDetector);

    const turnFiles = [
      'prisma/schema.prisma', // db
      'src/middleware/auth.ts', // auth
      'src/routes/login.ts', // api + auth
    ];

    const evaluation = scorer.evaluate({
      filePath: 'src/middleware/auth.ts',
      originalContent: '',
      proposedContent: Array(20).fill('// auth middleware line').join('\n'),
      turnFiles,
    });

    expect(evaluation.exceedsThreshold).toBe(true);
    expect(evaluation.riskLevel).toBe('critical');
    expect(evaluation.triggers.some((t) => t.includes('layer boundaries'))).toBe(true);
  });

  it('triggers checkpoint when new third-party dependency is introduced regardless of line count', () => {
    const scorer = new CompositeScorer();

    const origPkg = JSON.stringify({ dependencies: { express: '^4.18.0' } }, null, 2);
    const propPkg = JSON.stringify(
      { dependencies: { express: '^4.18.0', jsonwebtoken: '^9.0.0' } },
      null,
      2
    );

    const evaluation = scorer.evaluate({
      filePath: 'package.json',
      originalContent: origPkg,
      proposedContent: propPkg,
    });

    expect(evaluation.exceedsThreshold).toBe(true);
    expect(evaluation.dependencyDiff?.hasNewDependencies).toBe(true);
    expect(evaluation.dependencyDiff?.addedPackages).toContain('jsonwebtoken');
    expect(evaluation.primaryConcept).toBe('DEPENDENCY_ADDITION');
  });

  it('integrates with MCP server: auto-approves small single-layer edit and flags multi-layer write', async () => {
    const tempDir = join(tmpdir(), `ratio-composite-mcp-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const stagingBuffer = new StagingBuffer();
    const transitionDetector = new LayerTransitionDetector();
    const complexityScorer = new ComplexityScorer(
      { maxLinesAdded: 50, maxTotalLinesChanged: 60 },
      undefined,
      transitionDetector
    );

    const server = createRatioServer(stagingBuffer, complexityScorer);
    const client = new Client(
      { name: 'integration-test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Call 1: Small single-layer UI edit (2 lines) -> Auto-approved write_permitted
    const uiFile = join(tempDir, 'components', 'Button.tsx');
    const call1Result = await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: uiFile,
        content: 'export const Button = () => <button>Click</button>;\n',
        rationale: 'Add simple button component',
      },
    });

    const call1Content = call1Result.content as Array<{ type: string; text: string }>;
    const call1Json: WritePermittedResponse = JSON.parse(call1Content[0].text);

    expect(call1Json.status).toBe('write_permitted');
    expect(await fileExists(uiFile)).toBe(true);
    expect(stagingBuffer.listPending()).toHaveLength(0); // Nothing staged!

    // Call 2: DB schema write in the same turn
    const dbFile = join(tempDir, 'db', 'schema.sql');
    await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: dbFile,
        content: 'CREATE TABLE orders (id INT PRIMARY KEY);\n',
        rationale: 'Add orders table',
      },
    });

    // Call 3: API route in the same turn -> Crosses layer boundaries (UI + DB + API)
    const apiFile = join(tempDir, 'routes', 'orders.ts');
    const call3Result = await client.callTool({
      name: 'ratio_write_file',
      arguments: {
        path: apiFile,
        content: 'export const getOrders = () => [];\n',
        rationale: 'Add orders route',
      },
    });

    const call3Content = call3Result.content as Array<{ type: string; text: string }>;
    const call3Json: CheckpointResponse = JSON.parse(call3Content[0].text);

    expect(call3Json.status).toBe('checkpoint_required');
    expect(call3Json.concept).toBe('MULTI_LAYER_CHANGE');
    expect(call3Json.ticketId).toMatch(/^chk_/);

    // apiFile must not exist on disk yet
    expect(await fileExists(apiFile)).toBe(false);

    // Staging buffer retains the pending write
    expect(stagingBuffer.get(call3Json.ticketId)?.file).toBe(apiFile);

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    await client.close();
    await server.close();
  });
});
