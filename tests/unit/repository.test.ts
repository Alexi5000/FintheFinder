import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseHarness = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const maybeSingleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const singleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const rowsResponses: Array<{ data: unknown[]; error: null | { message: string } }> = [];

  function createBuilder(table: string) {
    const builder = {
      error: null,
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => maybeSingleResponses.shift() ?? { data: null, error: null }),
      single: vi.fn(async () => singleResponses.shift() ?? { data: null, error: null }),
      insert: vi.fn((payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        calls.push({ table, op: 'update', payload });
        return builder;
      }),
      delete: vi.fn(() => {
        calls.push({ table, op: 'delete' });
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
    },
  };
});

vi.mock('@/server/supabase/server', () => ({
  createSupabaseAdmin: () => supabaseHarness.supabase,
}));

describe('research repository persistence helpers', () => {
  beforeEach(() => {
    supabaseHarness.calls.length = 0;
    supabaseHarness.maybeSingleResponses.length = 0;
    supabaseHarness.singleResponses.length = 0;
    supabaseHarness.rowsResponses.length = 0;
    vi.clearAllMocks();
  });

  it('persists a new run-cost row with the typed usage payload', async () => {
    supabaseHarness.maybeSingleResponses.push({ data: null, error: null });
    supabaseHarness.singleResponses.push({
      data: {
        id: 'cost_1',
        run_id: 'run_1',
        session_id: 'session_1',
        usage: { modelCalls: [{ model: 'gpt-5.5', inputTokens: 10, outputTokens: 4 }], exaSearches: 2 },
        model_cost_usd: 0.001,
        search_cost_usd: 0.01,
        total_usd: 0.011,
        pricing_effective_date: '2026-06-24',
        measurement_method: 'estimated',
        created_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });

    const { saveRunCost } = await import('@/server/research/repository');
    const cost = await saveRunCost(
      'run_1',
      'session_1',
      { modelCalls: [{ model: 'gpt-5.5', inputTokens: 10, outputTokens: 4 }], exaSearches: 2 },
      { modelCostUsd: 0.001, searchCostUsd: 0.01, totalUsd: 0.011, pricingEffectiveDate: '2026-06-24' },
    );

    expect(cost.totalUsd).toBe(0.011);
    expect(supabaseHarness.calls).toContainEqual(
      expect.objectContaining({
        table: 'research_run_costs',
        op: 'insert',
        payload: expect.objectContaining({ run_id: 'run_1', session_id: 'session_1' }),
      }),
    );
  });

  it('upserts explicit user-scoped research memory', async () => {
    supabaseHarness.maybeSingleResponses.push({ data: null, error: null });
    supabaseHarness.singleResponses.push({
      data: {
        id: 'memory_1',
        user_id: 'user_1',
        session_id: null,
        scope: 'user',
        namespace: 'preference',
        key: 'source-policy',
        value: { note: 'Prefer primary sources.' },
        created_at: '2026-06-24T00:00:00.000Z',
        updated_at: '2026-06-24T00:00:00.000Z',
      },
      error: null,
    });

    const { upsertResearchMemory } = await import('@/server/research/repository');
    const memory = await upsertResearchMemory('user_1', {
      scope: 'user',
      namespace: 'preference',
      key: 'source-policy',
      value: { note: 'Prefer primary sources.' },
    });

    expect(memory.value.note).toBe('Prefer primary sources.');
    expect(supabaseHarness.calls).toContainEqual(
      expect.objectContaining({
        table: 'research_memories',
        op: 'insert',
        payload: expect.objectContaining({ user_id: 'user_1', session_id: null }),
      }),
    );
  });

  it('creates a post-mortem and linked run event', async () => {
    const { createPostMortem } = await import('@/server/research/repository');
    await createPostMortem('session_1', 'run_1', 'Provider timeout', 'research');

    expect(supabaseHarness.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'research_post_mortems', op: 'insert' }),
        expect.objectContaining({ table: 'research_events', op: 'insert' }),
      ]),
    );
  });

  it('maps approval history rows into the public contract shape', async () => {
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'approval_1',
          session_id: 'session_1',
          user_id: 'user_1',
          action: 'approve',
          notes: 'Waived one critical gap after source review.',
          approved_source_ids: ['src_1'],
          waived_gap_ids: ['gap_1'],
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { getApprovals } = await import('@/server/research/repository');
    const approvals = await getApprovals('session_1');

    expect(approvals).toEqual([
      {
        id: 'approval_1',
        sessionId: 'session_1',
        userId: 'user_1',
        action: 'approve',
        notes: 'Waived one critical gap after source review.',
        approvedSourceIds: ['src_1'],
        waivedGapIds: ['gap_1'],
        createdAt: '2026-06-24T00:00:00.000Z',
      },
    ]);
  });

  it('checks session ownership before reading approval history', async () => {
    supabaseHarness.maybeSingleResponses.push({ data: { id: 'session_1' }, error: null });
    supabaseHarness.rowsResponses.push({
      data: [
        {
          id: 'approval_1',
          session_id: 'session_1',
          user_id: 'user_1',
          action: 'reject',
          notes: null,
          approved_source_ids: [],
          waived_gap_ids: [],
          created_at: '2026-06-24T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const { getApprovalsForUser } = await import('@/server/research/repository');
    const approvals = await getApprovalsForUser('user_1', 'session_1');

    expect(approvals[0]?.action).toBe('reject');
    expect(supabaseHarness.supabase.from).toHaveBeenNthCalledWith(1, 'research_sessions');
    expect(supabaseHarness.supabase.from).toHaveBeenNthCalledWith(2, 'research_approvals');
  });

  it('does not read approval history when ownership is not proven', async () => {
    supabaseHarness.maybeSingleResponses.push({ data: null, error: null });

    const { getApprovalsForUser } = await import('@/server/research/repository');
    await expect(getApprovalsForUser('user_1', 'session_2')).rejects.toThrow('Research session was not found for this user.');

    expect(supabaseHarness.supabase.from).toHaveBeenCalledTimes(1);
    expect(supabaseHarness.supabase.from).toHaveBeenCalledWith('research_sessions');
  });
});
