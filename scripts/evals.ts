import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { EvalSuiteSummary } from '../src/lib/schemas';
import { runOfflineEvalSuite } from '../src/server/evals/eval-suite';

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf('--output');
const manifestFlagIndex = args.indexOf('--manifest');
const suiteFlagIndex = args.indexOf('--suite');
const live = args.includes('--live');
const persist = args.includes('--persist');
const consumedFlagValueIndexes = new Set<number>();
if (outputFlagIndex >= 0) consumedFlagValueIndexes.add(outputFlagIndex + 1);
if (manifestFlagIndex >= 0) consumedFlagValueIndexes.add(manifestFlagIndex + 1);
if (suiteFlagIndex >= 0) consumedFlagValueIndexes.add(suiteFlagIndex + 1);
const positionalOutputPath = args.find((arg, index) => !arg.startsWith('--') && !consumedFlagValueIndexes.has(index));
const outputPath = outputFlagIndex >= 0 ? flagValue('--output', outputFlagIndex) : positionalOutputPath;
const manifestPath = manifestFlagIndex >= 0 ? flagValue('--manifest', manifestFlagIndex) : 'docs/demo/live-demo.json';
const suite = suiteFlagIndex >= 0 ? flagValue('--suite', suiteFlagIndex) : live ? 'live' : 'offline';

if (positionalOutputPath && live) throw new Error('Live eval proof uses --manifest; positional output is only supported for offline eval output.');
if (persist && live) throw new Error('Persisted eval history currently records offline suite summaries. Live proof is captured by docs/demo/live-demo.json.');

if (live) {
  const summary = await runLiveEvalProofCheck(manifestPath);
  writeSummaryOutput(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
} else {
  const summary = runOfflineEvalSuite();
  const persisted = persist ? await persistEvalSummary(suite, summary) : undefined;
  writeSummaryOutput(summary);
  console.log(JSON.stringify(persisted ? { ...summary, persistedEvalRun: persisted } : summary, null, 2));
  if (!summary.passed) process.exit(1);
}

async function runLiveEvalProofCheck(path: string) {
  const missingEnv = ['OPENAI_API_KEY', 'EXA_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    (key) => !process.env[key],
  );
  const absoluteManifestPath = resolvePath(path);
  const errors: string[] = [];
  if (missingEnv.length) errors.push(`Missing provider environment: ${missingEnv.join(', ')}`);
  if (!existsSync(absoluteManifestPath)) errors.push(`Missing live demo manifest: ${path}`);

  if (errors.length > 0) {
    return {
      passed: false,
      mode: 'live',
      status: 'missing_evidence',
      errors,
      instructions: [
        'Configure OpenAI, Exa, and Supabase environment variables.',
        'Run a configured live demo and record docs/demo/live-demo.json.',
        'Run npm run demo:record before npm run evals:live.',
      ],
    };
  }

  const demoRecordResult = validateRecordedDemo(path);
  if (demoRecordResult) {
    return {
      passed: false,
      mode: 'live',
      status: 'invalid_demo_manifest',
      errors: [demoRecordResult],
    };
  }

  const manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8')) as {
    approvalId?: string;
    evalOutput?: string;
    runId?: string;
    sessionId?: string;
    researchRunId?: string;
    reportingRunId?: string;
    traceId?: string;
    cost?: { totalUsd?: number; measurementMethod?: string; pricingEffectiveDate?: string };
  };
  if (!manifest.evalOutput || !existsSync(resolvePath(manifest.evalOutput))) {
    return {
      passed: false,
      mode: 'live',
      status: 'missing_eval_output',
      errors: [`Missing eval output artifact referenced by ${path}.`],
    };
  }

  const evalOutput = JSON.parse(readFileSync(resolvePath(manifest.evalOutput), 'utf8')) as {
    passed?: boolean;
    fixtureCount?: number;
    scenarioCount?: number;
    scenarios?: unknown;
    suite?: unknown;
    issues?: unknown;
    regressions?: unknown;
  };
  const { verifyLiveProofManifestFromSupabase } = await import('../src/server/demo/live-proof');
  const supabaseProof = await verifyLiveProofManifestFromSupabase(path);
  if (!supabaseProof.ok) {
    return {
      passed: false,
      mode: 'live',
      status: 'supabase_mismatch',
      errors: supabaseProof.errors,
      sessionId: manifest.sessionId,
      researchRunId: manifest.researchRunId,
      reportingRunId: manifest.reportingRunId,
      approvalId: manifest.approvalId,
      runId: manifest.runId,
      traceId: manifest.traceId,
      manifest: path,
      manifestSha256: createHash('sha256').update(readFileSync(absoluteManifestPath)).digest('hex'),
      evalOutput: manifest.evalOutput,
      cost: manifest.cost,
    };
  }
  return {
    passed: evalOutput.passed === true,
    mode: 'live',
    status: evalOutput.passed === true ? 'ok' : 'failed_eval_output',
    sessionId: manifest.sessionId,
    researchRunId: manifest.researchRunId,
    reportingRunId: manifest.reportingRunId,
    approvalId: manifest.approvalId,
    runId: manifest.runId,
    traceId: manifest.traceId,
    manifest: path,
    manifestSha256: createHash('sha256').update(readFileSync(absoluteManifestPath)).digest('hex'),
    evalOutput: manifest.evalOutput,
    scenarioCount: evalOutput.scenarioCount ?? evalOutput.fixtureCount,
    scenarios: Array.isArray(evalOutput.scenarios) ? evalOutput.scenarios : [],
    suite: evalOutput.suite,
    issues: Array.isArray(evalOutput.issues) ? evalOutput.issues : [],
    regressions: Array.isArray(evalOutput.regressions) ? evalOutput.regressions : [],
    cost: manifest.cost,
  };
}

function resolvePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

function flagValue(flag: string, index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value after ${flag}.`);
  return value;
}

function writeSummaryOutput(summary: unknown) {
  if (!outputPath) return;
  const absoluteOutputPath = resolvePath(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

async function persistEvalSummary(suite: string, summary: EvalSuiteSummary) {
  const { saveEvalRun } = await import('../src/server/evals/history');
  const run = await saveEvalRun(suite, summary);
  return { id: run.id, suite: run.suite, status: run.status, resultCount: run.results.length };
}

function validateRecordedDemo(path: string) {
  try {
    execFileSync(process.execPath, ['scripts/demo-record.mjs', path], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return null;
  } catch (error) {
    if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
      return error.stderr.trim();
    }
    return error instanceof Error ? error.message : 'Demo evidence manifest failed demo:record validation.';
  }
}
