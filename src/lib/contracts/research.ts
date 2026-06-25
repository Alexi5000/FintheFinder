import { z } from 'zod';

export const researchStatusSchema = z.enum([
  'draft',
  'queued',
  'running',
  'awaiting_approval',
  'approved',
  'rejected',
  'report_ready',
  'failed',
]);

export const researchPhaseSchema = z.enum([
  'intake',
  'planning',
  'searching',
  'evaluating',
  'extracting',
  'reviewing',
  'reporting',
  'complete',
  'failed',
]);

export const runStatusSchema = z.enum(['queued', 'leased', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled']);

export const sourceSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  domain: z.string().min(1),
  snippet: z.string().default(''),
  content: z.string().default(''),
  publishedAt: z.string().nullable().optional(),
  score: z.number().min(0).max(1).default(0),
  credibility: z.enum(['high', 'medium', 'low', 'unknown']).default('unknown'),
  relevanceReason: z.string().default(''),
});

export const sourceEvaluationSchema = z.object({
  sourceId: z.string(),
  isRelevant: z.boolean(),
  score: z.number().min(0).max(1),
  credibility: z.enum(['high', 'medium', 'low', 'unknown']),
  reason: z.string(),
  risks: z.array(z.string()).default([]),
});

export const learningSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  claim: z.string().min(1),
  evidence: z.string().min(1),
  followUpQuestions: z.array(z.string()).max(3).default([]),
});

export const reportSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  sourceIds: z.array(z.string()).min(1),
  claimIds: z.array(z.string()).optional(),
});

export const reportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  title: z.string().min(1),
  executiveSummary: z.string().min(1),
  sections: z.array(reportSectionSchema).min(1),
  citations: z.array(z.object({ sourceId: z.string(), url: z.string().url(), title: z.string() })),
  markdown: z.string().min(1),
  createdAt: z.string(),
});

export const researchEventTypeSchema = z.enum([
  'session_created',
  'state_transition',
  'agent_started',
  'agent_completed',
  'tool_started',
  'tool_completed',
  'claim_gap_opened',
  'approval_recorded',
  'report_ready',
  'error',
  'post_mortem_created',
]);

export const eventSeveritySchema = z.enum(['debug', 'info', 'warn', 'error']);
export const eventActorSchema = z.enum(['system', 'user', 'worker', 'agent', 'tool']);

export const researchRunEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  runId: z.string().optional(),
  attemptId: z.string().optional(),
  phase: researchPhaseSchema,
  eventType: researchEventTypeSchema.optional(),
  severity: eventSeveritySchema.optional(),
  actor: eventActorSchema.optional(),
  stepId: z.string().optional(),
  message: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
  traceId: z.string().optional(),
  correlationId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});

export const researchRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: runStatusSchema,
  attempt: z.number().int().positive(),
  currentAttemptId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  workerId: z.string().nullable().optional(),
  leaseExpiresAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const researchPostMortemSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  runId: z.string().nullable().optional(),
  rootCause: z.string(),
  affectedStep: z.string().nullable().optional(),
  actionItems: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const modelUsageSchema = z.object({
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export const runUsageSchema = z.object({
  modelCalls: z.array(modelUsageSchema).default([]),
  exaSearches: z.number().int().nonnegative().default(0),
});

export const runCostSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sessionId: z.string(),
  usage: runUsageSchema,
  modelCostUsd: z.number().nonnegative(),
  searchCostUsd: z.number().nonnegative(),
  totalUsd: z.number().nonnegative(),
  pricingEffectiveDate: z.string(),
  measurementMethod: z.enum(['estimated', 'provider_usage']).default('estimated'),
  createdAt: z.string(),
});

export const evalScoresSchema = z.object({
  correctness: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
});

export const evalResultSummarySchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  expectedPass: z.boolean(),
  observedPass: z.boolean(),
  scores: evalScoresSchema,
  issues: z.array(z.string()).default([]),
  regressions: z.array(z.string()).default([]),
});

export const evalSuiteSummarySchema = z.object({
  passed: z.boolean(),
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(evalResultSummarySchema),
}).superRefine((summary, ctx) => {
  if (summary.total !== summary.results.length) {
    ctx.addIssue({ code: 'custom', path: ['total'], message: 'Eval summary total must match result count.' });
  }
  const failedCount = summary.results.filter((result) => !result.passed).length;
  if (summary.failed !== failedCount) {
    ctx.addIssue({ code: 'custom', path: ['failed'], message: 'Eval summary failed count must match failed results.' });
  }
});

export const evalRunStatusSchema = z.enum(['passed', 'failed']);

export const evalRunSchema = z.object({
  id: z.string(),
  suite: z.string().min(1),
  status: evalRunStatusSchema,
  summary: evalSuiteSummarySchema,
  createdAt: z.string(),
});

