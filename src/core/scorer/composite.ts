import { defaultLayerTagger, LayerCategory, LayerTagger } from './layers.js';
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
import {
  ComplexityPipeline,
  createEvaluationContext,
  DependencyStage,
  LayerStage,
  SizeStage,
} from './pipeline/index.js';

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
 * Delegated to modular pipeline stages for extensibility and maintainability.
 */
export class CompositeScorer {
  private thresholds: ScoringThresholds;
  private tagger: LayerTagger;
  private transitionDetector: LayerTransitionDetector;
  private pipeline: ComplexityPipeline;

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
    this.pipeline = new ComplexityPipeline([
      new SizeStage(),
      new DependencyStage(),
      new LayerStage(this.tagger, this.transitionDetector),
    ]);
  }

  /**
   * Evaluates a file write/edit in the context of the current turn using modular stages.
   */
  public evaluate(input: CompositeInput): CompositeEvaluation {
    const ctx = createEvaluationContext({
      filePath: input.filePath,
      originalContent: input.originalContent,
      proposedContent: input.proposedContent,
      turnFiles: input.turnFiles,
      turnId: input.turnId,
      thresholds: this.thresholds,
    });

    return this.pipeline.execute(ctx);
  }
}

export const defaultCompositeScorer = new CompositeScorer();
