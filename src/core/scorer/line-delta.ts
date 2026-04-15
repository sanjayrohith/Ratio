import type { LineDeltaMetrics } from './types.js';

/**
 * Calculates line-level diff metrics between original and proposed file contents.
 */
export class LineDeltaCalculator {
  /**
   * Computes lines added, removed, total lines changed, and net delta.
   */
  public static calculate(
    originalContent: string,
    proposedContent: string
  ): LineDeltaMetrics {
    // If contents are identical, no lines were changed
    if (originalContent === proposedContent) {
      return {
        linesAdded: 0,
        linesRemoved: 0,
        totalLinesChanged: 0,
        netLineDelta: 0,
      };
    }

    const origLines = originalContent === '' ? [] : originalContent.split('\n');
    const propLines = proposedContent === '' ? [] : proposedContent.split('\n');

    // Case 1: Brand new file creation
    if (origLines.length === 0) {
      return {
        linesAdded: propLines.length,
        linesRemoved: 0,
        totalLinesChanged: propLines.length,
        netLineDelta: propLines.length,
      };
    }

    // Case 2: Complete file deletion / clearing
    if (propLines.length === 0) {
      return {
        linesAdded: 0,
        linesRemoved: origLines.length,
        totalLinesChanged: origLines.length,
        netLineDelta: -origLines.length,
      };
    }

    // Optimization: Trim common prefix
    let prefix = 0;
    while (
      prefix < origLines.length &&
      prefix < propLines.length &&
      origLines[prefix] === propLines[prefix]
    ) {
      prefix++;
    }

    // Optimization: Trim common suffix
    let origSuffix = origLines.length - 1;
    let propSuffix = propLines.length - 1;
    while (
      origSuffix >= prefix &&
      propSuffix >= prefix &&
      origLines[origSuffix] === propLines[propSuffix]
    ) {
      origSuffix--;
      propSuffix--;
    }

    const middleOrig = origLines.slice(prefix, origSuffix + 1);
    const middleProp = propLines.slice(prefix, propSuffix + 1);

    if (middleOrig.length === 0) {
      const added = middleProp.length;
      return {
        linesAdded: added,
        linesRemoved: 0,
        totalLinesChanged: added,
        netLineDelta: added,
      };
    }

    if (middleProp.length === 0) {
      const removed = middleOrig.length;
      return {
        linesAdded: 0,
        linesRemoved: removed,
        totalLinesChanged: removed,
        netLineDelta: -removed,
      };
    }

    // Compute LCS on the middle portion
    const lcsLength = this.computeLcs(middleOrig, middleProp);
    const linesAdded = middleProp.length - lcsLength;
    const linesRemoved = middleOrig.length - lcsLength;

    return {
      linesAdded,
      linesRemoved,
      totalLinesChanged: linesAdded + linesRemoved,
      netLineDelta: propLines.length - origLines.length,
    };
  }

  /**
   * Computes length of Longest Common Subsequence of lines using dynamic programming.
   */
  private static computeLcs(a: string[], b: string[]): number {
    const m = a.length;
    const n = b.length;

    // Space-optimized DP table (single row + previous row)
    let prev = new Uint32Array(n + 1);
    let curr = new Uint32Array(n + 1);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      prev.set(curr);
      curr.fill(0);
    }

    return prev[n];
  }
}
