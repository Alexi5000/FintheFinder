import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const workspace = process.cwd();
const runId = '123e4567-e89b-12d3-a456-426614174000';
const traceId = '123e4567e89b12d3a456426614174000';

let testDir = '';

describe('demo-record script', () => {
  beforeEach(() => {
    testDir = join(workspace, 'test-results', `demo-record-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('fails with structured evidence errors when the manifest is missing', () => {
    const result = runDemoRecord('test-results/missing-live-demo.json');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('"status": "missing_evidence"');
    expect(result.stderr).toContain('Demo evidence manifest not found');
  });

  it('accepts a complete manifest with inspectable local artifacts', () => {
    const manifestPath = writeDemoBundle();

    const result = runDemoRecord(manifestPath);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toEqual(
      expect.objectContaining({
        status: 'ok',
        runId,
        costUsd: 0.42,
        measurementMethod: 'provider_usage',
      }),
    );
  });

  it('rejects the example manifest and placeholder proof values', () => {
    const result = runDemoRecord('docs/demo/live-demo.example.json');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not the example manifest');
    expect(result.stderr).toContain('runId must not be a placeholder value');
    expect(result.stderr).toContain('traceId must not be a placeholder value');
  });

  it('rejects failed or mismatched live eval outputs', () => {
    const manifestPath = writeDemoBundle({
      evalOutput: { passed: false, mode: 'live', status: 'failed_eval_output', runId: '123e4567-e89b-12d3-a456-426614174999' },
    });

    const result = runDemoRecord(manifestPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('evalOutput must contain passed: true');
    expect(result.stderr).toContain('evalOutput status must be ok');
    expect(result.stderr).toContain('evalOutput runId must match manifest runId');
  });

  it('makes evals:live reject manifests that fail demo-record validation', () => {
    const manifestPath = writeDemoBundle({
      manifest: { runId: '00000000-0000-0000-0000-000000000000' },
    });

    const result = spawnSync(process.execPath, [join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/evals.ts', '--live', '--manifest', manifestPath], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENAI_API_KEY: 'test-openai',
        EXA_API_KEY: 'test-exa',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"status": "invalid_demo_manifest"');
    expect(result.stdout).toContain('runId must not be a placeholder value');
  });

  it('rejects missing media, weak cost evidence, and pending benchmark rows', () => {
    const manifestPath = writeDemoBundle({
      benchmark: '| Pending | Configured live demo run | Pending |',
      manifest: {
        cost: { totalUsd: 0, measurementMethod: 'guessed', pricingEffectiveDate: '2026-99-99' },
        screenshotsOrVideo: ['test-results/demo-record-missing.png'],
      },
    });

    const result = runDemoRecord(manifestPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cost.totalUsd must be a positive finite number');
    expect(result.stderr).toContain('cost.measurementMethod must be estimated or provider_usage');
    expect(result.stderr).toContain('cost.pricingEffectiveDate must be a valid ISO calendar date');
    expect(result.stderr).toContain('Live Run Log must include one row for the recorded runId');
    expect(result.stderr).toContain('screenshotsOrVideo artifact does not exist');
  });
});

function runDemoRecord(manifestPath: string) {
  return spawnSync(process.execPath, ['scripts/demo-record.mjs', manifestPath], {
    cwd: workspace,
    encoding: 'utf8',
  });
}

function writeDemoBundle(options: {
  benchmark?: string;
  evalOutput?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
} = {}) {
  const reportPath = join(testDir, 'report.md');
  const evalOutputPath = join(testDir, 'eval-output.json');
  const runExportPath = join(testDir, 'run-export.json');
  const screenshotPath = join(testDir, 'session-detail.png');
  const benchmarkPath = join(testDir, 'BENCHMARK.md');
  const manifestPath = join(testDir, 'live-demo.json');

  writeFileSync(
    reportPath,
    [
      '# Configured Demo Report',
      '',
      '## Executive Summary',
      'This recorded report contains enough detail to prove that a real markdown export was captured for the configured demo flow.',
      'It includes cited sources and a durable artifact path for review.',
      '',
      '## Sources',
      '- [Primary Source](https://example.com/source)',
      '',
    ].join('\n'),
  );
  writeFileSync(evalOutputPath, `${JSON.stringify(options.evalOutput ?? { passed: true, mode: 'live', status: 'ok', runId, traceId }, null, 2)}\n`);
  writeFileSync(
    runExportPath,
    `${JSON.stringify(
      {
        runId,
        traceId,
        status: 'report_ready',
        cost: { totalUsd: 0.42, measurementMethod: 'provider_usage', pricingEffectiveDate: '2026-06-24' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(screenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]));
  writeFileSync(
    benchmarkPath,
    options.benchmark ??
      [
        '# Benchmark',
        '',
        '## Live Run Log',
        '',
        '| Date | Prompt | Run ID | Model(s) | Exa searches | Tokens | Estimated cost | Eval result | Report |',
        '| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |',
        `| ${today()} | Demo prompt | ${runId} | gpt-5.5 | 3 | 1000 | 0.42 provider_usage | ${rel(evalOutputPath)} ${rel(manifestPath)} | ${rel(reportPath)} ${rel(runExportPath)} ${rel(screenshotPath)} |`,
        '',
      ].join('\n'),
  );

  const manifest = {
    date: today(),
    prompt: 'Research practical uses of AI agents in compliance-heavy financial services.',
    runId,
    traceId,
    reportExport: rel(reportPath),
    evalOutput: rel(evalOutputPath),
    runExport: rel(runExportPath),
    screenshotsOrVideo: [rel(screenshotPath)],
    benchmarkDoc: rel(benchmarkPath),
    cost: {
      totalUsd: 0.42,
      measurementMethod: 'provider_usage',
      pricingEffectiveDate: '2026-06-24',
    },
    ...options.manifest,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return rel(manifestPath);
}

function rel(path: string) {
  return relative(workspace, path).replace(/\\/g, '/');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
