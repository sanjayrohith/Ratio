import { describe, it, expect } from 'bun:test';
import { ComplexityScorer } from '../../src/core/scorer/index.js';

describe('ComplexityScorer Early-Exit Optimizations (<5ms)', () => {
  const scorer = new ComplexityScorer({
    maxLinesAdded: 50,
    maxTotalLinesChanged: 60,
  });

  it('early-exits immediately for identical content in <1ms', () => {
    const content = 'const a = 1;\nconst b = 2;\nfunction test() { return a + b; }';
    const start = performance.now();
    const result = scorer.evaluate('src/utils/math.ts', content, content);
    const duration = performance.now() - start;

    expect(result.earlyExit).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.lineDelta.totalLinesChanged).toBe(0);
    expect(duration).toBeLessThan(5); // Well under 5ms constraint
  });

  it('early-exits for minor incremental edits on trusted files in <5ms', () => {
    const original = 'export function add(a: number, b: number) {\n  return a + b;\n}\n';
    const proposed = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

    const start = performance.now();
    const result = scorer.evaluate('src/utils/calc.ts', original, proposed, 'turn-1', {
      trustScore: 1.0,
    });
    const duration = performance.now() - start;

    expect(result.earlyExit).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.lineDelta.totalLinesChanged).toBeLessThanOrEqual(5);
    expect(duration).toBeLessThan(5);
  });

  it('does NOT early-exit on package manifest modifications even for small diffs', () => {
    const original = '{\n  "name": "app",\n  "dependencies": {}\n}';
    const proposed = '{\n  "name": "app",\n  "dependencies": {\n    "lodash": "^4.17.21"\n  }\n}';

    const result = scorer.evaluate('package.json', original, proposed, 'turn-2', {
      trustScore: 1.0,
    });

    expect(result.earlyExit).toBe(false);
    expect(result.dependencyDiff?.hasNewDependencies).toBe(true);
    expect(result.exceedsThreshold).toBe(true);
  });

  it('does NOT early-exit when file trust score is low', () => {
    const original = 'let x = 1;\n';
    const proposed = 'let x = 2;\n';

    const result = scorer.evaluate('src/utils/calc.ts', original, proposed, 'turn-3', {
      trustScore: 0.3, // Low trust
    });

    expect(result.earlyExit).toBe(false);
  });

  it('does NOT early-exit on large diffs exceeding complexity thresholds', () => {
    const original = 'line 1\n';
    const largeAddition = Array.from({ length: 80 }, (_, i) => `line ${i + 2}`).join('\n');
    const proposed = original + largeAddition + '\n';

    const result = scorer.evaluate('src/utils/data.ts', original, proposed, 'turn-4', {
      trustScore: 1.0,
    });

    expect(result.earlyExit).toBe(false);
    expect(result.exceedsThreshold).toBe(true);
    expect(result.triggers.length).toBeGreaterThan(0);
  });
});
