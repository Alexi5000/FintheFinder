import { z } from 'zod';
import { mastra } from '@/mastra';
import { getProviderStatus } from '@/lib/config';
import {
  learningSchema,
  reportSchema,
  sourceEvaluationSchema,
  type ResearchLearning,
  type ResearchReport,
  type ResearchSource,
  type SourceEvaluation,
} from '@/lib/schemas';
import { nowIso, titleFromQuery } from '@/lib/utils';
import { logger } from '@/server/logger';
import { auditReportCitations } from './citation-auditor';
import { renderReportMarkdown } from './report-format';
import { searchWeb } from './search-service';
import { addEvent, replaceResearchArtifacts, updateSessionState } from './repository';

const planSchema = z.object({
  queries: z.array(z.string().min(3)).min(2).max(6),
  successCriteria: z.array(z.string()).min(1).max(8),
});

const reportDraftSchema = reportSchema.omit({ id: true, sessionId: true, markdown: true, createdAt: true });

export async function runResearchSession(sessionId: string, query: string) {
  const status = getProviderStatus();
  if (!status.openai || !status.exa) {
    await updateSessionState(sessionId, 'failed', 'failed');
    await addEvent(sessionId, 'failed', 'Provider configuration is incomplete.', status);
    throw new Error('OpenAI and Exa keys are required to run research.');
  }

  await updateSessionState(sessionId, 'running', 'planning');
  await addEvent(sessionId, 'planning', 'Planning focused search queries.');

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
    await addEvent(sessionId, 'searching', `Searching: ${searchQuery}`);
    const results = await searchWeb(searchQuery, { numResults: 5 });
    for (const source of results) {
      if (seen.has(source.canonicalUrl)) continue;
      seen.add(source.canonicalUrl);
      sources.push(source);
    }
  }

  await updateSessionState(sessionId, 'running', 'evaluating');
  await addEvent(sessionId, 'evaluating', `Evaluating ${sources.length} sources.`);
  const evaluations = await evaluateSources(query, sources);
  const relevantSources = sources.filter((source) => evaluations.some((evaluation) => evaluation.sourceId === source.id && evaluation.isRelevant));

  await updateSessionState(sessionId, 'running', 'extracting');
  await addEvent(sessionId, 'extracting', `Extracting learnings from ${relevantSources.length} relevant sources.`);
  const learnings = await extractLearnings(query, relevantSources);

  await updateSessionState(sessionId, 'running', 'reporting');
  await addEvent(sessionId, 'reporting', 'Synthesizing cited report.');
  const report = await generateReport(sessionId, query, relevantSources, learnings);

  const citationAudit = auditReportCitations(report, relevantSources);
  if (!citationAudit.ok) {
    logger.warn({ citationAudit, sessionId }, 'citation audit issues found');
    await addEvent(sessionId, 'reviewing', 'Citation audit completed with issues.', { issues: citationAudit.issues });
  }

  await replaceResearchArtifacts(sessionId, { sources: relevantSources, evaluations, learnings, report });
  await updateSessionState(sessionId, 'report_ready', 'complete');
  await addEvent(sessionId, 'complete', 'Report is ready.', { reportId: report.id });

  return { sources: relevantSources, evaluations, learnings, report };
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
