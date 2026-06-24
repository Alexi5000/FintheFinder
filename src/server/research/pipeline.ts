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
  const plan = await planner.generate(
    [
      {
        role: 'user',
        content: `Create a research plan for: ${query}`,
      },
    ],
    { structuredOutput: { schema: planSchema } },
  );

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();

  await updateSessionState(sessionId, 'running', 'searching');
  for (const searchQuery of plan.object.queries) {
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
  const evaluations = await evaluateSources(query, sources);
  const relevantSources = sources.filter((source) => evaluations.some((evaluation) => evaluation.sourceId === source.id && evaluation.isRelevant));

  await updateSessionState(sessionId, 'running', 'extracting');
  await addEvent(sessionId, 'extracting', `Extracting learnings from ${relevantSources.length} relevant sources.`, {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'learning_extractor' });
  const learnings = await extractLearnings(query, relevantSources);

  await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
  await addEvent(sessionId, 'reviewing', 'Building claim ledger and checking for gaps.', {}, { runId, correlationId, eventType: 'agent_started', actor: 'agent', stepId: 'claim_audit' });
  const claims = claimsFromLearnings(sessionId, learnings, relevantSources);
  const claimEvidence = evidenceFromLearnings(sessionId, learnings, relevantSources);
  const claimAudit = auditClaims(sessionId, claims, plan.object.successCriteria);
  const contradictionReview = await reviewContradictions(query, learnings, claims);
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

  await recordEstimatedRunCost(sessionId, runId, correlationId, 'reviewing', {
    exaSearches: plan.object.queries.length,
    modelCalls: [
      estimateModelCall(status.models.primary, { task: 'planner', query }, plan.object),
      ...sources.map((source) =>
        estimateModelCall(
          status.models.primary,
          { task: 'source_evaluation', query, source: { id: source.id, title: source.title, url: source.url, content: source.content.slice(0, 3000) } },
          evaluations.find((evaluation) => evaluation.sourceId === source.id) ?? {},
        ),
      ),
      ...relevantSources.map((source) =>
        estimateModelCall(
          status.models.primary,
          { task: 'learning_extraction', query, source: { id: source.id, title: source.title, url: source.url, content: source.content.slice(0, 6000) } },
          learnings.filter((learning) => learning.sourceId === source.id),
        ),
      ),
      estimateModelCall(status.models.primary, { task: 'contradiction_review', query, learnings, claims }, contradictionReview),
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

  const report = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);
  const citationAudit = auditReportCitations(report, artifacts.sources);
  const citationAgentAudit = await auditCitationsWithAgent(report, artifacts.sources);
  const reportCall = estimateModelCall(status.models.primary, { task: 'report_writer', query, sources: artifacts.sources, learnings: artifacts.learnings }, report);
  const citationAuditCall = estimateModelCall(status.models.primary, { task: 'citation_auditor', report, sources: artifacts.sources }, citationAgentAudit);

  if (!citationAudit.ok || !citationAgentAudit.ok) {
    const issues = [...citationAudit.issues, ...citationAgentAudit.issues];
    logger.warn({ issues, sessionId, runId }, 'citation audit blocked report readiness');
    await saveResearchAudit(sessionId, 'citation', { ok: false, issues }, runId);
    await recordEstimatedRunCost(sessionId, runId, correlationId, 'reviewing', { exaSearches: 0, modelCalls: [reportCall, citationAuditCall] });
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Citation audit blocked report readiness.', { issues }, { runId, correlationId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await updateSessionState(sessionId, 'running', 'reviewing');
  const finalReview = await reviewFinalReport(report);
  const finalReviewCall = estimateModelCall(status.models.primary, { task: 'final_reviewer', report }, finalReview);
  await saveResearchAudit(sessionId, 'final_review', { ok: finalReview.approved, issues: finalReview.issues }, runId);

  if (!finalReview.approved) {
    await recordEstimatedRunCost(sessionId, runId, correlationId, 'reviewing', { exaSearches: 0, modelCalls: [reportCall, citationAuditCall, finalReviewCall] });
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Final reviewer requested human follow-up.', { issues: finalReview.issues }, { runId, correlationId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await recordEstimatedRunCost(sessionId, runId, correlationId, 'complete', { exaSearches: 0, modelCalls: [reportCall, citationAuditCall, finalReviewCall] });
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
  const report = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);

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

async function evaluateSources(query: string, sources: ResearchSource[]): Promise<SourceEvaluation[]> {
  const agent = mastra.getAgent('evaluationAgent');
  const evaluations: SourceEvaluation[] = [];

  for (const source of sources) {
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
    evaluations.push(sourceEvaluationSchema.parse(response.object));
  }

  return evaluations;
}

async function extractLearnings(query: string, sources: ResearchSource[]): Promise<ResearchLearning[]> {
  const agent = mastra.getAgent('learningExtractionAgent');
  const learnings: ResearchLearning[] = [];

  for (const source of sources) {
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
    learnings.push(learningSchema.parse(response.object));
  }

  return learnings;
}

async function generateReport(sessionId: string, query: string, sources: ResearchSource[], learnings: ResearchLearning[]): Promise<ResearchReport> {
  const agent = mastra.getAgent('reportAgent');
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
    ...reportWithoutMarkdown,
    title: response.object.title || titleFromQuery(query),
    markdown: renderReportMarkdown(reportWithoutMarkdown, sources, learnings),
  };
}

async function reviewContradictions(query: string, learnings: ResearchLearning[], claims: unknown[]) {
  const agent = mastra.getAgent('contradictionAgent');
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

  return contradictionReviewSchema.parse(response.object);
}

async function auditCitationsWithAgent(report: ResearchReport, sources: ResearchSource[]) {
  const agent = mastra.getAgent('citationAuditorAgent');
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

  return citationAgentAuditSchema.parse(response.object);
}

async function reviewFinalReport(report: ResearchReport) {
  const agent = mastra.getAgent('finalReviewerAgent');
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

  return finalReviewSchema.parse(response.object);
}

async function recordEstimatedRunCost(sessionId: string, runId: string | undefined, correlationId: string | undefined, phase: ResearchPhase, usage: RunUsage) {
  if (!runId) return null;

  const estimate = estimateRunCost(usage);
  const cost = await saveRunCost(runId, sessionId, usage, estimate, 'estimated');
  await addEvent(
    sessionId,
    phase,
    'Run cost estimate recorded.',
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
