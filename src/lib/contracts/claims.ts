import { z } from 'zod';

export const claimStatusSchema = z.enum(['proposed', 'supported', 'contradicted', 'unsupported', 'waived']);
export const claimSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const researchClaimSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  text: z.string().min(1),
  status: claimStatusSchema,
  severity: claimSeveritySchema.default('medium'),
  sourceIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const claimEvidenceSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  sourceId: z.string(),
  quote: z.string().min(1),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});

export const claimGapSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  claimId: z.string().optional(),
  description: z.string().min(1),
  severity: claimSeveritySchema,
  status: z.enum(['open', 'closed', 'waived']),
  resolution: z.string().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
});

export const claimAuditSchema = z.object({
  ok: z.boolean(),
  openCriticalGaps: z.array(claimGapSchema),
  openGaps: z.array(claimGapSchema),
  unsupportedClaimIds: z.array(z.string()),
});

export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type ClaimSeverity = z.infer<typeof claimSeveritySchema>;
export type ResearchClaim = z.infer<typeof researchClaimSchema>;
export type ClaimEvidence = z.infer<typeof claimEvidenceSchema>;
export type ClaimGap = z.infer<typeof claimGapSchema>;
export type ClaimAudit = z.infer<typeof claimAuditSchema>;
