import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
}

export interface AtomicWriteResult {
  filePath: string;
  bytesWritten: number;
}

/**
 * Ensures that the directory for a given path exists recursively.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Checks whether a file exists at the given path.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Safely reads the text content of a file, returning null if it does not exist.
 */
export async function safeReadFile(
  filePath: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, { encoding });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Safely writes content to disk atomically by writing to a temporary sibling file
 * and renaming it into place. Ensures parent directories exist.
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string | Uint8Array,
  options: AtomicWriteOptions = {}
): Promise<AtomicWriteResult> {
  const absolutePath = resolve(targetPath);
  const parentDir = dirname(absolutePath);

  // Ensure parent directory exists
  await ensureDir(parentDir);

  const encoding = options.encoding ?? 'utf-8';
  const tmpSuffix = randomBytes(4).toString('hex');
  const tmpPath = `${absolutePath}.ratio-tmp-${Date.now()}-${tmpSuffix}`;

  const data = typeof content === 'string' ? Buffer.from(content, encoding) : content;

  try {
    // Write contents to temporary file
    await fs.writeFile(tmpPath, data, { mode: options.mode });

    // Atomically rename into place
    await fs.rename(tmpPath, absolutePath);

    return {
      filePath: absolutePath,
      bytesWritten: data.byteLength,
    };
  } catch (error) {
    // Cleanup temporary file if it was created
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}

/**
 * Deletes a file safely if it exists.
 */
export async function removeFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
