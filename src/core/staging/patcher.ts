import type { FileEditChunk } from '../../types/protocol.js';

export class PatchError extends Error {
  constructor(
    message: string,
    public readonly chunk?: FileEditChunk
  ) {
    super(message);
    this.name = 'PatchError';
  }
}

/**
 * Applies a single edit chunk to the content, optionally constrained by line range.
 */
export function applySingleChunk(content: string, edit: FileEditChunk): string {
  const { oldText, newText, startLine, endLine } = edit;

  if (oldText === '') {
    // If oldText is empty, prepend or append? In diff tools, oldText shouldn't be empty unless inserting.
    throw new PatchError('Target oldText to replace cannot be empty string.', edit);
  }

  // If line range is specified, restrict search to that line window
  if (startLine !== undefined || endLine !== undefined) {
    const lines = content.split('\n');
    const totalLines = lines.length;

    const fromLine = Math.max(1, startLine ?? 1);
    const toLine = Math.min(totalLines, endLine ?? totalLines);

    if (fromLine > toLine || fromLine > totalLines) {
      throw new PatchError(
        `Invalid line range [${fromLine}, ${toLine}] for file with ${totalLines} lines.`,
        edit
      );
    }

    // Line numbers are 1-indexed; array slice is 0-indexed
    const beforeSlice = lines.slice(0, fromLine - 1).join('\n');
    const targetSlice = lines.slice(fromLine - 1, toLine).join('\n');
    const afterSlice = lines.slice(toLine).join('\n');

    const indexInTarget = targetSlice.indexOf(oldText);
    if (indexInTarget === -1) {
      throw new PatchError(
        `Target text not found within line range [${fromLine}, ${toLine}].`,
        edit
      );
    }

    const replacedTarget =
      targetSlice.substring(0, indexInTarget) +
      newText +
      targetSlice.substring(indexInTarget + oldText.length);

    // Reassemble full content
    const parts: string[] = [];
    if (fromLine > 1) {
      parts.push(beforeSlice);
    }
    parts.push(replacedTarget);
    if (toLine < totalLines) {
      parts.push(afterSlice);
    }

    return parts.join('\n');
  }

  // No line range specified: find exact substring match
  const matchIndex = content.indexOf(oldText);
  if (matchIndex === -1) {
    throw new PatchError(`Target text to replace was not found in the file content.`, edit);
  }

  // Check for uniqueness if no line numbers were supplied
  const secondMatchIndex = content.indexOf(oldText, matchIndex + oldText.length);
  if (secondMatchIndex !== -1) {
    throw new PatchError(
      `Multiple occurrences of target text found. Please provide startLine/endLine to disambiguate.`,
      edit
    );
  }

  return (
    content.substring(0, matchIndex) +
    newText +
    content.substring(matchIndex + oldText.length)
  );
}

/**
 * Sequentially applies an array of edit chunks to the original file content.
 */
export function applyEdits(originalContent: string, edits: FileEditChunk[]): string {
  if (!edits || edits.length === 0) {
    return originalContent;
  }

  // If edits specify line numbers, process from bottom to top to keep line numbers intact
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.startLine !== undefined && b.startLine !== undefined) {
      return b.startLine - a.startLine;
    }
    return 0;
  });

  let currentContent = originalContent;
  for (const edit of sortedEdits) {
    currentContent = applySingleChunk(currentContent, edit);
  }

  return currentContent;
}
