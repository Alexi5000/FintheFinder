import { describe, expect, it } from 'vitest';
import { loadEvalFixtures, runOfflineEvalSuite } from '@/server/evals/eval-suite';

describe('eval suite', () => {
  it('loads fixture-backed evals and preserves the negative control', () => {
    const fixtures = loadEvalFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    expect(fixtures.some((fixture) => fixture.expected.shouldPass === false)).toBe(true);
    expect(fixtures.map((fixture) => fixture.id)).toEqual(
      expect.arrayContaining([
        'prompt-injection-negative',
        'seo-spam-source-negative',
        'stale-conflicting-sources-negative',
        'malformed-output-negative',
        'missing-claims-negative',
        'citation-mismatch-negative',
        'overclaiming-cited-negative',
      ]),
    );

    const summary = runOfflineEvalSuite(fixtures);
    expect(summary.passed).toBe(true);
    expect(summary.results.some((result) => result.expectedPass === false && result.observedPass === false)).toBe(true);
  });
});
