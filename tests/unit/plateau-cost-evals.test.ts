import { describe, expect, it } from 'vitest';
import { estimateRunCost, isBudgetExceeded } from '@/server/research/cost-model';
import { scoreResearchPlateau } from '@/server/research/plateau-scorer';
import { runOfflineEval } from '@/server/evals/offline-eval';
import type { EvalFixture } from '@/server/evals/offline-eval';

describe('plateau scorer', () => {
  it('continues when critical gaps are open', () => {
    const decision = scoreResearchPlateau({
      iteration: 2,
      supportedClaims: 4,
      previousSupportedClaims: 4,
      openCriticalGaps: 1,
      uniqueDomains: 4,
      contradictionCount: 0,
      citationCoverage: 1,
      budgetRemainingUsd: 1,
    });
    expect(decision.shouldContinue).toBe(true);
    expect(decision.reasons).toContain('critical_gaps_open');
  });

  it('stops on plateau when coverage is sufficient', () => {
    const decision = scoreResearchPlateau({
      iteration: 3,
      supportedClaims: 6,
      previousSupportedClaims: 6,
      openCriticalGaps: 0,
      uniqueDomains: 4,
      contradictionCount: 0,
      citationCoverage: 1,
      budgetRemainingUsd: 1,
    });
    expect(decision.shouldContinue).toBe(false);
    expect(decision.reasons).toContain('marginal_gain_plateau');
  });
});

describe('cost model', () => {
  it('estimates model and search cost from a pricing snapshot', () => {
    const cost = estimateRunCost({
      exaSearches: 2,
      modelCalls: [{ model: 'gpt-5.4-mini', inputTokens: 1000, outputTokens: 500 }],
    });
    expect(cost.searchCostUsd).toBe(0.01);
    expect(cost.totalUsd).toBeGreaterThan(cost.searchCostUsd);
    expect(isBudgetExceeded({ exaSearches: 1000, modelCalls: [] }, 1)).toBe(true);
  });
});

describe('offline eval runner', () => {
  it('scores a cited report with required caveats as passing', () => {
    const fixture: EvalFixture = {
      id: 'unit_eval',
      prompt: 'fixture',
      expected: {
        requiredCaveats: ['uncertainty'],
        minimumCitationCoverage: 1,
        forbiddenPhrases: ['risk-free'],
      },
      actual: {
        sources: [
          {
            id: 'src_1',
            title: 'Source',
            url: 'https://example.com/source',
            canonicalUrl: 'https://example.com/source',
            domain: 'example.com',
            snippet: '',
            content: '',
            publishedAt: null,
            score: 1,
            credibility: 'high',
            relevanceReason: 'fixture',
          },
        ],
        report: {
          id: 'report_1',
          sessionId: 'session_1',
          title: 'Report',
          executiveSummary: 'Summary with uncertainty.',
          sections: [{ heading: 'Finding', body: 'Body', sourceIds: ['src_1'] }],
          citations: [{ sourceId: 'src_1', url: 'https://example.com/source', title: 'Source' }],
          markdown: '# Report\n\nThis preserves uncertainty.',
          createdAt: '2026-06-24T00:00:00.000Z',
        },
      },
    };
    expect(runOfflineEval(fixture).passed).toBe(true);
  });
});
