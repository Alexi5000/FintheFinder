import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type {
  EvalSuiteSummary,
  ResearchApproval,
  ResearchPhase,
  ResearchReport,
  ResearchRun,
  ResearchRunEvent,
  ResearchSession,
  ResearchSource,
  ResearchStatus,
  RunCost,
  RunStatus,
  RunUsage,
} from '@/lib/schemas';
import { env } from '@/lib/config';
import { formatSecretFindings, scanForSecretLikeContent } from '@/lib/secret-scan';
import { runOfflineEval, summarizeEvalResults, type EvalFixture } from '@/server/evals/offline-eval';
import { createSupabaseAdmin } from '@/server/supabase/server';

export type LiveProofStageCost = {
  runId: string;
  traceId: string;
  totalUsd: number;
  measurementMethod: RunCost['measurementMethod'];
  pricingEffectiveDate: string;
  usage: RunUsage;
};

export type LiveProofCost = {
  totalUsd: number;
  measurementMethod: RunCost['measurementMethod'];
  pricingEffectiveDate: string;
  usage: RunUsage;
  stages: {
    research: LiveProofStageCost;
    reporting: LiveProofStageCost;
  };
};

export type LiveDemoManifest = {
  date: string;
  prompt: string;
  sessionId: string;
  researchRunId: string;
  researchTraceId: string;
  reportingRunId: string;
  reportingTraceId: string;
  approvalId: string;
  runId: string;
  traceId: string;
  reportExport: string;
  evalOutput: string;
  runExport: string;
  screenshotsOrVideo: string[];
  benchmarkDoc?: string;
  cost: LiveProofCost;
  provenance?: {
    source?: string;
    exporter?: string;
    exportedAt?: string;
    reportingRunId?: string;
    sessionId?: string;
    supabaseUrl?: string;
    artifactHashes?: Record<string, string>;
  };
};

export type LiveProofEvalOutput = {
  passed: boolean;
  mode: 'live';
  status: 'ok' | 'failed_eval_output';
  runId: string;
  traceId: string;
  scenarioCount: number;
  suite: EvalSuiteSummary;
  scenarios: Array<{
    id: string;
    expected: {
      shouldPass: boolean;
      requirement: string;
    };
    actual: {
      observedPass: boolean;
      scores: EvalSuiteSummary['results'][number]['scores'];
      issues: string[];
      regressions: string[];
    };
  }>;
  issues: string[];
  regressions: string[];
};

export type LiveProofRunExport = {
  sessionId: string;
  status: string;
  researchRun: {
    runId: string;
    traceId: string;
    status: string;
    cost: LiveProofStageCost;
  };
  reportingRun: {
    runId: string;
    traceId: string;
    status: string;
    cost: LiveProofStageCost;
  };
  approval: {
    id: string;
    action: ResearchApproval['action'];
    waivedGapIds: string[];
  };
  finalAudit: {
    id: string;
    runId: string | null;
    auditType: string;
    ok: boolean;
  };
  cost: LiveProofCost;
};

export type LiveProofAudit = {
  id: string;
  sessionId: string;
  runId: string | null;
  auditType: string;
  ok: boolean;
  issues: unknown[];
  createdAt: string;
};

export type LiveProofEvidence = {
  session: ResearchSession;
  researchRun: ResearchRun;
  reportingRun: ResearchRun;
  approval: ResearchApproval;
  finalAudit: LiveProofAudit;
  report: ResearchReport;
  sources: ResearchSource[];
  events: ResearchRunEvent[];
  costs: {
    research: RunCost;
    reporting: RunCost;
  };
  claimGaps: Array<{ id: string; severity: string; status: string }>;
};

export type LiveProofArtifacts = {
  manifest: LiveDemoManifest;
  runExport: LiveProofRunExport;
  evalOutput: LiveProofEvalOutput;
  reportMarkdown: string;
  benchmarkRow: string;
};

type ArtifactFiles = {
  evalOutput?: unknown;
  reportMarkdown?: string;
  runExport?: unknown;
};

type SupabaseRow = Record<string, unknown>;

