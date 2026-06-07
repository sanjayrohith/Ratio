import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeConfigGet, executeConfigSet } from '../../src/cli/commands/config.js';
import { createProgram, ExitCode } from '../../src/cli/index.js';
import { generateDefaultConfigJson } from '../../src/core/config/schema.js';

describe('Ratio CLI Config Command Unit & Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-config-test-'));
    originalCwd = process.cwd();
    // Seed default ratio.config.json
    writeFileSync(join(tempDir, 'ratio.config.json'), generateDefaultConfigJson(), 'utf-8');
  });

  afterEach(() => {
    process.exitCode = 0;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('executeConfigGet', () => {
    it('returns the entire parsed configuration when no key is specified', async () => {
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => output.push(args.join(' '));

      try {
        const res = await executeConfigGet(undefined, { cwd: tempDir });
        expect(res.success).toBe(true);
        expect(res.config).toBeDefined();
        expect(res.config!.thresholds.maxLinesAdded).toBe(50);
        expect(res.config!.weights.lineWeight).toBe(1.0);

        const stdout = output.join('\n');
        const parsed = JSON.parse(stdout);
        expect(parsed.thresholds.maxLinesAdded).toBe(50);
      } finally {
        console.log = originalLog;
      }
    });

    it('retrieves nested configuration values using dot notation', async () => {
      const res = await executeConfigGet('thresholds.maxLinesAdded', { cwd: tempDir });
      expect(res.success).toBe(true);
      expect(res.key).toBe('thresholds.maxLinesAdded');
      expect(res.value).toBe(50);
    });

    it('retrieves values using shorthand threshold, weight, trust, and storage aliases', async () => {
      const thresholdRes = await executeConfigGet('maxLinesAdded', { cwd: tempDir });
      expect(thresholdRes.success).toBe(true);
      expect(thresholdRes.value).toBe(50);

      const weightRes = await executeConfigGet('lineWeight', { cwd: tempDir });
      expect(weightRes.success).toBe(true);
      expect(weightRes.value).toBe(1.0);

      const trustRes = await executeConfigGet('initial', { cwd: tempDir });
      expect(trustRes.success).toBe(true);
      expect(trustRes.value).toBe(1.0);

      const storageRes = await executeConfigGet('walMode', { cwd: tempDir });
      expect(storageRes.success).toBe(true);
      expect(storageRes.value).toBe(true);
    });

    it('returns error when requesting a non-existent configuration key', async () => {
      const res = await executeConfigGet('nonexistent.path.value', { cwd: tempDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });

    it('handles missing ratio.config.json by falling back to defaults', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'ratio-config-empty-'));
      try {
        const res = await executeConfigGet('thresholds.maxLinesAdded', { cwd: emptyDir });
        expect(res.success).toBe(true);
        expect(res.value).toBe(50);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('executeConfigSet', () => {
    it('modifies numeric threshold using dot notation and updates ratio.config.json', async () => {
      const res = await executeConfigSet('thresholds.maxLinesAdded', '150', { cwd: tempDir });
      expect(res.success).toBe(true);
      expect(res.value).toBe(150);
      expect(res.previousValue).toBe(50);

      const onDisk = JSON.parse(readFileSync(join(tempDir, 'ratio.config.json'), 'utf-8'));
      expect(onDisk.thresholds.maxLinesAdded).toBe(150);
      // Unchanged keys should be preserved
      expect(onDisk.thresholds.maxLinesRemoved).toBe(100);
      expect(onDisk.weights.lineWeight).toBe(1.0);
    });

    it('modifies threshold using shorthand alias', async () => {
      const res = await executeConfigSet('maxLinesRemoved', '75', { cwd: tempDir });
      expect(res.success).toBe(true);
      expect(res.value).toBe(75);

      const onDisk = JSON.parse(readFileSync(join(tempDir, 'ratio.config.json'), 'utf-8'));
      expect(onDisk.thresholds.maxLinesRemoved).toBe(75);
    });

    it('coerces boolean values correctly', async () => {
      const res1 = await executeConfigSet('storage.walMode', 'false', { cwd: tempDir });
      expect(res1.success).toBe(true);
      expect(res1.value).toBe(false);

      let onDisk = JSON.parse(readFileSync(join(tempDir, 'ratio.config.json'), 'utf-8'));
      expect(onDisk.storage.walMode).toBe(false);

      const res2 = await executeConfigSet('storage.walMode', 'true', { cwd: tempDir });
      expect(res2.success).toBe(true);
      expect(res2.value).toBe(true);

      onDisk = JSON.parse(readFileSync(join(tempDir, 'ratio.config.json'), 'utf-8'));
      expect(onDisk.storage.walMode).toBe(true);
    });

    it('rejects invalid numbers and booleans', async () => {
      const numRes = await executeConfigSet('thresholds.maxLinesAdded', 'invalid_number', { cwd: tempDir });
      expect(numRes.success).toBe(false);
      expect(numRes.error).toContain('Invalid numeric value');

      const boolRes = await executeConfigSet('storage.walMode', 'not_a_bool', { cwd: tempDir });
      expect(boolRes.success).toBe(false);
      expect(boolRes.error).toContain('Invalid boolean value');
    });

    it('validates schema bounds (e.g. min 1 for maxLinesAdded)', async () => {
      const res = await executeConfigSet('thresholds.maxLinesAdded', '-5', { cwd: tempDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Schema validation failed');
    });

    it('creates ratio.config.json if not present when setting a value', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'ratio-config-empty-'));
      try {
        const res = await executeConfigSet('thresholds.maxLinesAdded', '220', { cwd: emptyDir });
        expect(res.success).toBe(true);
        expect(res.value).toBe(220);

        const onDisk = JSON.parse(readFileSync(join(emptyDir, 'ratio.config.json'), 'utf-8'));
        expect(onDisk.thresholds.maxLinesAdded).toBe(220);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('Commander CLI Dispatching', () => {
    it('executes ratio config get command via program CLI dispatching', async () => {
      process.chdir(tempDir);
      const program = createProgram();

      const output: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => output.push(args.join(' '));

      try {
        await program.parseAsync(['bun', 'ratio', 'config', 'get', 'thresholds.maxLinesAdded']);
        const stdout = output.join('\n');
        expect(stdout).toContain('thresholds.maxLinesAdded = 50');
      } finally {
        console.log = originalLog;
      }
    });

    it('executes ratio config set command via program CLI dispatching', async () => {
      process.chdir(tempDir);
      const program = createProgram();

      await program.parseAsync(['bun', 'ratio', 'config', 'set', 'thresholds.maxLinesAdded', '180']);

      const onDisk = JSON.parse(readFileSync(join(tempDir, 'ratio.config.json'), 'utf-8'));
      expect(onDisk.thresholds.maxLinesAdded).toBe(180);
    });

    it('sets USER_ERROR exit code when invalid key or value passed through commander', async () => {
      process.chdir(tempDir);
      const program = createProgram();

      await program.parseAsync(['bun', 'ratio', 'config', 'get', 'invalid.missing.key']);
      expect(process.exitCode).toBe(ExitCode.USER_ERROR);

      process.exitCode = 0;
      const setProgram = createProgram();
      await setProgram.parseAsync(['bun', 'ratio', 'config', 'set', 'thresholds.maxLinesAdded', 'not_a_number']);
      expect(process.exitCode).toBe(ExitCode.USER_ERROR);
    });
  });
});
