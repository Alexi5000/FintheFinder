import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runOfflineEval, summarizeEvalResults, type EvalFixture } from '../src/server/evals/offline-eval';

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf('--output');
const positionalOutputPath = args.find((arg) => !arg.startsWith('--'));
const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : positionalOutputPath;

if (outputFlagIndex >= 0 && !args[outputFlagIndex + 1]) {
  throw new Error('Missing output path after --output.');
}
const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'evals');
const fixtureFiles = readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).sort();

if (fixtureFiles.length === 0) {
  throw new Error('No offline eval fixtures found in tests/fixtures/evals.');
}

const fixtures = fixtureFiles.map((file) => JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as EvalFixture);
const summary = summarizeEvalResults(fixtures.map(runOfflineEval));

if (outputPath) {
  const absoluteOutputPath = join(process.cwd(), outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exit(1);
