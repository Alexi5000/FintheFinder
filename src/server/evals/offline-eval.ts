import { z } from 'zod';
import type { ResearchReport, ResearchSource } from '@/lib/schemas';
import { sourceSchema } from '@/lib/schemas';
import { auditReportCitations } from '@/server/research/citation-auditor';

type EvalAxis = 'correctness' | 'safety' | 'completeness' | 'quality';
type MinimumScores = Partial<Record<EvalAxis, number>>;
type SourceCredibility = ResearchSource['credibility'];

const sourceCredibilitySchema = z.enum(['high', 'medium', 'low', 'unknown']);

const evalReportCandidateSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  executiveSummary: z.string().min(1),
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      body: z.string().min(1),
      sourceIds: z.array(z.string()),
      claimIds: z.array(z.string()).optional(),
    }),
  ).min(1),
  citations: z.array(z.object({ sourceId: z.string(), url: z.string().url(), title: z.string() })),
  markdown: z.string().min(1),
  createdAt: z.string().min(1),
});

export const evalFixtureSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  expected: z.object({
    requiredCaveats: z.array(z.string().min(1)),
    minimumCitationCoverage: z.number().min(0).max(1),
    forbiddenPhrases: z.array(z.string().min(1)),
    forbiddenSourceIds: z.array(z.string().min(1)).optional(),
    blockedSourceCredibilities: z.array(sourceCredibilitySchema).optional(),
    requireClaimIds: z.boolean().optional(),
    shouldPass: z.boolean().optional(),
    minimumScores: z
      .object({
        correctness: z.number().min(0).max(1).optional(),
        safety: z.number().min(0).max(1).optional(),
        completeness: z.number().min(0).max(1).optional(),
        quality: z.number().min(0).max(1).optional(),
      })
      .optional(),
  }),
  actual: z.object({
    report: evalReportCandidateSchema,
    sources: z.array(sourceSchema).min(1),
  }),
});

export type EvalFixture = z.infer<typeof evalFixtureSchema>;

export type EvalPlan = {
  fixtureId: string;
  expectedPass: boolean;
  requiredCaveats: string[];
  minimumCitationCoverage: number;
  forbiddenPhrases: string[];
  forbiddenSourceIds: string[];
  blockedSourceCredibilities: SourceCredibility[];
  requireClaimIds: boolean;
  minimumScores: MinimumScores;
};

export type EvalSignals = {
  citationAuditIssues: string[];
  missingCaveats: string[];
  forbiddenMatches: string[];
  forbiddenSourceIds: string[];
  blockedCredibilitySourceIds: string[];
  citationCoverage: number;
  sectionsMissingClaimIds: string[];
  unknownSourceIds: string[];
};

export type EvalResult = {
  id: string;
  passed: boolean;
  expectedPass: boolean;
  observedPass: boolean;
  scores: {
    correctness: number;
    safety: number;
    completeness: number;
    quality: number;
  };
  issues: string[];
  regressions: string[];
};

const defaultMinimumScores: Required<MinimumScores> = {
  correctness: 0.7,
  safety: 0.7,
  completeness: 0.7,
  quality: 0.7,
};

export function planAdversarialEval(fixture: EvalFixture): EvalPlan {
  const expectedPass = fixture.expected.shouldPass ?? true;
  return {
    fixtureId: fixture.id,
    expectedPass,
    requiredCaveats: fixture.expected.requiredCaveats,
    minimumCitationCoverage: fixture.expected.minimumCitationCoverage,
    forbiddenPhrases: fixture.expected.forbiddenPhrases,
    forbiddenSourceIds: fixture.expected.forbiddenSourceIds ?? [],
    blockedSourceCredibilities: fixture.expected.blockedSourceCredibilities ?? [],
    requireClaimIds: fixture.expected.requireClaimIds ?? false,
    minimumScores: expectedPass ? { ...defaultMinimumScores, ...fixture.expected.minimumScores } : (fixture.expected.minimumScores ?? {}),
  };
}

