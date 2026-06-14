import { resolve, normalize, relative, isAbsolute } from 'node:path';
import { realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

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
  workspaceRoot?: string
): string {
  // 1. Check for null byte poisoning
  if (targetPath.includes('\0')) {
    throw new PathSecurityError('Path contains illegal null bytes.', targetPath);
  }

  const trimmed = targetPath.trim();
  if (trimmed.length === 0) {
    throw new PathSecurityError('Target path must not be empty.', targetPath);
  }

  const allowedRoots = workspaceRoot
    ? [existsSync(workspaceRoot) ? realpathSync(resolve(workspaceRoot)) : resolve(workspaceRoot)]
    : [
        existsSync(process.cwd()) ? realpathSync(resolve(process.cwd())) : resolve(process.cwd()),
        existsSync(tmpdir()) ? realpathSync(resolve(tmpdir())) : resolve(tmpdir()),
      ];

  const primaryRoot = allowedRoots[0];
  const resolvedTarget = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(primaryRoot, trimmed);

  const matchedRoot = allowedRoots.find((root) => isPathInside(resolvedTarget, root));
  if (!matchedRoot) {
    throw new PathSecurityError(
      `Access denied: path escapes workspace boundary: "${targetPath}"`,
      targetPath
    );
  }

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

  if (!isPathInside(realAncestor, matchedRoot)) {
    throw new PathSecurityError(
      `Access denied: path escapes workspace boundary via symlink or parent resolution: "${targetPath}"`,
      targetPath
    );
  }

  // 6. Block writes into sensitive internal directories (.git)
  const relativeToMatched = relative(matchedRoot, resolvedTarget);
  const normalizedRel = normalize(relativeToMatched).replace(/\\/g, '/');
  if (
    normalizedRel === '.git' ||
    normalizedRel.startsWith('.git/') ||
    normalizedRel.includes('/.git/') ||
    resolvedTarget.replace(/\\/g, '/').includes('/.git/') ||
    resolvedTarget.replace(/\\/g, '/').endsWith('/.git')
  ) {
    throw new PathSecurityError(
      `Access denied: writing to .git directory is prohibited: "${targetPath}"`,
      targetPath
    );
  }

  return resolvedTarget;
}
