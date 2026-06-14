import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateSafeWritePath,
  isPathInside,
  PathSecurityError,
} from '../../src/core/security/path.js';

describe('Path Canonicalization & Workspace Boundary Validation Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-path-security-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('allows safe relative and absolute paths within workspace', () => {
    const safe1 = validateSafeWritePath('src/index.ts', tempDir);
    expect(safe1).toBe(join(tempDir, 'src/index.ts'));

    const safe2 = validateSafeWritePath('./package.json', tempDir);
    expect(safe2).toBe(join(tempDir, 'package.json'));

    const safeAbs = validateSafeWritePath(join(tempDir, 'docs/readme.md'), tempDir);
    expect(safeAbs).toBe(join(tempDir, 'docs/readme.md'));
  });

  it('rejects path traversal attempts escaping workspace root', () => {
    expect(() => {
      validateSafeWritePath('../../etc/passwd', tempDir);
    }).toThrow(PathSecurityError);

    expect(() => {
      validateSafeWritePath('../outside.txt', tempDir);
    }).toThrow(PathSecurityError);

    expect(() => {
      validateSafeWritePath('/etc/shadow', tempDir);
    }).toThrow(PathSecurityError);
  });

  it('blocks null-byte poisoning attacks', () => {
    expect(() => {
      validateSafeWritePath('safe.txt\0.evil.sh', tempDir);
    }).toThrow(/null byte/);
  });

  it('blocks writes into .git directory', () => {
    expect(() => {
      validateSafeWritePath('.git/hooks/pre-commit', tempDir);
    }).toThrow(/\.git directory/);

    expect(() => {
      validateSafeWritePath('./.git/config', tempDir);
    }).toThrow(/\.git directory/);
  });

  it('verifies isPathInside utility logic', () => {
    expect(isPathInside(join(tempDir, 'a/b'), tempDir)).toBe(true);
    expect(isPathInside(tempDir, tempDir)).toBe(true);
    expect(isPathInside('/tmp', tempDir)).toBe(false);
  });
});
