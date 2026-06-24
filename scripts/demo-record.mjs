import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const manifestPath = process.argv[2] ?? 'docs/demo/live-demo.json';
const absoluteManifestPath = resolvePath(manifestPath);

if (!existsSync(absoluteManifestPath)) {
  fail(`Demo evidence manifest not found: ${manifestPath}`, [
    'Copy docs/demo/live-demo.example.json to docs/demo/live-demo.json after recording a configured run.',
    'Fill runId, report export, screenshot or video, eval output, trace ID, and cost evidence.',
  ]);
}

const manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
const errors = validateManifest(manifest);

if (errors.length > 0) fail('Demo evidence manifest is incomplete.', errors);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      manifest: manifestPath,
      runId: manifest.runId,
      report: manifest.reportExport,
      costUsd: manifest.cost.totalUsd,
      measurementMethod: manifest.cost.measurementMethod,
    },
    null,
    2,
  ),
);

function validateManifest(value) {
  const errors = [];
  requireString(value.date, 'date', errors);
  requireString(value.prompt, 'prompt', errors);
  requireString(value.runId, 'runId', errors);
  requireString(value.traceId, 'traceId', errors);
  requireString(value.reportExport, 'reportExport', errors);
  requireString(value.evalOutput, 'evalOutput', errors);

  if (!Array.isArray(value.screenshotsOrVideo) || value.screenshotsOrVideo.length === 0) {
    errors.push('screenshotsOrVideo must include at least one screenshot or video path/URL.');
  } else {
    for (const artifact of value.screenshotsOrVideo) requireString(artifact, 'screenshotsOrVideo[]', errors);
  }

  if (!value.cost || typeof value.cost !== 'object') {
    errors.push('cost object is required.');
  } else {
    if (typeof value.cost.totalUsd !== 'number' || value.cost.totalUsd < 0) errors.push('cost.totalUsd must be a nonnegative number.');
    if (!['estimated', 'provider_usage'].includes(value.cost.measurementMethod)) {
      errors.push('cost.measurementMethod must be estimated or provider_usage.');
    }
    requireString(value.cost.pricingEffectiveDate, 'cost.pricingEffectiveDate', errors);
  }

  for (const pathField of ['reportExport', 'evalOutput']) {
    const artifact = value[pathField];
    if (typeof artifact === 'string' && !isUrl(artifact) && !existsSync(resolvePath(artifact))) {
      errors.push(`${pathField} does not exist: ${artifact}`);
    }
  }

  for (const artifact of value.screenshotsOrVideo ?? []) {
    if (typeof artifact === 'string' && !isUrl(artifact) && !existsSync(resolvePath(artifact))) {
      errors.push(`screenshotsOrVideo artifact does not exist: ${artifact}`);
    }
  }

  return errors;
}

function requireString(value, name, errors) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('TODO') || value.includes('PENDING')) {
    errors.push(`${name} must be a non-empty finalized string.`);
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function fail(message, details) {
  console.error(JSON.stringify({ status: 'missing_evidence', message, details }, null, 2));
  process.exit(1);
}
