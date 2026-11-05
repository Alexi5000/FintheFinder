require('./verify-braces.cjs');
const { spawnSync } = require('node:child_process');

const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (result.error || ![0, 1].includes(result.status)) {
  process.stderr.write(result.stderr || String(result.error || 'npm audit failed'));
  process.exit(1);
}
const audit = JSON.parse(result.stdout);
if (audit.error || !audit.vulnerabilities || !audit.metadata?.vulnerabilities) {
  throw new Error('npm audit did not return a complete vulnerability report');
}
const findings = Object.values(audit.vulnerabilities);
const ALLOWED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', // braces verified local backport
  'https://github.com/advisories/GHSA-g3hv-75wg-m249', // minimatch dev-only ESLint/Mastra CLI exception documented in docs/OPERATIONS.md
]);

function covered(finding, visited = new Set()) {
  if (visited.has(finding.name) || !finding.via.length) return false;
  const next = new Set([...visited, finding.name]);
  return finding.via.every((source) => {
    if (typeof source === 'object') {
      return ALLOWED_ADVISORIES.has(source.url);
    }
    const dependency = audit.vulnerabilities[source];
    if (!dependency) return false;
    if (!['moderate', 'high', 'critical'].includes(dependency.severity)) {
      return true;
    }
    return covered(dependency, next);
  });
}
const blocked = findings.filter((finding) =>
  ['moderate', 'high', 'critical'].includes(finding.severity) && !covered(finding),
);
if (blocked.length) {
  console.error(JSON.stringify(blocked, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(audit.metadata.vulnerabilities));
console.log('Only GHSA-vfj7-8cjw-p6xm (verified local backport) and GHSA-g3hv-75wg-m249 (documented dev-only exception) are permitted; upstream alerts remain visible.');
