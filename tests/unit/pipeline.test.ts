import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchLearning, ResearchReport, ResearchSource, SourceEvaluation } from '@/lib/schemas';

const source: ResearchSource = {
  id: 'src_1',
  title: 'Source',
  url: 'https://example.com/source',
  canonicalUrl: 'https://example.com/source',
  domain: 'example.com',
  snippet: 'snippet',
  content: 'source content',
  publishedAt: null,
  score: 1,
  credibility: 'high',
  relevanceReason: 'fixture',
};

const evaluation: SourceEvaluation = {
  sourceId: 'src_1',
  isRelevant: true,
  score: 0.9,
  credibility: 'high',
  reason: 'fixture',
  risks: [],
};

const learning: ResearchLearning = {
  id: 'learning_1',
  sourceId: 'src_1',
  claim: 'Human oversight is required.',
  evidence: 'The source requires human oversight.',
  followUpQuestions: [],
};

const reportDraft = {
  title: 'Report',
  executiveSummary: 'Summary',
  sections: [{ heading: 'Finding', body: 'Body', sourceIds: ['src_1'], claimIds: ['claim_1'] }],
  citations: [{ sourceId: 'src_1', url: 'https://example.com/source', title: 'Source' }],
};

const repositoryMock = vi.hoisted(() => ({
  addEvent: vi.fn(async () => undefined),
  getResearchArtifacts: vi.fn(),
  publishReport: vi.fn(async () => ({ ok: true, idempotent: false })),
  replaceResearchArtifacts: vi.fn(async () => undefined),
  saveReport: vi.fn(async () => undefined),
  saveResearchAudit: vi.fn(async () => undefined),
  saveRunCost: vi.fn(async () => ({
    id: 'cost_1',
    runId: 'run_1',
    sessionId: 'session_1',
    usage: { modelCalls: [], exaSearches: 0 },
    modelCostUsd: 0,
    searchCostUsd: 0,
    totalUsd: 0,
    pricingEffectiveDate: '2026-06-24',
    measurementMethod: 'estimated',
    createdAt: '2026-06-24T00:00:00.000Z',
  })),
  updateSessionState: vi.fn(async () => undefined),
}));

const agentState = vi.hoisted(() => ({
  citationOk: true,
  finalApproved: true,
  contradictionCriticalGaps: [] as string[],
  useProviderUsage: false,
}));

vi.mock('@/lib/config', () => ({
  env: { RUN_BUDGET_USD: 5 },
  getProviderStatus: () => ({ openai: true, exa: true, supabase: true, models: { primary: 'gpt-5.5', fast: 'gpt-5.4-mini', reasoningEffort: 'high' } }),
}));

vi.mock('@/server/research/search-service', () => ({
  searchWeb: vi.fn(async () => [source]),
}));

vi.mock('@/server/research/repository', () => repositoryMock);

vi.mock('@/mastra', () => ({
  mastra: {
    getAgent: (name: string) => ({
      generate: async () => {
        const output = (object: unknown) => (agentState.useProviderUsage ? { object, usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 } } : { object });
        if (name === 'plannerAgent') return output({ queries: ['agent compliance', 'agent controls'], successCriteria: ['Human oversight is required.'] });
        if (name === 'evaluationAgent') return output(evaluation);
        if (name === 'learningExtractionAgent') return output(learning);
        if (name === 'contradictionAgent') return output({ ok: agentState.contradictionCriticalGaps.length === 0, issues: [], criticalGaps: agentState.contradictionCriticalGaps });
        if (name === 'reportAgent') return output(reportDraft);
        if (name === 'citationAuditorAgent') return output({ ok: agentState.citationOk, issues: agentState.citationOk ? [] : ['missing citation'] });
        if (name === 'finalReviewerAgent') return output({ approved: agentState.finalApproved, issues: agentState.finalApproved ? [] : ['needs caveat'], summary: 'ready' });
        throw new Error(`Unexpected agent ${name}`);
      },
    }),
  },
}));

