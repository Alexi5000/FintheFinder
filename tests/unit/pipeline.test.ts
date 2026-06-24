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
        if (name === 'contradictionAgent') return output({ ok: true, issues: [], criticalGaps: [] });
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
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('awaiting_approval');
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
    );
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

  it('runs approved reporting through citation audit and final review', async () => {
    const { runApprovedReportSession } = await import('@/server/research/pipeline');
    const result = await runApprovedReportSession('session_1', 'Research AI compliance', {
      run: {
        id: 'run_2',
        sessionId: 'session_1',
        status: 'running',
        attempt: 1,
        metadata: { stage: 'reporting' },
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('completed');
    expect(repositoryMock.saveReport).toHaveBeenCalledWith(expect.objectContaining<Partial<ResearchReport>>({ title: 'Report', sessionId: 'session_1' }));
    expect(repositoryMock.saveResearchAudit).toHaveBeenCalledWith('session_1', 'final_review', { ok: true, issues: [] }, 'run_2');
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
