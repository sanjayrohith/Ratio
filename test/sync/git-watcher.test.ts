import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitWatcher } from '../../src/core/sync/git-watcher.js';

describe('GitWatcher & Direct Write Fallback Detection Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-git-sync-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('detects valid git repository after git init and returns false for non-git dirs', async () => {
    const watcher = new GitWatcher({ workspaceRoot: tempDir });
    expect(await watcher.isGitRepository()).toBe(false);

    // Initialize git repository
    const proc = Bun.spawn(['git', 'init'], { cwd: tempDir });
    await proc.exited;

    expect(await watcher.isGitRepository()).toBe(true);
  });

  it('flags files modified directly on disk that bypassed Ratio MCP tools', async () => {
    // 1. Init git repo
    const initProc = Bun.spawn(['git', 'init'], { cwd: tempDir });
    await initProc.exited;

    // 2. Setup initial committed file
    await Bun.write(join(tempDir, 'tracked.txt'), 'version 1\n');
    const commitProc = Bun.spawn(['bash', '-c', 'git add tracked.txt && git commit -m "initial"'], {
      cwd: tempDir,
    });
    await commitProc.exited;

    // 3. Directly create an unintercepted file and modify tracked.txt via direct filesystem write
    await Bun.write(join(tempDir, 'bypassed_direct.ts'), 'export const evil = true;\n');
    await Bun.write(join(tempDir, 'tracked.txt'), 'version 2\n');

    const watcher = new GitWatcher({ workspaceRoot: tempDir });

    // Scenario A: Nothing is known to Ratio ledger
    const bypassedAll = await watcher.detectBypassedWrites([]);
    expect(bypassedAll.length).toBe(2);
    const files = bypassedAll.map((b) => b.file);
    expect(files).toContain('bypassed_direct.ts');
    expect(files).toContain('tracked.txt');

    // Scenario B: tracked.txt was properly logged by Ratio, but bypassed_direct.ts was not
    const bypassedUntrackedOnly = await watcher.detectBypassedWrites([
      join(tempDir, 'tracked.txt'),
    ]);
    expect(bypassedUntrackedOnly.length).toBe(1);
    expect(bypassedUntrackedOnly[0].file).toBe('bypassed_direct.ts');
    expect(bypassedUntrackedOnly[0].isBypassed).toBe(true);
    expect(bypassedUntrackedOnly[0].lineDelta).toBeGreaterThan(0);
  });

  it('ignores .ratio and .git directories', async () => {
    const initProc = Bun.spawn(['git', 'init'], { cwd: tempDir });
    await initProc.exited;

    // Write file inside .ratio
    await Bun.write(join(tempDir, '.ratio', 'test.log'), 'log entry\n');

    const watcher = new GitWatcher({ workspaceRoot: tempDir });
    const modified = await watcher.getModifiedFiles();
    expect(modified.some((m) => m.file.includes('.ratio'))).toBe(false);
  });
});
