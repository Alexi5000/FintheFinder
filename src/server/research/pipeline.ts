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
import { addEvent, getResearchArtifacts, replaceResearchArtifacts, saveReport, saveResearchAudit, saveRunCost, updateSessionState } from './repository';

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
};

type PipelineStageResult = {
  status: 'awaiting_approval' | 'completed';
};

type MeasuredModelCall = {
  call: ModelUsage;
  measured: boolean;
};

export async function runResearchSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const runId = options.run?.id;
  const correlationId = options.correlationId;
  const status = getProviderStatus();
  if (!status.openai || !status.exa) {
    await updateSessionState(sessionId, 'failed', 'failed');
    await addEvent(sessionId, 'failed', 'Provider configuration is incomplete.', status, { runId, correlationId, eventType: 'error', severity: 'error' });
    throw new Error('OpenAI and Exa keys are required to run research.');
  }

  await updateSessionState(sessionId, 'running', 'planning');
  await addEvent(sessionId, 'planning', 'Planning focused search queries.', {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'planner' });

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

  await updateSessionState(sessionId, 'running', 'searching');
  for (const searchQuery of plan.queries) {
    await addEvent(sessionId, 'searching', `Searching: ${searchQuery}`, {}, { runId, correlationId, eventType: 'tool_started', actor: 'tool', stepId: 'exa_search' });
    const results = await searchWeb(searchQuery, { numResults: 5 });
    for (const source of results) {
      if (seen.has(source.canonicalUrl)) continue;
      seen.add(source.canonicalUrl);
      sources.push(source);
    }
  }

  await updateSessionState(sessionId, 'running', 'evaluating');
  await addEvent(sessionId, 'evaluating', `Evaluating ${sources.length} sources.`, {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'source_evaluator' });
  const evaluatedSources = await evaluateSources(query, sources);
  const evaluations = evaluatedSources.evaluations;
  const relevantSources = sources.filter((source) => evaluations.some((evaluation) => evaluation.sourceId === source.id && evaluation.isRelevant));

  await updateSessionState(sessionId, 'running', 'extracting');
  await addEvent(sessionId, 'extracting', `Extracting learnings from ${relevantSources.length} relevant sources.`, {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'learning_extractor' });
  const extractedLearnings = await extractLearnings(query, relevantSources);
  const learnings = extractedLearnings.learnings;

  await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
  await addEvent(sessionId, 'reviewing', 'Building claim ledger and checking for gaps.', {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'claim_audit' });
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

  await replaceResearchArtifacts(sessionId, {
    sources: relevantSources,
    evaluations,
    learnings,
    claims,
    claimEvidence,
    claimGaps: allGaps,
    audits: [
      { runId, auditType: 'claim_gap', audit: { ...claimAudit, openGaps: allGaps, openCriticalGaps: allGaps.filter((gap) => gap.severity === 'critical') } satisfies ClaimAudit },
      { runId, auditType: 'contradiction', audit: contradictionReview },
    ],
  });

  const researchModelUsage = [plannerUsage, ...evaluatedSources.usage, ...extractedLearnings.usage, contradictionResult.usage];
  await recordRunCost(sessionId, runId, correlationId, 'reviewing', measurementMethodFor(researchModelUsage), {
    exaSearches: plan.queries.length,
    modelCalls: [
      ...researchModelUsage.map((usage) => usage.call),
    ],
  });

  await addEvent(
    sessionId,
    'reviewing',
    'Research artifacts are ready for human approval.',
    { openGaps: allGaps.length, supportedClaims: claims.length },
    { runId, correlationId, eventType: 'state_transition', actor: 'worker', stepId: 'awaiting_approval' },
  );

  return { status: 'awaiting_approval' };
}

