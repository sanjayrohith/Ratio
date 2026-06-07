import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Database } from 'bun:sqlite';
import { getWorkspaceContext } from '../../storage/workspace.js';
import { createDatabase, closeDatabase } from '../../storage/db.js';
import { loadRatioConfig } from '../../core/config/schema.js';
import { pc } from '../ui.js';

export interface ResetOptions {
  cwd?: string;
  file?: string;
  yes?: boolean;
  force?: boolean;
  verbose?: boolean;
}

export interface ResetResult {
  success: boolean;
  cancelled?: boolean;
  rootDir: string;
  filesReset: number;
  error?: string;
}

export interface CleanOptions {
  cwd?: string;
  days?: number;
  all?: boolean;
  yes?: boolean;
  force?: boolean;
  verbose?: boolean;
}

export interface CleanResult {
  success: boolean;
  cancelled?: boolean;
  rootDir: string;
  checkpointsPurged: number;
  interceptionsPurged: number;
  sessionsPurged: number;
  pendingWritesPurged: number;
  error?: string;
}

/**
 * Prompts user for interactive confirmation if running in interactive TTY.
 */
export async function promptConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N]: `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Resets file trust scores back to initial state (1.0, 0 passes, 0 failures).
 */
export async function executeReset(options: ResetOptions = {}): Promise<ResetResult> {
  const context = getWorkspaceContext(options.cwd);
  const rootDir = resolve(options.cwd ?? context.rootDir);
  const dbPath = context.dbPath;

  if (!existsSync(dbPath)) {
    console.error(`Error: Workspace not initialized. Database not found at ${dbPath}`);
    return { success: false, rootDir, filesReset: 0, error: 'Database not found' };
  }

  const bypassConfirm = Boolean(options.yes || options.force);
  if (!bypassConfirm) {
    const targetDesc = options.file ? `trust score for "${options.file}"` : 'all per-file trust scores';
    const confirmed = await promptConfirm(`Are you sure you want to reset ${targetDesc}?`);
    if (!confirmed) {
      console.log('Reset cancelled.');
      return { success: true, cancelled: true, rootDir, filesReset: 0 };
    }
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);
    const config = await loadRatioConfig(rootDir);
    const initialScore = config.trust.initial ?? 1.0;
    const now = new Date().toISOString();

    let filesReset = 0;
    if (options.file) {
      const res = db
        .prepare(`
          UPDATE trust_scores
          SET score = ?, total_passes = 0, total_failures = 0, updated_at = ?
          WHERE file_path = ?
        `)
        .run(initialScore, now, options.file);
      filesReset = res.changes;
      console.log(`${pc.green('✓')} Reset trust score for ${pc.cyan(options.file)} to ${initialScore.toFixed(2)}`);
    } else {
      const res = db
        .prepare(`
          UPDATE trust_scores
          SET score = ?, total_passes = 0, total_failures = 0, updated_at = ?
        `)
        .run(initialScore, now);
      filesReset = res.changes;
      console.log(`${pc.green('✓')} Reset ${filesReset} file trust score(s) to ${initialScore.toFixed(2)}`);
    }

    return {
      success: true,
      rootDir,
      filesReset,
    };
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}

/**
 * Purges historical checkpoint logs, interceptions, and ended sessions from SQLite ledger.
 */
export async function executeClean(options: CleanOptions = {}): Promise<CleanResult> {
  const context = getWorkspaceContext(options.cwd);
  const rootDir = resolve(options.cwd ?? context.rootDir);
  const dbPath = context.dbPath;

  if (!existsSync(dbPath)) {
    console.error(`Error: Workspace not initialized. Database not found at ${dbPath}`);
    return {
      success: false,
      rootDir,
      checkpointsPurged: 0,
      interceptionsPurged: 0,
      sessionsPurged: 0,
      pendingWritesPurged: 0,
      error: 'Database not found',
    };
  }

  const bypassConfirm = Boolean(options.yes || options.force);
  if (!bypassConfirm) {
    const scope = options.all
      ? 'ALL historical logs and sessions'
      : options.days
      ? `logs older than ${options.days} day(s)`
      : 'all checkpoint history';
    const confirmed = await promptConfirm(`Are you sure you want to clean ${scope}?`);
    if (!confirmed) {
      console.log('Clean cancelled.');
      return {
        success: true,
        cancelled: true,
        rootDir,
        checkpointsPurged: 0,
        interceptionsPurged: 0,
        sessionsPurged: 0,
        pendingWritesPurged: 0,
      };
    }
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);

    let cutoffDate: string | null = null;
    if (options.days && options.days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - options.days);
      cutoffDate = d.toISOString();
    }

    let checkpointsPurged = 0;
    let interceptionsPurged = 0;
    let sessionsPurged = 0;
    let pendingWritesPurged = 0;

    if (cutoffDate) {
      checkpointsPurged = db.prepare('DELETE FROM checkpoints WHERE created_at < ?').run(cutoffDate).changes;
      interceptionsPurged = db.prepare('DELETE FROM interceptions WHERE created_at < ?').run(cutoffDate).changes;
      sessionsPurged = db.prepare('DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?').run(cutoffDate).changes;
      pendingWritesPurged = db.prepare("DELETE FROM pending_writes WHERE status != 'PENDING' AND created_at < ?").run(cutoffDate).changes;
    } else {
      checkpointsPurged = db.prepare('DELETE FROM checkpoints').run().changes;
      interceptionsPurged = db.prepare('DELETE FROM interceptions').run().changes;
      sessionsPurged = db.prepare('DELETE FROM sessions').run().changes;
      pendingWritesPurged = db.prepare("DELETE FROM pending_writes WHERE status != 'PENDING'").run().changes;
    }

    // Reclaim disk space
    db.run('VACUUM;');

    console.log(`${pc.green('✓')} Cleaned SQLite ledger:`);
    console.log(`  Purged Checkpoints:    ${pc.bold(String(checkpointsPurged))}`);
    console.log(`  Purged Interceptions:  ${pc.bold(String(interceptionsPurged))}`);
    console.log(`  Purged Sessions:       ${pc.bold(String(sessionsPurged))}`);
    console.log(`  Purged Pending Writes: ${pc.bold(String(pendingWritesPurged))}`);

    return {
      success: true,
      rootDir,
      checkpointsPurged,
      interceptionsPurged,
      sessionsPurged,
      pendingWritesPurged,
    };
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}
