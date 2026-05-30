import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getDefaultRatioServerCommand, McpServerConfig } from './claude.js';

export interface OpenCodeConfigOptions {
  serverCommand?: string;
  serverArgs?: string[];
  serverPath?: string;
}

export interface OpenCodeConfigResult {
  path: string;
  created: boolean;
  updated: boolean;
  config: Record<string, any>;
}

/**
 * Determines the target opencode configuration file path.
 * Checks for existing opencode.json or .opencode/mcp.json; defaults to opencode.json.
 */
export function resolveOpenCodeConfigPath(targetDir: string): { path: string; exists: boolean } {
  const rootConfig = join(targetDir, 'opencode.json');
  if (existsSync(rootConfig)) {
    return { path: rootConfig, exists: true };
  }

  const dotConfig = join(targetDir, '.opencode', 'mcp.json');
  if (existsSync(dotConfig)) {
    return { path: dotConfig, exists: true };
  }

  return { path: rootConfig, exists: false };
}

/**
 * Updates or creates opencode configuration registering Ratio as an MCP server.
 */
export async function updateOpenCodeConfig(
  targetDir: string,
  options: OpenCodeConfigOptions = {}
): Promise<OpenCodeConfigResult> {
  const { path: configPath, exists } = resolveOpenCodeConfigPath(targetDir);

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
