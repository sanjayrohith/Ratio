import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeInit } from '../../src/cli/commands/init.js';
import { createProgram } from '../../src/cli/index.js';
import { loadRatioConfig } from '../../src/core/config/schema.js';
import { createDatabase, closeDatabase } from '../../src/storage/db.js';
import { getAppliedMigrations } from '../../src/storage/migrations/index.js';
import { RATIO_DIR_NAME, LEDGER_DB_NAME } from '../../src/storage/workspace.js';

describe('Ratio Init End-to-End CLI Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-init-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('bootstraps .ratio directory, valid config, and migrated ledger.db', async () => {
    const result = await executeInit({ cwd: tempDir });

    expect(result.success).toBe(true);
    expect(result.configCreated).toBe(true);
    expect(existsSync(result.ratioDir)).toBe(true);
    expect(existsSync(result.configPath)).toBe(true);
    expect(existsSync(result.dbPath)).toBe(true);

    // Verify config schema validity
    const config = await loadRatioConfig(tempDir);
    expect(config.version).toBe('1.0.0');
    expect(config.thresholds.maxTotalLinesChanged).toBeGreaterThan(0);
    expect(config.thresholds.maxLinesAdded).toBeGreaterThan(0);

    // Verify SQLite ledger and migrations
    const db = createDatabase(result.dbPath);
    try {
      const migrations = getAppliedMigrations(db);
      expect(migrations.length).toBeGreaterThanOrEqual(2);

      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table';")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map((t) => t.name));

      expect(tableNames.has('checkpoints')).toBe(true);
      expect(tableNames.has('trust_scores')).toBe(true);
      expect(tableNames.has('interceptions')).toBe(true);
      expect(tableNames.has('sessions')).toBe(true);
    } finally {
      closeDatabase(db);
    }
  });

  it('preserves existing config unless --force is specified', async () => {
    // First run
    const first = await executeInit({ cwd: tempDir });
    expect(first.configCreated).toBe(true);

    // Custom change to config
    const configPath = join(tempDir, 'ratio.config.json');
    const customConfig = JSON.stringify({ version: '1.0.0', thresholds: { maxLinesAdded: 999 } });
    writeFileSync(configPath, customConfig, 'utf-8');

    // Second run without force
    const second = await executeInit({ cwd: tempDir, force: false });
    expect(second.configCreated).toBe(false);
    expect(readFileSync(configPath, 'utf-8')).toBe(customConfig);

    // Third run with force
    const third = await executeInit({ cwd: tempDir, force: true });
    expect(third.configCreated).toBe(true);
    const reloaded = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(reloaded.thresholds.maxLinesAdded).not.toBe(999);
  });

  it('configures claude code MCP integration and guidelines when requested', async () => {
    const result = await executeInit({ cwd: tempDir, client: 'claude' });
    expect(result.configuredClients).toContain('Claude Code');

    const claudeMcpPath = join(tempDir, '.claude', 'mcp.json');
    expect(existsSync(claudeMcpPath)).toBe(true);
    const claudeMcp = JSON.parse(readFileSync(claudeMcpPath, 'utf-8'));
    expect(claudeMcp.mcpServers.ratio).toBeDefined();

    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    expect(existsSync(claudeMdPath)).toBe(true);
    const claudeMd = readFileSync(claudeMdPath, 'utf-8');
    expect(claudeMd).toContain('ratio_write_file');
  });

  it('configures all agent integrations (claude, cursor, opencode) when client=all', async () => {
    const result = await executeInit({ cwd: tempDir, client: 'all' });
    expect(result.configuredClients).toContain('Claude Code');
    expect(result.configuredClients).toContain('Cursor');
    expect(result.configuredClients).toContain('opencode');

    // Claude
    expect(existsSync(join(tempDir, '.claude', 'mcp.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true);

    // Cursor
    expect(existsSync(join(tempDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursorrules'))).toBe(true);

    // opencode
    expect(existsSync(join(tempDir, 'opencode.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'opencode-rules.md'))).toBe(true);
  });

  it('executes ratio init command via commander program CLI dispatching', async () => {
    process.chdir(tempDir);
    const program = createProgram();
    program.exitOverride(); // Prevent process.exit in tests

    await program.parseAsync(['node', 'ratio', 'init', '--client', 'claude']);

    expect(existsSync(join(tempDir, RATIO_DIR_NAME))).toBe(true);
    expect(existsSync(join(tempDir, 'ratio.config.json'))).toBe(true);
    expect(existsSync(join(tempDir, RATIO_DIR_NAME, LEDGER_DB_NAME))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'mcp.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true);
  });
});
