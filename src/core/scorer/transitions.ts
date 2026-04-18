import { defaultLayerTagger, LayerCategory, LayerTagger } from './layers.js';

export interface LayerTransition {
  from: LayerCategory;
  to: LayerCategory;
  file: string;
  timestamp: Date;
}

export interface LayerTransitionResult {
  layersTouched: LayerCategory[];
  filesTouched: string[];
  isMultiLayer: boolean;
  transitions: LayerTransition[];
  summary: string;
}

interface TurnRecord {
  file: string;
  layers: LayerCategory[];
  timestamp: Date;
}

/**
 * Detects architectural layer transitions across concurrent or sequential file writes within a single turn.
 */
export class LayerTransitionDetector {
  private tagger: LayerTagger;
  private turnHistory: Map<string, TurnRecord[]> = new Map();
  private turnTtlMs: number;

  constructor(
    tagger: LayerTagger = defaultLayerTagger,
    turnTtlMs: number = 60_000 // 1 minute default turn correlation window
  ) {
    this.tagger = tagger;
    this.turnTtlMs = turnTtlMs;
  }

  /**
   * Analyzes a list of file paths (e.g. batch changes) for cross-layer transitions.
   */
  public analyzePaths(filePaths: string[]): LayerTransitionResult {
    const layersTouchedSet = new Set<LayerCategory>();
    const transitions: LayerTransition[] = [];
    const filesTouched = [...filePaths];

    let previousLayer: LayerCategory | null = null;

    for (const file of filePaths) {
      const categories = this.tagger.tagPath(file);
      for (const cat of categories) {
        layersTouchedSet.add(cat);
        if (previousLayer && previousLayer !== cat) {
          transitions.push({
            from: previousLayer,
            to: cat,
            file,
            timestamp: new Date(),
          });
        }
        previousLayer = cat;
      }
    }

    const layersTouched = Array.from(layersTouchedSet);
    const isMultiLayer = layersTouched.length > 1;

    const summary = isMultiLayer
      ? `Cross-layer modification detected across [${layersTouched.join(', ')}].`
      : layersTouched.length === 1
        ? `Single layer modification within [${layersTouched[0]}].`
        : 'No specific architectural layers detected.';

    return {
      layersTouched,
      filesTouched,
      isMultiLayer,
      transitions,
      summary,
    };
  }

  /**
   * Records a file write into the active turn session and detects whether it crosses
   * layer boundaries relative to previous writes in the same turn.
   */
  public recordWrite(filePath: string, turnId: string = 'default'): LayerTransitionResult {
    const now = new Date();
    const records = this.getCleanTurnRecords(turnId, now);

    const newLayers = this.tagger.tagPath(filePath);
    records.push({
      file: filePath,
      layers: newLayers,
      timestamp: now,
    });
    this.turnHistory.set(turnId, records);

    const allFiles = records.map((r) => r.file);
    return this.analyzePaths(allFiles);
  }

  /**
   * Resets the turn history for a given turn ID or for all turns.
   */
  public reset(turnId?: string): void {
    if (turnId) {
      this.turnHistory.delete(turnId);
    } else {
      this.turnHistory.clear();
    }
  }

  /**
   * Retrieves and prunes expired records for the given turn ID.
   */
  private getCleanTurnRecords(turnId: string, now: Date): TurnRecord[] {
    const existing = this.turnHistory.get(turnId) ?? [];
    const cutoff = now.getTime() - this.turnTtlMs;
    return existing.filter((r) => r.timestamp.getTime() >= cutoff);
  }
}

export const defaultTransitionDetector = new LayerTransitionDetector();
