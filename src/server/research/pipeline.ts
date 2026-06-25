import { z } from 'zod';
import { mastra } from '@/mastra';
import { env, getProviderStatus } from '@/lib/config';
import {
  claimAuditSchema,
  learningSchema,
  reportSchema,
  sourceEvaluationSchema,
  type ClaimAudit,
  type ResearchLearning,
  type ResearchReport,
  type ResearchRun,
  type ResearchSource,
  type ModelUsage,
  type RunUsage,
  type ResearchRunEvent,
  type SourceEvaluation,
  type ResearchPhase,
} from '@/lib/schemas';
import { nowIso, titleFromQuery } from '@/lib/utils';
import { logger } from '@/server/logger';
import { auditReportCitations } from './citation-auditor';
import { auditClaims, claimsFromLearnings, evidenceFromLearnings } from './claim-ledger';
import { estimateModelCall, estimateRunCost } from './cost-model';
import { renderReportMarkdown } from './report-format';
import { searchWeb } from './search-service';
import { addEvent, getResearchArtifacts, publishReport, replaceResearchArtifacts, saveResearchAudit, saveRunCost, updateSessionState } from './repository';

const planSchema = z.object({
  queries: z.array(z.string().min(3)).min(2).max(6),
  successCriteria: z.array(z.string()).min(1).max(8),
});

const reportDraftSchema = reportSchema.omit({ id: true, sessionId: true, markdown: true, createdAt: true });

const contradictionReviewSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()).default([]),
  criticalGaps: z.array(z.string()).default([]),
});

const citationAgentAuditSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()).default([]),
});

const finalReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

type PipelineOptions = {
  run?: ResearchRun;
  correlationId?: string;
  attemptId?: string;
  assertLease?: PipelinePersistenceGuard;
};

type PipelineStageResult = {
  status: 'awaiting_approval' | 'completed';
  runFinalized?: boolean;
};

export type PipelinePersistenceContext = {
  runId?: string;
  operation: string;
  phase: ResearchPhase;
  stepId: string;
};

export type PipelinePersistenceGuard = (context: PipelinePersistenceContext) => Promise<void>;

type MeasuredModelCall = {
  call: ModelUsage;
  measured: boolean;
};

type PipelineEventOptions = Partial<
  Pick<ResearchRunEvent, 'eventType' | 'severity' | 'actor' | 'stepId' | 'durationMs' | 'traceId' | 'correlationId'>
>;

function persistenceFor(options: PipelineOptions) {
  const mutate = async <T>(operation: string, phase: ResearchPhase, stepId: string, action: () => Promise<T>) => {
    await options.assertLease?.({ runId: options.run?.id, operation, phase, stepId });
    return action();
  };

  const event = (
    sessionId: string,
    phase: ResearchPhase,
    message: string,
    metadata: Record<string, unknown> = {},
    eventOptions: PipelineEventOptions = {},
  ) =>
    mutate('add_event', phase, eventOptions.stepId ?? eventOptions.eventType ?? 'event', () =>
      addEvent(sessionId, phase, message, metadata, {
        ...eventOptions,
        runId: options.run?.id,
        attemptId: options.attemptId,
        correlationId: eventOptions.correlationId ?? options.correlationId,
      }),
    );

  return { mutate, event };
}

function artifactReplacementFence(options: PipelineOptions) {
  if (!options.run?.id || !options.attemptId || !options.run.workerId) return undefined;
  return { runId: options.run.id, attemptId: options.attemptId, workerId: options.run.workerId };
}

function reportPublicationContext(options: PipelineOptions) {
  if (!options.run?.id && !options.attemptId && !options.correlationId) return undefined;
  return { runId: options.run?.id, attemptId: options.attemptId, workerId: options.run?.workerId ?? undefined, correlationId: options.correlationId };
}

