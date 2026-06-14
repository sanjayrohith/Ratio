import { resolve, normalize, relative, isAbsolute } from 'node:path';
import { realpathSync, existsSync } from 'node:fs';

export class PathSecurityError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * Checks if childPath is strictly inside or equal to parentDir.
 */
export function isPathInside(childPath: string, parentDir: string): boolean {
  const rel = relative(parentDir, childPath);
  return Boolean(rel && !rel.startsWith('..') && !isAbsolute(rel)) || rel === '';
}

/**
 * Validates and canonicalizes a file path ensuring it does not escape the repository/workspace boundary,
 * contains no null-byte injection, and does not touch protected internal directories (like .git).
 */
export function validateSafeWritePath(
  targetPath: string,
  workspaceRoot: string = process.cwd()
): string {
  // 1. Check for null byte poisoning
  if (targetPath.includes('\0')) {
    throw new PathSecurityError('Path contains illegal null bytes.', targetPath);
  }

  const trimmed = targetPath.trim();
  if (trimmed.length === 0) {
    throw new PathSecurityError('Target path must not be empty.', targetPath);
  }

  // 2. Canonicalize workspace root
  const canonicalRoot = existsSync(workspaceRoot)
    ? realpathSync(resolve(workspaceRoot))
    : resolve(workspaceRoot);

  // 3. Resolve target path against workspace root
  const resolvedTarget = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(canonicalRoot, trimmed);

  // 4. Resolve symlinks on existing ancestors to prevent symlink traversal escapes
  let currentCheck = resolvedTarget;
  while (!existsSync(currentCheck)) {
    const parent = resolve(currentCheck, '..');
    if (parent === currentCheck) break;
    currentCheck = parent;
  }

  let realAncestor = currentCheck;
  if (existsSync(currentCheck)) {
    try {
      realAncestor = realpathSync(currentCheck);
    } catch {
      // Ignore realpath failure on virtual/mock paths
    }
  }

  if (!isPathInside(realAncestor, canonicalRoot)) {
    throw new PathSecurityError(
      `Access denied: path escapes workspace boundary via symlink or parent resolution: "${targetPath}"`,
      targetPath
    );
  }

  // 5. Verify resolved target is inside canonical workspace
  if (!isPathInside(resolvedTarget, canonicalRoot)) {
    throw new PathSecurityError(
      `Access denied: path escapes workspace boundary: "${targetPath}"`,
      targetPath
    );
  }

  // 6. Block writes into sensitive internal directories (.git)
  const relativeToRoot = relative(canonicalRoot, resolvedTarget);
  const normalizedRel = normalize(relativeToRoot).replace(/\\/g, '/');
  if (
    normalizedRel === '.git' ||
    normalizedRel.startsWith('.git/') ||
    normalizedRel.includes('/.git/')
  ) {
    throw new PathSecurityError(
      `Access denied: writing to .git directory is prohibited: "${targetPath}"`,
      targetPath
    );
  }

  return resolvedTarget;
}
