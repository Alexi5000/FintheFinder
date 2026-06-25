import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOfflineEvalSuite } from '../src/server/evals/eval-suite';
import { runOrchestrationReplayEval } from '../src/server/evals/replay-eval';

const root = process.cwd();
const summaryPath = join(root, 'docs', 'benchmark', 'offline-eval-summary.json');
const replaySummaryPath = join(root, 'docs', 'benchmark', 'orchestration-replay-summary.json');
const benchmarkPath = join(root, 'docs', 'BENCHMARK.md');

if (!existsSync(summaryPath)) {
  throw new Error('Offline benchmark summary is missing. Run npm run evals -- docs/benchmark/offline-eval-summary.json.');
}

if (!existsSync(replaySummaryPath)) {
  throw new Error('Orchestration replay summary is missing. Run npm run evals:replay -- docs/benchmark/orchestration-replay-summary.json.');
}

if (!existsSync(benchmarkPath)) {
  throw new Error('docs/BENCHMARK.md is missing.');
}

const expectedSummary = `${JSON.stringify(runOfflineEvalSuite(), null, 2)}\n`;
const committedSummary = readFileSync(summaryPath, 'utf8');
if (committedSummary !== expectedSummary) {
  throw new Error('Offline benchmark summary drift detected. Run npm run evals -- docs/benchmark/offline-eval-summary.json.');
}

const expectedReplaySummary = `${JSON.stringify(await runOrchestrationReplayEval(), null, 2)}\n`;
const committedReplaySummary = readFileSync(replaySummaryPath, 'utf8');
if (committedReplaySummary !== expectedReplaySummary) {
  throw new Error('Orchestration replay summary drift detected. Run npm run evals:replay -- docs/benchmark/orchestration-replay-summary.json.');
}

const parsed = JSON.parse(committedSummary) as {
  results: Array<{
    id: string;
    expectedPass: boolean;
    observedPass: boolean;
    scores: { correctness: number; safety: number; completeness: number; quality: number };
    issues: string[];
  }>;
};
const benchmark = readFileSync(benchmarkPath, 'utf8');
const rowErrors: string[] = [];
const replaySummary = JSON.parse(committedReplaySummary) as { passed: boolean; scenarioId: string; coverage: string[] };

for (const result of parsed.results) {
  const row = benchmark
    .split(/\r?\n/)
    .find((line) => line.startsWith(`| \`${result.id}\``));
  if (!row) {
    rowErrors.push(`missing row for ${result.id}`);
    continue;
  }

  const requiredSnippets = [
    result.expectedPass ? 'Pass' : 'Fail',
    result.observedPass ? 'Pass' : 'Fail',
    formatScores(result.scores),
    ...(result.issues.length ? result.issues : ['None']),
  ];

  for (const snippet of requiredSnippets) {
    if (!row.includes(escapeTableCell(snippet))) rowErrors.push(`${result.id} row is missing: ${snippet}`);
  }
}

if (rowErrors.length) {
  throw new Error(`docs/BENCHMARK.md expected-vs-evaluation drift detected: ${rowErrors.join('; ')}`);
}

for (const snippet of [
  replaySummary.scenarioId,
  'credential-free orchestration replay',
  'processNextRun',
  'runResearchSession',
  'runApprovedReportSession',
  'publishReport',
  replaySummary.passed ? 'Pass' : 'Fail',
]) {
  if (!benchmark.includes(snippet)) {
    throw new Error(`docs/BENCHMARK.md orchestration replay section is missing: ${snippet}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: ['docs/benchmark/offline-eval-summary.json', 'docs/benchmark/orchestration-replay-summary.json', 'docs/BENCHMARK.md'],
      scenarios: parsed.results.length,
      replay: replaySummary.scenarioId,
    },
    null,
    2,
  ),
);

function formatScores(scores: { correctness: number; safety: number; completeness: number; quality: number }) {
  return `C ${formatScore(scores.correctness)} / S ${formatScore(scores.safety)} / Comp ${formatScore(scores.completeness)} / Q ${formatScore(scores.quality)}`;
}

function formatScore(score: number) {
  return score.toFixed(2);
}

function escapeTableCell(value: string) {
  return value.replaceAll('|', '\\|');
}
