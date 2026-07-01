import type { ResearchLearning, ResearchReport, ResearchSource } from '@/lib/schemas';

export function renderReportMarkdown(report: Omit<ResearchReport, 'markdown'>, sources: ResearchSource[], learnings: ResearchLearning[]) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const lines: string[] = [`# ${report.title}`, '', '## Executive Summary', report.executiveSummary, ''];

  for (const section of report.sections) {
    lines.push(`## ${section.heading}`, section.body, '');
    lines.push(
      `Sources: ${section.sourceIds
        .map((id) => {
          const source = sourceById.get(id);
          return source ? `[${source.title}](${source.url})` : id;
        })
        .join(', ')}`,
      '',
    );
  }

  if (learnings.length > 0) {
    lines.push('## Evidence Notes', '');
    for (const learning of learnings) {
      const source = sourceById.get(learning.sourceId);
      lines.push(`- ${learning.evidence} ${source ? `([source](${source.url}))` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Sources', '');
  for (const source of sources) {
    lines.push(`- [${source.title}](${source.url})`);
  }

  return lines.join('\n');
}
