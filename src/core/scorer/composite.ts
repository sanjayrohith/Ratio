import { diffDependencies, detectManifestKind } from './dependencies.js';
import { defaultLayerTagger, LayerCategory, LayerTagger } from './layers.js';
import { LineDeltaCalculator } from './line-delta.js';
import {
  defaultTransitionDetector,
  LayerTransitionDetector,
  LayerTransitionResult,
} from './transitions.js';
import {
  DEFAULT_SCORING_THRESHOLDS,
  type DependencyDiff,
  type LineDeltaMetrics,
  type ScoringThresholds,
} from './types.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ScoreBreakdown {
  lineScore: number;
  layerScore: number;
  dependencyScore: number;
  fileCountScore: number;
  totalScore: number;
}

export interface CompositeEvaluation {
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  exceedsThreshold: boolean;
  triggers: string[];
  primaryConcept: string;
  suggestedQuestion: string;
  layers: LayerCategory[];
  lineDelta: LineDeltaMetrics;
  layerTransitions: LayerTransitionResult;
  dependencyDiff?: DependencyDiff;
  breakdown: ScoreBreakdown;
  summary: string;
}

export interface CompositeInput {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  turnFiles?: string[];
  turnId?: string;
  rationale?: string;
}

/**
 * Composite scoring aggregator combining line delta, file count, layer transitions,
 * and dependency additions into a unified architectural risk assessment.
 */
export class CompositeScorer {
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
   * Evaluates a file write/edit in the context of the current turn.
   */
  public evaluate(input: CompositeInput): CompositeEvaluation {
    const { filePath, originalContent, proposedContent, turnFiles, turnId } = input;

    // 1. Line Delta calculation
    const lineDelta = LineDeltaCalculator.calculate(originalContent, proposedContent);

    // 2. Dependency detection
    let dependencyDiff: DependencyDiff | undefined;
    const manifestKind = detectManifestKind(filePath);
    if (manifestKind !== 'unknown') {
      dependencyDiff = diffDependencies(filePath, originalContent, proposedContent);
    }

    // 3. Layer classification & transition detection
    const fileLayers = this.tagger.tagPath(filePath);
    const effectiveFiles = turnFiles && turnFiles.length > 0 ? turnFiles : [filePath];
    if (!effectiveFiles.includes(filePath)) {
      effectiveFiles.push(filePath);
    }
    const layerTransitions = this.transitionDetector.analyzePaths(effectiveFiles);

    // 4. Triggers detection
    const triggers: string[] = [];

    if (dependencyDiff?.hasNewDependencies) {
      const added = dependencyDiff.addedPackages.join(', ');
      triggers.push(`Introduces new third-party dependencies: ${added}`);
    }

    if (layerTransitions.isMultiLayer) {
      triggers.push(
        `Crosses architectural layer boundaries (${layerTransitions.layersTouched.join(' + ')})`
      );
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

    if (effectiveFiles.length > this.thresholds.maxFilesPerTurn) {
      triggers.push(
        `Files modified in turn (${effectiveFiles.length}) exceeded limit of ${this.thresholds.maxFilesPerTurn}`
      );
    }

    // 5. Compute Weighted Risk Score (0 - 100)
    // Line Score (up to 35 pts)
    const lineScore = Math.min(
      35,
      Math.round((lineDelta.linesAdded / this.thresholds.maxLinesAdded) * 20) +
        Math.round((lineDelta.totalLinesChanged / this.thresholds.maxTotalLinesChanged) * 15)
    );

    // Dependency Score (up to 35 pts)
    const dependencyScore = dependencyDiff?.hasNewDependencies
      ? Math.min(35, dependencyDiff.addedPackages.length * 30)
      : 0;

    // Layer Score (up to 30 pts)
    let layerScore = 0;
    if (layerTransitions.isMultiLayer) {
      layerScore += 25;
    }
    if (fileLayers.includes('auth') || fileLayers.includes('db')) {
      layerScore += 10;
    }
    layerScore = Math.min(30, layerScore);

    // File Count Score (up to 20 pts)
    const fileCountScore = Math.min(
      20,
      Math.max(0, (effectiveFiles.length - 1) * 7)
    );

    const rawTotal = lineScore + dependencyScore + layerScore + fileCountScore;
    const riskScore = Math.min(100, rawTotal);

    // 6. Determine Risk Level
    let riskLevel: RiskLevel;
    if (riskScore >= 75 || triggers.length >= 2) {
      riskLevel = 'critical';
    } else if (riskScore >= 45 || triggers.length >= 1) {
      riskLevel = 'high';
    } else if (riskScore >= 20) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    const exceedsThreshold = triggers.length > 0 || riskScore >= 45;

    // 7. Select Primary Concept and Formulate Question
    let primaryConcept = 'ARCHITECTURAL_RATIONALE';
    let suggestedQuestion: string;

    if (layerTransitions.isMultiLayer) {
      primaryConcept = 'MULTI_LAYER_CROSSING';
      suggestedQuestion = `Socratic Checkpoint: This turn touches multiple architectural layers (${layerTransitions.layersTouched.join(' and ')}). Before writing to "${filePath}", explain: How do these layers interact, what contract binds them, and how do you ensure failure in one does not cascade?`;
    } else if (dependencyDiff?.hasNewDependencies) {
      primaryConcept = 'DEPENDENCY_ADDITION';
      const deps = dependencyDiff.addedPackages.join(', ');
      suggestedQuestion = `Socratic Checkpoint: This change introduces new third-party dependency (${deps}) in "${filePath}". Before writing, explain: Why is this external package needed over standard runtime libraries, and what are its security implications?`;
    } else if (fileLayers.includes('auth')) {
      primaryConcept = 'AUTHENTICATION_ARCHITECTURE';
      suggestedQuestion = `Socratic Checkpoint: Modifying sensitive authentication layer in "${filePath}". Before proceeding, explain: What is the exact verification mechanism implemented here, and what happens if the secret or token is compromised?`;
    } else if (fileLayers.includes('db')) {
      primaryConcept = 'DATABASE_INTEGRITY';
      suggestedQuestion = `Socratic Checkpoint: Modifying persistent schema / database logic in "${filePath}". Before writing, explain: How does this migration/model change handle zero-downtime deployment and existing records?`;
    } else {
      suggestedQuestion = `Socratic Checkpoint: Modifying ${lineDelta.totalLinesChanged} lines in "${filePath}". Before writing, explain: What is the core architectural mechanism of this change and what failure modes does it guard against?`;
    }

    const summary = exceedsThreshold
      ? `Composite risk high (${riskScore}/100, ${riskLevel}). Triggers: ${triggers.join('; ')}`
      : `Composite risk low (${riskScore}/100, ${riskLevel}). Within acceptable limits.`;

    return {
      riskScore,
      riskLevel,
      exceedsThreshold,
      triggers,
      primaryConcept,
      suggestedQuestion,
      layers: fileLayers,
      lineDelta,
      layerTransitions,
      dependencyDiff,
      breakdown: {
        lineScore,
        layerScore,
        dependencyScore,
        fileCountScore,
        totalScore: riskScore,
      },
      summary,
    };
  }
}

export const defaultCompositeScorer = new CompositeScorer();
