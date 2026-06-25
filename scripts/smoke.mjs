import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJsonPath = join(root, 'package.json');
const checks = [
  ['package.json', existsSync(packageJsonPath)],
  ['README.md', existsSync(join(root, 'README.md')) || existsSync(join(root, 'README.MD'))],
  ['env example', ['.env.example', '.env.sample', 'env.example', '.env.local.example'].some((name) => existsSync(join(root, name)))],
  ['deploy notes', ['DEPLOY.md', 'docs/DEPLOY.md', 'docs/deploy.md', 'docs/deployment.md', 'docs/DEPLOYMENT.md'].some((name) => existsSync(join(root, name)))],
  ['fde gates', existsSync(join(root, 'docs', 'FDE_GATES.md'))],
  ['contract schema', existsSync(join(root, 'contracts', 'schema.json'))],
];

if (existsSync(packageJsonPath)) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  checks.push(['build script', Boolean(pkg.scripts?.build)]);
}

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(JSON.stringify({
    project: 'FintheFinder',
    status: 'failed',
    missing: failed.map(([name]) => name),
  }, null, 2));
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const contractCheck = spawnSync(`${npmCommand} run contracts:check --silent`, { cwd: root, stdio: 'pipe', shell: true });
if (contractCheck.status !== 0) {
  console.error(contractCheck.error?.message || contractCheck.stderr?.toString() || contractCheck.stdout?.toString());
  process.exit(contractCheck.status ?? 1);
}

if (process.env.SMOKE_URL) {
  let response;
  try {
    response = await fetchHealthWithRetry(`${process.env.SMOKE_URL.replace(/\/$/, '')}/api/health`);
  } catch {
    console.error(JSON.stringify({ project: 'FintheFinder', status: 'failed', healthErrors: ['health endpoint did not respond'] }, null, 2));
    process.exit(1);
  }
  if (!response.ok) {
    console.error(JSON.stringify({ project: 'FintheFinder', status: 'failed', healthStatus: response.status }, null, 2));
    process.exit(1);
  }
  let health;
  try {
    health = await response.json();
  } catch {
    console.error(JSON.stringify({ project: 'FintheFinder', status: 'failed', healthStatus: response.status, healthErrors: ['health response must be JSON'] }, null, 2));
    process.exit(1);
  }
  const errors = validateHealthPayload(health);
  if (errors.length) {
    console.error(JSON.stringify({ project: 'FintheFinder', status: 'failed', healthStatus: response.status, healthErrors: errors }, null, 2));
    process.exit(1);
  }
  checks.push(['hosted health', true]);
}

console.log(JSON.stringify({
  project: 'FintheFinder',
  status: 'ok',
  checked: checks.map(([name]) => name),
}, null, 2));

function validateHealthPayload(payload) {
  const errors = [];
  const allowedProviderStates = new Set(['configured', 'missing']);
  const providerKeys = ['openai', 'exa', 'supabase'];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['health payload must be a JSON object'];
  if (payload.ok !== true) errors.push('health ok must be true');
  if (payload.service !== 'fin-the-finder') errors.push('health service must be fin-the-finder');
  if (!payload.contracts || payload.contracts.version !== 1) errors.push('health contract version must be 1');

  if (!payload.providers || typeof payload.providers !== 'object' || Array.isArray(payload.providers)) {
    errors.push('health providers must be an object');
  } else {
    for (const key of providerKeys) {
      if (!allowedProviderStates.has(payload.providers[key])) {
        errors.push(`provider ${key} must be configured or missing`);
      }
    }
    for (const key of Object.keys(payload.providers)) {
      if (!providerKeys.includes(key)) errors.push(`unexpected provider key ${key}`);
    }
  }

  const serialized = JSON.stringify(payload);
  const forbidden = [
    'OPENAI_API_KEY',
    'EXA_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'authorization',
    'Bearer ',
  ];
  for (const marker of forbidden) {
    if (serialized.includes(marker)) errors.push(`health payload must not expose ${marker.trim()}`);
  }
  if (/\bsk-[A-Za-z0-9_-]{6,}\b/.test(serialized)) errors.push('health payload must not expose OpenAI-style keys');
  if (/\beyJ[A-Za-z0-9_-]{12,}\b/.test(serialized)) errors.push('health payload must not expose JWT-like tokens');

  return errors;
}

async function fetchHealthWithRetry(url) {
  const attempts = Number(process.env.SMOKE_RETRIES ?? 20);
  const delayMs = Number(process.env.SMOKE_RETRY_DELAY_MS ?? 500);
  let lastResponse;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      lastResponse = response;
      if (response.ok || response.status < 500) return response;
    } catch {
      // Retry until a just-started server is ready.
    }
    await delay(delayMs);
  }

  if (lastResponse) return lastResponse;
  throw new Error('health endpoint did not respond');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