export async function runResearchSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const persistence = persistenceFor(options);
  const status = getProviderStatus();
  if (!status.openai || !status.exa) {
    await persistence.mutate('update_session_state', 'failed', 'provider_config', () => updateSessionState(sessionId, 'failed', 'failed'));
    await persistence.event(sessionId, 'failed', 'Provider configuration is incomplete.', status, { eventType: 'error', severity: 'error', stepId: 'provider_config' });
    throw new Error('OpenAI and Exa keys are required to run research.');
  }

  await persistence.mutate('update_session_state', 'planning', 'planner', () => updateSessionState(sessionId, 'running', 'planning'));
  await persistence.event(sessionId, 'planning', 'Planning focused search queries.', {}, { eventType: 'agent_started', actor: 'agent', stepId: 'planner' });

  const planner = mastra.getAgent('plannerAgent');
  const planResponse = await planner.generate(
    [
      {
        role: 'user',
        content: `Create a research plan for: ${query}`,
      },
    ],
    { structuredOutput: { schema: planSchema } },
  );
  const plan = planSchema.parse(planResponse.object);
  const plannerUsage = modelUsageFromResponse(status.models.primary, planResponse, { task: 'planner', query }, plan);

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();

  await persistence.mutate('update_session_state', 'searching', 'exa_search', () => updateSessionState(sessionId, 'running', 'searching'));
  for (const searchQuery of plan.queries) {
    await persistence.event(sessionId, 'searching', `Searching: ${searchQuery}`, {}, { eventType: 'tool_started', actor: 'tool', stepId: 'exa_search' });
    const results = await searchWeb(searchQuery, { numResults: 5 });
    for (const source of results) {
      if (seen.has(source.canonicalUrl)) continue;
      seen.add(source.canonicalUrl);
      sources.push(source);
    }
  }

  await persistence.mutate('update_session_state', 'evaluating', 'source_evaluator', () => updateSessionState(sessionId, 'running', 'evaluating'));
  await persistence.event(sessionId, 'evaluating', `Evaluating ${sources.length} sources.`, {}, { eventType: 'agent_started', actor: 'agent', stepId: 'source_evaluator' });
  const evaluatedSources = await evaluateSources(query, sources);
  const evaluations = evaluatedSources.evaluations;
  const relevantSources = sources.filter((source) => evaluations.some((evaluation) => evaluation.sourceId === source.id && evaluation.isRelevant));

  await persistence.mutate('update_session_state', 'extracting', 'learning_extractor', () => updateSessionState(sessionId, 'running', 'extracting'));
  await persistence.event(sessionId, 'extracting', `Extracting learnings from ${relevantSources.length} relevant sources.`, {}, { eventType: 'agent_started', actor: 'agent', stepId: 'learning_extractor' });
  const extractedLearnings = await extractLearnings(query, relevantSources);
  const learnings = extractedLearnings.learnings;

  await persistence.mutate('update_session_state', 'reviewing', 'claim_audit', () => updateSessionState(sessionId, 'running', 'reviewing'));
  await persistence.event(sessionId, 'reviewing', 'Building claim ledger and checking for gaps.', {}, { eventType: 'agent_started', actor: 'agent', stepId: 'claim_audit' });
  const claims = claimsFromLearnings(sessionId, learnings, relevantSources);
  const claimEvidence = evidenceFromLearnings(sessionId, learnings, relevantSources);
  const claimAudit = auditClaims(sessionId, claims, plan.successCriteria);
  const contradictionResult = await reviewContradictions(query, learnings, claims);
  const contradictionReview = contradictionResult.review;
  const contradictionGaps = contradictionReview.criticalGaps.map((description) => ({
    id: `gap_${crypto.randomUUID()}`,
    sessionId,
    description,
    severity: 'critical' as const,
    status: 'open' as const,
    createdAt: nowIso(),
  }));
  const allGaps = [...claimAudit.openGaps, ...contradictionGaps];

  await persistence.mutate('replace_research_artifacts', 'reviewing', 'claim_audit', () => replaceResearchArtifacts(sessionId, {
    sources: relevantSources,
    evaluations,
    learnings,
    claims,
    claimEvidence,
    claimGaps: allGaps,
    audits: [
      { runId: options.run?.id, auditType: 'claim_gap', audit: { ...claimAudit, openGaps: allGaps, openCriticalGaps: allGaps.filter((gap) => gap.severity === 'critical') } satisfies ClaimAudit },
      { runId: options.run?.id, auditType: 'contradiction', audit: contradictionReview },
    ],
  }, artifactReplacementFence(options)));

  const researchModelUsage = [plannerUsage, ...evaluatedSources.usage, ...extractedLearnings.usage, contradictionResult.usage];
  await recordRunCost(sessionId, options, 'reviewing', measurementMethodFor(researchModelUsage), {
    exaSearches: plan.queries.length,
    modelCalls: [
      ...researchModelUsage.map((usage) => usage.call),
    ],
  });

  await persistence.mutate('update_session_state', 'reviewing', 'awaiting_approval', () => updateSessionState(sessionId, 'awaiting_approval', 'reviewing'));
  await persistence.event(
    sessionId,
    'reviewing',
    'Research artifacts are ready for human approval.',
    { openGaps: allGaps.length, supportedClaims: claims.length },
    { eventType: 'state_transition', actor: 'worker', stepId: 'awaiting_approval' },
  );

  return { status: 'awaiting_approval' };
}

