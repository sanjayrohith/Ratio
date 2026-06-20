import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('Standalone Distribution Binary Smoke Tests', () => {
  const tempSuiteDir = join(process.cwd(), 'dist', 'smoke-test');
  const binaryPath = join(tempSuiteDir, 'ratio');
  const serverBinaryPath = join(tempSuiteDir, 'ratio-server');

  beforeAll(() => {
    mkdirSync(tempSuiteDir, { recursive: true });

    // 1. Compile standalone CLI binary
    const buildCli = spawnSync(
      'bun',
      ['build', '--compile', './src/cli/index.ts', '--outfile', binaryPath],
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(buildCli.status).toBe(0);
    expect(existsSync(binaryPath)).toBe(true);

    // 2. Compile standalone server binary
    const buildServer = spawnSync(
      'bun',
      ['build', '--compile', './src/server/index.ts', '--outfile', serverBinaryPath],
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(buildServer.status).toBe(0);
    expect(existsSync(serverBinaryPath)).toBe(true);
  });

  afterAll(() => {
    try {
      rmSync(tempSuiteDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('CLI Binary Execution', () => {
    it('executes --version and returns version string', () => {
      const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    it('executes --help and displays usage overview', () => {
      const result = spawnSync(binaryPath, ['--help'], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: ratio');
      expect(result.stdout).toContain('A Socratic Interceptor for AI Coding Agents');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('doctor');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('log');
      expect(result.stdout).toContain('report');
    });

    it('bootstraps repository via ratio init in fresh directory', () => {
      const projectDir = join(tempSuiteDir, 'test-project');
      mkdirSync(projectDir, { recursive: true });
      const initRes = spawnSync(binaryPath, ['init', '--yes'], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      expect(initRes.status).toBe(0);
      expect(existsSync(join(projectDir, '.ratio', 'ledger.db'))).toBe(true);
      expect(existsSync(join(projectDir, 'ratio.config.json'))).toBe(true);

      // Verify status on freshly initialized workspace
      const statusRes = spawnSync(binaryPath, ['status'], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      expect(statusRes.status).toBe(0);
      expect(statusRes.stdout).toContain('Ratio Repository Status');
      expect(statusRes.stdout).toContain('Total Checkpoints:  0');

      // Verify report generation on fresh workspace
      const reportRes = spawnSync(binaryPath, ['report', '--stdout'], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      expect(reportRes.status).toBe(0);
      expect(reportRes.stdout).toContain('Ratio Portfolio Audit');
      expect(reportRes.stdout).toContain('Viva Readiness Score');
    });
  });

  describe('MCP Standalone Server Binary Handshake & Dispatch', () => {
    it('initializes MCP session over stdio and responds to tools/list', () => {
      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'smoke-test-client', version: '1.0.0' },
        },
      });

      const listToolsRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      const input = `${initRequest}\n${listToolsRequest}\n`;

      const mcpProcess = spawnSync(serverBinaryPath, [], {
        input,
        encoding: 'utf-8',
        timeout: 10000,
      });

      expect(mcpProcess.status).toBe(0);
      const lines = mcpProcess.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      expect(lines.length).toBeGreaterThanOrEqual(2);

      const initResponse = JSON.parse(lines[0]);
      expect(initResponse.id).toBe(1);
      expect(initResponse.result.serverInfo.name).toBe('ratio');

      const toolsResponse = JSON.parse(lines[1]);
      expect(toolsResponse.id).toBe(2);
      expect(toolsResponse.result.tools).toBeArray();

      const toolNames = toolsResponse.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('ratio_write_file');
      expect(toolNames).toContain('ratio_edit_file');
      expect(toolNames).toContain('ratio_submit_answer');
    });
  });
});
