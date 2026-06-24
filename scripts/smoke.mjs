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
  const response = await fetch(`${process.env.SMOKE_URL.replace(/\/$/, '')}/api/health`);
  if (!response.ok) {
    console.error(JSON.stringify({ project: 'FintheFinder', status: 'failed', healthStatus: response.status }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify({
  project: 'FintheFinder',
  status: 'ok',
  checked: checks.map(([name]) => name),
}, null, 2));