export async function runApprovedReportSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const persistence = persistenceFor(options);
  const status = getProviderStatus();
  if (!status.openai) {
    await persistence.mutate('update_session_state', 'failed', 'provider_config', () => updateSessionState(sessionId, 'failed', 'failed'));
    await persistence.event(sessionId, 'failed', 'OpenAI configuration is incomplete.', status, { eventType: 'error', severity: 'error', stepId: 'provider_config' });
    throw new Error('OpenAI key is required to generate reports.');
  }

  const artifacts = await getResearchArtifacts(sessionId);
  const unresolvedCriticalGaps = artifacts.gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
  if (unresolvedCriticalGaps.length > 0) {
    await persistence.mutate('update_session_state', 'reviewing', 'critical_gap_gate', () => updateSessionState(sessionId, 'awaiting_approval', 'reviewing'));
    await persistence.event(
      sessionId,
      'reviewing',
      'Report generation blocked by unresolved critical claim gaps.',
      { openCriticalGapIds: unresolvedCriticalGaps.map((gap) => gap.id) },
      { eventType: 'claim_gap_opened', severity: 'warn', actor: 'worker', stepId: 'critical_gap_gate' },
    );
    return { status: 'awaiting_approval' };
  }

  await persistence.mutate('update_session_state', 'reporting', 'report_writer', () => updateSessionState(sessionId, 'running', 'reporting'));
  await persistence.event(sessionId, 'reporting', 'Synthesizing cited report from approved research artifacts.', {}, { eventType: 'agent_started', actor: 'agent', stepId: 'report_writer' });

  const reportResult = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);
  const report = reportResult.report;
  const citationAudit = auditReportCitations(report, artifacts.sources);
  const citationAgentAuditResult = await auditCitationsWithAgent(report, artifacts.sources);
  const citationAgentAudit = citationAgentAuditResult.audit;

  if (!citationAudit.ok || !citationAgentAudit.ok) {
    const issues = [...citationAudit.issues, ...citationAgentAudit.issues];
    logger.warn({ issues, sessionId, runId: options.run?.id }, 'citation audit blocked report readiness');
    await persistence.mutate('save_research_audit', 'reviewing', 'citation_auditor', () => saveResearchAudit(sessionId, 'citation', { ok: false, issues }, options.run?.id));
    const modelUsage = [reportResult.usage, citationAgentAuditResult.usage];
    await recordRunCost(sessionId, options, 'reviewing', measurementMethodFor(modelUsage), {
      exaSearches: 0,
      modelCalls: modelUsage.map((usage) => usage.call),
    });
    await persistence.mutate('update_session_state', 'reviewing', 'citation_auditor', () => updateSessionState(sessionId, 'awaiting_approval', 'reviewing'));
    await persistence.event(sessionId, 'reviewing', 'Citation audit blocked report readiness.', { issues }, { eventType: 'claim_gap_opened', severity: 'warn', stepId: 'citation_auditor' });
    return { status: 'awaiting_approval' };
  }

  await persistence.mutate('update_session_state', 'reviewing', 'final_reviewer', () => updateSessionState(sessionId, 'running', 'reviewing'));
  const finalReviewResult = await reviewFinalReport(report);
  const finalReview = finalReviewResult.review;
  const reportingModelUsage = [reportResult.usage, citationAgentAuditResult.usage, finalReviewResult.usage];

  if (!finalReview.approved) {
    await persistence.mutate('save_research_audit', 'reviewing', 'final_reviewer', () => saveResearchAudit(sessionId, 'final_review', { ok: false, issues: finalReview.issues }, options.run?.id));
    await recordRunCost(sessionId, options, 'reviewing', measurementMethodFor(reportingModelUsage), {
      exaSearches: 0,
      modelCalls: reportingModelUsage.map((usage) => usage.call),
    });
    await persistence.mutate('update_session_state', 'reviewing', 'final_reviewer', () => updateSessionState(sessionId, 'awaiting_approval', 'reviewing'));
    await persistence.event(sessionId, 'reviewing', 'Final reviewer requested human follow-up.', { issues: finalReview.issues }, { eventType: 'claim_gap_opened', severity: 'warn', stepId: 'final_reviewer' });
    return { status: 'awaiting_approval' };
  }

  await recordRunCost(sessionId, options, 'complete', measurementMethodFor(reportingModelUsage), {
    exaSearches: 0,
    modelCalls: reportingModelUsage.map((usage) => usage.call),
  });
  const publicationContext = reportPublicationContext(options);
  const publicationFenced = Boolean(publicationContext?.runId && publicationContext.attemptId && publicationContext.workerId);
  const publication = await persistence.mutate('publish_report', 'complete', 'report_ready', () =>
    publishReport(sessionId, report, { ok: true, issues: finalReview.issues }, publicationContext),
  );
  if (!publication.ok) {
    logger.warn(
      { sessionId, runId: options.run?.id, openCriticalGapIds: publication.openCriticalGapIds },
      'report publication returned to approval because critical gaps reopened',
    );
    return { status: 'awaiting_approval', runFinalized: publicationFenced };
  }
  return { status: 'completed', runFinalized: publicationFenced };
}

