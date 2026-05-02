/**
 * Mathematical model and parameters for per-file trust scoring (faded scaffolding).
 *
 * Trust score is bounded within [0.0, 1.0]:
 * - 1.0 represents high student mastery: scaffolding fades (loose thresholds, fewer checkpoints).
 * - 0.0 represents low student mastery: strict scaffolding (tight thresholds, frequent checkpoints).
 */

export interface TrustScoreConfig {
  initialScore: number;
  decayPenalty: number; // Applied on failed checkpoint (-0.25)
  recoveryIncrement: number; // Applied on passed checkpoint (+0.1)
  minScore: number;
  maxScore: number;
}

export const DEFAULT_TRUST_SCORE_CONFIG: TrustScoreConfig = {
  initialScore: 1.0,
  decayPenalty: -0.25,
  recoveryIncrement: 0.1,
  minScore: 0.0,
  maxScore: 1.0,
};

/**
 * Clamps a score strictly within [minScore, maxScore].
 */
export function clampScore(score: number, min = 0.0, max = 1.0): number {
  const clamped = Math.max(min, Math.min(max, score));
  // Round to 4 decimal places to prevent floating point noise
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Calculates updated trust score after an evaluation event.
 * If scoreDelta is provided directly, it is applied.
 * Otherwise, passed -> +recoveryIncrement, failed -> decayPenalty.
 */
export function calculateTrustScore(
  currentScore: number,
  outcome: 'passed' | 'failed',
  config: TrustScoreConfig = DEFAULT_TRUST_SCORE_CONFIG,
  customDelta?: number
): number {
  const delta =
    customDelta !== undefined
      ? customDelta
      : outcome === 'passed'
      ? config.recoveryIncrement
      : config.decayPenalty;

  return clampScore(currentScore + delta, config.minScore, config.maxScore);
}
