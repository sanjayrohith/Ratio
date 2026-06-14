import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateSafeWritePath,
  isPathInside,
  PathSecurityError,
} from '../../src/core/security/path.js';
import { McpRequestDispatcher } from '../../src/server/dispatcher.js';
import { StagingBuffer } from '../../src/core/staging/buffer.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';

describe('Security Boundary & Path Traversal Prevention Tests', () => {
  let workspaceDir: string;
  let outsideDir: string;
  let dispatcher: McpRequestDispatcher;
  let stagingBuffer: StagingBuffer;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'ratio-sec-workspace-'));
    outsideDir = mkdtempSync(join(tmpdir(), 'ratio-sec-outside-'));

    stagingBuffer = new StagingBuffer();
    dispatcher = new McpRequestDispatcher(
      stagingBuffer,
      new ComplexityScorer(),
      {},
      'sec-turn',
      workspaceDir
    );
  });

  afterEach(() => {
    try {
      rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    try {
      rmSync(outsideDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Parent Directory Traversal (../)', () => {
    it('blocks simple ../ parent escapes via validateSafeWritePath', () => {
      expect(() => {
        validateSafeWritePath('../outside.txt', workspaceDir);
      }).toThrow(PathSecurityError);

      expect(() => {
        validateSafeWritePath('../../etc/passwd', workspaceDir);
      }).toThrow(PathSecurityError);

      expect(() => {
        validateSafeWritePath('../../../../../../etc/shadow', workspaceDir);
      }).toThrow(PathSecurityError);
    });

    it('blocks complex nested traversal sequences (a/b/../../../../outside)', () => {
      expect(() => {
        validateSafeWritePath('src/utils/../../../outside.txt', workspaceDir);
      }).toThrow(PathSecurityError);

      expect(() => {
        validateSafeWritePath('./subdir/nested/../../../../../../etc/passwd', workspaceDir);
      }).toThrow(PathSecurityError);
    });

    it('rejects ratio_write_file when path attempts directory traversal escaping workspace', async () => {
      expect(async () => {
        await dispatcher.dispatch('ratio_write_file', {
          path: '../../escaped.txt',
          content: 'malicious payload',
        });
      }).toThrow();

      expect(stagingBuffer.size).toBe(0);
      expect(existsSync(join(workspaceDir, '../../escaped.txt'))).toBe(false);
    });

    it('rejects ratio_edit_file when target attempts directory traversal escaping workspace', async () => {
      expect(async () => {
        await dispatcher.dispatch('ratio_edit_file', {
          path: '../escaped_edit.txt',
          edits: [{ oldText: 'a', newText: 'b' }],
        });
      }).toThrow();

      expect(stagingBuffer.size).toBe(0);
    });
  });

  describe('Absolute Path Escapes Outside Workspace', () => {
    it('blocks absolute paths pointing outside workspace root', () => {
      const outsideFile = join(outsideDir, 'forbidden.txt');

      expect(() => {
        validateSafeWritePath(outsideFile, workspaceDir);
      }).toThrow(PathSecurityError);

      expect(() => {
        validateSafeWritePath('/etc/passwd', workspaceDir);
      }).toThrow(PathSecurityError);

      expect(() => {
        validateSafeWritePath('/var/log/system.log', workspaceDir);
      }).toThrow(PathSecurityError);
    });

    it('rejects ratio_write_file with absolute path outside repository', async () => {
      const outsideFile = join(outsideDir, 'target.ts');

      expect(async () => {
        await dispatcher.dispatch('ratio_write_file', {
          path: outsideFile,
          content: 'export const hack = true;',
        });
      }).toThrow();

      expect(existsSync(outsideFile)).toBe(false);
      expect(stagingBuffer.size).toBe(0);
    });
  });

  describe('Null-Byte Poisoning Attacks', () => {
    it('blocks null-byte injection in path string', () => {
      expect(() => {
        validateSafeWritePath('safe.ts\0.evil.sh', workspaceDir);
      }).toThrow(/null byte/);

      expect(() => {
        validateSafeWritePath('\0/etc/passwd', workspaceDir);
      }).toThrow(/null byte/);

      expect(() => {
        validateSafeWritePath('valid/path.ts\0', workspaceDir);
      }).toThrow(/null byte/);
    });

    it('rejects ratio_write_file with null-byte in path', async () => {
      expect(async () => {
        await dispatcher.dispatch('ratio_write_file', {
          path: 'legit.ts\0malicious.sh',
          content: 'echo pwned',
        });
      }).toThrow();

      expect(stagingBuffer.size).toBe(0);
    });
  });

  describe('Internal & Sensitive Directory Protection (.git)', () => {
    it('blocks direct writes to .git directory', () => {
      expect(() => {
        validateSafeWritePath('.git', workspaceDir);
      }).toThrow(/\.git directory/);

      expect(() => {
        validateSafeWritePath('.git/config', workspaceDir);
      }).toThrow(/\.git directory/);

      expect(() => {
        validateSafeWritePath('./.git/hooks/pre-commit', workspaceDir);
      }).toThrow(/\.git directory/);

      expect(() => {
        validateSafeWritePath('subdir/../.git/HEAD', workspaceDir);
      }).toThrow(/\.git directory/);
    });

    it('rejects ratio_write_file targeting .git directory', async () => {
      expect(async () => {
        await dispatcher.dispatch('ratio_write_file', {
          path: '.git/hooks/post-checkout',
          content: '#!/bin/sh\nrm -rf /',
        });
      }).toThrow();

      expect(existsSync(join(workspaceDir, '.git/hooks/post-checkout'))).toBe(false);
      expect(stagingBuffer.size).toBe(0);
    });
  });

  describe('Symlink-Based Directory Traversal Escapes', () => {
    it('blocks traversal through symlinked directories pointing outside the workspace', () => {
      const symlinkTarget = outsideDir;
      const symlinkPath = join(workspaceDir, 'symlinked_outside');

      try {
        symlinkSync(symlinkTarget, symlinkPath, 'dir');
      } catch {
        // Skip if OS permission disallows symlink creation
        return;
      }

      // Attempting to write into workspace/symlinked_outside/escape.txt
      // resolves on disk to outsideDir/escape.txt
      const targetViaSymlink = join(symlinkPath, 'escape.txt');

      expect(() => {
        validateSafeWritePath(targetViaSymlink, workspaceDir);
      }).toThrow(/escapes workspace boundary via symlink/);
    });

    it('rejects ratio_write_file attempting to write through external symlink', async () => {
      const symlinkTarget = outsideDir;
      const symlinkPath = join(workspaceDir, 'external_link');

      try {
        symlinkSync(symlinkTarget, symlinkPath, 'dir');
      } catch {
        return;
      }

      const targetPath = join(symlinkPath, 'pwn.ts');

      expect(async () => {
        await dispatcher.dispatch('ratio_write_file', {
          path: targetPath,
          content: 'export const escaped = true;',
        });
      }).toThrow();

      expect(existsSync(join(outsideDir, 'pwn.ts'))).toBe(false);
      expect(stagingBuffer.size).toBe(0);
    });
  });

  describe('Valid In-Workspace Operations', () => {
    it('allows valid relative and absolute paths within workspace', () => {
      const validRel1 = validateSafeWritePath('src/index.ts', workspaceDir);
      expect(validRel1).toBe(join(workspaceDir, 'src/index.ts'));

      const validRel2 = validateSafeWritePath('./nested/deep/file.ts', workspaceDir);
      expect(validRel2).toBe(join(workspaceDir, 'nested/deep/file.ts'));

      const validAbs = validateSafeWritePath(join(workspaceDir, 'package.json'), workspaceDir);
      expect(validAbs).toBe(join(workspaceDir, 'package.json'));
    });

    it('successfully processes ratio_write_file for valid safe in-workspace path', async () => {
      const result = await dispatcher.dispatch('ratio_write_file', {
        path: 'src/main.ts',
        content: 'console.log("hello safe world");',
      });

      expect(result.content).toBeArray();
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse((result.content[0] as any).text);
      expect(parsed.status).toBeOneOf(['write_permitted', 'checkpoint_required']);
    });
  });
});