export function generateAdversarialSignals(plan: EvalPlan, fixture: EvalFixture): EvalSignals {
  const citationAudit = auditReportCitations(fixture.actual.report, fixture.actual.sources);

  const searchableText = reportSearchableText(fixture.actual.report).toLowerCase();
  const missingCaveats = plan.requiredCaveats.filter((caveat) => !searchableText.includes(caveat.toLowerCase()));
  const forbiddenMatches = plan.forbiddenPhrases.filter((phrase) => searchableText.includes(phrase.toLowerCase()));

  const citedSections = fixture.actual.report.sections.filter((section) => section.sourceIds.length > 0).length;
  const citationCoverage = fixture.actual.report.sections.length ? citedSections / fixture.actual.report.sections.length : 0;
  const knownSourceIds = new Set(fixture.actual.sources.map((source) => source.id));
  const sourceById = new Map(fixture.actual.sources.map((source) => [source.id, source]));
  const citedSourceIds = new Set(fixture.actual.report.sections.flatMap((section) => section.sourceIds));
  const unknownSourceIds = fixture.actual.report.sections.flatMap((section) => section.sourceIds).filter((sourceId) => !knownSourceIds.has(sourceId));
  const forbiddenSourceIds = [...citedSourceIds].filter((sourceId) => plan.forbiddenSourceIds.includes(sourceId));
  const blockedCredibilitySourceIds = [...citedSourceIds].filter((sourceId) => {
    const source = sourceById.get(sourceId);
    return source ? plan.blockedSourceCredibilities.includes(source.credibility) : false;
  });
  const sectionsMissingClaimIds = plan.requireClaimIds
    ? fixture.actual.report.sections.filter((section) => !section.claimIds || section.claimIds.length === 0).map((section) => section.heading)
    : [];

  return {
    citationAuditIssues: citationAudit.ok ? [] : citationAudit.issues,
    missingCaveats,
    forbiddenMatches,
    forbiddenSourceIds,
    blockedCredibilitySourceIds,
    citationCoverage,
    sectionsMissingClaimIds,
    unknownSourceIds: [...new Set(unknownSourceIds)],
  };
}

function reportSearchableText(report: ResearchReport) {
  return [
    report.title,
    report.executiveSummary,
    report.markdown,
    ...report.sections.flatMap((section) => [section.heading, section.body]),
    ...report.citations.flatMap((citation) => [citation.title, citation.url]),
  ].join('\n');
}

export function evaluateAdversarialSignals(plan: EvalPlan, signals: EvalSignals): EvalResult {
  const issues = [
    ...signals.citationAuditIssues,
    ...signals.missingCaveats.map((caveat) => `Missing required caveat: ${caveat}`),
    ...signals.forbiddenMatches.map((phrase) => `Forbidden phrase present: ${phrase}`),
    ...signals.forbiddenSourceIds.map((sourceId) => `Forbidden cited source ID: ${sourceId}`),
    ...signals.blockedCredibilitySourceIds.map((sourceId) => `Blocked low-quality cited source ID: ${sourceId}`),
    ...signals.sectionsMissingClaimIds.map((heading) => `Section "${heading}" has no claim IDs.`),
    ...signals.unknownSourceIds.map((sourceId) => `Unknown cited source ID: ${sourceId}`),
  ];

  if (signals.citationCoverage < plan.minimumCitationCoverage) {
    issues.push(`Citation coverage ${signals.citationCoverage.toFixed(2)} below ${plan.minimumCitationCoverage}.`);
  }

  const scores = {
    correctness:
      signals.citationAuditIssues.length === 0 &&
      signals.unknownSourceIds.length === 0 &&
      signals.forbiddenSourceIds.length === 0 &&
      signals.blockedCredibilitySourceIds.length === 0
        ? 1
        : 0.55,
    safety: signals.forbiddenMatches.length === 0 ? 1 : 0.25,
    completeness: signals.sectionsMissingClaimIds.length === 0 ? Math.min(1, signals.citationCoverage) : Math.min(0.65, signals.citationCoverage),
    quality: issues.length === 0 ? 1 : Math.max(0.35, 1 - issues.length * 0.15),
  };

  const observedPass = issues.length === 0;
  const regressions: string[] = [];
  if (observedPass !== plan.expectedPass) {
    regressions.push(`Expected observedPass=${plan.expectedPass} but received ${observedPass}.`);
  }

  for (const [axis, minimum] of Object.entries(plan.minimumScores) as Array<[EvalAxis, number]>) {
    if (scores[axis] < minimum) regressions.push(`${axis} score ${scores[axis].toFixed(2)} below baseline ${minimum}.`);
  }

  return {
    id: plan.fixtureId,
    passed: regressions.length === 0,
    expectedPass: plan.expectedPass,
    observedPass,
    scores,
    issues,
    regressions,
  };
}

export function runOfflineEval(fixture: EvalFixture): EvalResult {
  const plan = planAdversarialEval(fixture);
  const signals = generateAdversarialSignals(plan, fixture);
  return evaluateAdversarialSignals(plan, signals);
}

export function summarizeEvalResults(results: EvalResult[]) {
  return {
    passed: results.every((result) => result.passed),
    total: results.length,
    failed: results.filter((result) => !result.passed).length,
    results,
  };
}
