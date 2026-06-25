import { describe, expect, it } from 'vitest';
import {
  buildLiveProofArtifacts,
  buildLiveProofCost,
  validateLiveProofManifestEvidence,
  type LiveProofEvidence,
  type LiveDemoManifest,
} from '@/server/demo/live-proof';

const sessionId = '123e4567-e89b-12d3-a456-426614174100';
const researchRunId = '123e4567-e89b-12d3-a456-426614174200';
const reportingRunId = '123e4567-e89b-12d3-a456-426614174300';
const approvalId = '123e4567-e89b-12d3-a456-426614174400';
const researchTraceId = '123e4567e89b12d3a456426614174200';
const reportingTraceId = '123e4567e89b12d3a456426614174300';

describe('live proof provenance', () => {
  it('builds manifest, run export, and eval artifacts from Supabase-shaped evidence', () => {
    const artifacts = buildLiveProofArtifacts(evidence(), {
      benchmarkDoc: 'docs/BENCHMARK.md',
      date: '2026-06-24',
      evalOutput: 'docs/demo/artifacts/eval-summary.json',
      exportedAt: '2026-06-24T00:00:00.000Z',
      manifestPath: 'docs/demo/live-demo.json',
      reportExport: 'docs/demo/artifacts/report.md',
      runExport: 'docs/demo/artifacts/run-export.json',
      screenshotsOrVideo: ['docs/demo/artifacts/session.png'],
      supabaseUrl: 'https://example.supabase.co',
    });

    expect(artifacts.manifest).toEqual(
      expect.objectContaining({
        sessionId,
        researchRunId,
        reportingRunId,
        researchTraceId,
        reportingTraceId,
        approvalId,
        runId: reportingRunId,
        traceId: reportingTraceId,
      }),
    );
    expect(artifacts.runExport.cost).toEqual(buildLiveProofCost(evidence()));
    expect(artifacts.evalOutput).toEqual(expect.objectContaining({ passed: true, mode: 'live', status: 'ok', runId: reportingRunId, scenarioCount: 3 }));
    expect(artifacts.evalOutput.scenarios.map((scenario) => scenario.id)).toEqual(['live-citation-integrity', 'live-claim-traceability', 'live-safety-language']);
    expect(validateLiveProofManifestEvidence(artifacts.manifest, evidence(), { evalOutput: artifacts.evalOutput, reportMarkdown: artifacts.reportMarkdown, runExport: artifacts.runExport })).toEqual([]);
  });

  it('rejects manifest values that do not match Supabase evidence', () => {
    const artifacts = buildLiveProofArtifacts(evidence(), {
      benchmarkDoc: 'docs/BENCHMARK.md',
      evalOutput: 'docs/demo/artifacts/eval-summary.json',
      manifestPath: 'docs/demo/live-demo.json',
      reportExport: 'docs/demo/artifacts/report.md',
      runExport: 'docs/demo/artifacts/run-export.json',
      screenshotsOrVideo: ['docs/demo/artifacts/session.png'],
    });
    const tampered: LiveDemoManifest = {
      ...artifacts.manifest,
      prompt: 'A locally falsified prompt that does not match Supabase.',
      date: '2026-06-23',
      reportingRunId: '123e4567-e89b-12d3-a456-426614174999',
      cost: { ...artifacts.manifest.cost, totalUsd: 99 },
    };

    expect(validateLiveProofManifestEvidence(tampered, evidence())).toEqual(
      expect.arrayContaining(['prompt must match Supabase evidence.', 'date must match Supabase evidence.', 'reportingRunId must match Supabase evidence.', 'manifest cost must match Supabase evidence.']),
    );
  });

  it('rejects open critical gaps in live proof evidence', () => {
    const liveEvidence = evidence();
    liveEvidence.claimGaps = [{ id: 'gap_critical', severity: 'critical', status: 'open' }];
    const artifacts = buildLiveProofArtifacts(liveEvidence, {
      benchmarkDoc: 'docs/BENCHMARK.md',
      evalOutput: 'docs/demo/artifacts/eval-summary.json',
      manifestPath: 'docs/demo/live-demo.json',
      reportExport: 'docs/demo/artifacts/report.md',
      runExport: 'docs/demo/artifacts/run-export.json',
      screenshotsOrVideo: ['docs/demo/artifacts/session.png'],
    });

    expect(artifacts.evalOutput.passed).toBe(false);
    expect(validateLiveProofManifestEvidence(artifacts.manifest, liveEvidence)).toContain('Supabase session still has open critical claim gaps.');
  });

  it('rejects evidence that is not durably bound to the reporting run', () => {
    const liveEvidence = evidence();
    liveEvidence.reportingRun.metadata = { stage: 'reporting' };
    liveEvidence.finalAudit.runId = researchRunId;
    liveEvidence.events = liveEvidence.events.filter((event) => event.eventType !== 'report_ready');
    const artifacts = buildLiveProofArtifacts(liveEvidence, {
      benchmarkDoc: 'docs/BENCHMARK.md',
      evalOutput: 'docs/demo/artifacts/eval-summary.json',
      manifestPath: 'docs/demo/live-demo.json',
      reportExport: 'docs/demo/artifacts/report.md',
      runExport: 'docs/demo/artifacts/run-export.json',
      screenshotsOrVideo: ['docs/demo/artifacts/session.png'],
    });

    expect(validateLiveProofManifestEvidence(artifacts.manifest, liveEvidence)).toEqual(
      expect.arrayContaining([
        'Supabase reporting run metadata.approvalId must match approval.',
        'Supabase reporting run metadata.sourceResearchRunId must match research run.',
        'Supabase final review audit must be approved and bound to the reporting run.',
        'Supabase report_ready event must be bound to the reporting run.',
      ]),
    );
  });

  it('refuses to export secret-like content into demo artifacts', () => {
    const liveEvidence = evidence();
    liveEvidence.session.query = 'Research this leaked token sk-abcdefghijklmnopqrstuvwxyz123456';

    expect(() =>
      buildLiveProofArtifacts(liveEvidence, {
        benchmarkDoc: 'docs/BENCHMARK.md',
        evalOutput: 'docs/demo/artifacts/eval-summary.json',
        manifestPath: 'docs/demo/live-demo.json',
        reportExport: 'docs/demo/artifacts/report.md',
        runExport: 'docs/demo/artifacts/run-export.json',
        screenshotsOrVideo: ['docs/demo/artifacts/session.png'],
      }),
    ).toThrow('Live proof artifacts contain disallowed secret-like content');
  });
});

