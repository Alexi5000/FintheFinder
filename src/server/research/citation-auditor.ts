import type { ResearchReport, ResearchSource } from '@/lib/schemas';

export function auditReportCitations(report: ResearchReport, sources: ResearchSource[]) {
  const sourceIds = new Set(sources.map((source) => source.id));
  const issues: string[] = [];

  for (const section of report.sections) {
    if (section.sourceIds.length === 0) {
      issues.push(`Section "${section.heading}" has no citations.`);
    }

    for (const sourceId of section.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        issues.push(`Section "${section.heading}" references unknown source ${sourceId}.`);
      }
    }
  }

  for (const citation of report.citations) {
    if (!sourceIds.has(citation.sourceId)) {
      issues.push(`Citation references unknown source ${citation.sourceId}.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
