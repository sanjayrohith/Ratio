import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeDoctor } from '../../src/cli/commands/doctor.js';
import { executeInit } from '../../src/cli/commands/init.js';
import { injectClaudeGuidelines } from '../../src/cli/configurators/guidelines.js';
import { updateCursorConfig } from '../../src/cli/configurators/cursor.js';
import { updateOpenCodeConfig } from '../../src/cli/configurators/opencode.js';

describe('Ratio Doctor Diagnostics Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-doctor-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports warnings for uninitialized directory but remains non-failing', async () => {
    const report = await executeDoctor({ cwd: tempDir });

    expect(report.checks.length).toBe(6);
    expect(report.healthy).toBe(true);

    const bunCheck = report.checks.find((c) => c.id === 'runtime_bun');
    expect(bunCheck).toBeDefined();
    expect(bunCheck?.status).toBe('ok');

    const fsCheck = report.checks.find((c) => c.id === 'fs_permissions');
    expect(fsCheck?.status).toBe('ok');

    const dirCheck = report.checks.find((c) => c.id === 'workspace_ratio_dir');
    expect(dirCheck?.status).toBe('warn');

    const configCheck = report.checks.find((c) => c.id === 'config_schema');
    expect(configCheck?.status).toBe('warn');

    const dbCheck = report.checks.find((c) => c.id === 'sqlite_ledger');
    expect(dbCheck?.status).toBe('warn');

    const agentCheck = report.checks.find((c) => c.id === 'agent_configurations');
    expect(agentCheck?.status).toBe('warn');
  });

  it('reports all ok for fully initialized workspace with agent integrations', async () => {
    await executeInit({ cwd: tempDir });
    await injectClaudeGuidelines(tempDir);

    const report = await executeDoctor({ cwd: tempDir });
    expect(report.healthy).toBe(true);
    expect(report.summary.failures).toBe(0);

    const passedIds = report.checks.filter((c) => c.status === 'ok').map((c) => c.id);
    expect(passedIds).toContain('runtime_bun');
    expect(passedIds).toContain('fs_permissions');
    expect(passedIds).toContain('workspace_ratio_dir');
    expect(passedIds).toContain('config_schema');
    expect(passedIds).toContain('sqlite_ledger');
    expect(passedIds).toContain('agent_configurations');
  });

  it('flags corrupted ratio.config.json as failure', async () => {
    await executeInit({ cwd: tempDir });
    const configPath = join(tempDir, 'ratio.config.json');
    writeFileSync(configPath, '{ invalid-json', 'utf-8');

    const report = await executeDoctor({ cwd: tempDir });
    expect(report.healthy).toBe(false);
    expect(report.summary.failures).toBeGreaterThanOrEqual(1);

    const configCheck = report.checks.find((c) => c.id === 'config_schema');
    expect(configCheck?.status).toBe('fail');
    expect(configCheck?.message).toContain('invalid');
  });

  it('detects cursor and opencode integrations in agent check', async () => {
    await executeInit({ cwd: tempDir });
    await updateCursorConfig(tempDir);
    await updateOpenCodeConfig(tempDir);

    const report = await executeDoctor({ cwd: tempDir });
    const agentCheck = report.checks.find((c) => c.id === 'agent_configurations');
    expect(agentCheck?.status).toBe('ok');
    expect(agentCheck?.message).toContain('Cursor');
    expect(agentCheck?.message).toContain('opencode');
  });
});