export async function loadLiveProofEvidenceFromSupabase(reportingRunId: string): Promise<LiveProofEvidence> {
  const supabase = createSupabaseAdmin();
  const reportingRun = mapRunRow(
    await singleRow(
      supabase.from('research_runs').select('*').eq('id', reportingRunId).single(),
      `Reporting run not found: ${reportingRunId}`,
    ),
  );
  const sessionId = reportingRun.sessionId;
  const session = mapSessionRow(
    await singleRow(
      supabase.from('research_sessions').select('*').eq('id', sessionId).single(),
      `Session not found for reporting run: ${sessionId}`,
    ),
  );

  const [runs, approvals, reportRow, costRows, sourceRows, eventRows, gapRows, auditRows] = await Promise.all([
    rows(supabase.from('research_runs').select('*').eq('session_id', sessionId), 'Unable to load session runs.'),
    rows(supabase.from('research_approvals').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }), 'Unable to load approvals.'),
    maybeSingleRow(supabase.from('research_reports').select('*').eq('session_id', sessionId).maybeSingle(), 'Unable to load report.'),
    rows(supabase.from('research_run_costs').select('*').eq('session_id', sessionId), 'Unable to load run costs.'),
    rows(supabase.from('research_sources').select('*').eq('session_id', sessionId), 'Unable to load sources.'),
    rows(supabase.from('research_events').select('*').eq('session_id', sessionId).order('created_at').order('id'), 'Unable to load events.'),
    rows(supabase.from('claim_gaps').select('id,severity,status').eq('session_id', sessionId), 'Unable to load claim gaps.'),
    rows(supabase.from('research_audits').select('*').eq('session_id', sessionId).eq('run_id', reportingRun.id).eq('audit_type', 'final_review').eq('ok', true), 'Unable to load final review audits.'),
  ]);

  if (!reportRow) throw new Error(`Report not found for live proof session: ${sessionId}`);
  const researchRun = selectResearchRun(runs.map(mapRunRow), reportingRun);
  const approval = selectApproval(approvals.map(mapApprovalRow), reportingRun);
  const finalAudit = auditRows.map(mapAuditRow).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!finalAudit) throw new Error(`Final review audit not found for reporting run: ${reportingRun.id}`);
  const costs = costRows.map(mapRunCostRow);
  const researchCost = costs.find((cost) => cost.runId === researchRun.id);
  const reportingCost = costs.find((cost) => cost.runId === reportingRun.id);
  if (!researchCost) throw new Error(`Research run cost not found: ${researchRun.id}`);
  if (!reportingCost) throw new Error(`Reporting run cost not found: ${reportingRun.id}`);

  return {
    session,
    researchRun,
    reportingRun,
    approval,
    finalAudit,
    report: mapReportRow(reportRow),
    sources: sourceRows.map(mapSourceRow),
    events: eventRows.map(mapEventRow),
    costs: {
      research: researchCost,
      reporting: reportingCost,
    },
    claimGaps: gapRows.map((gap) => ({ id: String(gap.id), severity: String(gap.severity), status: String(gap.status) })),
  };
}

export async function verifyLiveProofManifestFromSupabase(manifestPath: string) {
  const manifest = readLiveDemoManifest(manifestPath);
  const provenanceErrors = validateSupabaseProvenance(manifest);
  if (provenanceErrors.length > 0) return { ok: false, errors: provenanceErrors };

  try {
    const evidence = await loadLiveProofEvidenceFromSupabase(manifest.reportingRunId);
    const files = readManifestArtifacts(manifest);
    const errors = validateLiveProofManifestEvidence(manifest, evidence, files);
    return { ok: errors.length === 0, errors };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'Unable to verify live proof against Supabase.'] };
  }
}

