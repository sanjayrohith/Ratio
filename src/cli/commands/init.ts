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

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  yes?: boolean;
  client?: 'claude' | 'cursor' | 'opencode' | 'all' | string;
  verbose?: boolean;
}

export interface InitResult {
  success: boolean;
  rootDir: string;
  ratioDir: string;
  configPath: string;
  dbPath: string;
  configCreated: boolean;
}

/**
 * Executes ratio init:
 * 1. Creates workspace .ratio/ directory.
 * 2. Generates default ratio.config.json if not present.
 * 3. Initializes repository ledger SQLite database and runs all migrations.
 */
export async function executeInit(options: InitOptions = {}): Promise<InitResult> {
  const rootDir = resolve(options.cwd ?? process.cwd());
  const ratioDir = join(rootDir, RATIO_DIR_NAME);
  const configPath = join(rootDir, 'ratio.config.json');
  const dbPath = join(ratioDir, LEDGER_DB_NAME);

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

  if (options.verbose) {
    console.log(`[ratio:init] Initialized workspace at ${rootDir}`);
    console.log(`[ratio:init] Created config at ${configPath}`);
    console.log(`[ratio:init] Initialized SQLite ledger at ${dbPath}`);
  }

  return {
    success: true,
    rootDir,
    ratioDir,
    configPath,
    dbPath,
    configCreated,
  };
}
