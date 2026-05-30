import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

export interface ClaudeConfigOptions {
  serverCommand?: string;
  serverArgs?: string[];
  serverPath?: string;
  targetFile?: 'mcp.json' | '.claude.json';
}

export interface ClaudeConfigUpdateResult {
  path: string;
  created: boolean;
  updated: boolean;
  config: Record<string, any>;
}

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Resolves the path to the Ratio server entry point if available.
 */
export function getDefaultRatioServerCommand(): { command: string; args: string[] } {
  // Check if src/server/index.ts exists relative to this file
  try {
    const serverEntry = resolve(__dirname, '../../server/index.ts');
    if (existsSync(serverEntry)) {
      return { command: 'bun', args: ['run', serverEntry] };
    }
  } catch {
    // Fall back to bun run ratio
  }
  return { command: 'bun', args: ['run', 'ratio'] };
}

/**
 * Determines the target Claude configuration file path.
 * Prefers existing .claude.json or .claude/mcp.json; defaults to .claude/mcp.json.
 */
export function resolveClaudeConfigPath(
  targetDir: string,
  preferred?: 'mcp.json' | '.claude.json'
): { path: string; exists: boolean } {
  if (preferred === '.claude.json') {
    const p = join(targetDir, '.claude.json');
    return { path: p, exists: existsSync(p) };
  }
  if (preferred === 'mcp.json') {
    const p = join(targetDir, '.claude', 'mcp.json');
    return { path: p, exists: existsSync(p) };
  }

  // Auto-detect existing
  const claudeJson = join(targetDir, '.claude.json');
  if (existsSync(claudeJson)) {
    return { path: claudeJson, exists: true };
  }

  const mcpJson = join(targetDir, '.claude', 'mcp.json');
  if (existsSync(mcpJson)) {
    return { path: mcpJson, exists: true };
  }

  // Default to .claude/mcp.json
  return { path: mcpJson, exists: false };
}

/**
 * Updates or creates Claude Code configuration registering Ratio as an MCP server.
 */
export async function updateClaudeConfig(
  targetDir: string,
  options: ClaudeConfigOptions = {}
): Promise<ClaudeConfigUpdateResult> {
  const { path: configPath, exists } = resolveClaudeConfigPath(targetDir, options.targetFile);

  let currentConfig: Record<string, any> = {};
  if (exists) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      currentConfig = JSON.parse(raw);
    } catch {
      currentConfig = {};
    }
  }

  // Ensure mcpServers dictionary exists
  if (!currentConfig.mcpServers || typeof currentConfig.mcpServers !== 'object') {
    currentConfig.mcpServers = {};
  }

  const defaultCmd = getDefaultRatioServerCommand();
  const serverCommand = options.serverCommand ?? defaultCmd.command;
  let serverArgs = options.serverArgs;

  if (!serverArgs) {
    if (options.serverPath) {
      serverArgs = ['run', options.serverPath];
    } else {
      serverArgs = defaultCmd.args;
    }
  }

  const ratioServerConfig: McpServerConfig = {
    command: serverCommand,
    args: serverArgs,
  };

  currentConfig.mcpServers.ratio = ratioServerConfig;

  // Ensure parent directory exists (.claude/)
  await fs.mkdir(dirname(configPath), { recursive: true });

  await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 2) + '\n', 'utf-8');

  return {
    path: configPath,
    created: !exists,
    updated: true,
    config: currentConfig,
  };
}