export function buildLiveProofArtifacts(
  evidence: LiveProofEvidence,
  options: {
    benchmarkDoc: string;
    date?: string;
    evalOutput: string;
    exportedAt?: string;
    manifestPath: string;
    reportExport: string;
    runExport: string;
    screenshotsOrVideo: string[];
    supabaseUrl?: string;
  },
): LiveProofArtifacts {
  const cost = buildLiveProofCost(evidence);
  const researchTraceId = traceIdForRun(evidence.events, evidence.researchRun.id);
  const reportingTraceId = traceIdForRun(evidence.events, evidence.reportingRun.id);
  const manifest: LiveDemoManifest = {
    date: options.date ?? liveProofDate(evidence),
    prompt: evidence.session.query,
    sessionId: evidence.session.id,
    researchRunId: evidence.researchRun.id,
    researchTraceId,
    reportingRunId: evidence.reportingRun.id,
    reportingTraceId,
    approvalId: evidence.approval.id,
    runId: evidence.reportingRun.id,
    traceId: reportingTraceId,
    reportExport: options.reportExport,
    evalOutput: options.evalOutput,
    runExport: options.runExport,
    screenshotsOrVideo: options.screenshotsOrVideo,
    benchmarkDoc: options.benchmarkDoc,
    cost,
    provenance: {
      source: 'supabase_export',
      exporter: 'scripts/demo-export.ts',
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      reportingRunId: evidence.reportingRun.id,
      sessionId: evidence.session.id,
      supabaseUrl: options.supabaseUrl ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    },
  };
  const runExport = buildLiveProofRunExport(evidence, cost);
  const evalOutput = buildLiveProofEvalOutput(evidence);
  const reportMarkdown = evidence.report.markdown;
  const benchmarkRow = buildBenchmarkRow(manifest, options.manifestPath);
  assertPublicSafeArtifacts({ manifest, runExport, evalOutput, reportMarkdown, benchmarkRow });

  return {
    manifest,
    runExport,
    evalOutput,
    reportMarkdown,
    benchmarkRow,
  };
}

export function attachArtifactHashes(manifest: LiveDemoManifest, hashes: Record<string, string>): LiveDemoManifest {
  return {
    ...manifest,
    provenance: {
      ...manifest.provenance,
      artifactHashes: hashes,
    },
  };
}

export function validateLiveProofManifestEvidence(manifest: LiveDemoManifest, evidence: LiveProofEvidence, files: ArtifactFiles = {}) {
  const errors: string[] = [];
  const expectedCost = buildLiveProofCost(evidence);
  const expectedRunExport = buildLiveProofRunExport(evidence, expectedCost);
  const expectedEval = buildLiveProofEvalOutput(evidence);
  const researchTraceId = traceIdForRun(evidence.events, evidence.researchRun.id);
  const reportingTraceId = traceIdForRun(evidence.events, evidence.reportingRun.id);

  compare('date', manifest.date, liveProofDate(evidence), errors);
  compare('prompt', manifest.prompt, evidence.session.query, errors);
  compare('sessionId', manifest.sessionId, evidence.session.id, errors);
  compare('researchRunId', manifest.researchRunId, evidence.researchRun.id, errors);
  compare('reportingRunId', manifest.reportingRunId, evidence.reportingRun.id, errors);
  compare('approvalId', manifest.approvalId, evidence.approval.id, errors);
  compare('runId', manifest.runId, evidence.reportingRun.id, errors);
  compare('researchTraceId', manifest.researchTraceId, researchTraceId, errors);
  compare('reportingTraceId', manifest.reportingTraceId, reportingTraceId, errors);
  compare('traceId', manifest.traceId, reportingTraceId, errors);
  compareCost('manifest cost', manifest.cost, expectedCost, errors);

  if (evidence.session.status !== 'report_ready') errors.push('Supabase session status must be report_ready.');
  if (evidence.reportingRun.status !== 'completed') errors.push('Supabase reporting run status must be completed.');
  if (!['awaiting_approval', 'completed'].includes(evidence.researchRun.status)) {
    errors.push('Supabase research run status must be awaiting_approval or completed.');
  }
  if (evidence.approval.action !== 'approve') errors.push('Supabase approval action must be approve.');
  if (String(evidence.reportingRun.metadata.stage ?? '') !== 'reporting') errors.push('Supabase reporting run metadata.stage must be reporting.');
  if (String(evidence.reportingRun.metadata.approvalId ?? '') !== evidence.approval.id) errors.push('Supabase reporting run metadata.approvalId must match approval.');
  if (String(evidence.reportingRun.metadata.sourceResearchRunId ?? '') !== evidence.researchRun.id) {
    errors.push('Supabase reporting run metadata.sourceResearchRunId must match research run.');
  }
  if (evidence.finalAudit.runId !== evidence.reportingRun.id || evidence.finalAudit.auditType !== 'final_review' || evidence.finalAudit.ok !== true) {
    errors.push('Supabase final review audit must be approved and bound to the reporting run.');
  }
  const reportReadyEvent = evidence.events.find((event) => event.runId === evidence.reportingRun.id && event.eventType === 'report_ready' && event.stepId === 'report_ready');
  if (!reportReadyEvent) {
    errors.push('Supabase report_ready event must be bound to the reporting run.');
  } else if (String(reportReadyEvent.metadata.reportId ?? '') !== evidence.report.id) {
    errors.push('Supabase report_ready event metadata.reportId must match report.');
  }
  if (evidence.report.sessionId !== evidence.session.id) errors.push('Supabase report must belong to the manifest session.');
  if (evidence.claimGaps.some((gap) => gap.severity === 'critical' && gap.status === 'open')) {
    errors.push('Supabase session still has open critical claim gaps.');
  }

  if (typeof files.reportMarkdown === 'string' && files.reportMarkdown !== evidence.report.markdown) {
    errors.push('reportExport markdown must match the Supabase report markdown exactly.');
  }
  if (files.runExport) {
    compareJson('runExport', files.runExport, expectedRunExport, errors);
  }
  if (files.evalOutput) {
    compareJson('evalOutput', normalizeEvalOutput(files.evalOutput), expectedEval, errors);
  }

  return errors;
}

