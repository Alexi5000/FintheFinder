import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const manifestPath = process.argv[2] ?? 'docs/demo/live-demo.json';
const absoluteManifestPath = resolvePath(manifestPath);

if (!existsSync(absoluteManifestPath)) {
  fail(`Demo evidence manifest not found: ${manifestPath}`, [
    'Copy docs/demo/live-demo.example.json to docs/demo/live-demo.json after recording a configured run.',
    'Fill runId, traceId, report export, run export, screenshot or video, eval output, benchmark row, and cost evidence.',
  ]);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
} catch (error) {
  fail('Demo evidence manifest is not valid JSON.', [error instanceof Error ? error.message : 'Unable to parse manifest.']);
}

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['manifest must be a JSON object.'];
  }

  if (normalizeRelativePath(absoluteManifestPath) === 'docs/demo/live-demo.example.json') {
    errors.push('demo:record must validate docs/demo/live-demo.json, not the example manifest.');
  }

  requireString(value.date, 'date', errors, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
  if (typeof value.date === 'string' && !isValidIsoDate(value.date)) errors.push('date must be a valid ISO calendar date.');
  if (typeof value.date === 'string' && isFutureDate(value.date)) errors.push('date must not be in the future.');

  requireString(value.prompt, 'prompt', errors, { minLength: 20 });
  requireString(value.runId, 'runId', errors, {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    placeholder: /^0{8}-0{4}-0{4}-0{4}-0{12}$/i,
  });
  requireString(value.traceId, 'traceId', errors, {
    pattern: /^[0-9a-f]{32}$/i,
    placeholder: /^0{32}$/i,
  });
  requireString(value.reportExport, 'reportExport', errors);
  requireString(value.evalOutput, 'evalOutput', errors);
  requireString(value.runExport, 'runExport', errors);

  const reportPath = requireLocalArtifact(value.reportExport, 'reportExport', errors);
  if (reportPath) validateReportArtifact(reportPath, errors);

  const evalOutputPath = requireLocalArtifact(value.evalOutput, 'evalOutput', errors);
  if (evalOutputPath) validateEvalOutput(evalOutputPath, value.runId, value.traceId, errors);

  const runExportPath = requireLocalArtifact(value.runExport, 'runExport', errors);
  if (runExportPath) validateRunExport(runExportPath, value, errors);

  if (!Array.isArray(value.screenshotsOrVideo) || value.screenshotsOrVideo.length === 0) {
    errors.push('screenshotsOrVideo must include at least one screenshot or video path/URL.');
  } else {
    for (const artifact of value.screenshotsOrVideo) {
      requireString(artifact, 'screenshotsOrVideo[]', errors);
      validateMediaArtifact(artifact, errors);
    }
  }

  if (!value.cost || typeof value.cost !== 'object') {
    errors.push('cost object is required.');
  } else {
    if (typeof value.cost.totalUsd !== 'number' || !Number.isFinite(value.cost.totalUsd) || value.cost.totalUsd <= 0) {
      errors.push('cost.totalUsd must be a positive finite number from the recorded run.');
    }
    if (!['estimated', 'provider_usage'].includes(value.cost.measurementMethod)) {
      errors.push('cost.measurementMethod must be estimated or provider_usage.');
    }
    requireString(value.cost.pricingEffectiveDate, 'cost.pricingEffectiveDate', errors, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
    if (typeof value.cost.pricingEffectiveDate === 'string' && !isValidIsoDate(value.cost.pricingEffectiveDate)) {
      errors.push('cost.pricingEffectiveDate must be a valid ISO calendar date.');
    }
  }

  validateBenchmarkEvidence(value.benchmarkDoc ?? 'docs/BENCHMARK.md', value, errors);

  return errors;
}

function requireString(value, name, errors, options = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || /TODO|PENDING|TBD/i.test(value)) {
    errors.push(`${name} must be a non-empty finalized string.`);
    return;
  }
  if (options.minLength && value.trim().length < options.minLength) {
    errors.push(`${name} must be at least ${options.minLength} characters.`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    errors.push(`${name} has an invalid format.`);
  }
  if (options.placeholder && options.placeholder.test(value)) {
    errors.push(`${name} must not be a placeholder value.`);
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path);
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function normalizeRelativePath(path) {
  return relative(process.cwd(), resolvePath(path)).replace(/\\/g, '/');
}

function isInsideWorkspace(path) {
  const relativePath = relative(realpathSync(process.cwd()), path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function requireLocalArtifact(path, name, errors) {
  if (typeof path !== 'string' || path.trim().length === 0) return null;
  if (isUrl(path)) {
    errors.push(`${name} must be a local artifact path so demo:record can inspect it.`);
    return null;
  }

  const absolutePath = resolvePath(path);
  if (!existsSync(absolutePath)) {
    errors.push(`${name} does not exist: ${path}`);
    return null;
  }
  if (lstatSync(absolutePath).isSymbolicLink()) {
    errors.push(`${name} must not be a symlink: ${path}`);
    return null;
  }
  const realPath = realpathSync(absolutePath);
  if (!isInsideWorkspace(realPath)) {
    errors.push(`${name} must stay inside the repository workspace.`);
    return null;
  }
  if (!statSync(realPath).isFile()) {
    errors.push(`${name} must point to a file: ${path}`);
    return null;
  }
  return realPath;
}

function validateReportArtifact(path, errors) {
  if (statSync(path).size > 2_000_000) errors.push('reportExport must be 2MB or smaller.');
  const report = readFileSync(path, 'utf8');
  if (report.trim().length < 200) errors.push('reportExport must contain a nontrivial markdown report.');
  if (/TODO|PENDING|TBD/i.test(report)) errors.push('reportExport must not contain placeholder markers.');
  if (!/^#\s+/m.test(report)) errors.push('reportExport must include a markdown title.');
  if (!/^## Sources\s*$/m.test(report)) errors.push('reportExport must include a Sources section.');
  if (!/\]\(https?:\/\//i.test(report)) errors.push('reportExport must include linked source citations.');
}

function validateEvalOutput(path, runId, traceId, errors) {
  let evalOutput;
  try {
    evalOutput = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`evalOutput is not valid JSON: ${error instanceof Error ? error.message : 'Unable to parse.'}`);
    return;
  }

  if (!evalOutput || typeof evalOutput !== 'object' || Array.isArray(evalOutput)) {
    errors.push('evalOutput must be a JSON object.');
    return;
  }
  if (/TODO|PENDING|TBD/i.test(JSON.stringify(evalOutput))) errors.push('evalOutput must not contain placeholder markers.');
  if (evalOutput.passed !== true) errors.push('evalOutput must contain passed: true.');
  if (evalOutput.mode !== 'live') errors.push('evalOutput must come from live proof mode.');
  if (evalOutput.status !== 'ok') errors.push('evalOutput status must be ok.');
  if (!evalOutput.runId) errors.push('evalOutput runId is required.');
  if (evalOutput.runId && evalOutput.runId !== runId) errors.push('evalOutput runId must match manifest runId.');
  if (!evalOutput.traceId) errors.push('evalOutput traceId is required.');
  if (evalOutput.traceId && evalOutput.traceId !== traceId) errors.push('evalOutput traceId must match manifest traceId.');
  if (evalOutput.manifestSha256 && evalOutput.manifestSha256 !== manifestHash()) {
    errors.push('evalOutput manifestSha256 must match the current manifest file.');
  }
}

function validateRunExport(path, manifest, errors) {
  let runExport;
  try {
    runExport = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`runExport is not valid JSON: ${error instanceof Error ? error.message : 'Unable to parse.'}`);
    return;
  }

  if (!runExport || typeof runExport !== 'object' || Array.isArray(runExport)) {
    errors.push('runExport must be a JSON object.');
    return;
  }
  if (/TODO|PENDING|TBD/i.test(JSON.stringify(runExport))) errors.push('runExport must not contain placeholder markers.');
  if (runExport.runId !== manifest.runId) errors.push('runExport runId must match manifest runId.');
  if (runExport.traceId !== manifest.traceId) errors.push('runExport traceId must match manifest traceId.');
  if (!['report_ready', 'completed'].includes(runExport.status)) {
    errors.push('runExport status must be report_ready or completed.');
  }
  if (!runExport.cost || typeof runExport.cost !== 'object') {
    errors.push('runExport cost object is required.');
    return;
  }
  if (runExport.cost.totalUsd !== manifest.cost?.totalUsd) errors.push('runExport cost.totalUsd must match manifest cost.totalUsd.');
  if (runExport.cost.measurementMethod !== manifest.cost?.measurementMethod) {
    errors.push('runExport cost.measurementMethod must match manifest cost.measurementMethod.');
  }
  if (runExport.cost.pricingEffectiveDate !== manifest.cost?.pricingEffectiveDate) {
    errors.push('runExport cost.pricingEffectiveDate must match manifest cost.pricingEffectiveDate.');
  }
}

function validateMediaArtifact(path, errors) {
  const artifactPath = requireLocalArtifact(path, 'screenshotsOrVideo artifact', errors);
  if (!artifactPath) return;

  if (statSync(artifactPath).size > 50_000_000) {
    errors.push(`screenshotsOrVideo artifact must be 50MB or smaller: ${path}`);
  }
  const extension = extname(artifactPath).toLowerCase();
  const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov']);
  if (!allowedExtensions.has(extension)) {
    errors.push(`screenshotsOrVideo artifact must be an image or video file: ${path}`);
  }
  if (statSync(artifactPath).size === 0) {
    errors.push(`screenshotsOrVideo artifact must be nonempty: ${path}`);
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension) && !hasKnownImageSignature(artifactPath, extension)) {
    errors.push(`screenshotsOrVideo image artifact has an invalid file signature: ${path}`);
  }
}

function validateBenchmarkEvidence(path, manifest, errors) {
  requireString(path, 'benchmarkDoc', errors);
  const benchmarkPath = requireLocalArtifact(path, 'benchmarkDoc', errors);
  if (!benchmarkPath) return;

  const benchmark = readFileSync(benchmarkPath, 'utf8');
  const rows = liveRunRows(benchmark);
  const matchingRow = rows.find((row) => row.raw.includes(manifest.runId));
  if (!matchingRow) {
    errors.push('benchmarkDoc Live Run Log must include one row for the recorded runId.');
    return;
  }
  if (/TODO|PENDING|TBD/i.test(matchingRow.raw)) {
    errors.push('benchmarkDoc live demo row must not contain placeholder markers.');
  }

  const rowText = matchingRow.raw;
  const manifestPath = normalizeRelativePath(absoluteManifestPath);
  const requiredReferences = [
    manifest.date,
    manifest.runId,
    manifest.reportExport,
    manifest.evalOutput,
    manifest.runExport,
    manifestPath,
    ...(Array.isArray(manifest.screenshotsOrVideo) ? manifest.screenshotsOrVideo : []),
    String(manifest.cost?.totalUsd),
    manifest.cost?.measurementMethod,
  ].filter((reference) => typeof reference === 'string' && reference.length > 0);

  for (const reference of requiredReferences) {
    if (!rowText.includes(reference)) errors.push(`benchmarkDoc live demo row must reference ${reference}.`);
  }

  if (matchingRow.cells.length < 9) {
    errors.push('benchmarkDoc live demo row must include date, prompt, run ID, models, Exa searches, tokens, cost, eval, and report cells.');
    return;
  }
  if (!matchingRow.cells[3] || /pending/i.test(matchingRow.cells[3])) errors.push('benchmarkDoc live demo row must include model names.');
  if (!positiveIntegerCell(matchingRow.cells[4])) errors.push('benchmarkDoc live demo row must include positive Exa search count.');
  if (!positiveIntegerCell(matchingRow.cells[5])) errors.push('benchmarkDoc live demo row must include positive token count.');
}

function isValidIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isFutureDate(value) {
  if (!isValidIsoDate(value)) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Date.parse(`${value}T00:00:00.000Z`) > todayUtc;
}

function manifestHash() {
  return createHash('sha256').update(readFileSync(absoluteManifestPath)).digest('hex');
}

function hasKnownImageSignature(path, extension) {
  const bytes = readFileSync(path).subarray(0, 12);
  const hex = bytes.toString('hex');
  if (extension === '.png') return hex.startsWith('89504e470d0a1a0a');
  if (extension === '.jpg' || extension === '.jpeg') return hex.startsWith('ffd8ff');
  if (extension === '.gif') return bytes.toString('ascii', 0, 4) === 'GIF8';
  if (extension === '.webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return true;
}

function liveRunRows(markdown) {
  const liveSection = markdown.split(/^## Live Run Log\s*$/m)[1] ?? '';
  const tableBlock = liveSection.split(/^##\s+/m)[0] ?? '';
  return tableBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line) && !/^\|\s*Date\s*\|/i.test(line))
    .map((line) => ({
      raw: line,
      cells: line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    }));
}

function positiveIntegerCell(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  return /^\d+$/.test(normalized) && Number(normalized) > 0;
}

function fail(message, details) {
  console.error(JSON.stringify({ status: 'missing_evidence', message, details }, null, 2));
  process.exit(1);
}
