import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  attachArtifactHashes,
  buildLiveProofArtifacts,
  loadLiveProofEvidenceFromSupabase,
  sha256File,
  type LiveProofEvidence,
} from '../src/server/demo/live-proof';

type DemoExportDependencies = {
  loadEvidence: (reportingRunId: string) => Promise<LiveProofEvidence>;
};

export async function runDemoExport(args = process.argv.slice(2), dependencies: DemoExportDependencies = { loadEvidence: loadLiveProofEvidenceFromSupabase }) {
  const reportingRunId = flagValue(args, '--reporting-run-id');
  if (!reportingRunId) {
    throw new Error('Missing --reporting-run-id. Pass the completed reporting run ID from the configured Supabase run.');
  }

  const manifestPath = flagValue(args, '--manifest') ?? 'docs/demo/live-demo.json';
  const artifactDir = flagValue(args, '--artifacts') ?? 'docs/demo/artifacts';
  const benchmarkPath = flagValue(args, '--benchmark') ?? 'docs/BENCHMARK.md';
  const updateBenchmark = args.includes('--update-benchmark');
  const media = flagValues(args, '--media');
  if (media.length === 0) {
    throw new Error('Missing --media. Attach at least one recorded screenshot or video artifact for the live demo proof.');
  }

  const reportPath = join(artifactDir, 'report.md');
  const evalPath = join(artifactDir, 'eval-summary.json');
  const runExportPath = join(artifactDir, 'run-export.json');

  mkdirSync(resolvePath(artifactDir), { recursive: true });
  mkdirSync(dirname(resolvePath(manifestPath)), { recursive: true });

  const evidence = await dependencies.loadEvidence(reportingRunId);
  const artifacts = buildLiveProofArtifacts(evidence, {
    benchmarkDoc: normalizeRelativePath(benchmarkPath),
    evalOutput: normalizeRelativePath(evalPath),
    manifestPath: normalizeRelativePath(manifestPath),
    reportExport: normalizeRelativePath(reportPath),
    runExport: normalizeRelativePath(runExportPath),
    screenshotsOrVideo: media.map(normalizeRelativePath),
  });

  writeFileSync(resolvePath(reportPath), artifacts.reportMarkdown);
  writeFileSync(resolvePath(evalPath), `${JSON.stringify(artifacts.evalOutput, null, 2)}\n`);
  writeFileSync(resolvePath(runExportPath), `${JSON.stringify(artifacts.runExport, null, 2)}\n`);

  const manifest = attachArtifactHashes(artifacts.manifest, {
    [normalizeRelativePath(reportPath)]: sha256File(reportPath),
    [normalizeRelativePath(evalPath)]: sha256File(evalPath),
    [normalizeRelativePath(runExportPath)]: sha256File(runExportPath),
    ...Object.fromEntries(media.map((path) => [normalizeRelativePath(path), sha256File(path)])),
  });
  writeFileSync(resolvePath(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);

  if (updateBenchmark) {
    writeFileSync(resolvePath(benchmarkPath), updateBenchmarkLiveRow(readFileSync(resolvePath(benchmarkPath), 'utf8'), artifacts.benchmarkRow));
  }

  return {
    status: 'ok',
    manifest: normalizeRelativePath(manifestPath),
    reportExport: normalizeRelativePath(reportPath),
    evalOutput: normalizeRelativePath(evalPath),
    runExport: normalizeRelativePath(runExportPath),
    benchmarkUpdated: updateBenchmark,
    reportingRunId,
    sessionId: evidence.session.id,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const summary = await runDemoExport();
  console.log(JSON.stringify(summary, null, 2));
}

function flagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value after ${flag}.`);
  return value;
}

function flagValues(args: string[], flag: string) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value after ${flag}.`);
      values.push(value);
    }
  }
  return values;
}

function updateBenchmarkLiveRow(markdown: string, row: string) {
  const lines = markdown.split(/\r?\n/);
  const liveHeaderIndex = lines.findIndex((line) => /^## Live Run Log\s*$/.test(line));
  if (liveHeaderIndex < 0) throw new Error('docs/BENCHMARK.md is missing the Live Run Log section.');
  const pendingRowIndex = lines.findIndex((line, index) => index > liveHeaderIndex && /^\|\s*Pending\s*\|/i.test(line));
  if (pendingRowIndex >= 0) {
    lines[pendingRowIndex] = row;
    return `${lines.join('\n')}\n`;
  }
  const tableEndIndex = lines.findIndex((line, index) => index > liveHeaderIndex && line.trim() === '');
  const insertIndex = tableEndIndex > liveHeaderIndex ? tableEndIndex : lines.length;
  lines.splice(insertIndex, 0, row);
  return `${lines.join('\n')}\n`;
}

function resolvePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

function normalizeRelativePath(path: string) {
  return relative(process.cwd(), resolvePath(path)).replace(/\\/g, '/');
}