describe('research pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.citationOk = true;
    agentState.finalApproved = true;
    agentState.contradictionCriticalGaps = [];
    agentState.useProviderUsage = false;
    repositoryMock.getResearchArtifacts.mockResolvedValue({
      sources: [source],
      evaluations: [evaluation],
      learnings: [learning],
      events: [],
      report: null,
      claims: [],
      gaps: [],
    });
  });

  it('runs research stage to the human approval gate with claims and audits', async () => {
    const { runResearchSession } = await import('@/server/research/pipeline');
    const result = await runResearchSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_1',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'research' },
        workerId: 'worker_1',
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
      attemptId: 'attempt_1',
      correlationId: 'corr_1',
    });

    expect(result.status).toBe('awaiting_approval');
    expect(repositoryMock.addEvent).toHaveBeenCalledWith(
      'session_1',
      'planning',
      'Planning focused search queries.',
      {},
      expect.objectContaining({ attemptId: 'attempt_1', correlationId: 'corr_1', runId: 'run_1' }),
    );
    expect(repositoryMock.replaceResearchArtifacts).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        sources: [source],
        evaluations: expect.any(Array),
        learnings: expect.any(Array),
        claims: expect.any(Array),
        claimEvidence: expect.any(Array),
        audits: expect.any(Array),
      }),
      { runId: 'run_1', attemptId: 'attempt_1', workerId: 'worker_1' },
    );
  });

  it('blocks research artifact persistence when the worker lease guard fails', async () => {
    const assertLease = vi.fn(async (context: { operation: string }) => {
      if (context.operation === 'replace_research_artifacts') throw new Error('lease lost before artifact write');
    });
    const { runResearchSession } = await import('@/server/research/pipeline');

    await expect(
      runResearchSession('session_1', 'Research AI compliance', {
        run: {
          id: 'run_guarded',
          sessionId: 'session_1',
          status: 'running',
          attempt: 1,
          metadata: { stage: 'research' },
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
        assertLease,
      }),
    ).rejects.toThrow('lease lost before artifact write');

    expect(assertLease).toHaveBeenCalledWith(expect.objectContaining({ operation: 'replace_research_artifacts', runId: 'run_guarded' }));
    expect(repositoryMock.replaceResearchArtifacts).not.toHaveBeenCalled();
    expect(repositoryMock.saveRunCost).not.toHaveBeenCalled();
    expect(repositoryMock.updateSessionState).not.toHaveBeenCalledWith('session_1', 'awaiting_approval', 'reviewing');
  });

  it('marks run cost as provider usage when all agent calls report tokens', async () => {
    agentState.useProviderUsage = true;
    const { runResearchSession } = await import('@/server/research/pipeline');
    await runResearchSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_usage',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'research' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(repositoryMock.saveRunCost).toHaveBeenCalledWith('run_usage', 'session_1', expect.any(Object), expect.any(Object), 'provider_usage');
  });

  it('records budget metadata and warns when research stops with critical gaps over budget', async () => {
    agentState.contradictionCriticalGaps = ['Primary evidence is missing.'];
    repositoryMock.saveRunCost.mockResolvedValueOnce({
      id: 'cost_budget',
      runId: 'run_budget',
      sessionId: 'session_1',
      usage: { modelCalls: [], exaSearches: 2 },
      modelCostUsd: 5,
      searchCostUsd: 1,
      totalUsd: 6,
      pricingEffectiveDate: '2026-06-24',
      measurementMethod: 'estimated',
      createdAt: '2026-06-24T00:00:00.000Z',
    });
    const { runResearchSession } = await import('@/server/research/pipeline');

    const result = await runResearchSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_budget',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'research' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('awaiting_approval');
    expect(repositoryMock.addEvent).toHaveBeenCalledWith(
      'session_1',
      'reviewing',
      'Run cost estimate recorded.',
      expect.objectContaining({
        budgetExceeded: true,
        budgetRemainingUsd: -1,
        budgetUsd: 5,
        estimatedCostUsd: 6,
      }),
      expect.objectContaining({ severity: 'warn', stepId: 'cost_estimator' }),
    );
    expect(repositoryMock.addEvent).toHaveBeenCalledWith(
      'session_1',
      'reviewing',
      'Run budget exceeded while critical claim gaps remain; human approval required before continuing.',
      expect.objectContaining({
        budgetExceeded: true,
        budgetRemainingUsd: -1,
        openCriticalGapIds: expect.arrayContaining([expect.stringMatching(/^gap_/)]),
      }),
      expect.objectContaining({ eventType: 'claim_gap_opened', severity: 'warn', stepId: 'budget_gate' }),
    );
  });

  it('runs approved reporting through citation audit and final review', async () => {
    const { runApprovedReportSession } = await import('@/server/research/pipeline');
    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_2',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        workerId: 'worker_1',
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
      attemptId: 'attempt_1',
      correlationId: 'corr_1',
    });

    expect(result.status).toBe('completed');
    expect(result.runFinalized).toBe(true);
    expect(repositoryMock.publishReport).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining<Partial<ResearchReport>>({ title: 'Report', sessionId: 'session_1' }),
      { ok: true, issues: [] },
      { runId: 'run_2', attemptId: 'attempt_1', workerId: 'worker_1', correlationId: 'corr_1' },
    );
    expect(repositoryMock.saveReport).not.toHaveBeenCalled();
    expect(repositoryMock.saveResearchAudit).not.toHaveBeenCalled();
    expect(repositoryMock.updateSessionState).not.toHaveBeenCalledWith('session_1', 'report_ready', 'complete');
    expect(repositoryMock.addEvent).not.toHaveBeenCalledWith(
      'session_1',
      'complete',
      'Report is ready.',
      expect.any(Object),
      expect.objectContaining({ eventType: 'report_ready' }),
    );
  });

  it('still publishes an over-budget report when no critical gaps are open', async () => {
    repositoryMock.saveRunCost.mockResolvedValueOnce({
      id: 'cost_reporting_budget',
      runId: 'run_reporting_budget',
      sessionId: 'session_1',
      usage: { modelCalls: [], exaSearches: 0 },
      modelCostUsd: 6,
      searchCostUsd: 0,
      totalUsd: 6,
      pricingEffectiveDate: '2026-06-24',
      measurementMethod: 'estimated',
      createdAt: '2026-06-24T00:00:00.000Z',
    });
    const { runApprovedReportSession } = await import('@/server/research/pipeline');

    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_reporting_budget',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('completed');
    expect(repositoryMock.getResearchArtifacts).toHaveBeenCalledTimes(2);
    expect(repositoryMock.publishReport).toHaveBeenCalled();
  });

  it('blocks over-budget report publication when critical gaps reopen before publish', async () => {
    repositoryMock.saveRunCost.mockResolvedValueOnce({
      id: 'cost_reporting_block',
      runId: 'run_reporting_block',
      sessionId: 'session_1',
      usage: { modelCalls: [], exaSearches: 0 },
      modelCostUsd: 6,
      searchCostUsd: 0,
      totalUsd: 6,
      pricingEffectiveDate: '2026-06-24',
      measurementMethod: 'estimated',
      createdAt: '2026-06-24T00:00:00.000Z',
    });
    repositoryMock.getResearchArtifacts
      .mockResolvedValueOnce({
        sources: [source],
        evaluations: [evaluation],
        learnings: [learning],
        events: [],
        report: null,
        claims: [],
        gaps: [],
      })
      .mockResolvedValueOnce({
        sources: [source],
        evaluations: [evaluation],
        learnings: [learning],
        events: [],
        report: null,
        claims: [],
        gaps: [
          {
            id: 'gap_reopened',
            sessionId: 'session_1',
            description: 'Critical claim reopened after approval.',
            severity: 'critical',
            status: 'open',
            createdAt: '2026-06-24T00:00:00.000Z',
          },
        ],
      });
    const { runApprovedReportSession } = await import('@/server/research/pipeline');

    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_reporting_block',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('awaiting_approval');
    expect(repositoryMock.updateSessionState).toHaveBeenCalledWith('session_1', 'awaiting_approval', 'reviewing');
    expect(repositoryMock.addEvent).toHaveBeenCalledWith(
      'session_1',
      'reviewing',
      'Run budget exceeded while critical claim gaps remain; human approval required before continuing.',
      expect.objectContaining({
        budgetExceeded: true,
        openCriticalGapIds: ['gap_reopened'],
      }),
      expect.objectContaining({ eventType: 'claim_gap_opened', severity: 'warn', stepId: 'budget_gate' }),
    );
    expect(repositoryMock.publishReport).not.toHaveBeenCalled();
  });

  it('returns to approval when transactional report publication finds reopened critical gaps', async () => {
    repositoryMock.publishReport.mockResolvedValueOnce({
      ok: false,
      code: 'critical_gaps_unresolved',
      status: 'awaiting_approval',
      openCriticalGapIds: ['gap_critical'],
    });
    const { runApprovedReportSession } = await import('@/server/research/pipeline');
    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_gap_reopened',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        workerId: 'worker_1',
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
      attemptId: 'attempt_1',
      correlationId: 'corr_1',
    });

    expect(result).toEqual({ status: 'awaiting_approval', runFinalized: true });
    expect(repositoryMock.saveReport).not.toHaveBeenCalled();
    expect(repositoryMock.updateSessionState).not.toHaveBeenCalledWith('session_1', 'awaiting_approval', 'reviewing');
  });

  it('blocks final report persistence when the worker lease guard fails', async () => {
    const assertLease = vi.fn(async (context: { operation: string }) => {
      if (context.operation === 'publish_report') throw new Error('lease lost before report write');
    });
    const { runApprovedReportSession } = await import('@/server/research/pipeline');

    await expect(
      runApprovedReportSession('session_1', 'Research AI compliance', {
        run: {
          id: 'run_report_guarded',
          sessionId: 'session_1',
          status: 'running',
          attempt: 1,
          metadata: { stage: 'reporting' },
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
        assertLease,
      }),
    ).rejects.toThrow('lease lost before report write');

    expect(assertLease).toHaveBeenCalledWith(expect.objectContaining({ operation: 'publish_report', runId: 'run_report_guarded' }));
    expect(repositoryMock.publishReport).not.toHaveBeenCalled();
    expect(repositoryMock.updateSessionState).not.toHaveBeenCalledWith('session_1', 'report_ready', 'complete');
  });

  it('returns to approval when citation audit fails', async () => {
    agentState.citationOk = false;
    const { runApprovedReportSession } = await import('@/server/research/pipeline');
    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_3',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('awaiting_approval');
    expect(repositoryMock.saveReport).not.toHaveBeenCalled();
  });

  it('returns to approval when final review fails', async () => {
    agentState.finalApproved = false;
    const { runApprovedReportSession } = await import('@/server/research/pipeline');
    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_4',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('awaiting_approval');
    expect(repositoryMock.saveResearchAudit).toHaveBeenCalledWith('session_1', 'final_review', { ok: false, issues: ['needs caveat'] }, 'run_4');
  });
});
