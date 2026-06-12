import { diffDependencies, detectManifestKind } from './dependencies.js';
import { defaultLayerTagger, LayerCategory, LayerTagger } from './layers.js';
import { LineDeltaCalculator } from './line-delta.js';
import {
  defaultTransitionDetector,
  LayerTransitionDetector,
} from './transitions.js';
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
export * from './pipeline/index.js';
export * from './cache.js';

/**
 * Heuristic complexity scorer evaluating line deltas, dependency additions,
 * and architectural layer crossings.
 */
export class ComplexityScorer {
  private thresholds: ScoringThresholds;
  private tagger: LayerTagger;
  private transitionDetector: LayerTransitionDetector;

  constructor(
    thresholds: Partial<ScoringThresholds> = {},
    tagger: LayerTagger = defaultLayerTagger,
    transitionDetector: LayerTransitionDetector = defaultTransitionDetector
  ) {
    this.thresholds = {
      ...DEFAULT_SCORING_THRESHOLDS,
      ...thresholds,
    };
    this.tagger = tagger;
    this.transitionDetector = transitionDetector;
  }

  /**
   * Evaluates proposed file changes against heuristic complexity thresholds and layer rules.
   * Features fast early-exit conditions for identical content and small diffs on trusted files (<5ms).
   */
  public evaluate(
    filePath: string,
    originalContent: string,
    proposedContent: string,
    turnId: string = 'default',
    options?: { trustScore?: number }
  ): ComplexityEvaluation {
    const startTime = performance.now();

    // Early-exit 1: Identical content (zero diff)
    if (originalContent === proposedContent) {
      const emptyLineDelta: LineDeltaMetrics = {
        linesAdded: 0,
        linesRemoved: 0,
        totalLinesChanged: 0,
        netLineDelta: 0,
      };
      const elapsed = performance.now() - startTime;
      return {
        exceedsThreshold: false,
        triggers: [],
        lineDelta: emptyLineDelta,
        layers: this.tagger.tagPath(filePath),
        layerTransitions: {
          layersTouched: [],
          filesTouched: [filePath],
          isMultiLayer: false,
          transitions: [],
          summary: 'No changes detected (identical content).',
        },
        concept: 'NO_OP_CHANGE',
        suggestedQuestion: 'No changes were made to the file.',
        summary: 'Change approved: identical content (0 lines changed).',
        earlyExit: true,
        executionTimeMs: elapsed,
      };
    }

    const manifestKind = detectManifestKind(filePath);
    const lineDelta = LineDeltaCalculator.calculate(originalContent, proposedContent);
    const isTrusted = options?.trustScore !== undefined ? options.trustScore >= 0.8 : true;

    // Early-exit 2: Small diff on trusted non-manifest file without layer transition triggers
    const isSmallDiff =
      lineDelta.totalLinesChanged <= Math.min(5, this.thresholds.maxTotalLinesChanged) &&
      lineDelta.linesAdded <= Math.min(5, this.thresholds.maxLinesAdded) &&
      lineDelta.linesRemoved <= Math.min(5, this.thresholds.maxLinesRemoved);

    if (isTrusted && manifestKind === 'unknown' && isSmallDiff) {
      const layers = this.tagger.tagPath(filePath);
      const layerTransitions = this.transitionDetector.recordWrite(filePath, turnId);

      if (!layerTransitions.isMultiLayer) {
        const elapsed = performance.now() - startTime;
        return {
          exceedsThreshold: false,
          triggers: [],
          lineDelta,
          layers,
          layerTransitions,
          concept: 'INCREMENTAL_EDIT',
          suggestedQuestion: 'Minor incremental change within trusted threshold.',
          summary: `Change approved: small diff on trusted file (${lineDelta.totalLinesChanged} lines changed).`,
          earlyExit: true,
          executionTimeMs: elapsed,
        };
      }
    }

    const triggers: string[] = [];

    // 1. Dependency analysis
    let dependencyDiff: DependencyDiff | undefined;
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

    // 2. Line threshold analysis
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

    // 3. Layer tagging & transition detection
    const layers = this.tagger.tagPath(filePath);
    const layerTransitions = this.transitionDetector.recordWrite(filePath, turnId);

    if (layerTransitions.isMultiLayer) {
      triggers.push(
        `Crosses architectural layer boundaries (${layerTransitions.layersTouched.join(' + ')})`
      );
    }

    const exceedsThreshold = triggers.length > 0;

    // 4. Determine Concept and Socratic question
    let concept = 'ARCHITECTURAL_RATIONALE';
    let suggestedQuestion: string;

    if (layerTransitions.isMultiLayer) {
      concept = 'MULTI_LAYER_CHANGE';
      suggestedQuestion = `Socratic Checkpoint: This turn modifies multiple architectural layers (${layerTransitions.layersTouched.join(' and ')}). Before writing to "${filePath}", explain: How do these layers interact, and how do you prevent breaking dependencies or data contract drift?`;
    } else if (dependencyDiff?.hasNewDependencies) {
      concept = 'DEPENDENCY_ADDITION';
      const added = dependencyDiff.addedPackages.join(', ');
      suggestedQuestion = `Socratic Checkpoint: This change introduces new third-party dependency (${added}) in "${filePath}". Before writing, explain: Why is this library necessary, what is its architectural footprint, and what failure risks does it introduce?`;
    } else if (layers.includes('auth')) {
      concept = 'AUTHENTICATION_ARCHITECTURE';
      suggestedQuestion = `Socratic Checkpoint: Modifying security/auth layer in "${filePath}". Before proceeding, explain: What is the exact verification mechanism implemented here, and how are unauthorized requests handled?`;
    } else if (layers.includes('db')) {
      concept = 'DATABASE_INTEGRITY';
      suggestedQuestion = `Socratic Checkpoint: Modifying persistent schema/database logic in "${filePath}". Before writing, explain: How does this change preserve data integrity and backward compatibility with existing data?`;
    } else {
      suggestedQuestion = `Socratic Checkpoint: This change modifies ${lineDelta.totalLinesChanged} lines (${lineDelta.linesAdded} added, ${lineDelta.linesRemoved} removed) in "${filePath}". Before writing, explain: What is the core architectural mechanism of this change and what failure modes does it guard against?`;
    }

    const summary = exceedsThreshold
      ? `Complexity thresholds exceeded: ${triggers.join('; ')}`
      : `Change approved: within complexity thresholds (${lineDelta.totalLinesChanged} lines changed).`;

    return {
      exceedsThreshold,
      triggers,
      lineDelta,
      layers,
      layerTransitions,
      dependencyDiff,
      concept,
      suggestedQuestion,
      summary,
      earlyExit: false,
      executionTimeMs: performance.now() - startTime,
    };
  }

  public getThresholds(): ScoringThresholds {
    return { ...this.thresholds };
  }

  public getTagger(): LayerTagger {
    return this.tagger;
  }

  public getTransitionDetector(): LayerTransitionDetector {
    return this.transitionDetector;
  }
}

export const defaultComplexityScorer = new ComplexityScorer();
