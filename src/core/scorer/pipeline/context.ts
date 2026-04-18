import type { DependencyDiff, LineDeltaMetrics, ScoringThresholds } from '../types.js';
import type { LayerCategory } from '../layers.js';
import type { LayerTransitionResult } from '../transitions.js';

/**
 * Shared evaluation context passed across modular scoring pipeline stages.
 */
export interface EvaluationContext {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  turnFiles: string[];
  turnId: string;
  thresholds: ScoringThresholds;

  // Intermediate and aggregated stage outputs
  lineDelta?: LineDeltaMetrics;
  dependencyDiff?: DependencyDiff;
  layers?: LayerCategory[];
  layerTransitions?: LayerTransitionResult;

  // Triggers and concept decisions
  triggers: string[];
  primaryConcept?: string;
  suggestedQuestion?: string;

  // Scoring components
  lineScore: number;
  dependencyScore: number;
  layerScore: number;
  fileCountScore: number;
  totalRiskScore: number;

  metadata: Record<string, unknown>;
}

/**
 * Creates an initialized EvaluationContext with defaults.
 */
export function createEvaluationContext(options: {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  turnFiles?: string[];
  turnId?: string;
  thresholds: ScoringThresholds;
}): EvaluationContext {
  const turnFiles = options.turnFiles && options.turnFiles.length > 0
    ? [...options.turnFiles]
    : [options.filePath];

  if (!turnFiles.includes(options.filePath)) {
    turnFiles.push(options.filePath);
  }

  return {
    filePath: options.filePath,
    originalContent: options.originalContent,
    proposedContent: options.proposedContent,
    turnFiles,
    turnId: options.turnId ?? 'default',
    thresholds: options.thresholds,
    triggers: [],
    lineScore: 0,
    dependencyScore: 0,
    layerScore: 0,
    fileCountScore: 0,
    totalRiskScore: 0,
    metadata: {},
  };
}

/**
 * Interface representing a modular pipeline stage.
 */
export interface PipelineStage {
  readonly name: string;
  execute(ctx: EvaluationContext): void | Promise<void>;
}
