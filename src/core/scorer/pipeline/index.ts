import type { CompositeEvaluation, RiskLevel } from '../composite.js';
import type { ScoringThresholds } from '../types.js';
import {
  createEvaluationContext,
  type EvaluationContext,
  type PipelineStage,
} from './context.js';
import { DependencyStage } from './dependency-stage.js';
import { LayerStage } from './layer-stage.js';
import { SizeStage } from './size-stage.js';

export * from './context.js';
export * from './size-stage.js';
export * from './dependency-stage.js';
export * from './layer-stage.js';

/**
 * Modular complexity evaluation pipeline executing size, dependency, and layer stages.
 */
export class ComplexityPipeline {
  private stages: PipelineStage[];

  constructor(stages?: PipelineStage[]) {
    this.stages = stages ?? [
      new SizeStage(),
      new DependencyStage(),
      new LayerStage(),
    ];
  }

  /**
   * Runs all pipeline stages sequentially against the evaluation context.
   */
  public execute(ctx: EvaluationContext): CompositeEvaluation {
    for (const stage of this.stages) {
      stage.execute(ctx);
    }

    const rawTotal =
      ctx.lineScore + ctx.dependencyScore + ctx.layerScore + ctx.fileCountScore;
    const riskScore = Math.min(100, rawTotal);
    ctx.totalRiskScore = riskScore;

    // Determine Risk Level
    let riskLevel: RiskLevel;
    const isMultiLayer = ctx.layerTransitions?.isMultiLayer ?? false;
    const layers = ctx.layers ?? [];
    const layersTouched = ctx.layerTransitions?.layersTouched ?? [];

    if (
      riskScore >= 75 ||
      ctx.triggers.length >= 2 ||
      layersTouched.length >= 3 ||
      (layersTouched.includes('auth') && layersTouched.includes('db'))
    ) {
      riskLevel = 'critical';
    } else if (riskScore >= 45 || ctx.triggers.length >= 1) {
      riskLevel = 'high';
    } else if (riskScore >= 20) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    const exceedsThreshold = ctx.triggers.length > 0 || riskScore >= 45;

    // Socratic question & concept selection
    let primaryConcept = 'ARCHITECTURAL_RATIONALE';
    let suggestedQuestion: string;

    if (isMultiLayer) {
      primaryConcept = 'MULTI_LAYER_CROSSING';
      suggestedQuestion = `Socratic Checkpoint: This turn touches multiple architectural layers (${layersTouched.join(' and ')}). Before writing to "${ctx.filePath}", explain: How do these layers interact, what contract binds them, and how do you ensure failure in one does not cascade?`;
    } else if (ctx.dependencyDiff?.hasNewDependencies) {
      primaryConcept = 'DEPENDENCY_ADDITION';
      const deps = ctx.dependencyDiff.addedPackages.join(', ');
      suggestedQuestion = `Socratic Checkpoint: This change introduces new third-party dependency (${deps}) in "${ctx.filePath}". Before writing, explain: Why is this external package needed over standard runtime libraries, and what are its security implications?`;
    } else if (layers.includes('auth')) {
      primaryConcept = 'AUTHENTICATION_ARCHITECTURE';
      suggestedQuestion = `Socratic Checkpoint: Modifying sensitive authentication layer in "${ctx.filePath}". Before proceeding, explain: What is the exact verification mechanism implemented here, and what happens if the secret or token is compromised?`;
    } else if (layers.includes('db')) {
      primaryConcept = 'DATABASE_INTEGRITY';
      suggestedQuestion = `Socratic Checkpoint: Modifying persistent schema / database logic in "${ctx.filePath}". Before writing, explain: How does this migration/model change handle zero-downtime deployment and existing records?`;
    } else {
      const lineDelta = ctx.lineDelta ?? { linesAdded: 0, linesRemoved: 0, totalLinesChanged: 0, netLineDelta: 0 };
      suggestedQuestion = `Socratic Checkpoint: Modifying ${lineDelta.totalLinesChanged} lines in "${ctx.filePath}". Before writing, explain: What is the core architectural mechanism of this change and what failure modes does it guard against?`;
    }

    ctx.primaryConcept = primaryConcept;
    ctx.suggestedQuestion = suggestedQuestion;

    const summary = exceedsThreshold
      ? `Composite risk high (${riskScore}/100, ${riskLevel}). Triggers: ${ctx.triggers.join('; ')}`
      : `Composite risk low (${riskScore}/100, ${riskLevel}). Within acceptable limits.`;

    return {
      riskScore,
      riskLevel,
      exceedsThreshold,
      triggers: ctx.triggers,
      primaryConcept,
      suggestedQuestion,
      layers,
      lineDelta: ctx.lineDelta ?? { linesAdded: 0, linesRemoved: 0, totalLinesChanged: 0, netLineDelta: 0 },
      layerTransitions: ctx.layerTransitions ?? {
        layersTouched: [],
        filesTouched: [ctx.filePath],
        isMultiLayer: false,
        transitions: [],
        summary: 'No transitions detected.',
      },
      dependencyDiff: ctx.dependencyDiff,
      breakdown: {
        lineScore: ctx.lineScore,
        layerScore: ctx.layerScore,
        dependencyScore: ctx.dependencyScore,
        fileCountScore: ctx.fileCountScore,
        totalScore: riskScore,
      },
      summary,
    };
  }
}
