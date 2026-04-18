import { LineDeltaCalculator } from '../line-delta.js';
import type { EvaluationContext, PipelineStage } from './context.js';

/**
 * Pipeline stage computing line delta and evaluating size-based complexity thresholds.
 */
export class SizeStage implements PipelineStage {
  public readonly name = 'SizeStage';

  public execute(ctx: EvaluationContext): void {
    const delta = LineDeltaCalculator.calculate(ctx.originalContent, ctx.proposedContent);
    ctx.lineDelta = delta;

    if (delta.linesAdded > ctx.thresholds.maxLinesAdded) {
      ctx.triggers.push(
        `Lines added (${delta.linesAdded}) exceeded threshold of ${ctx.thresholds.maxLinesAdded}`
      );
    }

    if (delta.totalLinesChanged > ctx.thresholds.maxTotalLinesChanged) {
      ctx.triggers.push(
        `Total lines changed (${delta.totalLinesChanged}) exceeded threshold of ${ctx.thresholds.maxTotalLinesChanged}`
      );
    }

    // Weight calculation: up to 35 points
    ctx.lineScore = Math.min(
      35,
      Math.round((delta.linesAdded / ctx.thresholds.maxLinesAdded) * 20) +
        Math.round((delta.totalLinesChanged / ctx.thresholds.maxTotalLinesChanged) * 15)
    );
  }
}
