import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ensureRatioDirectory,
  initializeWorkspaceDatabase,
  RATIO_DIR_NAME,
  LEDGER_DB_NAME,
} from '../../storage/workspace.js';
import { closeDatabase } from '../../storage/db.js';
import { generateDefaultConfigJson } from '../../core/config/schema.js';
import { updateClaudeConfig } from '../configurators/claude.js';
import { updateCursorConfig } from '../configurators/cursor.js';
import { updateOpenCodeConfig } from '../configurators/opencode.js';
import { injectAllGuidelines, injectClaudeGuidelines } from '../configurators/guidelines.js';

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  yes?: boolean;
  client?: 'claude' | 'cursor' | 'opencode' | 'all' | 'none' | string;
  verbose?: boolean;
}

export interface InitResult {
  success: boolean;
  rootDir: string;
  ratioDir: string;
  configPath: string;
  dbPath: string;
  configCreated: boolean;
  configuredClients: string[];
}

/**
 * Executes ratio init:
 * 1. Creates workspace .ratio/ directory.
 * 2. Generates default ratio.config.json if not present.
 * 3. Initializes repository ledger SQLite database and runs all migrations.
 * 4. Optionally registers MCP server configurations and injects agent guidelines.
 */
export async function executeInit(options: InitOptions = {}): Promise<InitResult> {
  const rootDir = resolve(options.cwd ?? process.cwd());
  const ratioDir = join(rootDir, RATIO_DIR_NAME);
  const configPath = join(rootDir, 'ratio.config.json');
  const dbPath = join(ratioDir, LEDGER_DB_NAME);
  const configuredClients: string[] = [];

  // 1. Ensure .ratio directory exists
  ensureRatioDirectory(rootDir);

  // 2. Generate default ratio.config.json
  let configCreated = false;
  if (!existsSync(configPath) || options.force) {
    writeFileSync(configPath, generateDefaultConfigJson(), 'utf-8');
    configCreated = true;
  }

  // 3. Initialize SQLite ledger and run migrations
  const { db } = initializeWorkspaceDatabase(rootDir);
  closeDatabase(db);

  // 4. Configure coding agent integrations if requested
  const client = (options.client ?? 'none').toLowerCase();
  if (client === 'claude') {
    await updateClaudeConfig(rootDir);
    await injectClaudeGuidelines(rootDir);
    configuredClients.push('Claude Code');
  } else if (client === 'cursor') {
    await updateCursorConfig(rootDir);
    configuredClients.push('Cursor');
  } else if (client === 'opencode') {
    await updateOpenCodeConfig(rootDir);
    configuredClients.push('opencode');
  } else if (client === 'all') {
    await updateClaudeConfig(rootDir);
    await updateCursorConfig(rootDir);
    await updateOpenCodeConfig(rootDir);
    await injectAllGuidelines(rootDir);
    configuredClients.push('Claude Code', 'Cursor', 'opencode');
  }

  if (options.verbose) {
    console.log(`[ratio:init] Initialized workspace at ${rootDir}`);
    console.log(`[ratio:init] Created config at ${configPath}`);
    console.log(`[ratio:init] Initialized SQLite ledger at ${dbPath}`);
    if (configuredClients.length > 0) {
      console.log(`[ratio:init] Configured clients: ${configuredClients.join(', ')}`);
    }
  }

  return {
    success: true,
    rootDir,
    ratioDir,
    configPath,
    dbPath,
    configCreated,
    configuredClients,
  };
}
