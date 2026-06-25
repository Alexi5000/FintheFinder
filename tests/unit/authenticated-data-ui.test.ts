import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClaimGap, ResearchClaim, ResearchMemory, ResearchSessionDetail } from '@/lib/schemas';

const supabaseHarness = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-access-token' } } })),
}));

vi.mock('@/lib/supabase-browser', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: supabaseHarness.getSession,
    },
  }),
}));

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...props }, children),
  };
});

const timestamp = '2026-06-24T00:00:00.000Z';

const claim: ResearchClaim = {
  id: 'claim_1',
  sessionId: 'session_1',
  text: 'Model drift controls must be logged.',
  status: 'supported',
  severity: 'high',
  sourceIds: ['src_1'],
  evidenceIds: ['evidence_1'],
  createdAt: timestamp,
};

const criticalGap: ClaimGap = {
  id: 'gap_1',
  sessionId: 'session_1',
  claimId: 'claim_1',
  description: 'Reviewer must confirm the escalation owner.',
  severity: 'critical',
  status: 'open',
  createdAt: timestamp,
};

const sessionDetail: ResearchSessionDetail = {
  id: 'session_1',
  userId: 'user_1',
  query: 'Research AI governance controls for financial services.',
  title: 'AI Governance Controls',
  status: 'awaiting_approval',
  phase: 'reviewing',
  createdAt: timestamp,
  updatedAt: timestamp,
  currentRun: {
    id: 'run_1',
    sessionId: 'session_1',
    status: 'awaiting_approval',
    attempt: 1,
    metadata: { stage: 'research' },
    workerId: 'worker_1',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  currentRunCost: {
    id: 'cost_1',
    runId: 'run_1',
    sessionId: 'session_1',
    usage: { modelCalls: [{ model: 'configured-primary', inputTokens: 1000, outputTokens: 500 }], exaSearches: 3 },
    modelCostUsd: 0.01,
    searchCostUsd: 0.015,
    totalUsd: 0.025,
    pricingEffectiveDate: '2026-06-24',
    measurementMethod: 'provider_usage',
    createdAt: timestamp,
  },
  currentPostMortem: null,
  sources: [
    {
      id: 'src_1',
      title: 'Primary Governance Source',
      url: 'https://example.com/governance',
      canonicalUrl: 'https://example.com/governance',
      domain: 'example.com',
      snippet: 'Controls summary',
      content: 'Evidence body',
      publishedAt: null,
      score: 1,
      credibility: 'high',
      relevanceReason: 'Fixture',
    },
  ],
  evaluations: [],
  learnings: [
    {
      id: 'learning_1',
      sourceId: 'src_1',
      claim: 'Model drift controls must be logged.',
      evidence: 'The source says drift controls need logs.',
      followUpQuestions: [],
    },
  ],
  events: [
    {
      id: 'event_1',
      sessionId: 'session_1',
      runId: 'run_1',
      phase: 'reviewing',
      eventType: 'claim_gap_opened',
      severity: 'warn',
      actor: 'system',
      stepId: 'claim_audit',
      message: 'Claim gap opened.',
      metadata: {},
      createdAt: timestamp,
    },
  ],
  approvals: [
    {
      id: 'approval_1',
      sessionId: 'session_1',
      userId: 'user_1',
      action: 'approve',
      notes: 'Reviewer waived one gap after checking the source.',
      approvedSourceIds: ['src_1'],
      waivedGapIds: ['gap_1'],
      createdAt: timestamp,
    },
  ],
  report: {
    id: 'report_1',
    sessionId: 'session_1',
    title: 'AI Governance Report',
    executiveSummary: 'Summary',
    sections: [{ heading: 'Controls', body: 'Model drift controls must be logged.', sourceIds: ['src_1'], claimIds: ['claim_1'] }],
    citations: [{ sourceId: 'src_1', url: 'https://example.com/governance', title: 'Primary Governance Source' }],
    markdown: '# AI Governance Report\n\n## Controls\n\nModel drift controls must be logged.',
    createdAt: timestamp,
  },
};

const memories: ResearchMemory[] = [
  {
    id: 'memory_1',
    userId: 'user_1',
    sessionId: 'session_1',
    scope: 'session',
    namespace: 'procedure',
    key: 'operator-note:1',
    value: { note: 'Prefer regulator and primary-source evidence.' },
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

describe('authenticated data UI', () => {
  it('renders populated session detail with run cost, approvals, claims, memory, and artifacts', async () => {
    const { SessionDetailClient } = await import('@/components/authenticated-data');

    const html = renderToStaticMarkup(
      createElement(SessionDetailClient, {
        sessionId: 'session_1',
        initialSession: sessionDetail,
        initialClaims: { claims: [claim], gaps: [criticalGap] },
        initialMemories: memories,
      }),
    );

    expect(html).toContain('AI Governance Controls');
    expect(html).toContain('Model drift controls must be logged.');
    expect(html).toContain('Prefer regulator and primary-source evidence.');
    expect(html).toContain('provider_usage');
    expect(html).toContain('$0.025');
    expect(html).toContain('Human approval gate');
    expect(html).toContain('Reviewer must confirm the escalation owner.');
    expect(html).toContain('Reviewer waived one gap after checking the source.');
    expect(html).toContain('Primary Governance Source');
  });

  it('renders a populated report reader and export action', async () => {
    const { ReportReaderClient } = await import('@/components/authenticated-data');

    const html = renderToStaticMarkup(createElement(ReportReaderClient, { sessionId: 'session_1', initialSession: sessionDetail }));

    expect(html).toContain('AI Governance Report');
    expect(html).toContain('# AI Governance Report');
    expect(html).toContain('Export markdown');
  });
});
