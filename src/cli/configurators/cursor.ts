import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getDefaultRatioServerCommand, McpServerConfig } from './claude.js';

export interface CursorConfigOptions {
  serverCommand?: string;
  serverArgs?: string[];
  serverPath?: string;
}

export interface CursorConfigResult {
  path: string;
  created: boolean;
  updated: boolean;
  config: Record<string, any>;
}

/**
 * Returns the target path for Cursor MCP configuration (.cursor/mcp.json).
 */
export function getCursorConfigPath(targetDir: string): string {
  return join(targetDir, '.cursor', 'mcp.json');
}

/**
 * Updates or creates Cursor configuration registering Ratio as an MCP server.
 */
export async function updateCursorConfig(
  targetDir: string,
  options: CursorConfigOptions = {}
): Promise<CursorConfigResult> {
  const configPath = getCursorConfigPath(targetDir);
  const exists = existsSync(configPath);

  let currentConfig: Record<string, any> = {};
  if (exists) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      currentConfig = JSON.parse(raw);
    } catch {
      currentConfig = {};
    }
  }

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

  const ratioConfig: McpServerConfig = {
    command: serverCommand,
    args: serverArgs,
  };

  currentConfig.mcpServers.ratio = ratioConfig;

  await fs.mkdir(dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 2) + '\n', 'utf-8');

  return {
    path: configPath,
    created: !exists,
    updated: true,
    config: currentConfig,
  };
}
