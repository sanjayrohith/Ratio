import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFile } from '../storage/fs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root template directory path relative to current module
export const TEMPLATES_ROOT = resolve(__dirname, '../../templates/agent-rules');

export interface GeneratedAgentRules {
  claudeMdPath: string;
  cursorRulesPath: string;
  openCodeRulesPath: string;
}

/**
 * Loads the raw content of an agent rule template.
 */
export async function loadTemplate(name: 'CLAUDE.md' | '.cursorrules' | 'opencode-rules.md'): Promise<string> {
  const filePath = join(TEMPLATES_ROOT, name);
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Injects or updates agent rules in the specified target workspace directory.
 */
export async function injectAgentRules(targetDir: string): Promise<GeneratedAgentRules> {
  const claudeTemplate = await loadTemplate('CLAUDE.md');
  const cursorTemplate = await loadTemplate('.cursorrules');
  const openCodeTemplate = await loadTemplate('opencode-rules.md');

  const claudeMdPath = join(targetDir, 'CLAUDE.md');
  const cursorRulesPath = join(targetDir, '.cursorrules');
  const openCodeRulesPath = join(targetDir, '.opencode-rules.md');

  await atomicWriteFile(claudeMdPath, claudeTemplate);
  await atomicWriteFile(cursorRulesPath, cursorTemplate);
  await atomicWriteFile(openCodeRulesPath, openCodeTemplate);

  return {
    claudeMdPath,
    cursorRulesPath,
    openCodeRulesPath,
  };
}
