import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import {
  findProjectRoot,
  getWorkspaceContext,
  RATIO_DIR_NAME,
  LEDGER_DB_NAME,
} from '../../storage/workspace.js';
import { loadRatioConfig } from '../../core/config/schema.js';
import { closeDatabase, createDatabase } from '../../storage/db.js';
import { getAppliedMigrations } from '../../storage/migrations/index.js';
import { resolveClaudeConfigPath } from '../configurators/claude.js';
import { getCursorConfigPath } from '../configurators/cursor.js';
import { resolveOpenCodeConfigPath } from '../configurators/opencode.js';

export interface DiagnosticCheck {
  id: string;
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  details?: Record<string, any>;
}

export interface DoctorReport {
  healthy: boolean;
  checks: DiagnosticCheck[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

export interface DoctorOptions {
  cwd?: string;
  verbose?: boolean;
}

/**
 * Runs system and workspace diagnostics for Ratio.
 */
export async function executeDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const rootDir = resolve(options.cwd ?? process.cwd());
  const checks: DiagnosticCheck[] = [];

  // 1. Bun runtime presence and version
  const bunVersion = (process.versions as any).bun;
  if (bunVersion) {
    checks.push({
      id: 'runtime_bun',
      name: 'Bun Runtime',
      status: 'ok',
      message: `Bun v${bunVersion} is running on ${process.platform}-${process.arch}`,
      details: { version: bunVersion, platform: process.platform, arch: process.arch },
    });
  } else {
    checks.push({
      id: 'runtime_bun',
      name: 'Bun Runtime',
      status: 'warn',
      message: 'Node.js runtime detected instead of native Bun executable',
    });
  }

  // 2. Filesystem write permissions
  const probeFile = join(rootDir, `.ratio-probe-${Date.now()}.tmp`);
  try {
    writeFileSync(probeFile, 'ratio-probe', 'utf-8');
    unlinkSync(probeFile);
    checks.push({
      id: 'fs_permissions',
      name: 'Filesystem Permissions',
      status: 'ok',
      message: 'Workspace directory is writable',
      details: { path: rootDir },
    });
  } catch (err: any) {
    checks.push({
      id: 'fs_permissions',
      name: 'Filesystem Permissions',
      status: 'fail',
      message: `Workspace directory write failed: ${err.message}`,
    });
  }

  // 3. .ratio directory presence
  const ratioDir = join(rootDir, RATIO_DIR_NAME);
  if (existsSync(ratioDir)) {
    checks.push({
      id: 'workspace_ratio_dir',
      name: 'Workspace Directory',
      status: 'ok',
      message: `.ratio directory found at ${ratioDir}`,
    });
  } else {
    checks.push({
      id: 'workspace_ratio_dir',
      name: 'Workspace Directory',
      status: 'warn',
      message: '.ratio directory missing. Run "ratio init" to bootstrap.',
    });
  }

  // 4. ratio.config.json validation
  const configPath = join(rootDir, 'ratio.config.json');
  if (existsSync(configPath)) {
    try {
      const config = await loadRatioConfig(rootDir);
      checks.push({
        id: 'config_schema',
        name: 'Configuration File',
        status: 'ok',
        message: 'ratio.config.json is present and schema-valid',
        details: { version: config.version, thresholds: config.thresholds },
      });
    } catch (err: any) {
      checks.push({
        id: 'config_schema',
        name: 'Configuration File',
        status: 'fail',
        message: `ratio.config.json invalid: ${err.message}`,
      });
    }
  } else {
    checks.push({
      id: 'config_schema',
      name: 'Configuration File',
      status: 'warn',
      message: 'ratio.config.json not found. Defaults will be used.',
    });
  }

  // 5. SQLite Ledger Database Health
  const dbPath = join(ratioDir, LEDGER_DB_NAME);
  if (existsSync(dbPath)) {
    let db: Database | null = null;
    try {
      db = createDatabase(dbPath);
      const integrity = db.query('PRAGMA integrity_check;').get() as { integrity_check?: string };
      const isIntegrityOk = integrity?.integrity_check === 'ok';

      const migrations = getAppliedMigrations(db);
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table';")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map((t) => t.name));

      const requiredTables = ['checkpoints', 'trust_scores', 'interceptions', 'sessions'];
      const missingTables = requiredTables.filter((t) => !tableNames.has(t));

      if (isIntegrityOk && missingTables.length === 0) {
        checks.push({
          id: 'sqlite_ledger',
          name: 'SQLite Ledger Database',
          status: 'ok',
          message: `Ledger database is healthy (${migrations.length} migrations applied)`,
          details: { appliedMigrations: migrations.length, tables: Array.from(tableNames) },
        });
      } else {
        checks.push({
          id: 'sqlite_ledger',
          name: 'SQLite Ledger Database',
          status: 'warn',
          message: `Ledger issues detected. Integrity: ${integrity?.integrity_check}, Missing tables: ${missingTables.join(', ')}`,
        });
      }
    } catch (err: any) {
      checks.push({
        id: 'sqlite_ledger',
        name: 'SQLite Ledger Database',
        status: 'fail',
        message: `Failed to inspect SQLite database: ${err.message}`,
      });
    } finally {
      if (db) closeDatabase(db);
    }
  } else {
    checks.push({
      id: 'sqlite_ledger',
      name: 'SQLite Ledger Database',
      status: 'warn',
      message: `ledger.db not found at ${dbPath}. Run "ratio init" to create.`,
    });
  }

  // 6. Agent Configuration Status
  const claudeConfig = resolveClaudeConfigPath(rootDir);
  let claudeHasRatio = false;
  if (claudeConfig.exists) {
    try {
      const parsed = JSON.parse(readFileSync(claudeConfig.path, 'utf-8'));
      claudeHasRatio = Boolean(parsed.mcpServers?.ratio);
    } catch {
      // Ignored
    }
  }

  const cursorConfig = getCursorConfigPath(rootDir);
  let cursorHasRatio = false;
  if (existsSync(cursorConfig)) {
    try {
      const parsed = JSON.parse(readFileSync(cursorConfig, 'utf-8'));
      cursorHasRatio = Boolean(parsed.mcpServers?.ratio);
    } catch {
      // Ignored
    }
  }

  const opencodeConfig = resolveOpenCodeConfigPath(rootDir);
  let opencodeHasRatio = false;
  if (opencodeConfig.exists) {
    try {
      const parsed = JSON.parse(readFileSync(opencodeConfig.path, 'utf-8'));
      opencodeHasRatio = Boolean(parsed.mcpServers?.ratio);
    } catch {
      // Ignored
    }
  }

  const claudeMdPath = join(rootDir, 'CLAUDE.md');
  const hasClaudeMd = existsSync(claudeMdPath) && readFileSync(claudeMdPath, 'utf-8').includes('ratio_write_file');

  const cursorRulesPath = join(rootDir, '.cursorrules');
  const hasCursorRules = existsSync(cursorRulesPath) && readFileSync(cursorRulesPath, 'utf-8').includes('ratio_write_file');

  const opencodeRulesPath = join(rootDir, 'opencode-rules.md');
  const hasOpencodeRules = existsSync(opencodeRulesPath) && readFileSync(opencodeRulesPath, 'utf-8').includes('ratio_write_file');

  const registeredClients: string[] = [];
  if (claudeHasRatio) registeredClients.push('Claude Code');
  if (cursorHasRatio) registeredClients.push('Cursor');
  if (opencodeHasRatio) registeredClients.push('opencode');
  if (hasClaudeMd) registeredClients.push('CLAUDE.md');
  if (hasCursorRules) registeredClients.push('.cursorrules');
  if (hasOpencodeRules) registeredClients.push('opencode-rules.md');

  if (registeredClients.length > 0) {
    checks.push({
      id: 'agent_configurations',
      name: 'Coding Agent Integrations',
      status: 'ok',
      message: `Detected active integrations: ${registeredClients.join(', ')}`,
      details: {
        claude: claudeHasRatio,
        cursor: cursorHasRatio,
        opencode: opencodeHasRatio,
        claudeMd: hasClaudeMd,
        cursorRules: hasCursorRules,
        opencodeRules: hasOpencodeRules,
      },
    });
  } else {
    checks.push({
      id: 'agent_configurations',
      name: 'Coding Agent Integrations',
      status: 'warn',
      message: 'No coding agent configurations detected (Claude Code, Cursor, or opencode).',
    });
  }

  const passed = checks.filter((c) => c.status === 'ok').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const failures = checks.filter((c) => c.status === 'fail').length;

  return {
    healthy: failures === 0,
    checks,
    summary: {
      total: checks.length,
      passed,
      warnings,
      failures,
    },
  };
}
