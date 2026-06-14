import { extname } from 'node:path';

export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.avif',
]);

export const FONT_EXTENSIONS = new Set([
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
]);

export const MEDIA_EXTENSIONS = new Set([
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.flac',
  '.aac',
  '.mov',
  '.avi',
  '.mkv',
]);

export const ARCHIVE_AND_BINARY_EXTENSIONS = new Set([
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.pdf',
  '.wasm',
  '.bin',
  '.exe',
  '.dmg',
  '.iso',
  '.so',
  '.dylib',
  '.dll',
]);

export const ALL_BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...FONT_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
  ...ARCHIVE_AND_BINARY_EXTENSIONS,
]);

export type BinaryAssetCategory =
  | 'image'
  | 'font'
  | 'media'
  | 'archive'
  | 'binary'
  | 'text';

/**
 * Determines whether a file path has an extension typical of binary/media assets.
 */
export function isBinaryFilePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ALL_BINARY_EXTENSIONS.has(ext);
}

/**
 * Classifies the binary asset category based on its file extension.
 */
export function getBinaryAssetCategory(filePath: string): BinaryAssetCategory {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (MEDIA_EXTENSIONS.has(ext)) return 'media';
  if (ARCHIVE_AND_BINARY_EXTENSIONS.has(ext)) return 'archive';
  return isBinaryFilePath(filePath) ? 'binary' : 'text';
}

/**
 * Checks whether content contains null bytes or high-density non-printable characters
 * indicating raw binary data.
 */
export function isBinaryContent(content: string | Uint8Array): boolean {
  if (content instanceof Uint8Array) {
    const checkLen = Math.min(content.length, 8000);
    for (let i = 0; i < checkLen; i++) {
      if (content[i] === 0) return true;
    }
    return false;
  }

  // String check
  const checkLen = Math.min(content.length, 8000);
  const sample = content.substring(0, checkLen);
  return sample.includes('\0');
}

/**
 * Determines whether a target write is a non-text asset (image, font, audio, video, binary)
 * based on path extension or content null-byte inspection.
 */
export function isNonTextAsset(
  filePath: string,
  content?: string | Uint8Array
): boolean {
  if (isBinaryFilePath(filePath)) {
    return true;
  }
  if (content !== undefined && isBinaryContent(content)) {
    return true;
  }
  return false;
}