export const evalResultSchema = z.object({
  id: z.string(),
  evalRunId: z.string(),
  fixtureId: z.string().min(1),
  passed: z.boolean(),
  expectedPass: z.boolean(),
  observedPass: z.boolean(),
  scores: evalScoresSchema,
  issues: z.array(z.string()).default([]),
  regressions: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const evalRunWithResultsSchema = evalRunSchema.extend({
  results: z.array(evalResultSchema),
});

export const evalHistoryResponseSchema = z.object({
  suite: z.string().min(1),
  runs: z.array(evalRunSchema),
  latest: evalRunWithResultsSchema.nullable(),
});

export const researchMemoryScopeSchema = z.enum(['user', 'session']);
export const researchMemoryNamespaceSchema = z.enum(['preference', 'source_cache', 'procedure', 'run_summary']);

export const researchMemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().nullable().optional(),
  scope: researchMemoryScopeSchema,
  namespace: researchMemoryNamespaceSchema,
  key: z.string().min(1),
  value: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((memory, ctx) => {
  if (memory.scope === 'user' && memory.sessionId) {
    ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'User-scoped memory must not include a sessionId.' });
  }
  if (memory.scope === 'session' && !memory.sessionId) {
    ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'Session-scoped memory requires a sessionId.' });
  }
});

export const upsertResearchMemorySchema = z.object({
  sessionId: z.string().optional(),
  scope: researchMemoryScopeSchema,
  namespace: researchMemoryNamespaceSchema,
  key: z.string().trim().min(1).max(160),
  value: z.record(z.string(), z.unknown()),
}).superRefine((memory, ctx) => {
  if (memory.scope === 'user' && memory.sessionId) {
    ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'User-scoped memory must not include a sessionId.' });
  }
  if (memory.scope === 'session' && !memory.sessionId) {
    ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'Session-scoped memory requires a sessionId.' });
  }
});

export const approvalActionSchema = z.enum(['approve', 'reject', 'follow_up']);

export const researchApprovalSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  userId: z.string(),
  action: approvalActionSchema,
  notes: z.string().nullable().optional(),
  approvedSourceIds: z.array(z.string()).default([]),
  waivedGapIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const researchSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  query: z.string().min(3),
  title: z.string().min(1),
  status: researchStatusSchema,
  phase: researchPhaseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const researchSessionDetailSchema = researchSessionSchema.extend({
  currentRun: researchRunSchema.nullable().optional(),
  currentRunCost: runCostSchema.nullable().optional(),
  currentPostMortem: researchPostMortemSchema.nullable().optional(),
  sources: z.array(sourceSchema),
  evaluations: z.array(sourceEvaluationSchema),
  learnings: z.array(learningSchema),
  events: z.array(researchRunEventSchema),
  approvals: z.array(researchApprovalSchema).default([]),
  report: reportSchema.nullable(),
});

export const researchPacketSchema = z.object({
  queries: z.array(z.string()),
  searchResults: z.array(sourceSchema),
  evaluations: z.array(sourceEvaluationSchema),
  learnings: z.array(learningSchema),
  completedQueries: z.array(z.string()),
  phase: researchPhaseSchema,
});

export const createResearchSessionSchema = z.object({
  query: z.string().trim().min(3).max(2000),
});

export const approvalRequestSchema = z.object({
  action: approvalActionSchema,
  notes: z.string().trim().max(2000).optional(),
  approvedSourceIds: z.array(z.string()).default([]),
  waivedGapIds: z.array(z.string()).default([]),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ResearchStatus = z.infer<typeof researchStatusSchema>;
export type ResearchPhase = z.infer<typeof researchPhaseSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type ResearchSource = z.infer<typeof sourceSchema>;
export type SourceEvaluation = z.infer<typeof sourceEvaluationSchema>;
export type ResearchLearning = z.infer<typeof learningSchema>;
export type ResearchReport = z.infer<typeof reportSchema>;
export type ResearchRunEvent = z.infer<typeof researchRunEventSchema>;
export type ResearchRun = z.infer<typeof researchRunSchema>;
export type ResearchPostMortem = z.infer<typeof researchPostMortemSchema>;
export type ModelUsage = z.infer<typeof modelUsageSchema>;
export type RunUsage = z.infer<typeof runUsageSchema>;
export type RunCost = z.infer<typeof runCostSchema>;
export type EvalScores = z.infer<typeof evalScoresSchema>;
export type EvalResultSummary = z.infer<typeof evalResultSummarySchema>;
export type EvalSuiteSummary = z.infer<typeof evalSuiteSummarySchema>;
export type EvalRunStatus = z.infer<typeof evalRunStatusSchema>;
export type EvalRun = z.infer<typeof evalRunSchema>;
export type EvalResult = z.infer<typeof evalResultSchema>;
export type EvalRunWithResults = z.infer<typeof evalRunWithResultsSchema>;
export type EvalHistoryResponse = z.infer<typeof evalHistoryResponseSchema>;
export type ResearchMemoryScope = z.infer<typeof researchMemoryScopeSchema>;
export type ResearchMemoryNamespace = z.infer<typeof researchMemoryNamespaceSchema>;
export type ResearchMemory = z.infer<typeof researchMemorySchema>;
export type UpsertResearchMemoryInput = z.infer<typeof upsertResearchMemorySchema>;
export type ResearchApproval = z.infer<typeof researchApprovalSchema>;
export type ResearchSession = z.infer<typeof researchSessionSchema>;
export type ResearchSessionDetail = z.infer<typeof researchSessionDetailSchema>;
export type ResearchPacket = z.infer<typeof researchPacketSchema>;
export type CreateResearchSessionInput = z.infer<typeof createResearchSessionSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
