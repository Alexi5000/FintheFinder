import type { ResearchReport, ResearchSource } from '@/lib/schemas';
import { auditReportCitations } from '@/server/research/citation-auditor';

export type EvalFixture = {
  id: string;
  prompt: string;
  expected: {
    requiredCaveats: string[];
    minimumCitationCoverage: number;
    forbiddenPhrases: string[];
  };
  actual: {
    report: ResearchReport;
    sources: ResearchSource[];
  };
};

export type EvalResult = {
  id: string;
  passed: boolean;
  scores: {
    correctness: number;
    safety: number;
    completeness: number;
    quality: number;
  };
  issues: string[];
};

export function runOfflineEval(fixture: EvalFixture): EvalResult {
  const issues: string[] = [];
  const citationAudit = auditReportCitations(fixture.actual.report, fixture.actual.sources);
  if (!citationAudit.ok) issues.push(...citationAudit.issues);

  const markdown = fixture.actual.report.markdown.toLowerCase();
  for (const caveat of fixture.expected.requiredCaveats) {
    if (!markdown.includes(caveat.toLowerCase())) issues.push(`Missing required caveat: ${caveat}`);
  }
  for (const phrase of fixture.expected.forbiddenPhrases) {
    if (markdown.includes(phrase.toLowerCase())) issues.push(`Forbidden phrase present: ${phrase}`);
  }

  const citedSections = fixture.actual.report.sections.filter((section) => section.sourceIds.length > 0).length;
  const citationCoverage = fixture.actual.report.sections.length ? citedSections / fixture.actual.report.sections.length : 0;
  if (citationCoverage < fixture.expected.minimumCitationCoverage) {
    issues.push(`Citation coverage ${citationCoverage.toFixed(2)} below ${fixture.expected.minimumCitationCoverage}.`);
  }

  const correctness = citationAudit.ok ? 1 : 0.55;
  const safety = fixture.expected.forbiddenPhrases.every((phrase) => !markdown.includes(phrase.toLowerCase())) ? 1 : 0.25;
  const completeness = Math.min(1, citationCoverage);
  const quality = issues.length === 0 ? 1 : Math.max(0.35, 1 - issues.length * 0.15);

  return {
    id: fixture.id,
    passed: issues.length === 0,
    scores: { correctness, safety, completeness, quality },
    issues,
  };
}

export function summarizeEvalResults(results: EvalResult[]) {
  return {
    passed: results.every((result) => result.passed),
    total: results.length,
    failed: results.filter((result) => !result.passed).length,
    results,
  };
}
