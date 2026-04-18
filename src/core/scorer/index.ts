import { diffDependencies, detectManifestKind } from './dependencies.js';
import { LineDeltaCalculator } from './line-delta.js';
import {
  DEFAULT_SCORING_THRESHOLDS,
  type ComplexityEvaluation,
  type DependencyDiff,
  type ScoringThresholds,
} from './types.js';

export * from './types.js';
export * from './line-delta.js';
export * from './dependencies.js';
export * from './layers.js';
export * from './transitions.js';
export * from './composite.js';

/**
 * Heuristic complexity scorer evaluating line deltas and dependency additions.
 */
export class ComplexityScorer {
  private thresholds: ScoringThresholds;

  constructor(thresholds: Partial<ScoringThresholds> = {}) {
    this.thresholds = {
      ...DEFAULT_SCORING_THRESHOLDS,
      ...thresholds,
    };
  }

  /**
   * Evaluates proposed file changes against heuristic complexity thresholds.
   */
  public evaluate(
    filePath: string,
    originalContent: string,
    proposedContent: string
  ): ComplexityEvaluation {
    const lineDelta = LineDeltaCalculator.calculate(originalContent, proposedContent);
    const triggers: string[] = [];

    let dependencyDiff: DependencyDiff | undefined;
    const manifestKind = detectManifestKind(filePath);
    if (manifestKind !== 'unknown') {
      dependencyDiff = diffDependencies(filePath, originalContent, proposedContent);
      if (
        dependencyDiff.hasNewDependencies &&
        dependencyDiff.addedPackages.length > this.thresholds.maxDependenciesAdded
      ) {
        triggers.push(
          `Added new third-party dependencies: ${dependencyDiff.addedPackages.join(', ')}`
        );
      }
    }

    if (lineDelta.linesAdded > this.thresholds.maxLinesAdded) {
      triggers.push(
        `Lines added (${lineDelta.linesAdded}) exceeded threshold of ${this.thresholds.maxLinesAdded}`
      );
    }

    if (lineDelta.totalLinesChanged > this.thresholds.maxTotalLinesChanged) {
      triggers.push(
        `Total lines changed (${lineDelta.totalLinesChanged}) exceeded threshold of ${this.thresholds.maxTotalLinesChanged}`
      );
    }

    const exceedsThreshold = triggers.length > 0;
    const summary = exceedsThreshold
      ? `Complexity thresholds exceeded: ${triggers.join('; ')}`
      : `Change approved: within complexity thresholds (${lineDelta.totalLinesChanged} lines changed).`;

    return {
      exceedsThreshold,
      triggers,
      lineDelta,
      dependencyDiff,
      summary,
    };
  }

  public getThresholds(): ScoringThresholds {
    return { ...this.thresholds };
  }
}

export const defaultComplexityScorer = new ComplexityScorer();
