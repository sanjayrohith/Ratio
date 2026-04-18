import type { LayerCategory } from './layers.js';
import type { LayerTransitionResult } from './transitions.js';

/**
 * Types and interfaces for the Heuristic Complexity Scorer.
 */

export type ManifestKind = 'npm' | 'pip' | 'cargo' | 'poetry' | 'go' | 'unknown';

export interface LineDeltaMetrics {
  linesAdded: number;
  linesRemoved: number;
  totalLinesChanged: number;
  netLineDelta: number;
}

export interface DependencyDiff {
  manifestKind: ManifestKind;
  manifestPath: string;
  addedPackages: string[];
  removedPackages: string[];
  updatedPackages: string[];
  hasNewDependencies: boolean;
}

export interface ScoringThresholds {
  maxLinesAdded: number;
  maxLinesRemoved: number;
  maxTotalLinesChanged: number;
  maxDependenciesAdded: number;
  maxFilesPerTurn: number;
}

export const DEFAULT_SCORING_THRESHOLDS: ScoringThresholds = {
  maxLinesAdded: 50,
  maxLinesRemoved: 100,
  maxTotalLinesChanged: 60,
  maxDependenciesAdded: 0, // Flag ANY newly added third-party library by default
  maxFilesPerTurn: 3,
};

export interface ComplexityEvaluation {
  exceedsThreshold: boolean;
  triggers: string[];
  lineDelta: LineDeltaMetrics;
  layers?: LayerCategory[];
  layerTransitions?: LayerTransitionResult;
  dependencyDiff?: DependencyDiff;
  concept?: string;
  suggestedQuestion?: string;
  summary: string;
}
