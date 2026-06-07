import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { getWorkspaceContext } from '../../storage/workspace.js';
import { createDatabase, closeDatabase } from '../../storage/db.js';
import { TrustScoreRepository } from '../../storage/trust-repo.js';
import { DynamicThresholdScaler } from '../../core/trust/scaler.js';
import { loadRatioConfig } from '../../core/config/schema.js';
import { pc } from '../ui.js';

export interface StatusOptions {
  cwd?: string;
  verbose?: boolean;
}

export interface StatusMetrics {
  totalCheckpoints: number;
  passedCheckpoints: number;
  failedCheckpoints: number;
  pendingCheckpoints: number;
  bypassedCheckpoints: number;
  passRate: number;
  totalSessions: number;
  activeSessions: number;
  trackedFilesCount: number;
}

export interface FileTrustStatus {
  filePath: string;
  trustScore: number;
  effectiveLinesAdded: number;
  effectiveLinesRemoved: number;
  totalPasses: number;
  totalFailures: number;
  updatedAt: string;
}

export interface StatusResult {
  initialized: boolean;
  rootDir: string;
  dbPath: string;
  metrics: StatusMetrics;
  fileTrustBreakdown: FileTrustStatus[];
}

/**
 * Renders an aligned terminal table for per-file trust scores and effective thresholds.
 */
export function renderTrustTable(files: FileTrustStatus[]): void {
  console.log('Per-File Trust Scores & Effective Thresholds:');
  if (files.length === 0) {
    console.log('  No files tracked yet. Initial trust (1.00) applies to subsequent writes.\n');
    return;
  }

  const colFile = Math.max(28, ...files.map((f) => f.filePath.length));
  const pad = (str: string, width: number) => str.padEnd(width);

  console.log(
    `  ${pc.bold(pad('File Path', colFile))}  ${pc.bold(pad('Trust', 8))}  ${pc.bold(pad('Effective Limit', 18))}  ${pc.bold(pad('Pass / Fail', 12))}  ${pc.bold(pad('Last Updated', 19))}`
  );
  console.log(`  ${pc.dim('-'.repeat(colFile + 65))}`);

  for (const file of files) {
    const scoreStr = file.trustScore.toFixed(2);
    const coloredScore = file.trustScore >= 0.8 ? pc.green(scoreStr) : file.trustScore >= 0.5 ? pc.yellow(scoreStr) : pc.red(scoreStr);
    const limitStr = `+${file.effectiveLinesAdded} / -${file.effectiveLinesRemoved}`;
    const pfStr = `${file.totalPasses} / ${file.totalFailures}`;
    const dateStr = file.updatedAt ? file.updatedAt.replace('T', ' ').slice(0, 19) : '-';

    console.log(
      `  ${pad(file.filePath, colFile)}  ${pad(coloredScore, 8 + (coloredScore.length - scoreStr.length))}  ${pad(limitStr, 18)}  ${pad(pfStr, 12)}  ${pad(dateStr, 19)}`
    );
  }
  console.log('');
}

/**
 * Computes repository metrics from the SQLite ledger and outputs status summary and trust breakdown.
 */
export async function executeStatus(options: StatusOptions = {}): Promise<StatusResult> {
  const context = getWorkspaceContext(options.cwd);
  const rootDir = resolve(options.cwd ?? context.rootDir);
  const dbPath = context.dbPath;

  const defaultMetrics: StatusMetrics = {
    totalCheckpoints: 0,
    passedCheckpoints: 0,
    failedCheckpoints: 0,
    pendingCheckpoints: 0,
    bypassedCheckpoints: 0,
    passRate: 0,
    totalSessions: 0,
    activeSessions: 0,
    trackedFilesCount: 0,
  };

  if (!existsSync(dbPath)) {
    console.log('\nRatio Repository Status:');
    console.log(`  Workspace: ${rootDir}`);
    console.log(`  Database:  ${dbPath} (not found)`);
    console.log('\nWorkspace not initialized. Run "ratio init" to get started.\n');

    return {
      initialized: false,
      rootDir,
      dbPath,
      metrics: defaultMetrics,
      fileTrustBreakdown: [],
    };
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);

    // 1. Query checkpoint counts
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
      };

    const totalCheckpoints = checkpointRow?.total ?? 0;
    const passedCheckpoints = checkpointRow?.passed ?? 0;
    const failedCheckpoints = checkpointRow?.failed ?? 0;
    const pendingCheckpoints = checkpointRow?.pending ?? 0;
    const bypassedCheckpoints = checkpointRow?.bypassed ?? 0;

    const evaluatedCount = passedCheckpoints + failedCheckpoints;
    const passRate =
      evaluatedCount > 0
        ? Math.round((passedCheckpoints / evaluatedCount) * 1000) / 10
        : 0;

    // 2. Query session statistics
    const sessionRow = db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) as active
        FROM sessions
      `)
      .get() as {
        total: number;
        active: number | null;
      };

    const totalSessions = sessionRow?.total ?? 0;
    const activeSessions = sessionRow?.active ?? 0;

    // 3. Query tracked files and per-file trust scores
    const trustRepo = new TrustScoreRepository(db);
    const trustRecords = trustRepo.listAll();

    const config = await loadRatioConfig(rootDir);
    const scaler = new DynamicThresholdScaler();

    const fileTrustBreakdown: FileTrustStatus[] = trustRecords.map((record) => {
      const scaled = scaler.scaleThresholds(config.thresholds, record.score);
      return {
        filePath: record.file_path,
        trustScore: record.score,
        effectiveLinesAdded: scaled.maxLinesAdded,
        effectiveLinesRemoved: scaled.maxLinesRemoved,
        totalPasses: record.total_passes,
        totalFailures: record.total_failures,
        updatedAt: record.updated_at,
      };
    });

    const trackedFilesCount = Math.max(trustRecords.length, (() => {
      const filesRow = db!
        .prepare(`
          SELECT COUNT(DISTINCT file_path) as count
          FROM (
            SELECT file_path FROM trust_scores
            UNION
            SELECT file_path FROM checkpoints
          )
        `)
        .get() as { count: number };
      return filesRow?.count ?? 0;
    })());

    const metrics: StatusMetrics = {
      totalCheckpoints,
      passedCheckpoints,
      failedCheckpoints,
      pendingCheckpoints,
      bypassedCheckpoints,
      passRate,
      totalSessions,
      activeSessions,
      trackedFilesCount,
    };

    console.log('\nRatio Repository Status:');
    console.log(`  Workspace: ${rootDir}`);
    console.log(`  Database:  ${dbPath}`);
    console.log('\nMetrics Summary:');
    console.log(`  Total Checkpoints:  ${metrics.totalCheckpoints}`);
    console.log(
      `  Pass Rate:          ${metrics.passRate.toFixed(1)}% (${metrics.passedCheckpoints} passed, ${metrics.failedCheckpoints} failed, ${metrics.pendingCheckpoints} pending)`
    );
    console.log(
      `  Active Sessions:    ${metrics.activeSessions} (Total: ${metrics.totalSessions})`
    );
    console.log(`  Tracked Files:      ${metrics.trackedFilesCount}\n`);

    renderTrustTable(fileTrustBreakdown);

    if (options.verbose) {
      console.log(`[ratio:status] Loaded metrics for database at ${dbPath}`);
    }

    return {
      initialized: true,
      rootDir,
      dbPath,
      metrics,
      fileTrustBreakdown,
    };
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}
