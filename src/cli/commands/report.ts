import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { getWorkspaceContext } from '../../storage/workspace.js';
import { createDatabase, closeDatabase } from '../../storage/db.js';
import { CheckpointRepository } from '../../storage/checkpoint-repo.js';
import { ReportAnalytics } from '../../core/reporting/analytics.js';
import { FileSummaryReporter } from '../../core/reporting/file-summary.js';
import { ConceptSummaryReporter } from '../../core/reporting/concept-summary.js';
import {
  CheckpointAuditEntry,
  ReportData,
  renderMarkdownReport,
} from '../../core/reporting/template.js';

export interface ReportOptions {
  cwd?: string;
  output?: string;
  stdout?: boolean;
  verbose?: boolean;
}

export interface ReportResult {
  initialized: boolean;
  rootDir: string;
  outputPath?: string;
  reportContent: string;
  data?: ReportData;
}

/**
 * Derives a human-readable project name from package.json or the directory basename.
 */
function resolveProjectName(rootDir: string): string {
  const pkgPath = join(rootDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (parsed.name && typeof parsed.name === 'string') {
        return parsed.name;
      }
    } catch {
      // fallback to folder name
    }
  }
  return basename(rootDir);
}

/**
 * Executes the `ratio report` CLI command:
 * Generates portfolio markdown report, writes to RATIO_REPORT.md or custom path,
 * and optionally prints to stdout.
 */
export async function executeReport(options: ReportOptions = {}): Promise<ReportResult> {
  const context = getWorkspaceContext(options.cwd);
  const rootDir = resolve(options.cwd ?? context.rootDir);
  const dbPath = context.dbPath;

  if (!existsSync(dbPath)) {
    console.error('\nError: Workspace not initialized.');
    console.error(`Ledger database not found at ${dbPath}`);
    console.error('Run "ratio init" to initialize the repository first.\n');

    return {
      initialized: false,
      rootDir,
      reportContent: '',
    };
  }

  let db: Database | null = null;
  try {
    db = createDatabase(dbPath);
    const projectName = resolveProjectName(rootDir);

    const analytics = new ReportAnalytics(db);
    const summary = analytics.computeSummary({ projectName });

    const fileReporter = new FileSummaryReporter(db);
    const files = fileReporter.generateFileSummaries();

    const conceptReporter = new ConceptSummaryReporter(db);
    const concepts = conceptReporter.generateConceptSummaries();

    const checkpointRepo = new CheckpointRepository(db);
    const recentCheckpoints = checkpointRepo.listCheckpoints({ limit: 10 });

    const evidence: CheckpointAuditEntry[] = recentCheckpoints.map((cp) => ({
      ticketId: cp.ticket_id,
      filePath: cp.file_path,
      concept: cp.concept,
      question: cp.question,
      studentAnswer: cp.student_answer,
      status: cp.status,
      score: cp.concept_score ?? cp.evaluation_score,
      timestamp: cp.created_at ? cp.created_at.replace('T', ' ').slice(0, 19) : 'unknown',
    }));

    const reportData: ReportData = {
      summary,
      files,
      concepts,
      evidence,
    };

    const markdown = renderMarkdownReport(reportData);

    if (options.stdout) {
      console.log(markdown);
      return {
        initialized: true,
        rootDir,
        reportContent: markdown,
        data: reportData,
      };
    }

    const outputFileName = options.output ?? 'RATIO_REPORT.md';
    const outputPath = resolve(rootDir, outputFileName);
    writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`\n✓ Portfolio audit report written to ${outputPath}`);
    console.log(`  Viva Readiness Score: ${summary.vivaReadinessScore}/100 (${summary.comprehensionRating})`);
    console.log(`  Pass Rate:            ${summary.passRate.toFixed(1)}%`);
    console.log(`  Tracked Files:        ${files.length}`);
    console.log(`  Concepts Probed:      ${concepts.length}\n`);

    if (options.verbose) {
      console.log(`[ratio:report] Generated ${markdown.length} bytes of report markdown`);
    }

    return {
      initialized: true,
      rootDir,
      outputPath,
      reportContent: markdown,
      data: reportData,
    };
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }
}
