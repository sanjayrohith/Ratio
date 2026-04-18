import { detectManifestKind, diffDependencies } from '../dependencies.js';
import type { EvaluationContext, PipelineStage } from './context.js';

/**
 * Pipeline stage detecting manifest files and third-party library additions.
 */
export class DependencyStage implements PipelineStage {
  public readonly name = 'DependencyStage';

  public execute(ctx: EvaluationContext): void {
    const manifestKind = detectManifestKind(ctx.filePath);
    if (manifestKind === 'unknown') {
      ctx.dependencyScore = 0;
      return;
    }

    const diff = diffDependencies(ctx.filePath, ctx.originalContent, ctx.proposedContent);
    ctx.dependencyDiff = diff;

    if (diff.hasNewDependencies) {
      if (diff.addedPackages.length > ctx.thresholds.maxDependenciesAdded) {
        ctx.triggers.push(
          `Added new third-party dependencies: ${diff.addedPackages.join(', ')}`
        );
      }
      ctx.dependencyScore = Math.min(35, diff.addedPackages.length * 30);
    } else {
      ctx.dependencyScore = 0;
    }
  }
}