function evidence(): LiveProofEvidence {
  return {
    session: {
      id: sessionId,
      userId: 'user_1',
      query: 'Research practical uses of AI agents in compliance-heavy financial services.',
      title: 'AI Agents In Compliance',
      status: 'report_ready',
      phase: 'complete',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:10:00.000Z',
    },
    researchRun: {
      id: researchRunId,
      sessionId,
      status: 'awaiting_approval',
      attempt: 1,
      currentAttemptId: '123e4567-e89b-12d3-a456-426614174201',
      metadata: { stage: 'research' },
      workerId: 'worker_live',
      leaseExpiresAt: null,
      startedAt: '2026-06-24T00:01:00.000Z',
      completedAt: '2026-06-24T00:05:00.000Z',
      error: null,
      createdAt: '2026-06-24T00:00:30.000Z',
      updatedAt: '2026-06-24T00:05:00.000Z',
    },
    reportingRun: {
      id: reportingRunId,
      sessionId,
      status: 'completed',
      attempt: 1,
      currentAttemptId: '123e4567-e89b-12d3-a456-426614174301',
      metadata: { stage: 'reporting', approvalId, sourceResearchRunId: researchRunId },
      workerId: 'worker_live',
      leaseExpiresAt: null,
      startedAt: '2026-06-24T00:06:00.000Z',
      completedAt: '2026-06-24T00:09:00.000Z',
      error: null,
      createdAt: '2026-06-24T00:05:30.000Z',
      updatedAt: '2026-06-24T00:09:00.000Z',
    },
    approval: {
      id: approvalId,
      sessionId,
      userId: 'user_1',
      action: 'approve',
      notes: 'Approved for live proof.',
      approvedSourceIds: ['src_regulator'],
      waivedGapIds: [],
      createdAt: '2026-06-24T00:05:15.000Z',
    },
    finalAudit: {
      id: 'audit_final',
      sessionId,
      runId: reportingRunId,
      auditType: 'final_review',
      ok: true,
      issues: [],
      createdAt: '2026-06-24T00:08:59.000Z',
    },
    report: {
      id: 'report_1',
      sessionId,
      title: 'AI Agents In Compliance',
      executiveSummary: 'AI agents can assist compliance work with human oversight.',
      sections: [{ heading: 'Use Case', body: 'Evidence preparation with human oversight.', sourceIds: ['src_regulator'], claimIds: ['claim_1'] }],
      citations: [{ sourceId: 'src_regulator', title: 'Regulator guidance', url: 'https://example.com/regulator' }],
      markdown: '# AI Agents In Compliance\n\n## Sources\n- [Regulator guidance](https://example.com/regulator)\n',
      createdAt: '2026-06-24T00:09:00.000Z',
    },
    sources: [
      {
        id: 'src_regulator',
        title: 'Regulator guidance',
        url: 'https://example.com/regulator',
        canonicalUrl: 'https://example.com/regulator',
        domain: 'example.com',
        snippet: 'Human oversight matters.',
        content: 'Human oversight matters.',
        publishedAt: '2026-01-01',
        score: 0.9,
        credibility: 'high',
        relevanceReason: 'Primary source.',
      },
    ],
    events: [
      { id: 'event_research', sessionId, runId: researchRunId, phase: 'planning', traceId: researchTraceId, message: 'Research started.', metadata: {}, createdAt: '2026-06-24T00:01:00.000Z' },
      { id: 'event_reporting', sessionId, runId: reportingRunId, phase: 'reporting', traceId: reportingTraceId, message: 'Reporting started.', metadata: {}, createdAt: '2026-06-24T00:06:00.000Z' },
      {
        id: 'event_ready',
        sessionId,
        runId: reportingRunId,
        phase: 'complete',
        traceId: reportingTraceId,
        eventType: 'report_ready',
        stepId: 'report_ready',
        message: 'Report ready.',
        metadata: { reportId: 'report_1' },
        createdAt: '2026-06-24T00:09:00.000Z',
      },
    ],
    costs: {
      research: {
        id: 'cost_research',
        runId: researchRunId,
        sessionId,
        usage: { exaSearches: 3, modelCalls: [{ model: 'gpt-5.5', inputTokens: 400, outputTokens: 200 }] },
        modelCostUsd: 0.01,
        searchCostUsd: 0.015,
        totalUsd: 0.25,
        pricingEffectiveDate: '2026-06-24',
        measurementMethod: 'provider_usage',
        createdAt: '2026-06-24T00:05:00.000Z',
      },
      reporting: {
        id: 'cost_reporting',
        runId: reportingRunId,
        sessionId,
        usage: { exaSearches: 0, modelCalls: [{ model: 'gpt-5.5', inputTokens: 250, outputTokens: 150 }] },
        modelCostUsd: 0.01,
        searchCostUsd: 0,
        totalUsd: 0.17,
        pricingEffectiveDate: '2026-06-24',
        measurementMethod: 'provider_usage',
        createdAt: '2026-06-24T00:09:00.000Z',
      },
    },
    claimGaps: [],
  };
}
