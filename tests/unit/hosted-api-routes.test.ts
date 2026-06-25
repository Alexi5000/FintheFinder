import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeHarness = vi.hoisted(() => ({
  addApproval: vi.fn(),
  addEvent: vi.fn(),
  checkRateLimit: vi.fn(),
  createSession: vi.fn(),
  enqueueResearchRun: vi.fn(),
  getClaimsAndGaps: vi.fn(),
  getEvents: vi.fn(),
  getOpenCriticalGaps: vi.fn(),
  getPostMortemForRun: vi.fn(),
  getRunCostForRun: vi.fn(),
  getRunForUser: vi.fn(),
  getSessionDetail: vi.fn(),
  getUserFromRequest: vi.fn(),
  hasSupabaseConfig: vi.fn(),
  listResearchMemories: vi.fn(),
  listSessions: vi.fn(),
  recordApprovalDecision: vi.fn(),
  updateSessionState: vi.fn(),
  upsertResearchMemory: vi.fn(),
  waiveClaimGaps: vi.fn(),
  withSpan: vi.fn(async (_name: string, _attrs: Record<string, unknown>, callback: () => Promise<unknown>) => callback()),
}));

vi.mock('@/server/rate-limit', () => ({
  checkRateLimit: routeHarness.checkRateLimit,
}));

vi.mock('@/server/research/repository', () => ({
  addApproval: routeHarness.addApproval,
  addEvent: routeHarness.addEvent,
  createSession: routeHarness.createSession,
  enqueueResearchRun: routeHarness.enqueueResearchRun,
  getClaimsAndGaps: routeHarness.getClaimsAndGaps,
  getEvents: routeHarness.getEvents,
  getOpenCriticalGaps: routeHarness.getOpenCriticalGaps,
  getPostMortemForRun: routeHarness.getPostMortemForRun,
  getRunCostForRun: routeHarness.getRunCostForRun,
  getRunForUser: routeHarness.getRunForUser,
  getSessionDetail: routeHarness.getSessionDetail,
  listResearchMemories: routeHarness.listResearchMemories,
  listSessions: routeHarness.listSessions,
  recordApprovalDecision: routeHarness.recordApprovalDecision,
  updateSessionState: routeHarness.updateSessionState,
  upsertResearchMemory: routeHarness.upsertResearchMemory,
  waiveClaimGaps: routeHarness.waiveClaimGaps,
}));

vi.mock('@/server/supabase/server', () => ({
  getUserFromRequest: routeHarness.getUserFromRequest,
  hasSupabaseConfig: routeHarness.hasSupabaseConfig,
}));

vi.mock('@/server/telemetry', () => ({
  withSpan: routeHarness.withSpan,
}));

const user = { id: 'user_1' };
const session = {
  id: 'session_1',
  userId: 'user_1',
  title: 'AI Agent Evaluation',
  query: 'Research AI agent evaluation systems',
  status: 'awaiting_approval',
  phase: 'reviewing',
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
  sources: [],
  evaluations: [],
  learnings: [],
  events: [],
  approvals: [],
  report: null,
};
const run = {
  id: 'run_1',
  sessionId: 'session_1',
  status: 'queued',
  attempt: 1,
  metadata: { stage: 'research' },
  workerId: null,
  leaseExpiresAt: null,
  startedAt: null,
  completedAt: null,
  error: null,
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
};

