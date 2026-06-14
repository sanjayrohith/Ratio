import { describe, it, expect } from 'bun:test';
import { runFeatureSimulation } from '../../scripts/simulate-feature.js';

describe('PRD Demo Feature Simulation Tests', () => {
  it('executes full PRD demo feature flow and clears all checkpoints successfully', async () => {
    const report = await runFeatureSimulation({ verbose: false, cleanup: true });

    expect(report.steps.length).toBe(4);
    expect(report.totalCommittedFiles).toBe(4);
    expect(report.totalCheckpoints).toBeGreaterThanOrEqual(2);
    expect(report.durationMs).toBeLessThan(10000);

    for (const step of report.steps) {
      expect(step.status).toBe('write_permitted');
    }
  });
});
