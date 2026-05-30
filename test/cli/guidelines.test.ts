import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  injectClaudeGuidelines,
  injectAllGuidelines,
  RATIO_MARKER_START,
  RATIO_MARKER_END,
} from '../../src/cli/configurators/guidelines.js';

describe('Guidelines Template Injector Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-guidelines-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates CLAUDE.md when no existing file is present', async () => {
    const res = await injectClaudeGuidelines(tempDir);
    expect(res.created).toBe(true);
    expect(existsSync(res.path)).toBe(true);

    const content = readFileSync(res.path, 'utf-8');
    expect(content).toContain(RATIO_MARKER_START);
    expect(content).toContain(RATIO_MARKER_END);
    expect(content).toContain('ratio_write_file');
    expect(content).toContain('ratio_submit_answer');
  });

  it('appends to existing CLAUDE.md preserving prior project instructions', async () => {
    const claudePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(claudePath, '# My Existing Project\nRun `npm test` before committing.\n', 'utf-8');

    const res = await injectClaudeGuidelines(tempDir);
    expect(res.created).toBe(false);
    expect(res.updated).toBe(true);

    const content = readFileSync(claudePath, 'utf-8');
    expect(content).toContain('# My Existing Project');
    expect(content).toContain('Run `npm test` before committing.');
    expect(content).toContain(RATIO_MARKER_START);
    expect(content).toContain('ratio_write_file');
  });

  it('updates existing marked block without duplicating content', async () => {
    const claudePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(
      claudePath,
      `# Header\n\n${RATIO_MARKER_START}\nOld guidelines\n${RATIO_MARKER_END}\n\n# Footer\n`,
      'utf-8'
    );

    const res = await injectClaudeGuidelines(tempDir);
    expect(res.updated).toBe(true);

    const content = readFileSync(claudePath, 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('# Footer');
    expect(content).not.toContain('Old guidelines');
    expect(content).toContain('ratio_write_file');

    // Ensure markers appear exactly once
    const firstIndex = content.indexOf(RATIO_MARKER_START);
    const lastIndex = content.lastIndexOf(RATIO_MARKER_START);
    expect(firstIndex).toBe(lastIndex);
  });

  it('injects all agent guidelines including cursor and opencode rules', async () => {
    const res = await injectAllGuidelines(tempDir);
    expect(res.claudeMd.created).toBe(true);
    expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursorrules'))).toBe(true);
    expect(existsSync(join(tempDir, 'opencode-rules.md'))).toBe(true);
  });
});
