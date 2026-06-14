import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { safeReadFile } from '../../storage/fs.js';

export interface BypassedChange {
  file: string;
  absolutePath: string;
  statusCode: string; // 'M', '??', 'A', 'D'
  lineDelta: number;
  isBypassed: boolean;
  reason: string;
}

export interface GitWatcherOptions {
  workspaceRoot?: string;
  ignoredPatterns?: string[];
}

/**
 * Git-based change detection watcher flagging untracked, direct file modifications
 * that bypassed Ratio MCP tools (e.g. agent running direct shell commands or sed/echo).
 */
export class GitWatcher {
  private workspaceRoot: string;
  private ignoredPatterns: string[];

  constructor(options: GitWatcherOptions = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
    this.ignoredPatterns = options.ignoredPatterns ?? [
      '.ratio',
      '.git',
      'node_modules',
      '.DS_Store',
      'RATIO_REPORT.md',
      'RATIO_REPORT.json',
    ];
  }

  /**
   * Checks whether the workspace directory is a valid git repository.
   */
  public async isGitRepository(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['git', 'rev-parse', '--is-inside-work-tree'], {
        cwd: this.workspaceRoot,
        stderr: 'pipe',
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      return output.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Runs `git status --porcelain` to retrieve list of currently modified and untracked files.
   */
  public async getModifiedFiles(): Promise<Array<{ file: string; statusCode: string }>> {
    const isGit = await this.isGitRepository();
    if (!isGit) {
      return [];
    }

    try {
      const proc = Bun.spawn(['git', 'status', '--porcelain'], {
        cwd: this.workspaceRoot,
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      if (!stdout.trim()) {
        return [];
      }

      const results: Array<{ file: string; statusCode: string }> = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.length < 4) continue;
        const statusCode = line.substring(0, 2).trim();
        const file = line.substring(3).trim();

        if (this.isIgnored(file)) {
          continue;
        }

        results.push({ file, statusCode });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Detects files modified on disk that were never intercepted by Ratio MCP tools.
   */
  public async detectBypassedWrites(
    knownTrackedFiles: Set<string> | string[]
  ): Promise<BypassedChange[]> {
    const trackedSet =
      knownTrackedFiles instanceof Set
        ? knownTrackedFiles
        : new Set(knownTrackedFiles.map((f) => resolve(this.workspaceRoot, f)));

    const modified = await this.getModifiedFiles();
    const bypassed: BypassedChange[] = [];

    for (const item of modified) {
      const absPath = resolve(this.workspaceRoot, item.file);
      const isLogged = trackedSet.has(absPath) || trackedSet.has(item.file);

      if (!isLogged) {
        // Inspect content to approximate line delta
        let lineCount = 0;
        if (existsSync(absPath)) {
          const content = (await safeReadFile(absPath)) ?? '';
          lineCount = content.length > 0 ? content.split('\n').length : 0;
        }

        bypassed.push({
          file: item.file,
          absolutePath: absPath,
          statusCode: item.statusCode,
          lineDelta: lineCount,
          isBypassed: true,
          reason: `Direct write detected via git status (${item.statusCode}) without MCP interception.`,
        });
      }
    }

    return bypassed;
  }

  private isIgnored(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return this.ignoredPatterns.some((pattern) => {
      return (
        normalized === pattern ||
        normalized.startsWith(pattern + '/') ||
        normalized.includes('/' + pattern + '/')
      );
    });
  }
}
