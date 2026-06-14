import { describe, it, expect } from 'bun:test';
import {
  applySingleChunk,
  applyEdits,
  isZeroByteContent,
  isFileDeletion,
  PatchError,
} from '../../src/core/staging/patcher.js';

describe('Patcher Edge Cases: Zero-Byte Files, Empty Replacements & Deletions', () => {
  describe('Zero-Byte File Creation & Empty Content', () => {
    it('handles zero-byte file detection', () => {
      expect(isZeroByteContent('')).toBe(true);
      expect(isZeroByteContent('hello')).toBe(false);
    });

    it('applies edit to empty file when oldText is empty', () => {
      const result = applySingleChunk('', {
        oldText: '',
        newText: 'console.log("Hello from empty file");',
      });
      expect(result).toBe('console.log("Hello from empty file");');
    });

    it('rejects edit on empty file if non-empty oldText was expected', () => {
      expect(() => {
        applySingleChunk('', {
          oldText: 'some existing text',
          newText: 'replacement',
        });
      }).toThrow(PatchError);
    });

    it('returns empty string if editing empty file with empty replacement', () => {
      const result = applySingleChunk('', {
        oldText: '',
        newText: '',
      });
      expect(result).toBe('');
    });
  });

  describe('Empty Replacement Strings & Text Deletion', () => {
    it('deletes substring when newText is empty string', () => {
      const original = 'const a = 1;\nconst unused = 2;\nconst b = 3;';
      const result = applySingleChunk(original, {
        oldText: 'const unused = 2;\n',
        newText: '',
      });
      expect(result).toBe('const a = 1;\nconst b = 3;');
    });

    it('truncates entire file content when newText is empty and oldText matches content', () => {
      const original = 'all of this code will be deleted';
      const result = applySingleChunk(original, {
        oldText: original,
        newText: '',
      });
      expect(result).toBe('');
      expect(isFileDeletion(original, result)).toBe(true);
    });

    it('deletes target chunk within line range constraint', () => {
      const original = 'line 1\nline 2 (delete me)\nline 3';
      const result = applySingleChunk(original, {
        oldText: 'line 2 (delete me)',
        newText: '',
        startLine: 2,
        endLine: 2,
      });
      expect(result).toBe('line 1\nline 3');
    });
  });

  describe('Pure Insertions (oldText is empty)', () => {
    it('inserts at beginning when startLine is 1', () => {
      const original = 'export const b = 2;';
      const result = applySingleChunk(original, {
        oldText: '',
        newText: 'export const a = 1;',
        startLine: 1,
      });
      expect(result).toBe('export const a = 1;\nexport const b = 2;');
    });

    it('appends at end when no startLine is specified', () => {
      const original = 'export const a = 1;';
      const result = applySingleChunk(original, {
        oldText: '',
        newText: 'export const b = 2;',
      });
      expect(result).toBe('export const a = 1;\nexport const b = 2;');
    });
  });

  describe('Multiple Edits with Deletions and Insertions', () => {
    it('applies sequential edits containing both deletion and replacement', () => {
      const original = 'function foo() {\n  return 1;\n}\n\nfunction unused() {}\n';
      const edits = [
        {
          oldText: 'function unused() {}\n',
          newText: '',
        },
        {
          oldText: 'return 1;',
          newText: 'return 42;',
        },
      ];

      const result = applyEdits(original, edits);
      expect(result).toContain('return 42;');
      expect(result).not.toContain('unused');
    });

    it('returns original content when edits array is empty', () => {
      const original = 'export const untouched = true;';
      expect(applyEdits(original, [])).toBe(original);
    });
  });
});
