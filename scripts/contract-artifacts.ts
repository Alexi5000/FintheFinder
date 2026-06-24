import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  apiErrorSchema,
  approvalRequestSchema,
  claimAuditSchema,
  claimEvidenceSchema,
  claimGapSchema,
  createResearchSessionSchema,
  researchClaimSchema,
  researchPostMortemSchema,
  researchPacketSchema,
  researchMemorySchema,
  runCostSchema,
  researchRunEventSchema,
  researchRunSchema,
  researchSessionDetailSchema,
  researchSessionSchema,
  reportSchema,
  upsertResearchMemorySchema,
  workflowActionSchema,
  workflowStateSchema,
} from '../src/lib/schemas';

export function buildContractArtifacts() {
  const contracts = {
    version: 1,
    generatedAt: 'deterministic',
    schemas: {
      apiError: z.toJSONSchema(apiErrorSchema),
      approvalRequest: z.toJSONSchema(approvalRequestSchema),
      claimAudit: z.toJSONSchema(claimAuditSchema),
      claimEvidence: z.toJSONSchema(claimEvidenceSchema),
      claimGap: z.toJSONSchema(claimGapSchema),
      createResearchSession: z.toJSONSchema(createResearchSessionSchema),
      researchClaim: z.toJSONSchema(researchClaimSchema),
      researchPostMortem: z.toJSONSchema(researchPostMortemSchema),
      researchPacket: z.toJSONSchema(researchPacketSchema),
      researchMemory: z.toJSONSchema(researchMemorySchema),
      upsertResearchMemory: z.toJSONSchema(upsertResearchMemorySchema),
      researchRun: z.toJSONSchema(researchRunSchema),
      runCost: z.toJSONSchema(runCostSchema),
      researchRunEvent: z.toJSONSchema(researchRunEventSchema),
      researchSession: z.toJSONSchema(researchSessionSchema),
      researchSessionDetail: z.toJSONSchema(researchSessionDetailSchema),
      report: z.toJSONSchema(reportSchema),
      workflowAction: z.toJSONSchema(workflowActionSchema),
      workflowState: z.toJSONSchema(workflowStateSchema),
    },
  };
  const serialized = `${JSON.stringify(contracts, null, 2)}\n`;
  const hash = createHash('sha256').update(serialized).digest('hex');
  return { serialized, hash };
}
