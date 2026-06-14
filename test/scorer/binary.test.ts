import { describe, it, expect } from 'bun:test';
import {
  isBinaryFilePath,
  isBinaryContent,
  isNonTextAsset,
  getBinaryAssetCategory,
} from '../../src/core/scorer/binary.js';
import { ComplexityScorer } from '../../src/core/scorer/index.js';

describe('Binary & Media File Detection and Checkpoint Bypass Tests', () => {
  describe('Path & Extension Classification', () => {
    it('correctly classifies image file paths', () => {
      expect(isBinaryFilePath('public/images/logo.png')).toBe(true);
      expect(isBinaryFilePath('src/assets/hero.jpg')).toBe(true);
      expect(isBinaryFilePath('favicon.ico')).toBe(true);
      expect(isBinaryFilePath('icons/user.webp')).toBe(true);
      expect(getBinaryAssetCategory('img.png')).toBe('image');
    });

    it('correctly classifies font files', () => {
      expect(isBinaryFilePath('fonts/Inter-Regular.woff2')).toBe(true);
      expect(isBinaryFilePath('public/fonts/roboto.ttf')).toBe(true);
      expect(isBinaryFilePath('fonts/custom.otf')).toBe(true);
      expect(getBinaryAssetCategory('font.woff2')).toBe('font');
    });

    it('correctly classifies media and archive files', () => {
      expect(isBinaryFilePath('assets/audio/chime.mp3')).toBe(true);
      expect(isBinaryFilePath('videos/intro.mp4')).toBe(true);
      expect(isBinaryFilePath('backups/bundle.zip')).toBe(true);
      expect(isBinaryFilePath('dist/bundle.wasm')).toBe(true);
      expect(getBinaryAssetCategory('video.mp4')).toBe('media');
      expect(getBinaryAssetCategory('data.zip')).toBe('archive');
    });

    it('identifies source code as text files', () => {
      expect(isBinaryFilePath('src/index.ts')).toBe(false);
      expect(isBinaryFilePath('server.py')).toBe(false);
      expect(isBinaryFilePath('main.go')).toBe(false);
      expect(isBinaryFilePath('package.json')).toBe(false);
      expect(getBinaryAssetCategory('src/index.ts')).toBe('text');
    });
  });

  describe('Content Null-Byte Inspection', () => {
    it('identifies binary content with null bytes', () => {
      const rawString = 'PNG\r\n\x1a\n\0\0\0\rIHDR';
      expect(isBinaryContent(rawString)).toBe(true);
      expect(isNonTextAsset('unknown-file', rawString)).toBe(true);

      const uint8 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]);
      expect(isBinaryContent(uint8)).toBe(true);
    });

    it('identifies standard utf-8 text as non-binary', () => {
      const text = 'export const hello = "world";\nconsole.log(hello);\n';
      expect(isBinaryContent(text)).toBe(false);
      expect(isNonTextAsset('src/app.ts', text)).toBe(false);
    });
  });

  describe('ComplexityScorer Binary Bypass Integration', () => {
    it('bypasses checkpoints for image writes even under zero threshold', () => {
      const scorer = new ComplexityScorer({
        maxLinesAdded: 0,
        maxTotalLinesChanged: 0,
      });

      const res = scorer.evaluate('public/logo.png', '', 'raw binary buffer representation...');
      expect(res.exceedsThreshold).toBe(false);
      expect(res.concept).toBe('BINARY_ASSET');
      expect(res.earlyExit).toBe(true);
      expect(res.summary).toContain('binary/media asset bypass');
    });

    it('bypasses checkpoints for font writes', () => {
      const scorer = new ComplexityScorer({
        maxLinesAdded: 0,
        maxTotalLinesChanged: 0,
      });

      const res = scorer.evaluate('fonts/inter.woff2', '', 'font content');
      expect(res.exceedsThreshold).toBe(false);
      expect(res.concept).toBe('BINARY_ASSET');
      expect(res.earlyExit).toBe(true);
    });

    it('still evaluates code files normally with threshold enforcement', () => {
      const scorer = new ComplexityScorer({
        maxLinesAdded: 2,
        maxTotalLinesChanged: 2,
      });

      const code = Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`).join('\n');
      const res = scorer.evaluate('src/utils.ts', '', code);
      expect(res.exceedsThreshold).toBe(true);
      expect(res.concept).not.toBe('BINARY_ASSET');
    });
  });
});
