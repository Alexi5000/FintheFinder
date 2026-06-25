import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDemoExport } from '../../scripts/demo-export';
import type { LiveProofEvidence } from '@/server/demo/live-proof';

const workspace = process.cwd();
const sessionId = '123e4567-e89b-12d3-a456-426614174100';
const researchRunId = '123e4567-e89b-12d3-a456-426614174200';
const reportingRunId = '123e4567-e89b-12d3-a456-426614174300';
const approvalId = '123e4567-e89b-12d3-a456-426614174400';
const researchTraceId = '123e4567e89b12d3a456426614174200';
const reportingTraceId = '123e4567e89b12d3a456426614174300';

let testDir = '';

describe('demo-export script', () => {
  beforeEach(() => {
    testDir = join(workspace, 'test-results', `demo-export-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('requires recorded media before exporting live proof artifacts', () => {
    const result = spawnSync(
      process.execPath,
      [join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/demo-export.ts', '--reporting-run-id', '123e4567-e89b-12d3-a456-426614174300'],
      {
        cwd: workspace,
        encoding: 'utf8',
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing --media');
  });

  it('writes a Supabase-derived live proof bundle with hashes and benchmark row', async () => {
    const mediaPath = join(testDir, 'session.png');
    const manifestPath = join(testDir, 'live-demo.json');
    const artifactDir = join(testDir, 'artifacts');
    const benchmarkPath = join(testDir, 'BENCHMARK.md');
    writeFileSync(mediaPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]));
    writeFileSync(
      benchmarkPath,
      [
        '# Benchmark',
        '',
        '## Live Run Log',
        '',
        '| Date | Prompt | Session / Runs | Model(s) | Exa searches | Tokens | Cost / method | Eval result | Report |',
        '| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |',
        '| Pending | Configured live demo run | Pending | Pending | Pending | Pending | Pending | Pending | Pending |',
        '',
      ].join('\n'),
    );

    const summary = await runDemoExport(
      [
        '--reporting-run-id',
        reportingRunId,
        '--manifest',
        rel(manifestPath),
        '--artifacts',
        rel(artifactDir),
        '--benchmark',
        rel(benchmarkPath),
        '--media',
        rel(mediaPath),
        '--update-benchmark',
      ],
      { loadEvidence: async () => evidence() },
    );

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const benchmark = readFileSync(benchmarkPath, 'utf8');

    expect(summary).toMatchObject({ status: 'ok', reportingRunId, sessionId, benchmarkUpdated: true });
    expect(manifest).toMatchObject({
      sessionId,
      researchRunId,
      reportingRunId,
      approvalId,
      prompt: evidence().session.query,
      date: '2026-06-24',
    });
    expect(manifest.evalOutput).toBe(rel(join(artifactDir, 'eval-summary.json')));
    expect(Object.keys(manifest.provenance.artifactHashes).sort()).toEqual(
      [manifest.reportExport, manifest.evalOutput, manifest.runExport, rel(mediaPath)].sort(),
    );
    expect(JSON.parse(readFileSync(join(artifactDir, 'eval-summary.json'), 'utf8'))).toMatchObject({ passed: true, scenarioCount: 3 });
    expect(benchmark).toContain(reportingRunId);
    expect(benchmark).toContain('Research AI agents &#124; financial compliance<br>Second line');
    expect(benchmark).not.toContain('| Pending | Configured live demo run | Pending |');
  });
});

function evidence(): LiveProofEvidence {
  return {
    session: {
      id: sessionId,
      userId: 'user_1',
      query: 'Research AI agents | financial compliance\nSecond line',
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
      id: '123e4567-e89b-12d3-a456-426614174500',
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
        metadata: { reportId: '123e4567-e89b-12d3-a456-426614174500' },
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

function rel(path: string) {
  return relative(workspace, path).replace(/\\/g, '/');
}