async function evaluateSources(query: string, sources: ResearchSource[]): Promise<{ evaluations: SourceEvaluation[]; usage: MeasuredModelCall[] }> {
  const agent = mastra.getAgent('evaluationAgent');
  const evaluations: SourceEvaluation[] = [];
  const usage: MeasuredModelCall[] = [];

  for (const source of sources) {
    const input = { task: 'source_evaluation', query, source: { id: source.id, title: source.title, url: source.url, content: source.content.slice(0, 3000) } };
    const response = await agent.generate(
      [
        {
          role: 'user',
          content: `Evaluate this source for the query "${query}".

Source ID: ${source.id}
Title: ${source.title}
URL: ${source.url}
Content: ${source.content.slice(0, 3000)}`,
        },
      ],
      { structuredOutput: { schema: sourceEvaluationSchema } },
    );
    const evaluation = sourceEvaluationSchema.parse(response.object);
    evaluations.push(evaluation);
    usage.push(modelUsageFromResponse(getProviderStatus().models.primary, response, input, evaluation));
  }

  return { evaluations, usage };
}

async function extractLearnings(query: string, sources: ResearchSource[]): Promise<{ learnings: ResearchLearning[]; usage: MeasuredModelCall[] }> {
  const agent = mastra.getAgent('learningExtractionAgent');
  const learnings: ResearchLearning[] = [];
  const usage: MeasuredModelCall[] = [];

  for (const source of sources) {
    const input = { task: 'learning_extraction', query, source: { id: source.id, title: source.title, url: source.url, content: source.content.slice(0, 6000) } };
    const response = await agent.generate(
      [
        {
          role: 'user',
          content: `Extract evidence-backed learnings for "${query}".

Source ID: ${source.id}
Title: ${source.title}
URL: ${source.url}
Content: ${source.content.slice(0, 6000)}`,
        },
      ],
      { structuredOutput: { schema: learningSchema } },
    );
    const learning = learningSchema.parse(response.object);
    learnings.push(learning);
    usage.push(modelUsageFromResponse(getProviderStatus().models.primary, response, input, learning));
  }

  return { learnings, usage };
}

async function generateReport(
  sessionId: string,
  query: string,
  sources: ResearchSource[],
  learnings: ResearchLearning[],
): Promise<{ report: ResearchReport; usage: MeasuredModelCall }> {
  const agent = mastra.getAgent('reportAgent');
  const input = { task: 'report_writer', query, sources, learnings };
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: `Write a production-quality cited research report.

Query: ${query}
Sources: ${JSON.stringify(sources.map(({ id, title, url, snippet, publishedAt }) => ({ id, title, url, snippet, publishedAt })))}
Learnings: ${JSON.stringify(learnings)}

Every section must cite source IDs from the supplied sources.`,
      },
    ],
    { structuredOutput: { schema: reportDraftSchema } },
  );

  const reportWithoutMarkdown = {
    ...response.object,
    id: crypto.randomUUID(),
    sessionId,
    createdAt: nowIso(),
  };

  return {
    report: {
      ...reportWithoutMarkdown,
      title: response.object.title || titleFromQuery(query),
      markdown: renderReportMarkdown(reportWithoutMarkdown, sources, learnings),
    },
    usage: modelUsageFromResponse(getProviderStatus().models.primary, response, input, reportWithoutMarkdown),
  };
}