describe('hosted research API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue(user);
    routeHarness.checkRateLimit.mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 1000 });
    routeHarness.createSession.mockResolvedValue(session);
    routeHarness.getSessionDetail.mockResolvedValue(session);
    routeHarness.enqueueResearchRun.mockResolvedValue(run);
    routeHarness.getRunForUser.mockResolvedValue(run);
    routeHarness.getEvents.mockResolvedValue([]);
    routeHarness.getRunCostForRun.mockResolvedValue(null);
    routeHarness.getPostMortemForRun.mockResolvedValue(null);
    routeHarness.getClaimsAndGaps.mockResolvedValue({ claims: [], gaps: [] });
    routeHarness.getOpenCriticalGaps.mockResolvedValue([]);
    routeHarness.recordApprovalDecision.mockImplementation(async (_userId: string, _sessionId: string, input: { action: 'approve' | 'reject' | 'follow_up' }) => ({
      ok: true,
      action: input.action,
      run: input.action === 'reject' ? null : run,
      runId: input.action === 'reject' ? null : run.id,
      status: input.action === 'reject' ? null : run.status,
    }));
    routeHarness.addApproval.mockResolvedValue(undefined);
    routeHarness.addEvent.mockResolvedValue(undefined);
    routeHarness.waiveClaimGaps.mockResolvedValue(undefined);
    routeHarness.updateSessionState.mockResolvedValue(undefined);
    routeHarness.listResearchMemories.mockResolvedValue([]);
    routeHarness.listSessions.mockResolvedValue([session]);
    routeHarness.upsertResearchMemory.mockResolvedValue({
      id: 'memory_1',
      userId: 'user_1',
      sessionId: 'session_1',
      scope: 'session',
      namespace: 'procedure',
      key: 'operator-note',
      value: { note: 'Prefer primary sources.' },
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });
  });

  it('scopes session listing and creation to the authenticated user', async () => {
    const sessionsRoute = await import('@/app/api/research/sessions/route');

    const getResponse = await sessionsRoute.GET(new Request('http://localhost/api/research/sessions?userId=other_user'));
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(routeHarness.listSessions).toHaveBeenCalledWith('user_1');
    expect(getPayload.sessions).toEqual([session]);

    const postResponse = await sessionsRoute.POST(
      new Request('http://localhost/api/research/sessions', {
        method: 'POST',
        body: JSON.stringify({ userId: 'other_user', query: 'Research AI agent evaluation systems' }),
      }),
    );
    const postPayload = await postResponse.json();

    expect(postResponse.status).toBe(201);
    expect(routeHarness.checkRateLimit).toHaveBeenCalledWith('create:user_1');
    expect(routeHarness.createSession).toHaveBeenCalledWith('user_1', 'Research AI agent evaluation systems');
    expect(postPayload.session).toEqual(session);
  });

  it('guards session creation before parsing bodies or writing rows', async () => {
    const sessionsRoute = await import('@/app/api/research/sessions/route');

    routeHarness.hasSupabaseConfig.mockReturnValue(false);
    expect((await sessionsRoute.POST(new Request('http://localhost/api/research/sessions', { method: 'POST', body: 'not-json' }))).status).toBe(503);
    expect(routeHarness.getUserFromRequest).not.toHaveBeenCalled();

    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue(null);
    expect((await sessionsRoute.POST(new Request('http://localhost/api/research/sessions', { method: 'POST', body: 'not-json' }))).status).toBe(401);
    expect(routeHarness.checkRateLimit).not.toHaveBeenCalled();

    routeHarness.getUserFromRequest.mockResolvedValue(user);
    routeHarness.checkRateLimit.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    const response = await sessionsRoute.POST(new Request('http://localhost/api/research/sessions', { method: 'POST', body: 'not-json' }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error.code).toBe('rate_limited');
    expect(routeHarness.createSession).not.toHaveBeenCalled();
  });

  it('queues research runs without executing the pipeline in the request', async () => {
    const { POST } = await import('@/app/api/research/sessions/[id]/run/route');

    const response = await POST(new Request('http://localhost/api/research/sessions/session_1/run'), params('session_1'));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(routeHarness.getSessionDetail).toHaveBeenCalledWith('user_1', 'session_1');
    expect(routeHarness.enqueueResearchRun).toHaveBeenCalledWith('session_1', { stage: 'research', requestedBy: 'user_1' }, 'planning');
    expect(payload).toEqual({ runId: 'run_1', status: 'queued', run });
  });

  it('fails closed before queueing runs when Supabase, auth, or rate limits fail', async () => {
    const { POST } = await import('@/app/api/research/sessions/[id]/run/route');

    routeHarness.hasSupabaseConfig.mockReturnValue(false);
    expect((await POST(new Request('http://localhost/api/research/sessions/session_1/run'), params('session_1'))).status).toBe(503);
    expect(routeHarness.getUserFromRequest).not.toHaveBeenCalled();

    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue(null);
    expect((await POST(new Request('http://localhost/api/research/sessions/session_1/run'), params('session_1'))).status).toBe(401);
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();

    routeHarness.getUserFromRequest.mockResolvedValue(user);
    routeHarness.checkRateLimit.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    expect((await POST(new Request('http://localhost/api/research/sessions/session_1/run'), params('session_1'))).status).toBe(429);
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
  });

  it('returns run status with run-scoped events, cost, and post-mortem', async () => {
    const event = { id: 'event_1', sessionId: 'session_1', runId: 'run_1', phase: 'planning', message: 'Queued', metadata: {}, createdAt: '2026-06-24T00:00:00.000Z' };
    const cost = { id: 'cost_1', runId: 'run_1', sessionId: 'session_1', usage: { modelCalls: [], exaSearches: 1 }, modelCostUsd: 0.01, searchCostUsd: 0.01, totalUsd: 0.02, pricingEffectiveDate: '2026-06-24', measurementMethod: 'estimated', createdAt: '2026-06-24T00:00:00.000Z' };
    const postMortem = { id: 'pm_1', sessionId: 'session_1', runId: 'run_1', rootCause: 'Provider timeout', affectedStep: 'searching', actionItems: [], createdAt: '2026-06-24T00:00:00.000Z' };
    routeHarness.getEvents.mockResolvedValue([event]);
    routeHarness.getRunCostForRun.mockResolvedValue(cost);
    routeHarness.getPostMortemForRun.mockResolvedValue(postMortem);
    const { GET } = await import('@/app/api/research/runs/[id]/route');

    const response = await GET(new Request('http://localhost/api/research/runs/run_1'), params('run_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(routeHarness.getRunForUser).toHaveBeenCalledWith('user_1', 'run_1');
    expect(routeHarness.getEvents).toHaveBeenCalledWith('session_1', { runId: 'run_1' });
    expect(payload).toEqual({ run, events: [event], cost, postMortem });
  });

  it('does not read run artifacts when run ownership lookup fails', async () => {
    routeHarness.getRunForUser.mockRejectedValue(new Error('run not found for user_2 token secret report text'));
    const { GET } = await import('@/app/api/research/runs/[id]/route');

    const response = await GET(new Request('http://localhost/api/research/runs/run_2'), params('run_2'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('internal_error');
    expect(payload.error.message).toBe('Unexpected server error.');
    expect(routeHarness.getRunForUser).toHaveBeenCalledWith('user_1', 'run_2');
    expect(routeHarness.getEvents).not.toHaveBeenCalled();
    expect(routeHarness.getRunCostForRun).not.toHaveBeenCalled();
    expect(routeHarness.getPostMortemForRun).not.toHaveBeenCalled();
  });

  it('formats session events as authenticated SSE after proving session ownership', async () => {
    routeHarness.getEvents.mockResolvedValue([
      { id: 'event_1', sessionId: 'session_1', phase: 'planning', message: 'Queued', metadata: {}, createdAt: '2026-06-24T00:00:00.000Z' },
      { id: 'event_2', sessionId: 'session_1', phase: 'reviewing', message: 'Claim audit complete', metadata: { gaps: 0 }, createdAt: '2026-06-24T00:00:01.000Z' },
    ]);
    const { GET } = await import('@/app/api/research/sessions/[id]/events/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_1/events'), params('session_1'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-cache');
    expect(routeHarness.getSessionDetail).toHaveBeenCalledWith('user_1', 'session_1');
    expect(routeHarness.getEvents).toHaveBeenCalledWith('session_1');
    expect(body).toContain('data: {"id":"event_1"');
    expect(body).toContain('\n\n');
  });

  it('does not stream events when session ownership is not proven', async () => {
    routeHarness.getSessionDetail.mockRejectedValue(new Error('session not found for user_2 token secret report text'));
    const { GET } = await import('@/app/api/research/sessions/[id]/events/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_2/events'), params('session_2'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('internal_error');
    expect(payload.error.message).toBe('Unexpected server error.');
    expect(routeHarness.getEvents).not.toHaveBeenCalled();
  });

  it('exports owned reports as markdown with a sanitized attachment filename', async () => {
    routeHarness.getSessionDetail.mockResolvedValue({
      ...session,
      title: 'Risk & Compliance / Q3',
      report: { id: 'report_1', sessionId: 'session_1', title: 'Report', executiveSummary: 'Summary', sections: [], citations: [], markdown: '# Report\n\nBody', createdAt: '2026-06-24T00:00:00.000Z' },
    });
    const { GET } = await import('@/app/api/reports/[id]/export.md/route');

    const response = await GET(new Request('http://localhost/api/reports/session_1/export.md'), params('session_1'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# Report\n\nBody');
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(response.headers.get('content-disposition')).toContain('risk-compliance-q3.md');
  });

  it('returns 404 for owned sessions without reports', async () => {
    const { GET } = await import('@/app/api/reports/[id]/export.md/route');

    const response = await GET(new Request('http://localhost/api/reports/session_1/export.md'), params('session_1'));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('report_not_found');
  });

  it('reads claims and gaps only after proving session ownership', async () => {
    routeHarness.getClaimsAndGaps.mockResolvedValue({ claims: [{ id: 'claim_1' }], gaps: [{ id: 'gap_1' }] });
    const { GET } = await import('@/app/api/research/sessions/[id]/claims/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_1/claims'), params('session_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(routeHarness.getSessionDetail).toHaveBeenCalledWith('user_1', 'session_1');
    expect(routeHarness.getClaimsAndGaps).toHaveBeenCalledWith('session_1');
    expect(payload).toEqual({ claims: [{ id: 'claim_1' }], gaps: [{ id: 'gap_1' }] });
  });

  it('does not read claims when session ownership is not proven', async () => {
    routeHarness.getSessionDetail.mockRejectedValue(new Error('session not found for user_2 token secret report text'));
    const { GET } = await import('@/app/api/research/sessions/[id]/claims/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_2/claims'), params('session_2'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('internal_error');
    expect(payload.error.message).toBe('Unexpected server error.');
    expect(routeHarness.getClaimsAndGaps).not.toHaveBeenCalled();
  });

  it('guards hosted read routes before repository work', async () => {
    const routes = [
      {
        name: 'run status',
        call: async () => {
          const { GET } = await import('@/app/api/research/runs/[id]/route');
          return GET(new Request('http://localhost/api/research/runs/run_1'), params('run_1'));
        },
        repositoryMocks: [routeHarness.getRunForUser, routeHarness.getEvents, routeHarness.getRunCostForRun, routeHarness.getPostMortemForRun],
      },
      {
        name: 'events',
        call: async () => {
          const { GET } = await import('@/app/api/research/sessions/[id]/events/route');
          return GET(new Request('http://localhost/api/research/sessions/session_1/events'), params('session_1'));
        },
        repositoryMocks: [routeHarness.getSessionDetail, routeHarness.getEvents],
      },
      {
        name: 'report export',
        call: async () => {
          const { GET } = await import('@/app/api/reports/[id]/export.md/route');
          return GET(new Request('http://localhost/api/reports/session_1/export.md'), params('session_1'));
        },
        repositoryMocks: [routeHarness.getSessionDetail],
      },
      {
        name: 'claims',
        call: async () => {
          const { GET } = await import('@/app/api/research/sessions/[id]/claims/route');
          return GET(new Request('http://localhost/api/research/sessions/session_1/claims'), params('session_1'));
        },
        repositoryMocks: [routeHarness.getSessionDetail, routeHarness.getClaimsAndGaps],
      },
      {
        name: 'memory',
        call: async () => {
          const { GET } = await import('@/app/api/research/memory/route');
          return GET(new Request('http://localhost/api/research/memory?sessionId=session_1'));
        },
        repositoryMocks: [routeHarness.getSessionDetail, routeHarness.listResearchMemories],
      },
    ];

    for (const route of routes) {
      vi.clearAllMocks();
      routeHarness.hasSupabaseConfig.mockReturnValue(false);
      routeHarness.getUserFromRequest.mockResolvedValue(user);
      expect((await route.call()).status, route.name).toBe(503);
      expect(routeHarness.getUserFromRequest, route.name).not.toHaveBeenCalled();
      for (const repositoryMock of route.repositoryMocks) expect(repositoryMock, route.name).not.toHaveBeenCalled();

      vi.clearAllMocks();
      routeHarness.hasSupabaseConfig.mockReturnValue(true);
      routeHarness.getUserFromRequest.mockResolvedValue(null);
      expect((await route.call()).status, route.name).toBe(401);
      for (const repositoryMock of route.repositoryMocks) expect(repositoryMock, route.name).not.toHaveBeenCalled();
    }
  });

  it('validates session ownership before reading or writing session-scoped memory', async () => {
    const memoryGet = await import('@/app/api/research/memory/route');

    const getResponse = await memoryGet.GET(new Request('http://localhost/api/research/memory?sessionId=session_1'));
    expect(getResponse.status).toBe(200);
    expect(routeHarness.getSessionDetail).toHaveBeenCalledWith('user_1', 'session_1');
    expect(routeHarness.listResearchMemories).toHaveBeenCalledWith('user_1', { sessionId: 'session_1' });

    const postResponse = await memoryGet.POST(
      new Request('http://localhost/api/research/memory', {
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session_1', scope: 'session', namespace: 'procedure', key: 'operator-note', value: { note: 'Prefer primary sources.' } }),
      }),
    );
    const postPayload = await postResponse.json();

    expect(postResponse.status).toBe(200);
    expect(routeHarness.getSessionDetail).toHaveBeenCalledWith('user_1', 'session_1');
    expect(routeHarness.upsertResearchMemory).toHaveBeenCalledWith('user_1', {
      sessionId: 'session_1',
      scope: 'session',
      namespace: 'procedure',
      key: 'operator-note',
      value: { note: 'Prefer primary sources.' },
    });
    expect(postPayload.memory.id).toBe('memory_1');
  });

  it('blocks approval when critical gaps are unresolved or waiver notes are missing', async () => {
    routeHarness.recordApprovalDecision
      .mockResolvedValueOnce({ ok: false, code: 'critical_gaps_unresolved', details: { openCriticalGapIds: ['gap_critical'] } })
      .mockResolvedValueOnce({ ok: false, code: 'waiver_notes_required', details: { openCriticalGapIds: ['gap_critical'] } });
    const { POST } = await import('@/app/api/research/sessions/[id]/approval/route');

    const unresolvedResponse = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', approvedSourceIds: [], waivedGapIds: [] }),
      }),
      params('session_1'),
    );
    const unresolvedPayload = await unresolvedResponse.json();

    expect(unresolvedResponse.status).toBe(409);
    expect(unresolvedPayload.error.code).toBe('critical_gaps_unresolved');
    expect(routeHarness.recordApprovalDecision).toHaveBeenCalledWith('user_1', 'session_1', { action: 'approve', approvedSourceIds: [], waivedGapIds: [] });
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();

    const missingNotesResponse = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', approvedSourceIds: [], waivedGapIds: ['gap_critical'] }),
      }),
      params('session_1'),
    );
    const missingNotesPayload = await missingNotesResponse.json();

    expect(missingNotesResponse.status).toBe(422);
    expect(missingNotesPayload.error.code).toBe('waiver_notes_required');
    expect(routeHarness.recordApprovalDecision).toHaveBeenLastCalledWith('user_1', 'session_1', { action: 'approve', approvedSourceIds: [], waivedGapIds: ['gap_critical'] });
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
  });

  it('rejects all approval decisions outside the awaiting approval state through the transactional decision helper', async () => {
    routeHarness.recordApprovalDecision.mockImplementation(async (_userId: string, _sessionId: string, input: { action: 'approve' | 'reject' | 'follow_up' }) => ({
      ok: false,
      code: 'approval_not_available',
      details: { currentStatus: 'queued', requestedAction: input.action },
    }));
    const { POST } = await import('@/app/api/research/sessions/[id]/approval/route');

    for (const action of ['approve', 'reject', 'follow_up'] as const) {
      const response = await POST(
        new Request('http://localhost/api/research/sessions/session_1/approval', {
          method: 'POST',
          body: JSON.stringify({ action, notes: 'Looks ready.', approvedSourceIds: [], waivedGapIds: [] }),
        }),
        params('session_1'),
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error.code).toBe('approval_not_available');
      expect(payload.error.details).toEqual({ currentStatus: 'queued', requestedAction: action });
    }

    expect(routeHarness.recordApprovalDecision).toHaveBeenCalledTimes(3);
    expect(routeHarness.getOpenCriticalGaps).not.toHaveBeenCalled();
    expect(routeHarness.waiveClaimGaps).not.toHaveBeenCalled();
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.addEvent).not.toHaveBeenCalled();
    expect(routeHarness.updateSessionState).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
  });

  it('records approval waivers and queues reporting work', async () => {
    const reportingRun = { ...run, id: 'run_reporting', metadata: { stage: 'reporting' } };
    routeHarness.recordApprovalDecision.mockResolvedValue({ ok: true, action: 'approve', run: reportingRun, runId: 'run_reporting', status: 'queued' });
    const { POST } = await import('@/app/api/research/sessions/[id]/approval/route');

    const response = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', notes: 'Reviewed and waived after source check.', approvedSourceIds: ['src_1'], waivedGapIds: ['gap_critical'] }),
      }),
      params('session_1'),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(routeHarness.recordApprovalDecision).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      { action: 'approve', notes: 'Reviewed and waived after source check.', approvedSourceIds: ['src_1'], waivedGapIds: ['gap_critical'] },
    );
    expect(routeHarness.waiveClaimGaps).not.toHaveBeenCalled();
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.addEvent).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
    expect(payload.runId).toBe('run_reporting');
    expect(payload.run).toEqual(reportingRun);
  });

  it('records reject and follow-up decisions with the correct state transitions', async () => {
    const { POST } = await import('@/app/api/research/sessions/[id]/approval/route');

    const rejectResponse = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', notes: 'Source quality is too weak.', approvedSourceIds: [], waivedGapIds: [] }),
      }),
      params('session_1'),
    );

    expect(rejectResponse.status).toBe(200);
    expect(routeHarness.recordApprovalDecision).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      { action: 'reject', notes: 'Source quality is too weak.', approvedSourceIds: [], waivedGapIds: [] },
    );
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.updateSessionState).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();

    vi.clearAllMocks();
    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue(user);
    const followUpRun = { ...run, id: 'run_follow_up' };
    routeHarness.recordApprovalDecision.mockResolvedValue({ ok: true, action: 'follow_up', run: followUpRun, runId: 'run_follow_up', status: 'queued' });

    const followUpResponse = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'follow_up', notes: 'Find more primary sources.', approvedSourceIds: [], waivedGapIds: [] }),
      }),
      params('session_1'),
    );
    const followUpPayload = await followUpResponse.json();

    expect(followUpResponse.status).toBe(202);
    expect(routeHarness.recordApprovalDecision).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      { action: 'follow_up', notes: 'Find more primary sources.', approvedSourceIds: [], waivedGapIds: [] },
    );
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
    expect(followUpPayload.runId).toBe('run_follow_up');
    expect(followUpPayload.run).toEqual(followUpRun);
  });

  it('maps active approval-run conflicts without side effects', async () => {
    routeHarness.recordApprovalDecision.mockResolvedValue({
      ok: false,
      code: 'active_run_conflict',
      details: { runId: 'run_active', status: 'running' },
    });
    const { POST } = await import('@/app/api/research/sessions/[id]/approval/route');

    const response = await POST(
      new Request('http://localhost/api/research/sessions/session_1/approval', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', notes: 'Looks good.', approvedSourceIds: [], waivedGapIds: [] }),
      }),
      params('session_1'),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('active_run_conflict');
    expect(payload.error.details).toEqual({ runId: 'run_active', status: 'running' });
    expect(routeHarness.addApproval).not.toHaveBeenCalled();
    expect(routeHarness.enqueueResearchRun).not.toHaveBeenCalled();
  });

  it('does not require session ownership for user-scoped memory', async () => {
    const memoryRoute = await import('@/app/api/research/memory/route');

    const getResponse = await memoryRoute.GET(new Request('http://localhost/api/research/memory'));
    expect(getResponse.status).toBe(200);
    expect(routeHarness.getSessionDetail).not.toHaveBeenCalled();
    expect(routeHarness.listResearchMemories).toHaveBeenCalledWith('user_1', { sessionId: undefined });

    vi.clearAllMocks();
    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue(user);
    routeHarness.upsertResearchMemory.mockResolvedValue({
      id: 'memory_user',
      userId: 'user_1',
      sessionId: null,
      scope: 'user',
      namespace: 'preference',
      key: 'source-policy',
      value: { note: 'Prefer primary sources.' },
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });

    const postResponse = await memoryRoute.POST(
      new Request('http://localhost/api/research/memory', {
        method: 'POST',
        body: JSON.stringify({ scope: 'user', namespace: 'preference', key: 'source-policy', value: { note: 'Prefer primary sources.' } }),
      }),
    );

    expect(postResponse.status).toBe(200);
    expect(routeHarness.getSessionDetail).not.toHaveBeenCalled();
    expect(routeHarness.upsertResearchMemory).toHaveBeenCalledWith('user_1', {
      scope: 'user',
      namespace: 'preference',
      key: 'source-policy',
      value: { note: 'Prefer primary sources.' },
    });
  });

  it('returns validation errors for malformed memory writes', async () => {
    const memoryRoute = await import('@/app/api/research/memory/route');

    const response = await memoryRoute.POST(
      new Request('http://localhost/api/research/memory', {
        method: 'POST',
        body: JSON.stringify({ scope: 'session', namespace: 'procedure', key: '', value: {} }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('validation_error');
    expect(routeHarness.upsertResearchMemory).not.toHaveBeenCalled();
  });

  it('rejects memory writes that contain secret-like values', async () => {
    const memoryRoute = await import('@/app/api/research/memory/route');

    const response = await memoryRoute.POST(
      new Request('http://localhost/api/research/memory', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'user',
          namespace: 'preference',
          key: 'source-policy',
          value: { api_key: 'sk-test_1234567890abcdef1234567890' },
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('validation_error');
    expect(routeHarness.upsertResearchMemory).not.toHaveBeenCalled();
  });
});

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
