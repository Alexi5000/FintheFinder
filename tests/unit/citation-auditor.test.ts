import { describe, expect, it } from 'vitest';
import { auditReportCitations } from '@/server/research/citation-auditor';
import type { ResearchReport, ResearchSource } from '@/lib/schemas';

const source: ResearchSource = {
  id: 'src_1',
  title: 'Source',
  url: 'https://example.com/source',
  canonicalUrl: 'https://example.com/source',
  domain: 'example.com',
  snippet: '',
  content: '',
  publishedAt: null,
  score: 1,
  credibility: 'high',
  relevanceReason: 'fixture',
};

describe('citation auditor', () => {
  it('passes sections that cite known sources', () => {
    const report: ResearchReport = {
      id: 'report_1',
      sessionId: 'session_1',
      title: 'Report',
      executiveSummary: 'Summary',
      sections: [{ heading: 'Finding', body: 'Body', sourceIds: ['src_1'] }],
      citations: [{ sourceId: 'src_1', url: source.url, title: source.title }],
      markdown: '# Report',
      createdAt: new Date().toISOString(),
    };

    expect(auditReportCitations(report, [source]).ok).toBe(true);
  });

  it('flags unknown source IDs', () => {
    const report: ResearchReport = {
      id: 'report_1',
      sessionId: 'session_1',
      title: 'Report',
      executiveSummary: 'Summary',
      sections: [{ heading: 'Finding', body: 'Body', sourceIds: ['missing'] }],
      citations: [],
      markdown: '# Report',
      createdAt: new Date().toISOString(),
    };

    expect(auditReportCitations(report, [source]).issues).toContain('Section "Finding" references unknown source missing.');
  });
});
