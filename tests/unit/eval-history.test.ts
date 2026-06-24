import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvalSuiteSummary } from '@/lib/schemas';

const supabaseHarness = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const maybeSingleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const singleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const rowsResponses: Array<{ data: unknown[]; error: null | { message: string } }> = [];

  function createBuilder(table: string) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => maybeSingleResponses.shift() ?? { data: null, error: null }),
      single: vi.fn(async () => singleResponses.shift() ?? { data: null, error: null }),
      insert: vi.fn((payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return builder;
      }),
      then: (resolve: (value: { data: unknown[]; error: null | { message: string } }) => void) =>
        resolve(rowsResponses.shift() ?? { data: [], error: null }),
    };
    return builder;
  }

  return {
    calls,
    maybeSingleResponses,
    singleResponses,
    rowsResponses,
    supabase: {
      from: vi.fn((table: string) => createBuilder(table)),
      rpc: vi.fn((name: string, payload: unknown) => {
        calls.push({ table: name, op: 'rpc', payload });
        return createBuilder(name);
      }),
    },
  };
});

vi.mock('@/server/supabase/server', () => ({
  createSupabaseAdmin: () => supabaseHarness.supabase,
}));

const summary: EvalSuiteSummary = {
  passed: true,
  total: 1,
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
};

describe('eval history repository', () => {
  beforeEach(() => {
    supabaseHarness.calls.length = 0;
    supabaseHarness.maybeSingleResponses.length = 0;
    supabaseHarness.singleResponses.length = 0;
    supabaseHarness.rowsResponses.length = 0;
    vi.clearAllMocks();
  });

  it('persists eval runs and result rows through the transactional RPC', async () => {
    supabaseHarness.singleResponses.push({
      data: {
        id: 'eval_run_1',
        suite: 'offline',
        status: 'passed',
        summary,
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });

    const { saveEvalRun } = await import('@/server/evals/history');
    const run = await saveEvalRun('offline', summary);

    expect(run.status).toBe('passed');
    expect(run.results).toHaveLength(1);
    expect(supabaseHarness.calls).toContainEqual(
      expect.objectContaining({
        table: 'record_eval_run',
        op: 'rpc',
        payload: expect.objectContaining({
          p_suite: 'offline',
          p_status: 'passed',
          p_summary: summary,
          p_results: [
            expect.objectContaining({
              fixtureId: 'fixture_1',
              expectedPass: true,
              observedPass: true,
              regressions: [],
            }),
          ],
        }),
      }),
    );
  });

  it('persists failed suite status for regression evidence', async () => {
    const failedSummary: EvalSuiteSummary = {
      ...summary,
      passed: false,
      failed: 1,
      results: [{ ...summary.results[0]!, passed: false, regressions: ['quality score below baseline.'] }],
    };
    supabaseHarness.singleResponses.push({
      data: {
        id: 'eval_run_2',
        suite: 'offline',
        status: 'failed',
        summary: failedSummary,
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });

    const { saveEvalRun } = await import('@/server/evals/history');
    const run = await saveEvalRun('offline', failedSummary);

    expect(run.status).toBe('failed');
    expect(supabaseHarness.calls[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ p_status: 'failed' }),
      }),
    );
  });

  it('propagates RPC errors instead of returning partial proof', async () => {
    supabaseHarness.singleResponses.push({ data: null, error: { message: 'transaction failed' } });

    const { saveEvalRun } = await import('@/server/evals/history');
    await expect(saveEvalRun('offline', summary)).rejects.toThrow('transaction failed');
  });

  it('lists persisted eval runs in public contract shape', async () => {
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'eval_run_1',
          suite: 'offline',
          status: 'passed',
          summary,
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { listEvalRuns } = await import('@/server/evals/history');
    const runs = await listEvalRuns(5);

    expect(runs).toEqual([
      {
        id: 'eval_run_1',
        suite: 'offline',
        status: 'passed',
        summary,
        createdAt: '2026-06-24T00:00:00.000Z',
      },
    ]);
  });

  it('returns null when no latest eval run exists', async () => {
    supabaseHarness.maybeSingleResponses.push({ data: null, error: null });

    const { getLatestEvalRun } = await import('@/server/evals/history');
    await expect(getLatestEvalRun()).resolves.toBeNull();
  });

  it('loads latest eval run with result rows and legacy defaults', async () => {
    supabaseHarness.maybeSingleResponses.push({
      data: {
        id: 'eval_run_1',
        suite: 'offline',
        status: 'passed',
        summary,
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });
    supabaseHarness.singleResponses.push({
      data: {
        id: 'eval_run_1',
        suite: 'offline',
        status: 'passed',
        summary,
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'eval_result_1',
          eval_run_id: 'eval_run_1',
          fixture_id: 'fixture_1',
          passed: true,
          scores: { correctness: 1, safety: 1, completeness: 1, quality: 1 },
          issues: [],
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { getLatestEvalRun } = await import('@/server/evals/history');
    const run = await getLatestEvalRun();

    expect(run?.results[0]).toEqual(
      expect.objectContaining({
        expectedPass: true,
        observedPass: true,
        regressions: [],
      }),
    );
  });

  it('rejects invalid persisted statuses and scores', async () => {
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'eval_run_1',
          suite: 'offline',
          status: 'unknown',
          summary,
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { listEvalRuns } = await import('@/server/evals/history');
    await expect(listEvalRuns(5)).rejects.toThrow();

    supabaseHarness.singleResponses.push({
      data: {
        id: 'eval_run_1',
        suite: 'offline',
        status: 'passed',
        summary,
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'eval_result_1',
          eval_run_id: 'eval_run_1',
          fixture_id: 'fixture_1',
          passed: true,
          expected_pass: true,
          observed_pass: true,
          scores: { correctness: 2, safety: 1, completeness: 1, quality: 1 },
          issues: [],
          regressions: [],
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { getEvalRunWithResults } = await import('@/server/evals/history');
    await expect(getEvalRunWithResults('eval_run_1')).rejects.toThrow();
  });
});
