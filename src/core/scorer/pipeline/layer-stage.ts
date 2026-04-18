import { defaultLayerTagger, LayerTagger } from '../layers.js';
import { defaultTransitionDetector, LayerTransitionDetector } from '../transitions.js';
import type { EvaluationContext, PipelineStage } from './context.js';

/**
 * Pipeline stage tagging architectural layers and detecting multi-layer transitions.
 */
export class LayerStage implements PipelineStage {
  public readonly name = 'LayerStage';

  private tagger: LayerTagger;
  private transitionDetector: LayerTransitionDetector;

  constructor(
    tagger: LayerTagger = defaultLayerTagger,
    transitionDetector: LayerTransitionDetector = defaultTransitionDetector
  ) {
    this.tagger = tagger;
    this.transitionDetector = transitionDetector;
  }

  public execute(ctx: EvaluationContext): void {
    const layers = this.tagger.tagPath(ctx.filePath);
    ctx.layers = layers;

    const layerTransitions = this.transitionDetector.analyzePaths(ctx.turnFiles);
    ctx.layerTransitions = layerTransitions;

    if (layerTransitions.isMultiLayer) {
      ctx.triggers.push(
        `Crosses architectural layer boundaries (${layerTransitions.layersTouched.join(' + ')})`
      );
    }

    if (ctx.turnFiles.length > ctx.thresholds.maxFilesPerTurn) {
      ctx.triggers.push(
        `Files modified in turn (${ctx.turnFiles.length}) exceeded limit of ${ctx.thresholds.maxFilesPerTurn}`
      );
    }

    // Layer risk score: up to 30 pts
    let layerScore = 0;
    if (layerTransitions.isMultiLayer) {
      layerScore += 25;
    }
    if (layers.includes('auth') || layers.includes('db')) {
      layerScore += 10;
    }
    ctx.layerScore = Math.min(30, layerScore);

    // File count score: up to 20 pts
    ctx.fileCountScore = Math.min(20, Math.max(0, (ctx.turnFiles.length - 1) * 7));
  }
}
