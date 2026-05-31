import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { getWorkspaceContext } from '../../storage/workspace.js';
import { createDatabase, closeDatabase } from '../../storage/db.js';
import {
  CheckpointRecord,
  CheckpointRepository,
  CheckpointStatus,
} from '../../storage/checkpoint-repo.js';

export interface LogOptions {
  cwd?: string;
  limit?: number;
  status?: CheckpointStatus;
  file?: string;
  verbose?: boolean;
}

export interface LogResult {
  initialized: boolean;
  rootDir: string;
  dbPath: string;
  count: number;
  checkpoints: CheckpointRecord[];
}

/**
 * Returns colorized status badge for terminal output.
 */
export function formatStatusBadge(status: string): string {
  switch (status.toLowerCase()) {
    case 'passed':
      return '\x1b[32m[PASSED]\x1b[0m';
    case 'failed':
      return '\x1b[31m[FAILED]\x1b[0m';
    case 'pending':
      return '\x1b[33m[PENDING]\x1b[0m';
    case 'bypassed':
      return '\x1b[36m[BYPASSED]\x1b[0m';
    default:
      return `[${status.toUpperCase()}]`;
  }
}

/**
 * Renders recent checkpoint history from the SQLite ledger with colorized statuses.
 */
export async function executeLog(options: LogOptions = {}): Promise<LogResult> {
  const context = getWorkspaceContext(options.cwd);
  const rootDir = resolve(options.cwd ?? context.rootDir);
  const dbPath = context.dbPath;
  const limit = Math.max(1, options.limit ?? 10);

  if (!existsSync(dbPath)) {
    console.log('\nRatio Checkpoint Ledger:');
    console.log(`  Workspace: ${rootDir}`);
    console.log(`  Database:  ${dbPath} (not found)`);
    console.log('\nWorkspace not initialized. Run "ratio init" to get started.\n');

    return {
      initialized: false,
      rootDir,
      dbPath,
      count: 0,
      checkpoints: [],
    };
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);
    const repo = new CheckpointRepository(db);

    const checkpoints = repo.listCheckpoints({
      filePath: options.file,
      status: options.status,
      limit,
    });

    console.log('\nRatio Checkpoint Ledger:');
    console.log(`  Workspace: ${rootDir}`);
    console.log(`  Database:  ${dbPath}`);
    console.log(`  Showing:   ${checkpoints.length} checkpoint(s)\n`);

    if (checkpoints.length === 0) {
      console.log('  No checkpoints found in ledger.\n');
    } else {
      for (const cp of checkpoints) {
        const badge = formatStatusBadge(cp.status);
        const dateStr = cp.created_at ? cp.created_at.replace('T', ' ').slice(0, 19) : 'unknown';
        const scoreStr =
          cp.concept_score !== null && cp.concept_score !== undefined
            ? ` (${cp.concept_score}/100)`
            : cp.evaluation_score !== null && cp.evaluation_score !== undefined
            ? ` (${cp.evaluation_score}/100)`
            : '';

        console.log(`  \x1b[1m${dateStr}\x1b[0m  ${badge}  \x1b[36m${cp.ticket_id}\x1b[0m${scoreStr}`);
        console.log(`    \x1b[90mFile:\x1b[0m     ${cp.file_path}`);
        console.log(`    \x1b[90mConcept:\x1b[0m  ${cp.concept}`);
        console.log(`    \x1b[90mQuestion:\x1b[0m ${cp.question}`);

        if (cp.student_answer) {
          console.log(`    \x1b[90mAnswer:\x1b[0m   ${cp.student_answer}`);
        }
        if (cp.evaluation_reason) {
          console.log(`    \x1b[90mReason:\x1b[0m   ${cp.evaluation_reason}`);
        }
        if (options.verbose) {
          if (cp.expected_keywords && cp.expected_keywords.length > 0) {
            console.log(`    \x1b[90mExpected Keywords:\x1b[0m ${cp.expected_keywords.join(', ')}`);
          }
          if (cp.detected_keywords && cp.detected_keywords.length > 0) {
            console.log(`    \x1b[90mDetected Keywords:\x1b[0m ${cp.detected_keywords.join(', ')}`);
          }
          if (cp.is_evasive) {
            console.log(`    \x1b[33mEvasion Detected:\x1b[0m  true`);
          }
        }
        console.log('');
      }
    }

    return {
      initialized: true,
      rootDir,
      dbPath,
      count: checkpoints.length,
      checkpoints,
    };
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}
