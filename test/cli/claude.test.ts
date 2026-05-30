import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateClaudeConfig, resolveClaudeConfigPath } from '../../src/cli/configurators/claude.js';

describe('Claude Code MCP Configurator Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-claude-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .claude/mcp.json when no claude config exists', async () => {
    const res = await updateClaudeConfig(tempDir);
    expect(res.created).toBe(true);
    expect(res.updated).toBe(true);
    expect(res.path).toBe(join(tempDir, '.claude', 'mcp.json'));
    expect(existsSync(res.path)).toBe(true);

    const parsed = JSON.parse(readFileSync(res.path, 'utf-8'));
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.ratio).toBeDefined();
    expect(parsed.mcpServers.ratio.command).toBe('bun');
  });

  it('updates existing .claude.json while preserving other settings', async () => {
    const claudeJsonPath = join(tempDir, '.claude.json');
    writeFileSync(
      claudeJsonPath,
      JSON.stringify({ model: 'claude-3-7-sonnet', mcpServers: { other: { command: 'node' } } }),
      'utf-8'
    );

    const res = await updateClaudeConfig(tempDir);
    expect(res.created).toBe(false);
    expect(res.path).toBe(claudeJsonPath);

    const parsed = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'));
    expect(parsed.model).toBe('claude-3-7-sonnet');
    expect(parsed.mcpServers.other).toBeDefined();
    expect(parsed.mcpServers.ratio).toBeDefined();
  });

  it('respects custom server path options', async () => {
    const res = await updateClaudeConfig(tempDir, { serverPath: '/custom/path/server.ts' });
    const parsed = JSON.parse(readFileSync(res.path, 'utf-8'));
    expect(parsed.mcpServers.ratio.args).toEqual(['run', '/custom/path/server.ts']);
  });
});
