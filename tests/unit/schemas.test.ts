import { describe, expect, it } from 'vitest';
import {
  createResearchSessionSchema,
  evalHistoryResponseSchema,
  evalResultSchema,
  evalRunSchema,
  evalRunWithResultsSchema,
  evalSuiteSummarySchema,
  researchApprovalSchema,
  researchMemorySchema,
  researchPacketSchema,
  runCostSchema,
  upsertResearchMemorySchema,
} from '@/lib/schemas';

describe('research schemas', () => {
  it('accepts a valid research session request', () => {
    expect(createResearchSessionSchema.parse({ query: 'Research agentic AI evaluation systems' })).toEqual({
      query: 'Research agentic AI evaluation systems',
    });
  });

  it('rejects empty research requests', () => {
    expect(() => createResearchSessionSchema.parse({ query: '  ' })).toThrow();
  });

  it('requires typed research packets', () => {
    expect(() =>
      researchPacketSchema.parse({
        queries: ['agent evals'],
        searchResults: [],
        evaluations: [],
        learnings: [],
        completedQueries: [],
        phase: 'complete',
      }),
    ).not.toThrow();
  });

  it('accepts typed run cost and memory records', () => {
    expect(() =>
      runCostSchema.parse({
        id: 'cost_1',
        runId: 'run_1',
        sessionId: 'session_1',
        usage: { modelCalls: [{ model: 'gpt-5.5', inputTokens: 100, outputTokens: 50 }], exaSearches: 2 },
        modelCostUsd: 0.00125,
        searchCostUsd: 0.01,
        totalUsd: 0.01125,
        pricingEffectiveDate: '2026-06-24',
        measurementMethod: 'estimated',
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    ).not.toThrow();

    expect(() =>
      researchMemorySchema.parse({
        id: 'memory_1',
        userId: 'user_1',
        sessionId: 'session_1',
        scope: 'session',
        namespace: 'run_summary',
        key: 'run:run_1',
        value: { status: 'awaiting_approval' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('validates explicit research memory writes', () => {
    expect(() =>
      upsertResearchMemorySchema.parse({
        sessionId: 'session_1',
        scope: 'session',
        namespace: 'procedure',
        key: 'operator-note:1',
        value: { note: 'Prefer primary sources.' },
      }),
    ).not.toThrow();
  });

  it('accepts typed human approval records', () => {
    expect(() =>
      researchApprovalSchema.parse({
        id: 'approval_1',
        sessionId: 'session_1',
        userId: 'user_1',
        action: 'approve',
        notes: 'Critical source gap waived after manual review.',
        approvedSourceIds: ['src_1'],
        waivedGapIds: ['gap_1'],
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('accepts typed eval history contracts', () => {
    const summary = {
      passed: true,
      total: 1,
      failed: 0,
      results: [
        {
          id: 'ai-compliance-research',
          passed: true,
          expectedPass: true,
          observedPass: true,
          scores: { correctness: 1, safety: 1, completeness: 1, quality: 1 },
          issues: [],
          regressions: [],
        },
      ],
    };
    const run = {
      id: 'eval_run_1',
      suite: 'offline',
      status: 'passed',
      summary,
      createdAt: '2026-06-24T00:00:00.000Z',
    };
    const result = {
      id: 'eval_result_1',
      evalRunId: 'eval_run_1',
      fixtureId: 'ai-compliance-research',
      passed: true,
      expectedPass: true,
      observedPass: true,
      scores: { correctness: 1, safety: 1, completeness: 1, quality: 1 },
      issues: [],
      regressions: [],
      createdAt: '2026-06-24T00:00:00.000Z',
    };

    expect(() => evalSuiteSummarySchema.parse(summary)).not.toThrow();
    expect(() => evalRunSchema.parse(run)).not.toThrow();
    expect(() => evalResultSchema.parse(result)).not.toThrow();
    expect(() => evalRunWithResultsSchema.parse({ ...run, results: [result] })).not.toThrow();
    expect(() => evalHistoryResponseSchema.parse({ suite: 'offline', runs: [run], latest: { ...run, results: [result] } })).not.toThrow();
  });

  it('rejects invalid eval summaries and persisted eval rows', () => {
    expect(() =>
      evalSuiteSummarySchema.parse({
        passed: true,
        total: 2,
        failed: 0,
        results: [
          {
            id: 'fixture_1',
            passed: true,
            expectedPass: true,
            observedPass: true,
            scores: { correctness: 1, safety: 1, completeness: 1, quality: 1 },
            issues: [],
            regressions: [],
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      evalRunSchema.parse({
        id: 'eval_run_1',
        suite: '',
        status: 'passed',
        summary: { passed: true, total: 0, failed: 0, results: [] },
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    ).toThrow();

    expect(() =>
      evalRunSchema.parse({
        id: 'eval_run_1',
        suite: 'offline',
        status: 'unknown',
        summary: { passed: true, total: 0, failed: 0, results: [] },
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    ).toThrow();

    expect(() =>
      evalResultSchema.parse({
        id: 'eval_result_1',
        evalRunId: 'eval_run_1',
        fixtureId: '',
        passed: true,
        expectedPass: true,
        observedPass: true,
        scores: { correctness: 1.1, safety: 1, completeness: 1, quality: 1 },
        issues: [],
        regressions: [],
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects memory records with mismatched scope and session binding', () => {
    expect(() =>
      upsertResearchMemorySchema.parse({
        scope: 'session',
        namespace: 'procedure',
        key: 'missing-session',
        value: {},
      }),
    ).toThrow();

    expect(() =>
      researchMemorySchema.parse({
        id: 'memory_1',
        userId: 'user_1',
        sessionId: 'session_1',
        scope: 'user',
        namespace: 'preference',
        key: 'bad-user-scope',
        value: {},
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects memory values that contain secret-like keys or tokens', () => {
    expect(() =>
      upsertResearchMemorySchema.parse({
        scope: 'user',
        namespace: 'preference',
        key: 'provider-token',
        value: { note: 'sk-test_1234567890abcdef1234567890' },
      }),
    ).toThrow(/secret-like content/);

    expect(() =>
      upsertResearchMemorySchema.parse({
        scope: 'session',
        sessionId: 'session_1',
        namespace: 'procedure',
        key: 'safe-procedure',
        value: { api_key: 'do-not-store-this' },
      }),
    ).toThrow(/secret-like content/);
  });
});
