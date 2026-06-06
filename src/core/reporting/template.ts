export interface ReportExecutiveSummary {
  projectName: string;
  generatedAt: string;
  totalLinesWritten: number;
  totalCheckpoints: number;
  passedCheckpoints: number;
  failedCheckpoints: number;
  pendingCheckpoints: number;
  bypassedCheckpoints: number;
  passRate: number; // 0.0 - 100.0%
  vivaReadinessScore: number; // 0 - 100
  comprehensionRating: 'Master' | 'Proficient' | 'Competent' | 'Developing' | 'Needs Review';
  independentUnderstandingPercentage: number; // 0.0 - 100.0%
}

export interface FileAuditSummary {
  filePath: string;
  linesWritten: number;
  checkpointsTriggered: number;
  questionsAnswered: number;
  passRate: number; // 0.0 - 100.0%
  trustScore: number; // 0.0 - 1.0
  scaffoldingStatus: 'High Trust' | 'Moderate Trust' | 'Tight Scaffolding' | 'Untracked';
}

export interface ConceptMasterySummary {
  concept: string;
  layer: string;
  totalTested: number;
  passedCount: number;
  failedCount: number;
  averageScore: number; // 0 - 100
  masteryStatus: 'Mastered' | 'Competent' | 'Vulnerable';
}

export interface CheckpointAuditEntry {
  ticketId: string;
  filePath: string;
  concept: string;
  question: string;
  studentAnswer?: string | null;
  status: string;
  score?: number | null;
  timestamp: string;
}

export interface ReportData {
  summary: ReportExecutiveSummary;
  files: FileAuditSummary[];
  concepts: ConceptMasterySummary[];
  evidence?: CheckpointAuditEntry[];
}

/**
 * Maps a Viva Readiness Score (0-100) to a qualitative comprehension rating.
 */
export function determineComprehensionRating(
  vivaScore: number
): 'Master' | 'Proficient' | 'Competent' | 'Developing' | 'Needs Review' {
  if (vivaScore >= 90) return 'Master';
  if (vivaScore >= 75) return 'Proficient';
  if (vivaScore >= 60) return 'Competent';
  if (vivaScore >= 40) return 'Developing';
  return 'Needs Review';
}

/**
 * Renders an executive portfolio report in GitHub-flavored Markdown.
 */
