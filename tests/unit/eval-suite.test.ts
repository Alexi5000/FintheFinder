import { describe, expect, it } from 'vitest';
import { loadEvalFixtures, runOfflineEvalSuite } from '@/server/evals/eval-suite';

describe('eval suite', () => {
  it('loads fixture-backed evals and preserves the negative control', () => {
    const fixtures = loadEvalFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    expect(fixtures.some((fixture) => fixture.expected.shouldPass === false)).toBe(true);

    const summary = runOfflineEvalSuite(fixtures);
    expect(summary.passed).toBe(true);
    expect(summary.results.some((result) => result.expectedPass === false && result.observedPass === false)).toBe(true);
  });
});
