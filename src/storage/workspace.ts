import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { createDatabase } from './db.js';
import { runMigrations } from './migrations/index.js';

export const RATIO_DIR_NAME = '.ratio';
export const LEDGER_DB_NAME = 'ledger.db';

export interface WorkspaceContext {
  rootDir: string;
  ratioDir: string;
  dbPath: string;
}

/**
 * Traverses parent directories starting from `startDir` looking for marker indicators
 * of a project root (e.g. .git, ratio.config.json, package.json, Cargo.toml, pyproject.toml, go.mod).
 * Defaults to startDir if no marker is found before filesystem root.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  const root = dirname(current);

  const markers = [
    RATIO_DIR_NAME,
    '.git',
    'ratio.config.json',
    'package.json',
    'Cargo.toml',
    'pyproject.toml',
    'go.mod',
  ];

  while (true) {
    for (const marker of markers) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      break; // Reached filesystem root
    }
    current = parent;
  }

  return resolve(startDir);
}

/**
 * Ensures the repository-scoped `.ratio` directory exists in the workspace.
 */
export function ensureRatioDirectory(projectRoot: string): string {
  const ratioDir = join(projectRoot, RATIO_DIR_NAME);
  if (!existsSync(ratioDir)) {
    mkdirSync(ratioDir, { recursive: true });
  }
  return ratioDir;
}

/**
 * Returns full paths for the workspace root, `.ratio` directory, and SQLite ledger database.
 */
export function getWorkspaceContext(startDir?: string): WorkspaceContext {
  const rootDir = findProjectRoot(startDir);
  const ratioDir = join(rootDir, RATIO_DIR_NAME);
  const dbPath = join(ratioDir, LEDGER_DB_NAME);

  return {
    rootDir,
    ratioDir,
    dbPath,
  };
}

/**
 * Initializes the workspace `.ratio/` directory and returns a fully-migrated
 * SQLite connection to the repo-scoped `ledger.db`.
 */
export function initializeWorkspaceDatabase(startDir?: string): {
  db: Database;
  context: WorkspaceContext;
} {
  const context = getWorkspaceContext(startDir);
  ensureRatioDirectory(context.rootDir);

  const db = createDatabase(context.dbPath);
  runMigrations(db);

  return { db, context };
}