async function reviewContradictions(query: string, learnings: ResearchLearning[], claims: unknown[]) {
  const agent = mastra.getAgent('contradictionAgent');
  const input = { task: 'contradiction_review', query, learnings, claims };
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: `Find contradictions, unsupported claims, stale evidence, and missing caveats.

Query: ${query}
Learnings: ${JSON.stringify(learnings)}
Claims: ${JSON.stringify(claims)}

Return ok=false if critical contradictions or gaps remain.`,
      },
    ],
    { structuredOutput: { schema: contradictionReviewSchema } },
  );

  const review = contradictionReviewSchema.parse(response.object);
  return {
    review,
    usage: modelUsageFromResponse(getProviderStatus().models.primary, response, input, review),
  };
}

async function auditCitationsWithAgent(report: ResearchReport, sources: ResearchSource[]) {
  const agent = mastra.getAgent('citationAuditorAgent');
  const input = { task: 'citation_auditor', report, sources };
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: `Audit this report for citation correctness. Every material section must cite supplied source IDs only.

Sources: ${JSON.stringify(sources.map(({ id, title, url }) => ({ id, title, url })))}
Report: ${JSON.stringify(report)}

Return ok=false if citations are missing, mismatched, or unsupported.`,
      },
    ],
    { structuredOutput: { schema: citationAgentAuditSchema } },
  );

  const audit = citationAgentAuditSchema.parse(response.object);
  return {
    audit,
    usage: modelUsageFromResponse(getProviderStatus().models.primary, response, input, audit),
  };
}

async function reviewFinalReport(report: ResearchReport) {
  const agent = mastra.getAgent('finalReviewerAgent');
  const input = { task: 'final_reviewer', report };
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: `Review this final research report for clarity, factual grounding, uncertainty labeling, citation coverage, and executive usefulness.

Report: ${JSON.stringify(report)}

Approve only if it is ready to publish.`,
      },
    ],
    { structuredOutput: { schema: finalReviewSchema } },
  );

  const review = finalReviewSchema.parse(response.object);
  return {
    review,
    usage: modelUsageFromResponse(getProviderStatus().models.primary, response, input, review),
  };
}

async function recordRunCost(
  sessionId: string,
  options: PipelineOptions,
  phase: ResearchPhase,
  measurementMethod: 'estimated' | 'provider_usage',
  usage: RunUsage,
) {
  const runId = options.run?.id;
  if (!runId) return null;

  const persistence = persistenceFor(options);
  const estimate = estimateRunCost(usage);
  const cost = await persistence.mutate('save_run_cost', phase, 'cost_estimator', () => saveRunCost(runId, sessionId, usage, estimate, measurementMethod));
  await persistence.event(
    sessionId,
    phase,
    measurementMethod === 'provider_usage' ? 'Run provider usage cost recorded.' : 'Run cost estimate recorded.',
    {
      usage,
      budgetUsd: env.RUN_BUDGET_USD,
      estimatedCostUsd: cost.totalUsd,
      measurementMethod: cost.measurementMethod,
      pricingEffectiveDate: cost.pricingEffectiveDate,
    },
    {
      eventType: 'tool_completed',
      severity: cost.totalUsd > env.RUN_BUDGET_USD ? 'warn' : 'info',
      actor: 'system',
      stepId: 'cost_estimator',
    },
  );
  return cost;
}

function measurementMethodFor(calls: MeasuredModelCall[]): 'estimated' | 'provider_usage' {
  return calls.length > 0 && calls.every((call) => call.measured) ? 'provider_usage' : 'estimated';
}

function modelUsageFromResponse(model: string, response: unknown, fallbackInput: unknown, fallbackOutput: unknown): MeasuredModelCall {
  const providerUsage = extractProviderUsage(response);
  if (providerUsage) {
    return {
      call: {
        model,
        inputTokens: providerUsage.inputTokens,
        outputTokens: providerUsage.outputTokens,
      },
      measured: true,
    };
  }

  return {
    call: estimateModelCall(model, fallbackInput, fallbackOutput),
    measured: false,
  };
}

function extractProviderUsage(response: unknown): { inputTokens: number; outputTokens: number } | null {
  const usage = (response as { usage?: unknown; totalUsage?: unknown } | null)?.usage ?? (response as { totalUsage?: unknown } | null)?.totalUsage;
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = numberField(usage, ['inputTokens', 'promptTokens']);
  const outputTokens = numberField(usage, ['outputTokens', 'completionTokens']);
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens };
}

function numberField(value: object, keys: string[]) {
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) return candidate;
  }
  return null;
}
