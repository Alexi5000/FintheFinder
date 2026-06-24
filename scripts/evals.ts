import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { runOfflineEvalSuite } from '../src/server/evals/eval-suite';

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf('--output');
const manifestFlagIndex = args.indexOf('--manifest');
const live = args.includes('--live');
const positionalOutputPath = args.find((arg, index) => !arg.startsWith('--') && index !== outputFlagIndex + 1 && index !== manifestFlagIndex + 1);
const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : positionalOutputPath;
const manifestPath = manifestFlagIndex >= 0 ? args[manifestFlagIndex + 1] : 'docs/demo/live-demo.json';

if (outputFlagIndex >= 0 && !args[outputFlagIndex + 1]) {
  throw new Error('Missing output path after --output.');
}

if (manifestFlagIndex >= 0 && !args[manifestFlagIndex + 1]) {
  throw new Error('Missing manifest path after --manifest.');
}

const summary = live ? runLiveEvalProofCheck(manifestPath) : runOfflineEvalSuite();

if (outputPath) {
  const absoluteOutputPath = join(process.cwd(), outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exit(1);

function runLiveEvalProofCheck(path: string) {
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

  const manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8')) as { evalOutput?: string; runId?: string };
  if (!manifest.evalOutput || !existsSync(resolvePath(manifest.evalOutput))) {
    return {
      passed: false,
      mode: 'live',
      status: 'missing_eval_output',
      errors: [`Missing eval output artifact referenced by ${path}.`],
    };
  }

  const evalOutput = JSON.parse(readFileSync(resolvePath(manifest.evalOutput), 'utf8')) as { passed?: boolean };
  return {
    passed: evalOutput.passed === true,
    mode: 'live',
    status: evalOutput.passed === true ? 'ok' : 'failed_eval_output',
    runId: manifest.runId,
    manifest: path,
    evalOutput: manifest.evalOutput,
  };
}

function resolvePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}
