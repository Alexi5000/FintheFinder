import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { runOrchestrationReplayEval } from '../src/server/evals/replay-eval';

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf('--output');
const consumedFlagValueIndexes = new Set<number>();
if (outputFlagIndex >= 0) consumedFlagValueIndexes.add(outputFlagIndex + 1);
const positionalOutputPath = args.find((arg, index) => !arg.startsWith('--') && !consumedFlagValueIndexes.has(index));
const outputPath = outputFlagIndex >= 0 ? flagValue('--output', outputFlagIndex) : positionalOutputPath;

const summary = await runOrchestrationReplayEval();
if (outputPath) {
  const absoluteOutputPath = resolvePath(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exit(1);

function resolvePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

function flagValue(flag: string, index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value after ${flag}.`);
  return value;
}
