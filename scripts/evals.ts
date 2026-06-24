import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runOfflineEval, summarizeEvalResults, type EvalFixture } from '../src/server/evals/offline-eval';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'evals');
const fixtureFiles = readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).sort();

if (fixtureFiles.length === 0) {
  throw new Error('No offline eval fixtures found in tests/fixtures/evals.');
}

const fixtures = fixtureFiles.map((file) => JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as EvalFixture);
const summary = summarizeEvalResults(fixtures.map(runOfflineEval));

console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exit(1);
