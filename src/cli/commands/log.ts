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
import { pc } from '../ui.js';

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
 * Returns colorized status badge for terminal output using picocolors.
 */
export function formatStatusBadge(status: string): string {
  switch (status.toLowerCase()) {
    case 'passed':
      return pc.green('[PASSED]');
    case 'failed':
      return pc.red('[FAILED]');
    case 'pending':
      return pc.yellow('[PENDING]');
    case 'bypassed':
      return pc.cyan('[BYPASSED]');
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

        console.log(`  ${pc.bold(dateStr)}  ${badge}  ${pc.cyan(cp.ticket_id)}${scoreStr}`);
        console.log(`    ${pc.dim('File:')}     ${cp.file_path}`);
        console.log(`    ${pc.dim('Concept:')}  ${cp.concept}`);
        console.log(`    ${pc.dim('Question:')} ${cp.question}`);

        if (cp.student_answer) {
          console.log(`    ${pc.dim('Answer:')}   ${cp.student_answer}`);
        }
        if (cp.evaluation_reason) {
          console.log(`    ${pc.dim('Reason:')}   ${cp.evaluation_reason}`);
        }
        if (options.verbose) {
          if (cp.expected_keywords && cp.expected_keywords.length > 0) {
            console.log(`    ${pc.dim('Expected Keywords:')} ${cp.expected_keywords.join(', ')}`);
          }
          if (cp.detected_keywords && cp.detected_keywords.length > 0) {
            console.log(`    ${pc.dim('Detected Keywords:')} ${cp.detected_keywords.join(', ')}`);
          }
          if (cp.is_evasive) {
            console.log(`    ${pc.yellow('Evasion Detected:')}  true`);
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
