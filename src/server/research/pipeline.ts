import { z } from 'zod';
import { mastra } from '@/mastra';
import { getProviderStatus } from '@/lib/config';
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
  type SourceEvaluation,
} from '@/lib/schemas';
import { nowIso, titleFromQuery } from '@/lib/utils';
import { logger } from '@/server/logger';
import { auditReportCitations } from './citation-auditor';
import { auditClaims, claimsFromLearnings, evidenceFromLearnings } from './claim-ledger';
import { renderReportMarkdown } from './report-format';
import { searchWeb } from './search-service';
import { addEvent, getResearchArtifacts, replaceResearchArtifacts, saveReport, saveResearchAudit, updateSessionState } from './repository';

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
};

type PipelineStageResult = {
  status: 'awaiting_approval' | 'completed';
};

export async function runResearchSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const runId = options.run?.id;
  const status = getProviderStatus();
  if (!status.openai || !status.exa) {
    await updateSessionState(sessionId, 'failed', 'failed');
    await addEvent(sessionId, 'failed', 'Provider configuration is incomplete.', status, { runId, eventType: 'error', severity: 'error' });
    throw new Error('OpenAI and Exa keys are required to run research.');
  }

  await updateSessionState(sessionId, 'running', 'planning');
  await addEvent(sessionId, 'planning', 'Planning focused search queries.', {}, { runId, eventType: 'agent_started', actor: 'agent', stepId: 'planner' });

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
    await addEvent(sessionId, 'searching', `Searching: ${searchQuery}`, {}, { runId, eventType: 'tool_started', actor: 'tool', stepId: 'exa_search' });
    const results = await searchWeb(searchQuery, { numResults: 5 });
    for (const source of results) {
      if (seen.has(source.canonicalUrl)) continue;
      seen.add(source.canonicalUrl);
      sources.push(source);
    }
  }

  await updateSessionState(sessionId, 'running', 'evaluating');
  await addEvent(sessionId, 'evaluating', `Evaluating ${sources.length} sources.`, {}, { runId, eventType: 'agent_started', actor: 'agent', stepId: 'source_evaluator' });
  const evaluations = await evaluateSources(query, sources);
  const relevantSources = sources.filter((source) => evaluations.some((evaluation) => evaluation.sourceId === source.id && evaluation.isRelevant));

  await updateSessionState(sessionId, 'running', 'extracting');
  await addEvent(sessionId, 'extracting', `Extracting learnings from ${relevantSources.length} relevant sources.`, {}, { runId, eventType: 'agent_started', actor: 'agent', stepId: 'learning_extractor' });
  const learnings = await extractLearnings(query, relevantSources);

  await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
  await addEvent(sessionId, 'reviewing', 'Building claim ledger and checking for gaps.', {}, { runId, eventType: 'agent_started', actor: 'agent', stepId: 'claim_audit' });
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

  await addEvent(
    sessionId,
    'reviewing',
    'Research artifacts are ready for human approval.',
    { openGaps: allGaps.length, supportedClaims: claims.length },
    { runId, eventType: 'state_transition', actor: 'worker', stepId: 'awaiting_approval' },
  );

  return { status: 'awaiting_approval' };
}

export async function runApprovedReportSession(sessionId: string, query: string, options: PipelineOptions = {}): Promise<PipelineStageResult> {
  const runId = options.run?.id;
  const status = getProviderStatus();
  if (!status.openai) {
    await updateSessionState(sessionId, 'failed', 'failed');
    await addEvent(sessionId, 'failed', 'OpenAI configuration is incomplete.', status, { runId, eventType: 'error', severity: 'error' });
    throw new Error('OpenAI key is required to generate reports.');
  }

  const artifacts = await getResearchArtifacts(sessionId);
  await updateSessionState(sessionId, 'running', 'reporting');
  await addEvent(sessionId, 'reporting', 'Synthesizing cited report from approved research artifacts.', {}, { runId, eventType: 'agent_started', actor: 'agent', stepId: 'report_writer' });

  const report = await generateReport(sessionId, query, artifacts.sources, artifacts.learnings);
  const citationAudit = auditReportCitations(report, artifacts.sources);
  const citationAgentAudit = await auditCitationsWithAgent(report, artifacts.sources);

  if (!citationAudit.ok || !citationAgentAudit.ok) {
    const issues = [...citationAudit.issues, ...citationAgentAudit.issues];
    logger.warn({ issues, sessionId, runId }, 'citation audit blocked report readiness');
    await saveResearchAudit(sessionId, 'citation', { ok: false, issues }, runId);
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Citation audit blocked report readiness.', { issues }, { runId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await updateSessionState(sessionId, 'running', 'reviewing');
  const finalReview = await reviewFinalReport(report);
  await saveResearchAudit(sessionId, 'final_review', { ok: finalReview.approved, issues: finalReview.issues }, runId);

  if (!finalReview.approved) {
    await updateSessionState(sessionId, 'awaiting_approval', 'reviewing');
    await addEvent(sessionId, 'reviewing', 'Final reviewer requested human follow-up.', { issues: finalReview.issues }, { runId, eventType: 'claim_gap_opened', severity: 'warn' });
    return { status: 'awaiting_approval' };
  }

  await saveReport(report);
  await updateSessionState(sessionId, 'report_ready', 'complete');
  await addEvent(sessionId, 'complete', 'Report is ready.', { reportId: report.id }, { runId, eventType: 'report_ready', actor: 'worker' });
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
