import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseHarness = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const rpcCalls: Array<{ functionName: string; args: unknown }> = [];
  const maybeSingleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const singleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const rpcMaybeSingleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const rpcSingleResponses: Array<{ data: unknown; error: null | { message: string } }> = [];
  const rowsResponses: Array<{ data: unknown[]; error: null | { message: string } }> = [];

  function createBuilder(table: string) {
    const builder = {
      error: null,
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      in: vi.fn(() => builder),
      limit: vi.fn(() => builder),
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
    rpcCalls,
    maybeSingleResponses,
    rpcMaybeSingleResponses,
    rpcSingleResponses,
    singleResponses,
    rowsResponses,
    supabase: {
      from: vi.fn((table: string) => createBuilder(table)),
      rpc: vi.fn((functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        const rpcBuilder = {
          maybeSingle: vi.fn(async () => rpcMaybeSingleResponses.shift() ?? { data: null, error: null }),
          single: vi.fn(async () => rpcSingleResponses.shift() ?? { data: null, error: null }),
        };
        return rpcBuilder;
      }),
    },
  };
});

vi.mock('@/server/supabase/server', () => ({
  createSupabaseAdmin: () => supabaseHarness.supabase,
}));

describe('research repository persistence helpers', () => {
  beforeEach(() => {
    supabaseHarness.calls.length = 0;
    supabaseHarness.rpcCalls.length = 0;
    supabaseHarness.maybeSingleResponses.length = 0;
    supabaseHarness.rpcMaybeSingleResponses.length = 0;
    supabaseHarness.rpcSingleResponses.length = 0;
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

  it('claims queued runs through the durable attempt RPC and maps the current attempt token', async () => {
    supabaseHarness.rpcMaybeSingleResponses.push({
      data: {
        id: 'run_1',
        session_id: 'session_1',
        status: 'leased',
        attempt: 2,
        current_attempt_id: 'attempt_2',
        metadata: { stage: 'research' },
        worker_id: 'worker_1',
        lease_expires_at: '2026-06-24T00:10:00.000Z',
        started_at: '2026-06-24T00:00:00.000Z',
        completed_at: null,
        error: null,
        created_at: '2026-06-24T00:00:00.000Z',
        updated_at: '2026-06-24T00:00:01.000Z',
      },
      error: null,
    });

    const { claimNextQueuedRun } = await import('@/server/research/repository');
    const claimed = await claimNextQueuedRun('worker_1', 60000);

    expect(supabaseHarness.rpcCalls).toEqual([
      { functionName: 'claim_next_research_run', args: { p_worker_id: 'worker_1', p_lease_ms: 60000 } },
    ]);
    expect(claimed).toEqual(
      expect.objectContaining({
        id: 'run_1',
        attempt: 2,
        currentAttemptId: 'attempt_2',
        workerId: 'worker_1',
      }),
    );
  });

  it('extends leases only with a durable attempt token', async () => {
    const { heartbeatResearchRun } = await import('@/server/research/repository');

    await expect(heartbeatResearchRun('run_1', 'worker_1', 60000, null)).resolves.toBeNull();
    expect(supabaseHarness.rpcCalls).toEqual([]);

    supabaseHarness.rpcMaybeSingleResponses.push({
      data: {
        id: 'run_1',
        session_id: 'session_1',
        status: 'running',
        attempt: 1,
        current_attempt_id: 'attempt_1',
        metadata: { stage: 'research' },
        worker_id: 'worker_1',
        lease_expires_at: '2026-06-24T00:10:00.000Z',
        started_at: '2026-06-24T00:00:00.000Z',
        completed_at: null,
        error: null,
        created_at: '2026-06-24T00:00:00.000Z',
        updated_at: '2026-06-24T00:00:01.000Z',
      },
      error: null,
    });

    const extended = await heartbeatResearchRun('run_1', 'worker_1', 60000, 'attempt_1');

    expect(supabaseHarness.rpcCalls).toEqual([
      {
        functionName: 'extend_research_run_lease',
        args: { p_run_id: 'run_1', p_attempt_id: 'attempt_1', p_worker_id: 'worker_1', p_lease_ms: 60000 },
      },
    ]);
    expect(extended?.currentAttemptId).toBe('attempt_1');
  });

  it('transitions worker-owned runs through the attempt-fenced transition RPC', async () => {
    supabaseHarness.rpcSingleResponses.push({
      data: {
        id: 'run_1',
        session_id: 'session_1',
        status: 'completed',
        attempt: 1,
        current_attempt_id: 'attempt_1',
        metadata: { stage: 'reporting' },
        worker_id: 'worker_1',
        lease_expires_at: null,
        started_at: '2026-06-24T00:00:00.000Z',
        completed_at: '2026-06-24T00:05:00.000Z',
        error: null,
        created_at: '2026-06-24T00:00:00.000Z',
        updated_at: '2026-06-24T00:05:00.000Z',
      },
      error: null,
    });

    const { updateRunStatus } = await import('@/server/research/repository');
    const transitioned = await updateRunStatus('run_1', 'completed', {
      workerId: 'worker_1',
      attemptId: 'attempt_1',
      completedAt: '2026-06-24T00:05:00.000Z',
    });

    expect(supabaseHarness.rpcCalls).toEqual([
      {
        functionName: 'transition_research_run',
        args: {
          p_run_id: 'run_1',
          p_attempt_id: 'attempt_1',
          p_worker_id: 'worker_1',
          p_status: 'completed',
          p_error: null,
          p_started_at: null,
          p_completed_at: '2026-06-24T00:05:00.000Z',
        },
      },
    ]);
    expect(supabaseHarness.calls).toEqual([]);
    expect(transitioned.status).toBe('completed');
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

  it('persists a full artifact graph with database column names', async () => {
    const { replaceResearchArtifacts } = await import('@/server/research/repository');

    await replaceResearchArtifacts('session_1', {
      sources: [
        {
          id: 'src_1',
          title: 'Primary source',
          url: 'https://example.com/source',
          canonicalUrl: 'https://example.com/source',
          domain: 'example.com',
          snippet: 'Evidence snippet',
          content: 'Evidence content',
          publishedAt: '2026-06-24',
          score: 0.92,
          credibility: 'high',
          relevanceReason: 'Primary evidence',
        },
      ],
      evaluations: [
        {
          sourceId: 'src_1',
          isRelevant: true,
          score: 0.92,
          credibility: 'high',
          reason: 'Directly answers the query.',
          risks: ['none'],
        },
      ],
      learnings: [
        {
          id: 'learning_1',
          sourceId: 'src_1',
          claim: 'AI systems need review.',
          evidence: 'The source says review is required.',
          followUpQuestions: ['What controls are required?'],
        },
      ],
      claims: [
        {
          id: 'claim_1',
          sessionId: 'session_1',
          text: 'AI systems need review.',
          status: 'supported',
          severity: 'high',
          sourceIds: ['src_1'],
          evidenceIds: ['evidence_1'],
          createdAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      claimEvidence: [
        {
          id: 'evidence_1',
          claimId: 'claim_1',
          sourceId: 'src_1',
          quote: 'Review is required.',
          confidence: 0.95,
          createdAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      claimGaps: [
        {
          id: 'gap_1',
          sessionId: 'session_1',
          claimId: 'claim_1',
          description: 'Need implementation detail.',
          severity: 'medium',
          status: 'open',
          createdAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      audits: [{ runId: 'run_1', auditType: 'claim', audit: { ok: false, openGaps: [], openCriticalGaps: [], unsupportedClaimIds: [] } }],
      report: {
        id: 'report_1',
        sessionId: 'session_1',
        title: 'Report',
        executiveSummary: 'Summary',
        sections: [{ heading: 'Finding', body: 'AI systems need review.', sourceIds: ['src_1'], claimIds: ['claim_1'] }],
        citations: [{ sourceId: 'src_1', url: 'https://example.com/source', title: 'Primary source' }],
        markdown: '# Report',
        createdAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(supabaseHarness.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'research_sources',
          op: 'insert',
          payload: [expect.objectContaining({ canonical_url: 'https://example.com/source', relevance_reason: 'Primary evidence' })],
        }),
        expect.objectContaining({
          table: 'source_evaluations',
          op: 'insert',
          payload: [expect.objectContaining({ source_id: 'src_1', is_relevant: true, risks: ['none'] })],
        }),
        expect.objectContaining({
          table: 'research_learnings',
          op: 'insert',
          payload: [expect.objectContaining({ source_id: 'src_1', follow_up_questions: ['What controls are required?'] })],
        }),
        expect.objectContaining({
          table: 'research_claims',
          op: 'insert',
          payload: [expect.objectContaining({ source_ids: ['src_1'], evidence_ids: [] })],
        }),
        expect.objectContaining({
          table: 'claim_evidence',
          op: 'insert',
          payload: [expect.objectContaining({ claim_id: 'claim_1', source_id: 'src_1' })],
        }),
        expect.objectContaining({
          table: 'research_claims',
          op: 'update',
          payload: expect.objectContaining({ evidence_ids: ['evidence_1'] }),
        }),
        expect.objectContaining({
          table: 'claim_gaps',
          op: 'insert',
          payload: [expect.objectContaining({ claim_id: 'claim_1', resolved_at: null })],
        }),
        expect.objectContaining({
          table: 'research_audits',
          op: 'insert',
          payload: [expect.objectContaining({ run_id: 'run_1', audit_type: 'claim', ok: false })],
        }),
        expect.objectContaining({
          table: 'research_reports',
          op: 'insert',
          payload: expect.objectContaining({ executive_summary: 'Summary', sections: expect.any(Array), citations: expect.any(Array) }),
        }),
      ]),
    );
  });

  it('persists structured run-event columns for tracing and SSE replay', async () => {
    const { addEvent } = await import('@/server/research/repository');

    await addEvent(
      'session_1',
      'searching',
      'Search tool completed.',
      { sourceCount: 3 },
      {
        runId: 'run_1',
        attemptId: 'attempt_1',
        eventType: 'tool_completed',
        severity: 'debug',
        actor: 'tool',
        stepId: 'web_search',
        durationMs: 123,
        traceId: 'trace_1',
        correlationId: 'corr_1',
      },
    );

    expect(supabaseHarness.calls).toContainEqual(
      expect.objectContaining({
        table: 'research_events',
        op: 'insert',
        payload: expect.objectContaining({
          run_id: 'run_1',
          attempt_id: 'attempt_1',
          event_type: 'tool_completed',
          severity: 'debug',
          actor: 'tool',
          step_id: 'web_search',
          duration_ms: 123,
          trace_id: 'trace_1',
          correlation_id: 'corr_1',
          metadata: { sourceCount: 3 },
        }),
      }),
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
