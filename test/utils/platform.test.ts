import { describe, it, expect } from 'bun:test';
import {
  isWindows,
  stripBom,
  normalizePath,
  toPlatformPath,
  normalizeLineEndings,
  detectLineEnding,
  safeStdioBuffer,
  comparePaths,
  isPathSubdirectory,
} from '../../src/core/utils/platform.js';

describe('Cross-Platform Utilities & Edge Cases (platform.ts)', () => {
  it('detects runtime environment accurately', () => {
    const win = isWindows();
    expect(win).toBe(process.platform === 'win32');
  });

  it('strips UTF-8 Byte Order Mark (BOM)', () => {
    const withBom = '\uFEFFHello World';
    expect(stripBom(withBom)).toBe('Hello World');

    const withoutBom = 'Hello World';
    expect(stripBom(withoutBom)).toBe('Hello World');
  });

  it('normalizes Windows and POSIX file paths to forward slashes', () => {
    expect(normalizePath('src\\core\\utils\\platform.ts')).toBe('src/core/utils/platform.ts');
    expect(normalizePath('c:\\Users\\User\\project\\file.txt')).toBe('C:/Users/User/project/file.txt');
    expect(normalizePath('D:/codes//ratio///src/index.ts')).toBe('D:/codes/ratio/src/index.ts');
    expect(normalizePath('/var/log/ratio/')).toBe('/var/log/ratio');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('C:/')).toBe('C:/');
    expect(normalizePath('')).toBe('');
  });

  it('converts normalized paths to platform native separators', () => {
    const path = 'src/server/tools.ts';
    const converted = toPlatformPath(path);
    if (isWindows()) {
      expect(converted).toBe('src\\server\\tools.ts');
    } else {
      expect(converted).toBe('src/server/tools.ts');
    }
  });

  it('normalizes CRLF and mixed line endings to LF and CRLF', () => {
    const mixed = 'line 1\r\nline 2\nline 3\rline 4';
    const lf = normalizeLineEndings(mixed, 'lf');
    expect(lf).toBe('line 1\nline 2\nline 3\nline 4');

    const crlf = normalizeLineEndings(mixed, 'crlf');
    expect(crlf).toBe('line 1\r\nline 2\r\nline 3\r\nline 4');
  });

  it('detects prevailing line ending in text', () => {
    const crlfText = 'hello\r\nworld\r\nagain\r\n';
    expect(detectLineEnding(crlfText)).toBe('crlf');

    const lfText = 'hello\nworld\nagain\n';
    expect(detectLineEnding(lfText)).toBe('lf');
  });

  it('handles stdio buffers safely and strips binary UTF-8 BOM headers', () => {
    // UTF-8 BOM is 0xEF, 0xBB, 0xBF
    const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x22, 0x6a, 0x73, 0x6f, 0x6e, 0x22, 0x3a, 0x31, 0x7d]);
    const cleaned = safeStdioBuffer(bomBuffer);
    expect(cleaned.toString('utf8')).toBe('{"json":1}');

    const stringInput = 'test string';
    const stringBuf = safeStdioBuffer(stringInput);
    expect(stringBuf.toString('utf8')).toBe('test string');

    const uint8Input = new Uint8Array([65, 66, 67]);
    const uint8Buf = safeStdioBuffer(uint8Input);
    expect(uint8Buf.toString('utf8')).toBe('ABC');
  });

  it('compares file paths across platforms with case sensitivity rules', () => {
    expect(comparePaths('src/core/utils/platform.ts', 'src\\core\\utils\\platform.ts')).toBe(true);
    expect(comparePaths('/home/user/project', '/home/user/project')).toBe(true);
  });

  it('correctly checks subdirectory containment', () => {
    expect(isPathSubdirectory('src/core/utils/platform.ts', 'src')).toBe(true);
    expect(isPathSubdirectory('../outside.txt', 'src')).toBe(false);
  });
});
