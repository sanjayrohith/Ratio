import { isAbsolute, normalize, relative, resolve } from 'node:path';

/**
 * Returns true if current execution environment is Windows.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Strips UTF-8 Byte Order Mark (BOM) from string or buffer if present.
 */
export function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

/**
 * Normalizes all path separators to POSIX forward slashes ('/'),
 * standardizes Windows drive letters to uppercase, and removes trailing slashes.
 */
export function normalizePath(filePath: string): string {
  if (!filePath || filePath.trim().length === 0) {
    return '';
  }

  // Replace all backslashes with forward slashes
  let normalized = filePath.replace(/\\/g, '/');

  // Handle Windows drive letters (e.g. c:/ -> C:/)
  normalized = normalized.replace(/^([a-zA-Z]):\//, (_, drive) => `${drive.toUpperCase()}:/`);

  // Remove redundant multiple slashes (except protocol prefixes like file://)
  normalized = normalized.replace(/([^:])\/{2,}/g, '$1/');

  // Remove trailing slashes (unless it's root like "/" or "C:/")
  if (normalized.length > 1 && normalized.endsWith('/') && !/^[a-zA-Z]:\/$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Converts a normalized path to the native platform's path format (using \ on Windows).
 */
export function toPlatformPath(filePath: string): string {
  if (!filePath) return '';
  if (isWindows()) {
    return filePath.replace(/\//g, '\\');
  }
  return filePath.replace(/\\/g, '/');
}

/**
 * Normalizes line endings to LF (\n), CRLF (\r\n), or native OS default.
 * Handles mixed line endings within a single string.
 */
export function normalizeLineEndings(
  content: string,
  target: 'lf' | 'crlf' | 'native' = 'lf'
): string {
  if (!content) return content;

  // First convert all CRLF and CR to standard LF
  const unified = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (target === 'lf') {
    return unified;
  }

  if (target === 'crlf') {
    return unified.replace(/\n/g, '\r\n');
  }

  // native
  return isWindows() ? unified.replace(/\n/g, '\r\n') : unified;
}

/**
 * Detects whether content predominantly uses CRLF or LF line endings.
 */
export function detectLineEnding(content: string): 'crlf' | 'lf' {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfOnlyCount = (content.match(/[^\r]\n/g) || []).length;

  return crlfCount > lfOnlyCount ? 'crlf' : 'lf';
}

/**
 * Safely processes stdio binary or text chunks, ensuring valid UTF-8 encoding
 * and removing any Windows BOM headers.
 */
export function safeStdioBuffer(
  chunk: string | Buffer | Uint8Array,
  encoding: BufferEncoding = 'utf8'
): Buffer {
  let buf: Buffer;
  if (Buffer.isBuffer(chunk)) {
    buf = chunk;
  } else if (typeof chunk === 'string') {
    buf = Buffer.from(chunk, encoding);
  } else {
    buf = Buffer.from(chunk);
  }

  // Strip UTF-8 BOM if present at the start (EF BB BF)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }

  return buf;
}

/**
 * Compares two file paths for equivalence across platforms,
 * taking case-insensitivity into account on Windows and macOS.
 */
export function comparePaths(pathA: string, pathB: string): boolean {
  const normA = normalizePath(pathA);
  const normB = normalizePath(pathB);

  if (isWindows() || process.platform === 'darwin') {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

/**
 * Determines whether childPath is strictly inside parentDir across platform formats.
 */
export function isPathSubdirectory(childPath: string, parentDir: string): boolean {
  const normChild = normalizePath(resolve(childPath));
  const normParent = normalizePath(resolve(parentDir));

  if (normChild === normParent) {
    return true;
  }

  const rel = relative(normParent, normChild);
  return Boolean(rel && !rel.startsWith('..') && !isAbsolute(rel));
}