export function renderMarkdownReport(data: ReportData): string {
  const { summary, files, concepts, evidence } = data;

  const lines: string[] = [];

  // 1. Title & Header
  lines.push(`# Ratio Portfolio Audit: Understanding Ledger`);
  lines.push(`\n> **Target Repository**: \`${summary.projectName}\``);
  lines.push(`> **Audit Timestamp**: ${summary.generatedAt}`);
  lines.push(`> **Auditor**: Ratio — Socratic Interceptor for AI Coding Agents\n`);

  // 2. Executive Summary & KPIs
  lines.push(`## 1. Executive Summary & Viva Readiness`);
  lines.push(
    `This report verifies code comprehension and architectural intentionality for changes generated during AI-assisted development sessions. When AI coding agents proposed complex changes, Ratio intercepted the writes and required the author to defend the underlying mechanism before commits landed on disk.\n`
  );

  lines.push(`| Key Metric | Value | Interpretation |`);
  lines.push(`| :--- | :--- | :--- |`);
  lines.push(
    `| **Viva Readiness Score** | **${summary.vivaReadinessScore} / 100** | Preparedness to explain and defend code in viva/interview |`
  );
  lines.push(
    `| **Comprehension Rating** | **${summary.comprehensionRating}** | Qualitative assessment based on mechanistic explanations |`
  );
  lines.push(
    `| **Independent Understanding** | **${summary.independentUnderstandingPercentage.toFixed(1)}%** | Proportion of intercepted logic successfully explained |`
  );
  lines.push(
    `| **Checkpoint Pass Rate** | **${summary.passRate.toFixed(1)}%** | ${summary.passedCheckpoints} passed / ${summary.passedCheckpoints + summary.failedCheckpoints} evaluated |`
  );
  lines.push(
    `| **Total Lines Authored** | **${summary.totalLinesWritten} lines** | Net lines intercepted across all tool calls |`
  );
  lines.push(
    `| **Total Checkpoints** | **${summary.totalCheckpoints}** | ${summary.passedCheckpoints} passed, ${summary.failedCheckpoints} failed, ${summary.pendingCheckpoints} pending, ${summary.bypassedCheckpoints} bypassed |\n`
  );

  // 3. Per-File Understanding Ledger Table
  lines.push(`## 2. Per-File Understanding Ledger`);
  lines.push(
    `Detailed audit of files touched during agent turns. Scaffolding automatically tightens (requiring smaller diffs) on shallow answers and fades as trust increases.\n`
  );

  if (files.length === 0) {
    lines.push(`*No files recorded in repository ledger yet.*\n`);
  } else {
    lines.push(
      `| File Path | Lines Written | Checkpoints | Answered | Pass Rate | Trust Score | Scaffolding Status |`
    );
    lines.push(
      `| :--- | :---: | :---: | :---: | :---: | :---: | :--- |`
    );
    for (const f of files) {
      lines.push(
        `| \`${f.filePath}\` | ${f.linesWritten} | ${f.checkpointsTriggered} | ${f.questionsAnswered} | ${f.passRate.toFixed(1)}% | ${f.trustScore.toFixed(2)} | ${f.scaffoldingStatus} |`
      );
    }
    lines.push('');
  }

  // 4. Architectural Concept Mastery Table
  lines.push(`## 3. Architectural Concept Mastery`);
  lines.push(
    `Evaluation of key architectural patterns, trade-offs, and security boundaries probed during coding.\n`
  );

  if (concepts.length === 0) {
    lines.push(`*No concept checkpoints evaluated yet.*\n`);
  } else {
    lines.push(
      `| Concept Pattern | Layer | Tested | Passed | Failed | Average Score | Status |`
    );
    lines.push(
      `| :--- | :--- | :---: | :---: | :---: | :---: | :--- |`
    );
    for (const c of concepts) {
      lines.push(
        `| **${c.concept}** | \`${c.layer}\` | ${c.totalTested} | ${c.passedCount} | ${c.failedCount} | ${c.averageScore.toFixed(0)}/100 | ${c.masteryStatus} |`
      );
    }
    lines.push('');
  }

  // 5. Checkpoint Evidence Trail
  if (evidence && evidence.length > 0) {
    lines.push(`## 4. Socratic Verification Evidence Trail`);
    lines.push(
      `Verifiable transcript excerpt demonstrating student explanations provided at write checkpoints.\n`
    );

    for (const ev of evidence) {
      const statusIcon = ev.status === 'passed' ? '✓ Passed' : ev.status === 'failed' ? '✗ Failed' : ev.status;
      const scoreTag = ev.score !== undefined && ev.score !== null ? ` (Score: ${ev.score}/100)` : '';
      lines.push(`### Checkpoint \`${ev.ticketId}\` — ${statusIcon}${scoreTag}`);
      lines.push(`- **File**: \`${ev.filePath}\``);
      lines.push(`- **Concept**: \`${ev.concept}\``);
      lines.push(`- **Timestamp**: ${ev.timestamp}`);
      lines.push(`- **Question**: *${ev.question}*`);
      if (ev.studentAnswer) {
        lines.push(`- **Student Explanation**: "${ev.studentAnswer}"`);
      }
      lines.push('');
    }
  }

  // 6. Verification Seal
  lines.push(`---`);
  lines.push(`*Audited by Ratio (Socratic MCP Interceptor for AI Coding Agents)*`);
  lines.push(`*Proof of Comprehension Artifact for Portfolio & Interview Viva Defense*\n`);

  return lines.join('\n');
}
