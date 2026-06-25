import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOfflineEvalSuite } from '../src/server/evals/eval-suite';

const root = process.cwd();
const summaryPath = join(root, 'docs', 'benchmark', 'offline-eval-summary.json');
const benchmarkPath = join(root, 'docs', 'BENCHMARK.md');

if (!existsSync(summaryPath)) {
  throw new Error('Offline benchmark summary is missing. Run npm run evals -- docs/benchmark/offline-eval-summary.json.');
}

if (!existsSync(benchmarkPath)) {
  throw new Error('docs/BENCHMARK.md is missing.');
}

const expectedSummary = `${JSON.stringify(runOfflineEvalSuite(), null, 2)}\n`;
const committedSummary = readFileSync(summaryPath, 'utf8');
if (committedSummary !== expectedSummary) {
  throw new Error('Offline benchmark summary drift detected. Run npm run evals -- docs/benchmark/offline-eval-summary.json.');
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

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: ['docs/benchmark/offline-eval-summary.json', 'docs/BENCHMARK.md'],
      scenarios: parsed.results.length,
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
