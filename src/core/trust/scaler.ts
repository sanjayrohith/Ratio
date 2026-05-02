import { ScoringThresholds, DEFAULT_SCORING_THRESHOLDS } from '../scorer/types.js';

export interface DynamicScalerConfig {
  minScaleFactor: number; // Minimum scale factor at score = 0.0 (e.g. 0.2 -> 20% of base threshold)
  maxScaleFactor: number; // Scale factor at score = 1.0 (e.g. 1.0 -> 100% of base threshold)
  minLineFloor: number;   // Floor so threshold never falls below an unworkable number (e.g. 5 lines)
}

export const DEFAULT_SCALER_CONFIG: DynamicScalerConfig = {
  minScaleFactor: 0.25, // At trust = 0, lines allowed is 25% of normal limit
  maxScaleFactor: 1.0,  // At trust = 1.0, lines allowed is 100% of normal limit
  minLineFloor: 5,      // Minimum floor
};

/**
 * DynamicThresholdScaler scales line delta limits based on a file's trust score.
 *
 * Mathematical Scaling:
 * factor = minScaleFactor + (maxScaleFactor - minScaleFactor) * trustScore
 * scaledLimit = Math.max(minLineFloor, Math.round(baseLimit * factor))
 *
 * - High trust (1.0) -> full threshold (e.g. 50 lines added allowed) -> scaffolding fades.
 * - Low trust (0.0) -> tightened threshold (e.g. 12 lines added allowed) -> tight scaffolding.
 */
export class DynamicThresholdScaler {
  constructor(private readonly config: DynamicScalerConfig = DEFAULT_SCALER_CONFIG) {}

  /**
   * Computes the scaling factor for a given trust score [0.0, 1.0].
   */
  getScaleFactor(trustScore: number): number {
    const clamped = Math.max(0.0, Math.min(1.0, trustScore));
    return (
      this.config.minScaleFactor +
      (this.config.maxScaleFactor - this.config.minScaleFactor) * clamped
    );
  }

  /**
   * Scales a complete ScoringThresholds object according to trust score.
   */
  scaleThresholds(
    baseThresholds: ScoringThresholds = DEFAULT_SCORING_THRESHOLDS,
    trustScore: number
  ): ScoringThresholds {
    const factor = this.getScaleFactor(trustScore);

    return {
      maxLinesAdded: Math.max(
        this.config.minLineFloor,
        Math.round(baseThresholds.maxLinesAdded * factor)
      ),
      maxLinesRemoved: Math.max(
        this.config.minLineFloor * 2,
        Math.round(baseThresholds.maxLinesRemoved * factor)
      ),
      maxTotalLinesChanged: Math.max(
        this.config.minLineFloor,
        Math.round(baseThresholds.maxTotalLinesChanged * factor)
      ),
      // Dependency limit remains 0 (new packages always require review)
      maxDependenciesAdded: baseThresholds.maxDependenciesAdded,
      // Files per turn also scales slightly or remains stable
      maxFilesPerTurn: Math.max(1, Math.round(baseThresholds.maxFilesPerTurn * factor)),
    };
  }
}