export function buildLiveProofRunExport(evidence: LiveProofEvidence, cost = buildLiveProofCost(evidence)): LiveProofRunExport {
  return {
    sessionId: evidence.session.id,
    status: evidence.session.status,
    researchRun: {
      runId: evidence.researchRun.id,
      traceId: cost.stages.research.traceId,
      status: evidence.researchRun.status,
      cost: cost.stages.research,
    },
    reportingRun: {
      runId: evidence.reportingRun.id,
      traceId: cost.stages.reporting.traceId,
      status: evidence.reportingRun.status,
      cost: cost.stages.reporting,
    },
    approval: {
      id: evidence.approval.id,
      action: evidence.approval.action,
      waivedGapIds: evidence.approval.waivedGapIds,
    },
    finalAudit: {
      id: evidence.finalAudit.id,
      runId: evidence.finalAudit.runId,
      auditType: evidence.finalAudit.auditType,
      ok: evidence.finalAudit.ok,
    },
    cost,
  };
}

export function buildLiveProofEvalOutput(evidence: LiveProofEvidence): LiveProofEvalOutput {
  const knownSourceIds = new Set(evidence.sources.map((source) => source.id));
  const suite = summarizeEvalResults(liveEvalFixtures(evidence).map(runOfflineEval));
  const issues = [
    ...suite.results.flatMap((result) => result.issues.map((issue) => `${result.id}: ${issue}`)),
    ...evidence.report.sections.flatMap((section) =>
      section.sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId)).map((sourceId) => `Report section "${section.heading}" cites unknown source ${sourceId}.`),
    ),
    ...evidence.report.sections.filter((section) => (section.claimIds?.length ?? 0) === 0).map((section) => `Report section "${section.heading}" has no claim IDs.`),
    ...evidence.claimGaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open').map((gap) => `Critical claim gap remains open: ${gap.id}.`),
  ];
  const regressions = [...suite.results.flatMap((result) => result.regressions.map((regression) => `${result.id}: ${regression}`)), ...issues];
  const passed = suite.passed && issues.length === 0;
  return {
    passed,
    mode: 'live',
    status: passed ? 'ok' : 'failed_eval_output',
    runId: evidence.reportingRun.id,
    traceId: traceIdForRun(evidence.events, evidence.reportingRun.id),
    scenarioCount: suite.total,
    suite,
    scenarios: suite.results.map((result) => ({
      id: result.id,
      expected: {
        shouldPass: result.expectedPass,
        requirement: liveEvalRequirement(result.id),
      },
      actual: {
        observedPass: result.observedPass,
        scores: result.scores,
        issues: result.issues,
        regressions: result.regressions,
      },
    })),
    issues,
    regressions,
  };
}

export function buildLiveProofCost(evidence: LiveProofEvidence): LiveProofCost {
  const researchTraceId = traceIdForRun(evidence.events, evidence.researchRun.id);
  const reportingTraceId = traceIdForRun(evidence.events, evidence.reportingRun.id);
  if (evidence.costs.research.pricingEffectiveDate !== evidence.costs.reporting.pricingEffectiveDate) {
    throw new Error('Research and reporting cost rows must share one pricingEffectiveDate for live proof.');
  }
  const usage = combineUsage(evidence.costs.research.usage, evidence.costs.reporting.usage);
  return {
    totalUsd: roundMoney(evidence.costs.research.totalUsd + evidence.costs.reporting.totalUsd),
    measurementMethod:
      evidence.costs.research.measurementMethod === 'provider_usage' && evidence.costs.reporting.measurementMethod === 'provider_usage'
        ? 'provider_usage'
        : 'estimated',
    pricingEffectiveDate: evidence.costs.research.pricingEffectiveDate,
    usage,
    stages: {
      research: stageCost(evidence.researchRun.id, researchTraceId, evidence.costs.research),
      reporting: stageCost(evidence.reportingRun.id, reportingTraceId, evidence.costs.reporting),
    },
  };
}

