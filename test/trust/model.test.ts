import { describe, it, expect } from 'bun:test';
import {
  calculateTrustScore,
  clampScore,
  DEFAULT_TRUST_SCORE_CONFIG,
} from '../../src/core/trust/model.js';

describe('Trust Score Mathematical Model Unit Tests', () => {
  it('clamps values strictly within boundaries [0.0, 1.0]', () => {
    expect(clampScore(1.25)).toBe(1.0);
    expect(clampScore(-0.35)).toBe(0.0);
    expect(clampScore(0.55555)).toBe(0.5556); // 4-decimal precision
    expect(clampScore(0.0)).toBe(0.0);
    expect(clampScore(1.0)).toBe(1.0);
  });

  it('decays score on failed checkpoints by penalty (-0.25)', () => {
    const initial = DEFAULT_TRUST_SCORE_CONFIG.initialScore; // 1.0
    const decayed1 = calculateTrustScore(initial, 'failed');
    expect(decayed1).toBe(0.75);

    const decayed2 = calculateTrustScore(decayed1, 'failed');
    expect(decayed2).toBe(0.5);

    const decayed3 = calculateTrustScore(decayed2, 'failed');
    expect(decayed3).toBe(0.25);

    const decayed4 = calculateTrustScore(decayed3, 'failed');
    expect(decayed4).toBe(0.0);

    // Further failures clamp at 0.0 floor
    const decayed5 = calculateTrustScore(decayed4, 'failed');
    expect(decayed5).toBe(0.0);
  });

  it('increments score on passed checkpoints by recovery (+0.10)', () => {
    const startScore = 0.5;
    const recovered1 = calculateTrustScore(startScore, 'passed');
    expect(recovered1).toBe(0.6);

    const recovered2 = calculateTrustScore(recovered1, 'passed');
    expect(recovered2).toBe(0.7);

    // Near boundary clamps at 1.0 ceiling
    const nearCeiling = 0.95;
    const recoveredCeiling = calculateTrustScore(nearCeiling, 'passed');
    expect(recoveredCeiling).toBe(1.0);
  });

  it('supports custom deltas for weighted evaluation scores', () => {
    // E.g., student answer received custom fine-grained penalty (-0.15)
    const score = calculateTrustScore(0.8, 'failed', DEFAULT_TRUST_SCORE_CONFIG, -0.15);
    expect(score).toBe(0.65);

    // E.g., student answer was brilliant, bonus boost (+0.2)
    const boosted = calculateTrustScore(0.65, 'passed', DEFAULT_TRUST_SCORE_CONFIG, 0.2);
    expect(boosted).toBe(0.85);
  });
});
