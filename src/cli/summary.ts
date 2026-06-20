import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { getWorkspaceContext } from '../storage/workspace.js';
import { createDatabase, closeDatabase } from '../storage/db.js';
import { TrustScoreRepository } from '../storage/trust-repo.js';
import { pc } from './ui.js';

export interface ActiveTrustScore {
  filePath: string;
  score: number;
}

export interface SessionSummary {
  workspaceRoot: string;
  dbPath: string;
  totalInterceptions: number;
  totalCheckpoints: number;
  checkpointsCleared: number; // passed
  checkpointsFailed: number;
  checkpointsPending: number;
  checkpointsBypassed: number;
  activeTrustScores: ActiveTrustScore[];
}

/**
 * Collects telemetry-free local session metrics from the repository SQLite ledger.
 */
export async function collectSessionSummary(
  workspaceRoot?: string
): Promise<SessionSummary | null> {
  const context = getWorkspaceContext(workspaceRoot);
  const rootDir = resolve(workspaceRoot ?? context.rootDir);
  const dbPath = context.dbPath;

  if (!existsSync(dbPath)) {
    return null;
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);

    let totalInterceptions = 0;
    try {
      const interceptionsRow = db
        .prepare(`SELECT COUNT(*) as count FROM interceptions`)
        .get() as { count: number } | undefined;
      totalInterceptions = interceptionsRow?.count ?? 0;
    } catch {
      totalInterceptions = 0;
    }

    let totalCheckpoints = 0;
    let checkpointsCleared = 0;
    let checkpointsFailed = 0;
    let checkpointsPending = 0;
    let checkpointsBypassed = 0;

    try {
      const checkpointRow = db
        .prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'bypassed' THEN 1 ELSE 0 END) as bypassed
          FROM checkpoints
        `)
        .get() as {
          total: number;
          passed: number | null;
          failed: number | null;
          pending: number | null;
          bypassed: number | null;
        } | undefined;

      if (checkpointRow) {
        totalCheckpoints = checkpointRow.total ?? 0;
        checkpointsCleared = checkpointRow.passed ?? 0;
        checkpointsFailed = checkpointRow.failed ?? 0;
        checkpointsPending = checkpointRow.pending ?? 0;
        checkpointsBypassed = checkpointRow.bypassed ?? 0;
      }
    } catch {
      // Table may not exist
    }

    let activeTrustScores: ActiveTrustScore[] = [];
    try {
      const trustRepo = new TrustScoreRepository(db);
      const trustRecords = trustRepo.listAll();
      activeTrustScores = trustRecords.map((r) => ({
        filePath: r.file_path,
        score: r.score,
      }));
    } catch {
      activeTrustScores = [];
    }

    return {
      workspaceRoot: rootDir,
      dbPath,
      totalInterceptions,
      totalCheckpoints,
      checkpointsCleared,
      checkpointsFailed,
      checkpointsPending,
      checkpointsBypassed,
      activeTrustScores,
    };
  } catch {
    return null;
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}

/**
 * Formats a telemetry-free local metrics summary into a human-readable string.
 */
export function formatSessionSummary(summary: SessionSummary): string {
  const lines: string[] = [];
  lines.push(pc.bold('\nRatio Local Session Summary (telemetry-free):'));
  lines.push(`  Workspace:            ${summary.workspaceRoot}`);
  lines.push(`  Total Interceptions:  ${summary.totalInterceptions}`);

  const passRate =
    summary.totalCheckpoints > 0
      ? ((summary.checkpointsCleared / summary.totalCheckpoints) * 100).toFixed(1)
      : '0.0';

  lines.push(
    `  Checkpoints Cleared:  ${summary.checkpointsCleared} / ${summary.totalCheckpoints} (${passRate}%)`
  );

  if (summary.checkpointsFailed > 0) {
    lines.push(`  Checkpoints Failed:   ${pc.red(String(summary.checkpointsFailed))}`);
  }

  if (summary.activeTrustScores.length > 0) {
    lines.push(`  Active Trust Scores (${summary.activeTrustScores.length} files):`);
    for (const item of summary.activeTrustScores) {
      const scoreStr = item.score.toFixed(2);
      const coloredScore =
        item.score >= 0.8
          ? pc.green(scoreStr)
          : item.score >= 0.5
            ? pc.yellow(scoreStr)
            : pc.red(scoreStr);
      lines.push(`    - ${item.filePath}: ${coloredScore}`);
    }
  } else {
    lines.push('  Active Trust Scores:  No files tracked yet');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Prints the session summary to the provided stream or stdout.
 */
export async function printSessionSummary(options: {
  workspaceRoot?: string;
  stream?: (msg: string) => void;
  onlyIfInterceptions?: boolean;
} = {}): Promise<boolean> {
  const summary = await collectSessionSummary(options.workspaceRoot);
  if (!summary) {
    return false;
  }

  if (options.onlyIfInterceptions && summary.totalInterceptions === 0) {
    return false;
  }

  const output = formatSessionSummary(summary);
  const logFn = options.stream ?? ((msg: string) => console.log(msg));
  logFn(output);
  return true;
}

let installedHook = false;

/**
 * Installs a process exit handler that prints local session summary upon termination.
 * Returns an unregister function to remove the listener.
 */
export function installExitSummaryHook(workspaceRoot?: string): () => void {
  if (installedHook) {
    return () => {};
  }

  installedHook = true;

  const handleExit = () => {
    try {
      const context = getWorkspaceContext(workspaceRoot);
      if (existsSync(context.dbPath)) {
        const db = createDatabase(context.dbPath);
        try {
          const row = db.prepare(`SELECT COUNT(*) as count FROM interceptions`).get() as { count: number } | undefined;
          if (row && row.count > 0) {
            const checkpointRow = db.prepare(`
              SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed
              FROM checkpoints
            `).get() as { total: number; passed: number | null } | undefined;

            const total = checkpointRow?.total ?? 0;
            const passed = checkpointRow?.passed ?? 0;

            console.log(pc.bold('\nRatio Process Exit Summary:'));
            console.log(`  Total Interceptions: ${row.count}`);
            console.log(`  Checkpoints Cleared: ${passed} / ${total}`);
          }
        } finally {
          closeDatabase(db);
        }
      }
    } catch {
      // Ignore errors on process shutdown
    }
  };

  process.once('beforeExit', handleExit);

  return () => {
    process.removeListener('beforeExit', handleExit);
    installedHook = false;
  };
}
