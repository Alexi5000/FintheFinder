import { createHash } from 'node:crypto';
import type { ClaimAudit, ClaimEvidence, ClaimGap, ResearchClaim, ResearchLearning, ResearchSource } from '@/lib/schemas';
import { nowIso } from '@/lib/utils';

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha256').update(value).digest('base64url').slice(0, 24)}`;
}

function normalizeClaim(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function claimsFromLearnings(sessionId: string, learnings: ResearchLearning[], sources: ResearchSource[], createdAt = nowIso()): ResearchClaim[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  const claims = new Map<string, ResearchClaim>();

  for (const learning of learnings) {
    if (!sourceIds.has(learning.sourceId)) continue;
    const key = normalizeClaim(learning.claim);
    const existing = claims.get(key);
    if (existing) {
      if (!existing.sourceIds.includes(learning.sourceId)) existing.sourceIds.push(learning.sourceId);
      existing.evidenceIds.push(stableId('evidence', `${learning.id}:${learning.sourceId}`));
      existing.status = existing.sourceIds.length > 0 ? 'supported' : existing.status;
      continue;
    }

    claims.set(key, {
      id: stableId('claim', `${sessionId}:${key}`),
      sessionId,
      text: learning.claim.trim(),
      status: learning.evidence.trim() ? 'supported' : 'unsupported',
      severity: 'medium',
      sourceIds: [learning.sourceId],
      evidenceIds: [stableId('evidence', `${learning.id}:${learning.sourceId}`)],
      createdAt,
    });
  }

  return [...claims.values()];
}

export function evidenceFromLearnings(sessionId: string, learnings: ResearchLearning[], sources: ResearchSource[], createdAt = nowIso()): ClaimEvidence[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  return learnings.flatMap((learning) => {
    if (!sourceIds.has(learning.sourceId) || !learning.evidence.trim()) return [];
    return [
      {
        id: stableId('evidence', `${learning.id}:${learning.sourceId}`),
        claimId: stableId('claim', `${sessionId}:${normalizeClaim(learning.claim)}`),
        sourceId: learning.sourceId,
        quote: learning.evidence.trim(),
        confidence: 0.72,
        createdAt,
      },
    ];
  });
}

export function auditClaims(sessionId: string, claims: ResearchClaim[], requiredCriteria: string[], createdAt = nowIso()): ClaimAudit {
  const supportedText = claims.filter((claim) => claim.status === 'supported').map((claim) => normalizeClaim(claim.text));
  const unsupportedClaimIds = claims.filter((claim) => claim.status === 'unsupported' || claim.status === 'contradicted').map((claim) => claim.id);
  const openGaps: ClaimGap[] = [];

  for (const criterion of requiredCriteria) {
    const normalized = normalizeClaim(criterion);
    const covered = supportedText.some((claimText) => claimText.includes(normalized) || normalized.includes(claimText));
    if (!covered) {
      openGaps.push({
        id: stableId('gap', `${sessionId}:${normalized}`),
        sessionId,
        description: criterion,
        severity: 'critical',
        status: 'open',
        createdAt,
      });
    }
  }

  const openCriticalGaps = openGaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
  return {
    ok: openCriticalGaps.length === 0 && unsupportedClaimIds.length === 0,
    openCriticalGaps,
    openGaps,
    unsupportedClaimIds,
  };
}
