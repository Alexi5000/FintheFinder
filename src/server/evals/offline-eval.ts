import type { ResearchReport, ResearchSource } from '@/lib/schemas';
import { auditReportCitations } from '@/server/research/citation-auditor';

type EvalAxis = 'correctness' | 'safety' | 'completeness' | 'quality';
type MinimumScores = Partial<Record<EvalAxis, number>>;

export type EvalFixture = {
  id: string;
  prompt: string;
  expected: {
    requiredCaveats: string[];
    minimumCitationCoverage: number;
    forbiddenPhrases: string[];
    shouldPass?: boolean;
    minimumScores?: MinimumScores;
  };
  actual: {
    report: ResearchReport;
    sources: ResearchSource[];
  };
};

export type EvalPlan = {
  fixtureId: string;
  expectedPass: boolean;
  requiredCaveats: string[];
  minimumCitationCoverage: number;
  forbiddenPhrases: string[];
  minimumScores: MinimumScores;
};

export type EvalSignals = {
  citationAuditIssues: string[];
  missingCaveats: string[];
  forbiddenMatches: string[];
  citationCoverage: number;
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
    minimumScores: expectedPass ? { ...defaultMinimumScores, ...fixture.expected.minimumScores } : (fixture.expected.minimumScores ?? {}),
  };
}

export function generateAdversarialSignals(plan: EvalPlan, fixture: EvalFixture): EvalSignals {
  const citationAudit = auditReportCitations(fixture.actual.report, fixture.actual.sources);

  const markdown = fixture.actual.report.markdown.toLowerCase();
  const missingCaveats = plan.requiredCaveats.filter((caveat) => !markdown.includes(caveat.toLowerCase()));
  const forbiddenMatches = plan.forbiddenPhrases.filter((phrase) => markdown.includes(phrase.toLowerCase()));

  const citedSections = fixture.actual.report.sections.filter((section) => section.sourceIds.length > 0).length;
  const citationCoverage = fixture.actual.report.sections.length ? citedSections / fixture.actual.report.sections.length : 0;
  const knownSourceIds = new Set(fixture.actual.sources.map((source) => source.id));
  const unknownSourceIds = fixture.actual.report.sections.flatMap((section) => section.sourceIds).filter((sourceId) => !knownSourceIds.has(sourceId));

  return {
    citationAuditIssues: citationAudit.ok ? [] : citationAudit.issues,
    missingCaveats,
    forbiddenMatches,
    citationCoverage,
    unknownSourceIds: [...new Set(unknownSourceIds)],
  };
}

export function evaluateAdversarialSignals(plan: EvalPlan, signals: EvalSignals): EvalResult {
  const issues = [
    ...signals.citationAuditIssues,
    ...signals.missingCaveats.map((caveat) => `Missing required caveat: ${caveat}`),
    ...signals.forbiddenMatches.map((phrase) => `Forbidden phrase present: ${phrase}`),
    ...signals.unknownSourceIds.map((sourceId) => `Unknown cited source ID: ${sourceId}`),
  ];

  if (signals.citationCoverage < plan.minimumCitationCoverage) {
    issues.push(`Citation coverage ${signals.citationCoverage.toFixed(2)} below ${plan.minimumCitationCoverage}.`);
  }

  const scores = {
    correctness: signals.citationAuditIssues.length === 0 && signals.unknownSourceIds.length === 0 ? 1 : 0.55,
    safety: signals.forbiddenMatches.length === 0 ? 1 : 0.25,
    completeness: Math.min(1, signals.citationCoverage),
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
