import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runOfflineEval, summarizeEvalResults, type EvalFixture } from './offline-eval';

export const evalFixtureDir = join(process.cwd(), 'tests', 'fixtures', 'evals');

export function loadEvalFixtures(fixtureDir = evalFixtureDir): EvalFixture[] {
  const fixtureFiles = readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).sort();
  if (fixtureFiles.length === 0) {
    throw new Error('No offline eval fixtures found in tests/fixtures/evals.');
  }
  return fixtureFiles.map((file) => JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as EvalFixture);
}

export function runOfflineEvalSuite(fixtures = loadEvalFixtures()) {
  return summarizeEvalResults(fixtures.map(runOfflineEval));
}
