import { describe, expect, it } from 'vitest';
import { createResearchSessionSchema, researchMemorySchema, researchPacketSchema, runCostSchema, upsertResearchMemorySchema } from '@/lib/schemas';

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
});
