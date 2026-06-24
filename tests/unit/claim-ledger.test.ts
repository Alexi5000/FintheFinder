import { describe, expect, it } from 'vitest';
import { auditClaims, claimsFromLearnings, evidenceFromLearnings } from '@/server/research/claim-ledger';
import type { ResearchLearning, ResearchSource } from '@/lib/schemas';

const source: ResearchSource = {
  id: 'src_1',
  title: 'Regulator guidance',
  url: 'https://example.com/regulator',
  canonicalUrl: 'https://example.com/regulator',
  domain: 'example.com',
  snippet: '',
  content: '',
  publishedAt: null,
  score: 1,
  credibility: 'high',
  relevanceReason: 'fixture',
};

const learnings: ResearchLearning[] = [
  {
    id: 'learning_1',
    sourceId: 'src_1',
    claim: 'Human oversight is required for high-risk AI workflows.',
    evidence: 'The guidance says institutions should preserve human oversight.',
    followUpQuestions: [],
  },
  {
    id: 'learning_2',
    sourceId: 'src_1',
    claim: 'Human oversight is required for high-risk AI workflows.',
    evidence: 'A second passage repeats the oversight requirement.',
    followUpQuestions: [],
  },
];

describe('claim ledger', () => {
  it('deduplicates learnings into stable supported claims', () => {
    const claims = claimsFromLearnings('session_1', learnings, [source], '2026-06-24T00:00:00.000Z');
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe('supported');
    expect(claims[0].evidenceIds).toHaveLength(2);
  });

  it('creates evidence that points at the generated claim namespace', () => {
    const claims = claimsFromLearnings('session_1', learnings, [source], '2026-06-24T00:00:00.000Z');
    const evidence = evidenceFromLearnings('session_1', learnings, [source], '2026-06-24T00:00:00.000Z');
    expect(evidence[0].claimId).toBe(claims[0].id);
  });

  it('blocks readiness when required criteria are uncovered', () => {
    const claims = claimsFromLearnings('session_1', learnings, [source], '2026-06-24T00:00:00.000Z');
    const audit = auditClaims('session_1', claims, ['documented rollback plan'], '2026-06-24T00:00:00.000Z');
    expect(audit.ok).toBe(false);
    expect(audit.openCriticalGaps[0].description).toBe('documented rollback plan');
  });
});