export async function runApprovedReportSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const runId = options.run?.id;
  const correlationId = options.correlationId;
  const status = getProviderStatus();
  if (!status.openai) {
    await updateSessionState(sessionId, 'failed', 'failed');
    await addEvent(sessionId, 'failed', 'OpenAI configuration is incomplete.', status, { runId, correlationId, eventType: 'error', severity: 'error' });
    throw new Error('OpenAI key is required to generate reports.');
  }

  const artifacts = await getResearchArtifacts(sessionId);
  const unresolvedCriticalGaps = artifacts.gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
  if (unresolvedCriticalGaps.length > 0) {
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(
      sessionId,
      'reviewing',
      'Report generation blocked by unresolved critical claim gaps.',
      { openCriticalGapIds: unresolvedCriticalGaps.map((gap) => gap.id) },
      { runId, correlationId, eventType: 'claim_gap_opened', severity: 'warn', actor: 'worker', stepId: 'critical_gap_gate' },
    );
    return { status: 'awaiting_approval' };
  }

  await updateSessionState(sessionId, 'running', 'reporting');
  await addEvent(sessionId, 'reporting', 'Synthesizing cited report from approved research artifacts.', {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'report_writer' });

  const reportResult = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);
  const report = reportResult.report;
  const citationAudit = auditReportCitations(report, artifacts.sources);
  const citationAgentAuditResult = await auditCitationsWithAgent(report, artifacts.sources);
  const citationAgentAudit = citationAgentAuditResult.audit;

  if (!citationAudit.ok || !citationAgentAudit.ok) {
    const issues = [...citationAudit.issues, ...citationAgentAudit.issues];
    logger.warn({ issues, sessionId, runId }, 'citation audit blocked report readiness');
    await saveResearchAudit(sessionId, 'citation', { ok: false, issues }, runId);
    const modelUsage = [reportResult.usage, citationAgentAuditResult.usage];
    await recordRunCost(sessionId, runId, correlationId, 'reviewing', measurementMethodFor(modelUsage), {
      exaSearches: 0,
      modelCalls: modelUsage.map((usage) => usage.call),
    });
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Citation audit blocked report readiness.', { issues }, { runId, correlationId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await updateSessionState(sessionId, 'running', 'reviewing');
  const finalReviewResult = await reviewFinalReport(report);
  const finalReview = finalReviewResult.review;
  await saveResearchAudit(sessionId, 'final_review', { ok: finalReview.approved, issues: finalReview.issues }, runId);
  const reportingModelUsage = [reportResult.usage, citationAgentAuditResult.usage, finalReviewResult.usage];

  if (!finalReview.approved) {
    await recordRunCost(sessionId, runId, correlationId, 'reviewing', measurementMethodFor(reportingModelUsage), {
      exaSearches: 0,
      modelCalls: reportingModelUsage.map((usage) => usage.call),
    });
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Final reviewer requested human follow-up.', { issues: finalReview.issues }, { runId, correlationId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await recordRunCost(sessionId, runId, correlationId, 'complete', measurementMethodFor(reportingModelUsage), {
    exaSearches: 0,
    modelCalls: reportingModelUsage.map((usage) => usage.call),
  });
  await saveReport(report);
  await updateSessionState(sessionId, 'report_ready', 'complete');
  await addEvent(sessionId, 'complete', 'Report is ready.', { reportId: report.id }, { runId, correlationId, eventType: 'report_ready', actor: 'worker' });
  return { status: 'completed' };
}

export async function runLegacySynchronousResearchSession(sessionId: string, query: string) {
  await runResearchSession(sessionId, query);
  await updateSessionState(sessionId, 'running', 'reporting');
  await addEvent(sessionId, 'reporting', 'Synthesizing cited report.');
  const artifacts = await getResearchArtifacts(sessionId);
  const { report } = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);

  const citationAudit = auditReportCitations(report, artifacts.sources);
  if (!citationAudit.ok) {
    logger.warn({ citationAudit, sessionId }, 'citation audit issues found');
    await addEvent(sessionId, 'reviewing', 'Citation audit completed with issues.', { issues: citationAudit.issues });
  }

  await saveReport(report);
  await updateSessionState(sessionId, 'report_ready', 'complete');
  await addEvent(sessionId, 'complete', 'Report is ready.', { reportId: report.id });

  return { ...artifacts, report };
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
  runId: string | undefined,
  correlationId: string | undefined,
  phase: ResearchPhase,
  measurementMethod: 'estimated' | 'provider_usage',
  usage: RunUsage,
) {
  if (!runId) return null;

  const estimate = estimateRunCost(usage);
  const cost = await saveRunCost(runId, sessionId, usage, estimate, measurementMethod);
  await addEvent(
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
      runId,
      correlationId,
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
