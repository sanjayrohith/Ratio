import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateCursorConfig, getCursorConfigPath } from '../../src/cli/configurators/cursor.js';
import { updateOpenCodeConfig, resolveOpenCodeConfigPath } from '../../src/cli/configurators/opencode.js';

describe('Cursor and opencode MCP Configurators Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-configurators-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Cursor Configurator', () => {
    it('creates .cursor/mcp.json and registers ratio server', async () => {
      const res = await updateCursorConfig(tempDir);
      expect(res.created).toBe(true);
      expect(res.path).toBe(join(tempDir, '.cursor', 'mcp.json'));
      expect(existsSync(res.path)).toBe(true);

      const parsed = JSON.parse(readFileSync(res.path, 'utf-8'));
      expect(parsed.mcpServers.ratio).toBeDefined();
      expect(parsed.mcpServers.ratio.command).toBe('bun');
    });

    it('updates existing .cursor/mcp.json preserving existing servers', async () => {
      const cursorConfig = getCursorConfigPath(tempDir);
      await updateCursorConfig(tempDir);

      // Add a third-party server
      const parsedBefore = JSON.parse(readFileSync(cursorConfig, 'utf-8'));
      parsedBefore.mcpServers.sqlite = { command: 'uvx', args: ['mcp-server-sqlite'] };
      writeFileSync(cursorConfig, JSON.stringify(parsedBefore), 'utf-8');

      // Re-run update
      const res = await updateCursorConfig(tempDir, { serverPath: '/path/to/server.ts' });
      expect(res.created).toBe(false);

      const parsedAfter = JSON.parse(readFileSync(cursorConfig, 'utf-8'));
      expect(parsedAfter.mcpServers.sqlite).toBeDefined();
      expect(parsedAfter.mcpServers.ratio.args).toEqual(['run', '/path/to/server.ts']);
    });
  });

  describe('opencode Configurator', () => {
    it('creates opencode.json when no existing config is present', async () => {
      const res = await updateOpenCodeConfig(tempDir);
      expect(res.created).toBe(true);
      expect(res.path).toBe(join(tempDir, 'opencode.json'));
      expect(existsSync(res.path)).toBe(true);

      const parsed = JSON.parse(readFileSync(res.path, 'utf-8'));
      expect(parsed.mcpServers.ratio).toBeDefined();
      expect(parsed.mcpServers.ratio.command).toBe('bun');
    });

    it('updates existing .opencode/mcp.json if already present', async () => {
      const dotOpencodePath = join(tempDir, '.opencode', 'mcp.json');
      const res1 = resolveOpenCodeConfigPath(tempDir);
      expect(res1.exists).toBe(false);

      // Create .opencode/mcp.json first
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(tempDir, '.opencode'), { recursive: true });
      writeFileSync(dotOpencodePath, JSON.stringify({ mcpServers: {} }), 'utf-8');

      const res = await updateOpenCodeConfig(tempDir);
      expect(res.path).toBe(dotOpencodePath);
      expect(res.created).toBe(false);

      const parsed = JSON.parse(readFileSync(dotOpencodePath, 'utf-8'));
      expect(parsed.mcpServers.ratio).toBeDefined();
    });
  });
});