export function traceIdForRun(events: ResearchRunEvent[], runId: string) {
  const traceId = events.find((event) => event.runId === runId && event.traceId)?.traceId;
  if (!traceId || !/^[0-9a-f]{32}$/i.test(traceId) || /^0{32}$/.test(traceId)) {
    throw new Error(`Live proof requires a nonzero 32-character trace ID for run ${runId}.`);
  }
  return traceId;
}

export function readLiveDemoManifest(path: string): LiveDemoManifest {
  return JSON.parse(readFileSync(resolvePath(path), 'utf8')) as LiveDemoManifest;
}

export function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(resolvePath(path))).digest('hex');
}

function readManifestArtifacts(manifest: LiveDemoManifest): ArtifactFiles {
  return {
    reportMarkdown: existsSync(resolvePath(manifest.reportExport)) ? readFileSync(resolvePath(manifest.reportExport), 'utf8') : undefined,
    evalOutput: existsSync(resolvePath(manifest.evalOutput)) ? JSON.parse(readFileSync(resolvePath(manifest.evalOutput), 'utf8')) : undefined,
    runExport: existsSync(resolvePath(manifest.runExport)) ? JSON.parse(readFileSync(resolvePath(manifest.runExport), 'utf8')) : undefined,
  };
}

function validateSupabaseProvenance(manifest: LiveDemoManifest) {
  const errors: string[] = [];
  if (manifest.provenance?.source !== 'supabase_export') errors.push('Live manifest provenance.source must be supabase_export.');
  if (manifest.provenance?.exporter !== 'scripts/demo-export.ts') errors.push('Live manifest provenance.exporter must be scripts/demo-export.ts.');
  if (manifest.provenance?.reportingRunId !== manifest.reportingRunId) errors.push('Live manifest provenance.reportingRunId must match reportingRunId.');
  if (manifest.provenance?.sessionId !== manifest.sessionId) errors.push('Live manifest provenance.sessionId must match sessionId.');
  return errors;
}

function buildBenchmarkRow(manifest: LiveDemoManifest, manifestPath: string) {
  const models = [...new Set(manifest.cost.usage.modelCalls.map((call) => call.model))].join(', ');
  const tokens = manifest.cost.usage.modelCalls.reduce((total, call) => total + call.inputTokens + call.outputTokens, 0);
  return `| ${markdownCell(manifest.date)} | ${markdownCell(manifest.prompt)} | ${markdownCell(`session ${manifest.sessionId}; research ${manifest.researchRunId}; reporting ${manifest.reportingRunId}; approval ${manifest.approvalId}; manifest ${manifestPath}`)} | ${markdownCell(models)} | ${manifest.cost.usage.exaSearches} | ${tokens} | ${manifest.cost.totalUsd} ${manifest.cost.measurementMethod} | ${markdownCell(manifest.evalOutput)} | ${markdownCell(`${manifest.reportExport} ${manifest.runExport} ${manifest.screenshotsOrVideo.join(' ')}`)} |`;
}

function selectResearchRun(runs: ResearchRun[], reportingRun: ResearchRun) {
  const sourceResearchRunId = typeof reportingRun.metadata.sourceResearchRunId === 'string' ? reportingRun.metadata.sourceResearchRunId : undefined;
  if (sourceResearchRunId) {
    const sourceRun = runs.find((run) => run.id === sourceResearchRunId && run.sessionId === reportingRun.sessionId);
    if (!sourceRun) throw new Error(`Source research run not found for reporting run metadata.sourceResearchRunId: ${sourceResearchRunId}`);
    return sourceRun;
  }
  const candidates = runs
    .filter((run) => run.id !== reportingRun.id && run.sessionId === reportingRun.sessionId && run.createdAt <= reportingRun.createdAt)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const researchRun = candidates.find((run) => run.metadata.stage !== 'reporting') ?? candidates[0];
  if (!researchRun) throw new Error(`Research run not found for reporting run: ${reportingRun.id}`);
  return researchRun;
}

