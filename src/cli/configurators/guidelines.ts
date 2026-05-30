import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTemplate } from '../../core/templates.js';

export const RATIO_MARKER_START = '<!-- RATIO_SOCRATIC_GUIDELINES_START -->';
export const RATIO_MARKER_END = '<!-- RATIO_SOCRATIC_GUIDELINES_END -->';

export const DEFAULT_CLAUDE_GUIDELINES = `# Ratio Socratic Interceptor Guidelines for Claude Code

You are operating under **Ratio**, an architectural guardian and Socratic mentor.
All file creation, modification, and replacement operations in this project are strictly governed by Ratio.

## Mandatory Tool Routing Rules

1. **NEVER** use standard native file-writing or file-editing tools (e.g., \`Write\`, \`Edit\`, \`write_to_file\`, \`replace_file_content\`) when Ratio MCP tools are available.
2. **ALWAYS** call Ratio MCP tools for filesystem changes:
   - Use \`ratio_write_file\` to create or overwrite a file.
   - Use \`ratio_edit_file\` to apply patch edits or targeted replacements to existing files.
3. Always supply a clear architectural \`rationale\` in the tool input explaining *why* this change is needed and what mechanism it implements.

## Handling Socratic Checkpoints

When calling \`ratio_write_file\` or \`ratio_edit_file\`, Ratio may return a response with:
\`status: "checkpoint_required"\`

When this happens:
1. **DO NOT** attempt to bypass, retry, or work around the checkpoint.
2. **DO NOT** make assumptions or answer the question on behalf of the user.
3. **IMMEDIATELY STOP** and relay the Socratic question directly to the human user in your next turn.
4. Show the file path and the question clearly to the user:
   > 🧭 **Ratio Socratic Checkpoint [Ticket: <ticketId>]**
   > *Target:* \`<file>\`
   > *Question:* \`<question>\`
5. Wait for the human user to provide their explanation in plain language.
6. Once the user provides their explanation, call \`ratio_submit_answer\` with:
   - \`ticketId\`: The ticket ID from the checkpoint response.
   - \`answer\`: The user's exact explanation.
7. If Ratio approves the explanation, the staged write will be released and committed. If Ratio asks a follow-up, relay that follow-up to the user.
`;

export interface GuidelinesInjectionOptions {
  force?: boolean;
}

export interface FileInjectionResult {
  path: string;
  created: boolean;
  updated: boolean;
}

export interface AllGuidelinesResult {
  claudeMd: FileInjectionResult;
  cursorRules?: FileInjectionResult;
  openCodeRules?: FileInjectionResult;
}

/**
 * Returns raw CLAUDE.md content, loading from template file or fallback constant.
 */
export async function getClaudeGuidelinesContent(): Promise<string> {
  try {
    return await loadTemplate('CLAUDE.md');
  } catch {
    return DEFAULT_CLAUDE_GUIDELINES;
  }
}

/**
 * Injects Socratic routing guidelines into project CLAUDE.md:
 * - If CLAUDE.md does not exist, creates it with full guidelines.
 * - If CLAUDE.md exists without Ratio guidelines, appends guidelines with markers.
 * - If CLAUDE.md exists with markers, updates the marked section.
 */
export async function injectClaudeGuidelines(
  targetDir: string,
  options: GuidelinesInjectionOptions = {}
): Promise<FileInjectionResult> {
  const filePath = join(targetDir, 'CLAUDE.md');
  const guidelinesContent = await getClaudeGuidelinesContent();
  const markedBlock = `${RATIO_MARKER_START}\n${guidelinesContent.trim()}\n${RATIO_MARKER_END}`;

  if (!existsSync(filePath)) {
    await fs.writeFile(filePath, markedBlock + '\n', 'utf-8');
    return { path: filePath, created: true, updated: false };
  }

  const existingContent = await fs.readFile(filePath, 'utf-8');

  // Check if markers already exist
  const startIndex = existingContent.indexOf(RATIO_MARKER_START);
  const endIndex = existingContent.indexOf(RATIO_MARKER_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    // Replace existing marked block
    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex + RATIO_MARKER_END.length);
    const updatedContent = `${before.trimEnd()}\n\n${markedBlock}\n\n${after.trimStart()}`.trim() + '\n';
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    return { path: filePath, created: false, updated: true };
  }

  // If already contains "Ratio Socratic Interceptor Guidelines" heading but no markers
  if (existingContent.includes('Ratio Socratic Interceptor Guidelines') && !options.force) {
    return { path: filePath, created: false, updated: false };
  }

  // Append marked block to existing CLAUDE.md
  const combined = `${existingContent.trimEnd()}\n\n${markedBlock}\n`;
  await fs.writeFile(filePath, combined, 'utf-8');

  return { path: filePath, created: false, updated: true };
}

/**
 * Injects all agent guidelines (CLAUDE.md, .cursorrules, opencode-rules.md).
 */
export async function injectAllGuidelines(
  targetDir: string,
  options: GuidelinesInjectionOptions = {}
): Promise<AllGuidelinesResult> {
  const claudeMd = await injectClaudeGuidelines(targetDir, options);

  // .cursorrules
  const cursorPath = join(targetDir, '.cursorrules');
  let cursorRules: FileInjectionResult | undefined;
  try {
    let cursorContent = '';
    try {
      cursorContent = await loadTemplate('.cursorrules');
    } catch {
      cursorContent = '# Ratio Socratic Rules\nAlways route file writes through Ratio MCP tools.\n';
    }
    const exists = existsSync(cursorPath);
    if (!exists || options.force) {
      await fs.writeFile(cursorPath, cursorContent, 'utf-8');
      cursorRules = { path: cursorPath, created: !exists, updated: exists };
    } else {
      cursorRules = { path: cursorPath, created: false, updated: false };
    }
  } catch {
    // Ignore
  }

  // opencode-rules.md
  const openCodePath = join(targetDir, 'opencode-rules.md');
  let openCodeRules: FileInjectionResult | undefined;
  try {
    let openCodeContent = '';
    try {
      openCodeContent = await loadTemplate('opencode-rules.md');
    } catch {
      openCodeContent = '# Ratio Rules for opencode\nAlways route file writes through Ratio MCP tools.\n';
    }
    const exists = existsSync(openCodePath);
    if (!exists || options.force) {
      await fs.writeFile(openCodePath, openCodeContent, 'utf-8');
      openCodeRules = { path: openCodePath, created: !exists, updated: exists };
    } else {
      openCodeRules = { path: openCodePath, created: false, updated: false };
    }
  } catch {
    // Ignore
  }

  return { claudeMd, cursorRules, openCodeRules };
}
