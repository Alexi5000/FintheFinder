import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const manifestPath = process.argv[2] ?? 'docs/demo/live-demo.json';
const absoluteManifestPath = resolvePath(manifestPath);

if (!existsSync(absoluteManifestPath)) {
  fail(`Demo evidence manifest not found: ${manifestPath}`, [
    'Copy docs/demo/live-demo.example.json to docs/demo/live-demo.json after recording a configured run.',
    'Fill sessionId, researchRunId, reportingRunId, approvalId, traces, report export, run export, screenshot or video, eval output, benchmark row, and cost evidence.',
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
      sessionId: manifest.sessionId,
      researchRunId: manifest.researchRunId,
      reportingRunId: manifest.reportingRunId,
      approvalId: manifest.approvalId,
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
  requireString(value.sessionId, 'sessionId', errors, {
    pattern: uuidPattern(),
    placeholder: zeroUuidPattern(),
  });
  requireString(value.researchRunId, 'researchRunId', errors, {
    pattern: uuidPattern(),
    placeholder: zeroUuidPattern(),
  });
  requireString(value.reportingRunId, 'reportingRunId', errors, {
    pattern: uuidPattern(),
    placeholder: zeroUuidPattern(),
  });
  requireString(value.runId, 'runId', errors, {
    pattern: uuidPattern(),
    placeholder: zeroUuidPattern(),
  });
  if (typeof value.runId === 'string' && typeof value.reportingRunId === 'string' && value.runId !== value.reportingRunId) {
    errors.push('runId must match reportingRunId so legacy live-eval output points at the final reporting run.');
  }
  if (typeof value.researchRunId === 'string' && typeof value.reportingRunId === 'string' && value.researchRunId === value.reportingRunId) {
    errors.push('researchRunId and reportingRunId must be distinct runs from the same demo session.');
  }
  requireString(value.approvalId, 'approvalId', errors, {
    pattern: uuidPattern(),
    placeholder: zeroUuidPattern(),
  });
  requireString(value.researchTraceId, 'researchTraceId', errors, {
    pattern: tracePattern(),
    placeholder: zeroTracePattern(),
  });
  requireString(value.reportingTraceId, 'reportingTraceId', errors, {
    pattern: tracePattern(),
    placeholder: zeroTracePattern(),
  });
  requireString(value.traceId, 'traceId', errors, {
    pattern: tracePattern(),
    placeholder: zeroTracePattern(),
  });
  if (typeof value.traceId === 'string' && typeof value.reportingTraceId === 'string' && value.traceId !== value.reportingTraceId) {
    errors.push('traceId must match reportingTraceId so legacy live-eval output points at the final reporting run.');
  }
  requireString(value.reportExport, 'reportExport', errors);
  requireString(value.evalOutput, 'evalOutput', errors);
  requireString(value.runExport, 'runExport', errors);

  const reportPath = requireLocalArtifact(value.reportExport, 'reportExport', errors);
  if (reportPath) validateReportArtifact(reportPath, errors);

  const evalOutputPath = requireLocalArtifact(value.evalOutput, 'evalOutput', errors);
  if (evalOutputPath) validateEvalOutput(evalOutputPath, value, errors);

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
    validateCostEvidence(value.cost, 'cost', errors, { requireUsage: true, requireStages: true, manifest: value });
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

function validateEvalOutput(path, manifest, errors) {
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
  if (evalOutput.runId && evalOutput.runId !== manifest.reportingRunId) errors.push('evalOutput runId must match manifest reportingRunId.');
  if (!evalOutput.traceId) errors.push('evalOutput traceId is required.');
  if (evalOutput.traceId && evalOutput.traceId !== manifest.reportingTraceId) errors.push('evalOutput traceId must match manifest reportingTraceId.');
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
  if (runExport.sessionId !== manifest.sessionId) errors.push('runExport sessionId must match manifest sessionId.');
  if (!['report_ready', 'completed'].includes(runExport.status)) {
    errors.push('runExport status must be report_ready or completed.');
  }
  if (!runExport.researchRun || typeof runExport.researchRun !== 'object') {
    errors.push('runExport researchRun object is required.');
  } else {
    if (runExport.researchRun.runId !== manifest.researchRunId) errors.push('runExport researchRun.runId must match manifest researchRunId.');
    if (runExport.researchRun.traceId !== manifest.researchTraceId) errors.push('runExport researchRun.traceId must match manifest researchTraceId.');
    if (!['awaiting_approval', 'completed'].includes(runExport.researchRun.status)) {
      errors.push('runExport researchRun.status must be awaiting_approval or completed.');
    }
  }
  if (!runExport.reportingRun || typeof runExport.reportingRun !== 'object') {
    errors.push('runExport reportingRun object is required.');
  } else {
    if (runExport.reportingRun.runId !== manifest.reportingRunId) errors.push('runExport reportingRun.runId must match manifest reportingRunId.');
    if (runExport.reportingRun.traceId !== manifest.reportingTraceId) errors.push('runExport reportingRun.traceId must match manifest reportingTraceId.');
    if (!['completed', 'report_ready'].includes(runExport.reportingRun.status)) {
      errors.push('runExport reportingRun.status must be completed or report_ready.');
    }
  }
  if (!runExport.approval || typeof runExport.approval !== 'object') {
    errors.push('runExport approval object is required.');
  } else {
    if (runExport.approval.id !== manifest.approvalId) errors.push('runExport approval.id must match manifest approvalId.');
    if (runExport.approval.action !== 'approve') errors.push('runExport approval.action must be approve.');
  }
  if (!runExport.cost || typeof runExport.cost !== 'object') {
    errors.push('runExport cost object is required.');
    return;
  }
  validateCostEvidence(runExport.cost, 'runExport cost', errors, { requireUsage: true, requireStages: true, manifest });
  compareCostEvidence(runExport.cost, manifest.cost, 'runExport cost', 'manifest cost', errors);
  compareCostEvidence(runExport.researchRun?.cost, manifest.cost?.stages?.research, 'runExport researchRun.cost', 'manifest cost.stages.research', errors);
  compareCostEvidence(runExport.reportingRun?.cost, manifest.cost?.stages?.reporting, 'runExport reportingRun.cost', 'manifest cost.stages.reporting', errors);
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
  const matchingRow = rows.find((row) => row.raw.includes(manifest.reportingRunId));
  if (!matchingRow) {
    errors.push('benchmarkDoc Live Run Log must include one row for the recorded reportingRunId.');
    return;
  }
  if (/TODO|PENDING|TBD/i.test(matchingRow.raw)) {
    errors.push('benchmarkDoc live demo row must not contain placeholder markers.');
  }

  const rowText = matchingRow.raw;
  const manifestPath = normalizeRelativePath(absoluteManifestPath);
  const requiredReferences = [
    manifest.date,
    manifest.sessionId,
    manifest.researchRunId,
    manifest.reportingRunId,
    manifest.approvalId,
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
    errors.push('benchmarkDoc live demo row must include date, prompt, session/run IDs, models, Exa searches, tokens, cost, eval, and report cells.');
    return;
  }
  if (!matchingRow.cells[3] || /pending/i.test(matchingRow.cells[3])) errors.push('benchmarkDoc live demo row must include model names.');
  if (!positiveIntegerCell(matchingRow.cells[4])) {
    errors.push('benchmarkDoc live demo row must include positive Exa search count.');
  } else if (Number(matchingRow.cells[4].replace(/,/g, '')) !== usageExaSearches(manifest.cost?.usage)) {
    errors.push('benchmarkDoc Exa search count must match manifest cost.usage.exaSearches.');
  }
  if (!positiveIntegerCell(matchingRow.cells[5])) {
    errors.push('benchmarkDoc live demo row must include positive token count.');
  } else if (Number(matchingRow.cells[5].replace(/,/g, '')) !== usageTotalTokens(manifest.cost?.usage)) {
    errors.push('benchmarkDoc token count must match manifest cost.usage model tokens.');
  }
  const expectedModels = usageModels(manifest.cost?.usage);
  for (const model of expectedModels) {
    if (!matchingRow.cells[3].includes(model)) errors.push(`benchmarkDoc model cell must include ${model}.`);
  }
  const benchmarkCost = numberFromCell(matchingRow.cells[6]);
  if (benchmarkCost === null || benchmarkCost !== manifest.cost?.totalUsd) {
    errors.push('benchmarkDoc cost cell must match manifest cost.totalUsd.');
  }
  if (!matchingRow.cells[6].includes(manifest.cost?.measurementMethod ?? '')) {
    errors.push('benchmarkDoc cost cell must include manifest cost.measurementMethod.');
  }
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

function uuidPattern() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}

function zeroUuidPattern() {
  return /^0{8}-0{4}-0{4}-0{4}-0{12}$/i;
}

function tracePattern() {
  return /^[0-9a-f]{32}$/i;
}

function zeroTracePattern() {
  return /^0{32}$/i;
}

function validateCostEvidence(cost, name, errors, options = {}) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) {
    errors.push(`${name} must be an object.`);
    return;
  }
  if (typeof cost.totalUsd !== 'number' || !Number.isFinite(cost.totalUsd) || cost.totalUsd <= 0) {
    errors.push(`${name}.totalUsd must be a positive finite number from the recorded run.`);
  }
  if (!['estimated', 'provider_usage'].includes(cost.measurementMethod)) {
    errors.push(`${name}.measurementMethod must be estimated or provider_usage.`);
  }
  requireString(cost.pricingEffectiveDate, `${name}.pricingEffectiveDate`, errors, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
  if (typeof cost.pricingEffectiveDate === 'string' && !isValidIsoDate(cost.pricingEffectiveDate)) {
    errors.push(`${name}.pricingEffectiveDate must be a valid ISO calendar date.`);
  }
  if (options.requireUsage) validateUsage(cost.usage, `${name}.usage`, errors);
  if (options.requireStages) validateStageCosts(cost, name, options.manifest, errors);
}

function validateUsage(usage, name, errors) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    errors.push(`${name} object is required.`);
    return;
  }
  if (!Number.isInteger(usage.exaSearches) || usage.exaSearches < 0) {
    errors.push(`${name}.exaSearches must be a nonnegative integer.`);
  }
  if (!Array.isArray(usage.modelCalls) || usage.modelCalls.length === 0) {
    errors.push(`${name}.modelCalls must include at least one model call.`);
    return;
  }
  usage.modelCalls.forEach((call, index) => {
    const prefix = `${name}.modelCalls[${index}]`;
    if (!call || typeof call !== 'object' || Array.isArray(call)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    requireString(call.model, `${prefix}.model`, errors);
    if (!Number.isInteger(call.inputTokens) || call.inputTokens < 0) errors.push(`${prefix}.inputTokens must be a nonnegative integer.`);
    if (!Number.isInteger(call.outputTokens) || call.outputTokens < 0) errors.push(`${prefix}.outputTokens must be a nonnegative integer.`);
    if ((call.inputTokens ?? 0) + (call.outputTokens ?? 0) <= 0) errors.push(`${prefix} must include positive token usage.`);
  });
}

function validateStageCosts(cost, name, manifest, errors) {
  if (!cost.stages || typeof cost.stages !== 'object' || Array.isArray(cost.stages)) {
    errors.push(`${name}.stages object is required.`);
    return;
  }
  const stages = [
    ['research', manifest?.researchRunId, manifest?.researchTraceId],
    ['reporting', manifest?.reportingRunId, manifest?.reportingTraceId],
  ];
  for (const [stage, expectedRunId, expectedTraceId] of stages) {
    const stageCost = cost.stages[stage];
    if (!stageCost || typeof stageCost !== 'object' || Array.isArray(stageCost)) {
      errors.push(`${name}.stages.${stage} object is required.`);
      continue;
    }
    if (stageCost.runId !== expectedRunId) errors.push(`${name}.stages.${stage}.runId must match manifest ${stage} run ID.`);
    if (stageCost.traceId !== expectedTraceId) errors.push(`${name}.stages.${stage}.traceId must match manifest ${stage} trace ID.`);
    validateCostEvidence(stageCost, `${name}.stages.${stage}`, errors, { requireUsage: true });
  }

  const stageTotalUsd = roundMoney((cost.stages.research?.totalUsd ?? 0) + (cost.stages.reporting?.totalUsd ?? 0));
  if (Number.isFinite(cost.totalUsd) && roundMoney(cost.totalUsd) !== stageTotalUsd) {
    errors.push(`${name}.totalUsd must equal research plus reporting stage costs.`);
  }
  const aggregateUsage = combineUsage([cost.stages.research?.usage, cost.stages.reporting?.usage]);
  if (cost.usage && usageExaSearches(cost.usage) !== aggregateUsage.exaSearches) {
    errors.push(`${name}.usage.exaSearches must equal research plus reporting stage searches.`);
  }
  if (cost.usage && usageTotalTokens(cost.usage) !== usageTotalTokens(aggregateUsage)) {
    errors.push(`${name}.usage model tokens must equal research plus reporting stage tokens.`);
  }
}

function compareCostEvidence(left, right, leftName, rightName, errors) {
  if (!left || !right) {
    errors.push(`${leftName} must match ${rightName}.`);
    return;
  }
  if (left.totalUsd !== right.totalUsd) errors.push(`${leftName}.totalUsd must match ${rightName}.totalUsd.`);
  if (left.measurementMethod !== right.measurementMethod) errors.push(`${leftName}.measurementMethod must match ${rightName}.measurementMethod.`);
  if (left.pricingEffectiveDate !== right.pricingEffectiveDate) errors.push(`${leftName}.pricingEffectiveDate must match ${rightName}.pricingEffectiveDate.`);
  if (usageExaSearches(left.usage) !== usageExaSearches(right.usage)) errors.push(`${leftName}.usage.exaSearches must match ${rightName}.usage.exaSearches.`);
  if (usageTotalTokens(left.usage) !== usageTotalTokens(right.usage)) errors.push(`${leftName}.usage model tokens must match ${rightName}.usage model tokens.`);
}

function usageExaSearches(usage) {
  return Number.isInteger(usage?.exaSearches) ? usage.exaSearches : 0;
}

function usageTotalTokens(usage) {
  if (!usage || !Array.isArray(usage.modelCalls)) return 0;
  return usage.modelCalls.reduce((total, call) => total + (Number(call?.inputTokens) || 0) + (Number(call?.outputTokens) || 0), 0);
}

function usageModels(usage) {
  if (!usage || !Array.isArray(usage.modelCalls)) return [];
  return [...new Set(usage.modelCalls.map((call) => call?.model).filter((model) => typeof model === 'string' && model.length > 0))];
}

function combineUsage(usages) {
  return {
    exaSearches: usages.reduce((total, usage) => total + usageExaSearches(usage), 0),
    modelCalls: usages.flatMap((usage) => (Array.isArray(usage?.modelCalls) ? usage.modelCalls : [])),
  };
}

function roundMoney(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function numberFromCell(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function fail(message, details) {
  console.error(JSON.stringify({ status: 'missing_evidence', message, details }, null, 2));
  process.exit(1);
}