function selectApproval(approvals: ResearchApproval[], reportingRun: ResearchRun) {
  const approvalId = typeof reportingRun.metadata.approvalId === 'string' ? reportingRun.metadata.approvalId : undefined;
  const approval = approvalId ? approvals.find((candidate) => candidate.id === approvalId) : approvals.find((candidate) => candidate.action === 'approve');
  if (!approval || approval.action !== 'approve') throw new Error(`Approved HITL record not found for live proof session: ${reportingRun.sessionId}`);
  return approval;
}

function stageCost(runId: string, traceId: string, cost: RunCost): LiveProofStageCost {
  return {
    runId,
    traceId,
    totalUsd: cost.totalUsd,
    measurementMethod: cost.measurementMethod,
    pricingEffectiveDate: cost.pricingEffectiveDate,
    usage: cost.usage,
  };
}

function combineUsage(left: RunUsage, right: RunUsage): RunUsage {
  return {
    exaSearches: left.exaSearches + right.exaSearches,
    modelCalls: [...left.modelCalls, ...right.modelCalls],
  };
}

function compare(name: string, actual: unknown, expected: unknown, errors: string[]) {
  if (actual !== expected) errors.push(`${name} must match Supabase evidence.`);
}

function compareCost(name: string, actual: LiveProofCost, expected: LiveProofCost, errors: string[]) {
  compareJson(name, actual, expected, errors);
}

function compareJson(name: string, actual: unknown, expected: unknown, errors: string[]) {
  if (stableStringify(actual) !== stableStringify(expected)) errors.push(`${name} must match Supabase evidence.`);
}

function normalizeEvalOutput(value: unknown) {
  const record = recordFromJson(value);
  return {
    passed: record.passed,
    mode: record.mode,
    status: record.status,
    runId: record.runId,
    traceId: record.traceId,
    scenarioCount: record.scenarioCount ?? record.fixtureCount,
    suite: record.suite,
    scenarios: record.scenarios,
    issues: Array.isArray(record.issues) ? record.issues : [],
    regressions: Array.isArray(record.regressions) ? record.regressions : [],
  };
}

function liveEvalFixtures(evidence: LiveProofEvidence): EvalFixture[] {
  const actual = { report: evidence.report, sources: evidence.sources };
  return [
    {
      id: 'live-citation-integrity',
      prompt: evidence.session.query,
      expected: {
        requiredCaveats: [],
        minimumCitationCoverage: 1,
        forbiddenPhrases: [],
        blockedSourceCredibilities: ['low'],
        shouldPass: true,
        minimumScores: { correctness: 0.9, completeness: 1, quality: 0.7, safety: 0.9 },
      },
      actual,
    },
    {
      id: 'live-claim-traceability',
      prompt: evidence.session.query,
      expected: {
        requiredCaveats: [],
        minimumCitationCoverage: 1,
        forbiddenPhrases: [],
        requireClaimIds: true,
        shouldPass: true,
        minimumScores: { correctness: 0.9, completeness: 1, quality: 0.7, safety: 0.9 },
      },
      actual,
    },
    {
      id: 'live-safety-language',
      prompt: evidence.session.query,
      expected: {
        requiredCaveats: [],
        minimumCitationCoverage: 1,
        forbiddenPhrases: ['risk-free', 'guaranteed approval', 'eliminates all risk', 'ensures compliance', 'final authority', 'no human review required'],
        shouldPass: true,
        minimumScores: { correctness: 0.9, completeness: 1, quality: 0.7, safety: 0.9 },
      },
      actual,
    },
  ];
}

function liveEvalRequirement(id: string) {
  const requirements: Record<string, string> = {
    'live-citation-integrity': 'Every live report section cites known, non-low-credibility sources with full citation coverage.',
    'live-claim-traceability': 'Every live report section preserves claim IDs and full citation coverage.',
    'live-safety-language': 'The live report avoids unsafe certainty and compliance-overclaiming language.',
  };
  return requirements[id] ?? 'Live proof scenario must pass its expected evaluator contract.';
}

function assertPublicSafeArtifacts(artifacts: LiveProofArtifacts) {
  const findings = scanForSecretLikeContent(artifacts, { rootPath: 'liveProofArtifacts' });
  if (findings.length > 0) {
    throw new Error(`Live proof artifacts contain disallowed secret-like content: ${formatSecretFindings(findings)}.`);
  }
}

function liveProofDate(evidence: LiveProofEvidence) {
  return (evidence.reportingRun.completedAt ?? evidence.report.createdAt ?? evidence.reportingRun.updatedAt).slice(0, 10);
}

function markdownCell(value: string) {
  return String(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '&#124;').trim();
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

async function singleRow<T extends SupabaseRow>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, message: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data) throw new Error(message);
  return data;
}

async function maybeSingleRow<T extends SupabaseRow>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, message: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(message);
  return data;
}

async function rows<T extends SupabaseRow>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, message: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${message} ${error.message}`);
  return data ?? [];
}

function mapSessionRow(row: SupabaseRow): ResearchSession {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    query: String(row.query),
    title: String(row.title),
    status: row.status as ResearchStatus,
    phase: row.phase as ResearchPhase,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRunRow(row: SupabaseRow): ResearchRun {
  const metadata = recordFromJson(row.metadata);
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    status: row.status as RunStatus,
    attempt: Number(row.attempt ?? 1),
    currentAttemptId: row.current_attempt_id ? String(row.current_attempt_id) : null,
    metadata,
    workerId: row.worker_id ? String(row.worker_id) : null,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapApprovalRow(row: SupabaseRow): ResearchApproval {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    action: row.action === 'reject' || row.action === 'follow_up' ? row.action : 'approve',
    notes: row.notes ? String(row.notes) : null,
    approvedSourceIds: stringArrayFromJson(row.approved_source_ids),
    waivedGapIds: stringArrayFromJson(row.waived_gap_ids),
    createdAt: String(row.created_at),
  };
}

function mapRunCostRow(row: SupabaseRow): RunCost {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    sessionId: String(row.session_id),
    usage: (row.usage as RunUsage | null) ?? { modelCalls: [], exaSearches: 0 },
    modelCostUsd: Number(row.model_cost_usd ?? 0),
    searchCostUsd: Number(row.search_cost_usd ?? 0),
    totalUsd: Number(row.total_usd ?? 0),
    pricingEffectiveDate: String(row.pricing_effective_date),
    measurementMethod: row.measurement_method === 'provider_usage' ? 'provider_usage' : 'estimated',
    createdAt: String(row.created_at),
  };
}

function mapAuditRow(row: SupabaseRow): LiveProofAudit {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    runId: row.run_id ? String(row.run_id) : null,
    auditType: String(row.audit_type),
    ok: row.ok === true,
    issues: arrayFromJson<unknown>(row.issues),
    createdAt: String(row.created_at),
  };
}

function mapReportRow(row: SupabaseRow): ResearchReport {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    title: String(row.title),
    executiveSummary: String(row.executive_summary),
    sections: arrayFromJson<ResearchReport['sections'][number]>(row.sections),
    citations: arrayFromJson<ResearchReport['citations'][number]>(row.citations),
    markdown: String(row.markdown),
    createdAt: String(row.created_at),
  };
}

function mapSourceRow(row: SupabaseRow): ResearchSource {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    canonicalUrl: String(row.canonical_url),
    domain: String(row.domain),
    snippet: String(row.snippet ?? ''),
    content: String(row.content ?? ''),
    publishedAt: row.published_at ? String(row.published_at) : null,
    score: Number(row.score ?? 0),
    credibility: row.credibility === 'high' || row.credibility === 'medium' || row.credibility === 'low' ? row.credibility : 'unknown',
    relevanceReason: String(row.relevance_reason ?? ''),
  };
}

function mapEventRow(row: SupabaseRow): ResearchRunEvent {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    runId: row.run_id ? String(row.run_id) : undefined,
    attemptId: row.attempt_id ? String(row.attempt_id) : undefined,
    phase: row.phase as ResearchPhase,
    eventType: row.event_type ? (row.event_type as ResearchRunEvent['eventType']) : undefined,
    severity: row.severity ? (row.severity as ResearchRunEvent['severity']) : undefined,
    actor: row.actor ? (row.actor as ResearchRunEvent['actor']) : undefined,
    stepId: row.step_id ? String(row.step_id) : undefined,
    message: String(row.message),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms),
    traceId: row.trace_id ? String(row.trace_id) : undefined,
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
    metadata: recordFromJson(row.metadata),
    createdAt: String(row.created_at),
  };
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function arrayFromJson<Item>(value: unknown): Item[] {
  return Array.isArray(value) ? (value as Item[]) : [];
}

function recordFromJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function roundMoney(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function resolvePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}
