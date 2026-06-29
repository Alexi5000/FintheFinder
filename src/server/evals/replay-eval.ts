import { z } from 'zod';
import type {
  ApprovalRequest,
  ClaimAudit,
  ClaimEvidence,
  ClaimGap,
  ResearchApproval,
  ResearchClaim,
  ResearchLearning,
  ResearchMemory,
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
  SourceEvaluation,
} from '@/lib/schemas';
import { estimateRunCost } from '@/server/research/cost-model';
import { runApprovedReportSession, runResearchSession, type PipelineDependencyOverrides } from '@/server/research/pipeline';
import { processNextRun, type WorkerConfig, type WorkerDependencies } from '@/worker/research-worker-runtime';
import { runOfflineEval, summarizeEvalResults, type EvalFixture } from './offline-eval';

const fixedNow = '2026-06-25T00:00:00.000Z';
const scenarioId = 'approved-reporting-happy-path';

const ids = {
  session: '10000000-0000-4000-8000-000000000001',
  user: '10000000-0000-4000-8000-000000000002',
  researchRun: '10000000-0000-4000-8000-000000000003',
  researchAttempt: '10000000-0000-4000-8000-000000000004',
  reportingRun: '10000000-0000-4000-8000-000000000005',
  reportingAttempt: '10000000-0000-4000-8000-000000000006',
  approval: '10000000-0000-4000-8000-000000000007',
  report: '10000000-0000-4000-8000-000000000008',
  correlation: 'corr_replay_001',
};

const replayEventSchema = z.object({
  phase: z.string(),
  eventType: z.string().optional(),
  stepId: z.string().optional(),
  runId: z.string().optional(),
  attemptId: z.string().optional(),
});

const replayAssertionSchema = z.object({
  id: z.string().min(1),
  passed: z.boolean(),
  details: z.string().optional(),
});

const replaySummaryBaseSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('credential_free_orchestration_replay'),
  passed: z.boolean(),
  scenarioId: z.literal(scenarioId),
  commands: z.array(z.string()).min(1),
  coverage: z.array(z.string()).min(1),
  ids: z.object({
    sessionId: z.string(),
    researchRunId: z.string(),
    approvalId: z.string(),
    reportingRunId: z.string(),
  }),
  assertions: z.array(replayAssertionSchema).min(1),
  artifactCounts: z.object({
    sources: z.number().int().nonnegative(),
    evaluations: z.number().int().nonnegative(),
    learnings: z.number().int().nonnegative(),
    claims: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    reports: z.number().int().nonnegative(),
  }),
  cost: z.object({
    researchExaSearches: z.number().int().nonnegative(),
    researchModelCalls: z.number().int().nonnegative(),
    reportingModelCalls: z.number().int().nonnegative(),
    totalModelCalls: z.number().int().nonnegative(),
    measurementMethods: z.array(z.string()).min(1),
  }),
  events: z.object({
    total: z.number().int().nonnegative(),
    lineage: z.array(replayEventSchema),
  }),
  evals: z.object({
    passed: z.boolean(),
    total: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    results: z.array(z.object({
      id: z.string(),
      passed: z.boolean(),
      observedPass: z.boolean(),
      regressions: z.array(z.string()),
      issues: z.array(z.string()),
      scores: z.object({
        correctness: z.number(),
        safety: z.number(),
        completeness: z.number(),
        quality: z.number(),
      }),
    })),
  }),
  providerBoundary: z.object({
    liveOpenAiCalls: z.literal(0),
    liveExaCalls: z.literal(0),
    liveSupabaseCalls: z.literal(0),
    deterministicAgentCalls: z.number().int().nonnegative(),
    deterministicSearchCalls: z.number().int().nonnegative(),
  }),
  issues: z.array(z.string()),
  regressions: z.array(z.string()),
  limits: z.array(z.string()).min(1),
});

export const orchestrationReplaySummarySchema = replaySummaryBaseSchema.superRefine((summary, ctx) => {
  const expectedPassed =
    summary.assertions.every((assertion) => assertion.passed) &&
    summary.evals.passed &&
    summary.issues.length === 0 &&
    summary.regressions.length === 0;

  if (summary.passed !== expectedPassed) {
    ctx.addIssue({
      code: 'custom',
      path: ['passed'],
      message: 'Replay summary passed flag must match assertions, eval result, issues, and regressions.',
    });
  }
});

export type OrchestrationReplaySummary = z.infer<typeof orchestrationReplaySummarySchema>;

type ReplayAssertion = z.infer<typeof replayAssertionSchema>;

type ResearchArtifacts = {
  sources: ResearchSource[];
  evaluations: SourceEvaluation[];
  learnings: ResearchLearning[];
  events: ResearchRunEvent[];
  report: ResearchReport | null;
  claims: ResearchClaim[];
  gaps: ClaimGap[];
};

type ResearchArtifactReplacement = {
  sources: ResearchSource[];
  evaluations: SourceEvaluation[];
  learnings: ResearchLearning[];
  claims?: ResearchClaim[];
  claimEvidence?: ClaimEvidence[];
  claimGaps?: ClaimGap[];
  audits?: Array<{ runId?: string; auditType: string; audit: ClaimAudit | { ok: boolean; issues: string[] } }>;
  report?: ResearchReport;
};

type ArtifactFence = {
  runId: string;
  attemptId: string;
  workerId: string;
};

type PublicationContext = {
  runId?: string;
  attemptId?: string;
  workerId?: string;
  correlationId?: string;
};

type StoredAudit = {
  id: string;
  sessionId: string;
  runId?: string;
  auditType: string;
  ok: boolean;
  issues: string[];
  createdAt: string;
};

type ReplayStore = {
  session: ResearchSession;
  runs: Map<string, ResearchRun>;
  queuedRunIds: string[];
  sources: ResearchSource[];
  evaluations: SourceEvaluation[];
  learnings: ResearchLearning[];
  claims: ResearchClaim[];
  claimEvidence: ClaimEvidence[];
  gaps: ClaimGap[];
  audits: StoredAudit[];
  approvals: ResearchApproval[];
  report: ResearchReport | null;
  events: ResearchRunEvent[];
  costs: RunCost[];
  memories: ResearchMemory[];
  warnings: Array<{ message: string; metadata: Record<string, unknown> }>;
  agentCalls: string[];
  searchQueries: string[];
  artifactFences: Array<ArtifactFence | undefined>;
  publicationContexts: PublicationContext[];
  directReportReadyStateWrites: number;
};

export async function runOrchestrationReplayEval(): Promise<OrchestrationReplaySummary> {
  const store = createReplayStore();
  const pipelineDependencies = createPipelineDependencies(store);
  const workerDependencies = createWorkerDependencies(store, pipelineDependencies);
  const config = replayWorkerConfig();

  const researchProcessed = await processNextRun(config, workerDependencies);
  const reportBeforeApproval = store.report;
  const researchRunAfterWorker = store.runs.get(ids.researchRun);
  const sessionAfterResearch = { ...store.session };
  const approvalDecision = recordApprovalDecision(store, ids.user, ids.session, {
    action: 'approve',
    notes: 'Credential-free replay approval.',
    approvedSourceIds: store.sources.map((source) => source.id),
    waivedGapIds: [],
  });
  const reportingProcessed = await processNextRun(config, workerDependencies);

  const evalSummary = summarizeEvalResults([runOfflineEval(replayFixture(store))]);
  const assertions = buildAssertions(store, {
    approvalDecision,
    reportBeforeApproval,
    reportingProcessed,
    researchProcessed,
    researchRunAfterWorker,
    sessionAfterResearch,
  });
  const issues = assertions.filter((assertion) => !assertion.passed).map((assertion) => `${assertion.id}: ${assertion.details ?? 'failed'}`);
  const regressions = evalSummary.results.flatMap((result) => result.regressions);

  const researchCost = store.costs.find((cost) => cost.runId === ids.researchRun);
  const reportingCost = store.costs.find((cost) => cost.runId === ids.reportingRun);
  const summary = {
    schemaVersion: 1,
    mode: 'credential_free_orchestration_replay',
    passed: issues.length === 0 && regressions.length === 0 && evalSummary.passed,
    scenarioId,
    commands: ['npm run evals:replay'],
    coverage: ['processNextRun', 'runResearchSession', 'approvalDecision', 'runApprovedReportSession', 'publishReport'],
    ids: {
      sessionId: ids.session,
      researchRunId: ids.researchRun,
      approvalId: ids.approval,
      reportingRunId: ids.reportingRun,
    },
    assertions,
    artifactCounts: {
      sources: store.sources.length,
      evaluations: store.evaluations.length,
      learnings: store.learnings.length,
      claims: store.claims.length,
      approvals: store.approvals.length,
      reports: store.report ? 1 : 0,
    },
    cost: {
      researchExaSearches: researchCost?.usage.exaSearches ?? 0,
      researchModelCalls: researchCost?.usage.modelCalls.length ?? 0,
      reportingModelCalls: reportingCost?.usage.modelCalls.length ?? 0,
      totalModelCalls: store.costs.reduce((total, cost) => total + cost.usage.modelCalls.length, 0),
      measurementMethods: [...new Set(store.costs.map((cost) => cost.measurementMethod))],
    },
    events: {
      total: store.events.length,
      lineage: store.events.map((event) => ({
        phase: event.phase,
        eventType: event.eventType,
        stepId: event.stepId,
        runId: event.runId,
        attemptId: event.attemptId,
      })),
    },
    evals: evalSummary,
    providerBoundary: {
      liveOpenAiCalls: 0,
      liveExaCalls: 0,
      liveSupabaseCalls: 0,
      deterministicAgentCalls: store.agentCalls.length,
      deterministicSearchCalls: store.searchQueries.length,
    },
    issues,
    regressions,
    limits: [
      'Does not prove live provider quality, Supabase RLS, hosted auth, or measured live cost.',
      'Uses deterministic in-memory adapters to prove orchestration and state-machine behavior without credentials.',
    ],
  } satisfies OrchestrationReplaySummary;

  return orchestrationReplaySummarySchema.parse(summary);
}

function createReplayStore(): ReplayStore {
  const session: ResearchSession = {
    id: ids.session,
    userId: ids.user,
    query: 'Research practical uses of AI agents in compliance-heavy financial services.',
    title: 'AI Agent Compliance Research',
    status: 'queued',
    phase: 'planning',
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
  const researchRun: ResearchRun = {
    id: ids.researchRun,
    sessionId: ids.session,
    status: 'queued',
    attempt: 1,
    currentAttemptId: null,
    metadata: { stage: 'research' },
    workerId: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    error: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };

  return {
    session,
    runs: new Map([[researchRun.id, researchRun]]),
    queuedRunIds: [researchRun.id],
    sources: [],
    evaluations: [],
    learnings: [],
    claims: [],
    claimEvidence: [],
    gaps: [],
    audits: [],
    approvals: [],
    report: null,
    events: [],
    costs: [],
    memories: [],
    warnings: [],
    agentCalls: [],
    searchQueries: [],
    artifactFences: [],
    publicationContexts: [],
    directReportReadyStateWrites: 0,
  };
}

function createPipelineDependencies(store: ReplayStore): PipelineDependencyOverrides {
  const repository = {
    addEvent: async (
      sessionId: string,
      phase: ResearchPhase,
      message: string,
      metadata: Record<string, unknown> = {},
      options: Partial<Pick<ResearchRunEvent, 'runId' | 'attemptId' | 'eventType' | 'severity' | 'actor' | 'stepId' | 'durationMs' | 'traceId' | 'correlationId'>> = {},
    ) => {
      const event: ResearchRunEvent = {
        id: `event_${String(store.events.length + 1).padStart(2, '0')}`,
        sessionId,
        runId: options.runId,
        attemptId: options.attemptId,
        phase,
        eventType: options.eventType,
        severity: options.severity,
        actor: options.actor,
        stepId: options.stepId,
        durationMs: options.durationMs,
        traceId: options.traceId,
        correlationId: options.correlationId,
        message,
        metadata,
        createdAt: fixedNow,
      };
      store.events.push(event);
      return event;
    },
    getResearchArtifacts: async (sessionId: string): Promise<ResearchArtifacts> => {
      assertSession(store, sessionId);
      return {
        sources: [...store.sources],
        evaluations: [...store.evaluations],
        learnings: [...store.learnings],
        events: [...store.events],
        report: store.report,
        claims: [...store.claims],
        gaps: [...store.gaps],
      };
    },
    publishReport: async (sessionId: string, report: ResearchReport, finalAudit: { ok: boolean; issues?: unknown[] }, context?: PublicationContext) =>
      publishReportInMemory(store, sessionId, report, { ok: finalAudit.ok, issues: stringArray(finalAudit.issues) }, context),
    replaceResearchArtifacts: async (sessionId: string, payload: unknown, fence?: ArtifactFence) => {
      assertSession(store, sessionId);
      const replacement = payload as ResearchArtifactReplacement;
      store.artifactFences.push(fence);
      if (!fence?.runId || !fence.attemptId || !fence.workerId) throw new Error('Replay artifact replacement requires a worker fence.');
      store.sources = replacement.sources;
      store.evaluations = replacement.evaluations;
      store.learnings = replacement.learnings;
      store.claims = replacement.claims ?? [];
      store.claimEvidence = replacement.claimEvidence ?? [];
      store.gaps = replacement.claimGaps ?? [];
      for (const audit of replacement.audits ?? []) {
        store.audits.push({
          id: `audit_${store.audits.length + 1}`,
          sessionId,
          runId: audit.runId,
          auditType: audit.auditType,
          ok: audit.audit.ok,
          issues: 'issues' in audit.audit ? stringArray(audit.audit.issues) : [],
          createdAt: fixedNow,
        });
      }
      if (replacement.report) store.report = replacement.report;
    },
    saveResearchAudit: async (sessionId: string, auditType: string, audit: { ok: boolean; issues?: unknown[] }, runId?: string) => {
      assertSession(store, sessionId);
      store.audits.push({
        id: `audit_${store.audits.length + 1}`,
        sessionId,
        runId,
        auditType,
        ok: audit.ok,
        issues: stringArray(audit.issues),
        createdAt: fixedNow,
      });
    },
    saveRunCost: async (
      runId: string,
      sessionId: string,
      usage: RunUsage,
      estimate: Pick<RunCost, 'modelCostUsd' | 'searchCostUsd' | 'totalUsd' | 'pricingEffectiveDate'>,
      measurementMethod: RunCost['measurementMethod'] = 'estimated',
    ) => {
      assertSession(store, sessionId);
      const cost: RunCost = {
        id: `cost_${store.costs.length + 1}`,
        runId,
        sessionId,
        usage,
        modelCostUsd: estimate.modelCostUsd,
        searchCostUsd: estimate.searchCostUsd,
        totalUsd: estimate.totalUsd,
        pricingEffectiveDate: estimate.pricingEffectiveDate,
        measurementMethod,
        createdAt: fixedNow,
      };
      store.costs.push(cost);
      return cost;
    },
    updateSessionState: async (sessionId: string, status: ResearchStatus, phase: ResearchPhase) => {
      assertSession(store, sessionId);
      if (status === 'report_ready') store.directReportReadyStateWrites += 1;
      updateSession(store, status, phase);
    },
  };

  return {
    config: { RUN_BUDGET_USD: 5 },
    getProviderStatus: () => ({
      openai: true,
      exa: true,
      supabase: true,
      models: { primary: 'gpt-5.5', fast: 'gpt-5.4-mini', reasoningEffort: 'high' },
      exaConfig: { searchType: 'auto', maxResults: 3, highlightMaxCharacters: 1200 },
    }),
    logger: {
      warn: (metadata: Record<string, unknown>, message: string) => {
        store.warnings.push({ message, metadata });
      },
    } as unknown as PipelineDependencyOverrides['logger'],
    mastra: createReplayMastra(store),
    nowIso: () => fixedNow,
    randomUUID: () => ids.report,
    repository: repository as unknown as NonNullable<PipelineDependencyOverrides['repository']>,
    searchWeb: async (query: string) => {
      store.searchQueries.push(query);
      return query.includes('governance') ? [regulatorSource()] : [auditSource()];
    },
  };
}

function createWorkerDependencies(store: ReplayStore, pipelineDependencies: PipelineDependencyOverrides): WorkerDependencies {
  const addEvent = pipelineDependencies.repository?.addEvent as WorkerDependencies['addEvent'] | undefined;
  if (!addEvent) throw new Error('Replay worker requires an in-memory addEvent dependency.');
  const logger = {
    error: () => undefined,
    info: () => undefined,
    warn: (metadata: Record<string, unknown>, message: string) => {
      store.warnings.push({ message, metadata });
    },
  };

  return {
    addEvent,
    claimNextQueuedRun: async (workerId, leaseMs) => claimNextQueuedRun(store, workerId, leaseMs),
    clearInterval: () => undefined,
    createPostMortem: async () => undefined,
    getProviderStatus: () => ({ openai: true, exa: true, supabase: true, models: { primary: 'gpt-5.5', fast: 'gpt-5.4-mini', reasoningEffort: 'high' } }),
    getSessionById: async (sessionId) => {
      assertSession(store, sessionId);
      return { ...store.session };
    },
    hasSupabaseConfig: () => true,
    heartbeatResearchRun: async (runId, workerId, _leaseMs, attemptId) => heartbeatRun(store, runId, workerId, attemptId ?? undefined),
    initTelemetry: () => undefined,
    logger,
    newCorrelationId: () => ids.correlation,
    runApprovedReportSession: (sessionId, query, options) => runApprovedReportSession(sessionId, query, { ...options, dependencies: pipelineDependencies }),
    runResearchSession: (sessionId, query, options) => runResearchSession(sessionId, query, { ...options, dependencies: pipelineDependencies }),
    saveRunSummaryMemory: async (userId, sessionId, runId, value) => {
      const memory: ResearchMemory = {
        id: `memory_${store.memories.length + 1}`,
        userId,
        sessionId,
        scope: 'session',
        namespace: 'run_summary',
        key: `run:${runId}`,
        value,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      store.memories.push(memory);
      return memory;
    },
    setInterval: () => ({ unref: () => undefined }) as unknown as ReturnType<typeof setInterval>,
    sleep: async () => undefined,
    updateRunStatus: async (runId, status, updates = {}) => updateRun(store, runId, status, updates),
    updateSessionState: async (sessionId, status, phase) => {
      assertSession(store, sessionId);
      updateSession(store, status, phase);
    },
    withSpan: async (_name, _attributes, callback) => callback(),
  };
}

function createReplayMastra(store: ReplayStore): NonNullable<PipelineDependencyOverrides['mastra']> {
  return {
    getAgent: (name) => ({
      generate: async (messages) => {
        store.agentCalls.push(name);
        return {
          object: agentOutput(name, messages[0]?.content ?? ''),
          usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
        };
      },
    }),
  };
}

function agentOutput(name: string, content: string) {
  if (name === 'plannerAgent') {
    return {
      queries: ['ai compliance governance controls', 'financial audit trails human oversight'],
      successCriteria: ['human oversight', 'regulatory uncertainty', 'audit trails'],
    };
  }
  if (name === 'evaluationAgent') {
    const sourceId = content.includes('src_audit_trails') ? 'src_audit_trails' : 'src_regulator_guidance';
    return {
      sourceId,
      isRelevant: true,
      score: 0.94,
      credibility: 'high',
      reason: 'Primary-source replay fixture relevant to compliance AI controls.',
      risks: [],
    };
  }
  if (name === 'learningExtractionAgent') {
    if (content.includes('src_audit_trails')) {
      return {
        id: 'learning_audit_trails',
        sourceId: 'src_audit_trails',
        claim: 'Audit trails and exception routing help preserve accountability in compliance-heavy AI workflows.',
        evidence: 'The audit guidance requires documented trails, review queues, and exception routing.',
        followUpQuestions: [],
      };
    }
    return {
      id: 'learning_human_oversight',
      sourceId: 'src_regulator_guidance',
      claim: 'Human oversight is required for compliance AI agents amid regulatory uncertainty.',
      evidence: 'The regulator guidance says financial institutions should preserve human oversight and document controls.',
      followUpQuestions: [],
    };
  }
  if (name === 'contradictionAgent') return { ok: true, issues: [], criticalGaps: [] };
  if (name === 'reportAgent') {
    return {
      title: 'AI Agents In Compliance-Heavy Financial Services',
      executiveSummary: 'AI agents can improve compliance operations, but regulatory uncertainty and human oversight remain central.',
      sections: [
        {
          heading: 'Governance Controls',
          body: 'Regulatory uncertainty makes AI-agent governance defensible only when human oversight, documented controls, and escalation paths remain in place.',
          sourceIds: ['src_regulator_guidance'],
          claimIds: ['claim_human_oversight'],
        },
        {
          heading: 'Operational Readiness',
          body: 'Audit trails and exception routing give compliance teams evidence for repeatable review without promising automatic acceptance.',
          sourceIds: ['src_audit_trails'],
          claimIds: ['claim_audit_trails'],
        },
      ],
      citations: [
        {
          sourceId: 'src_regulator_guidance',
          url: 'https://example.com/regulator-ai-governance',
          title: 'Regulator guidance on AI governance',
        },
        {
          sourceId: 'src_audit_trails',
          url: 'https://example.com/audit-trail-controls',
          title: 'Audit trail controls for AI workflows',
        },
      ],
    };
  }
  if (name === 'citationAuditorAgent') return { ok: true, issues: [] };
  if (name === 'finalReviewerAgent') return { approved: true, issues: [], summary: 'ready' };
  throw new Error(`Unexpected replay agent ${name}.`);
}

function replayWorkerConfig(): WorkerConfig {
  return {
    heartbeatMs: 1000,
    leaseMs: 60000,
    once: false,
    pollMs: 10,
    processOnce: true,
    workerId: 'worker_replay',
  };
}

function recordApprovalDecision(store: ReplayStore, userId: string, sessionId: string, input: ApprovalRequest) {
  assertSession(store, sessionId);
  if (userId !== store.session.userId) throw new Error('Replay approval user does not own session.');
  if (store.session.status !== 'awaiting_approval') throw new Error('Replay approval requires awaiting_approval state.');
  if (input.action !== 'approve') throw new Error('Replay scenario only supports approval.');
  const openCriticalGaps = store.gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
  if (openCriticalGaps.length > 0) throw new Error('Replay approval cannot proceed with open critical gaps.');

  const approval: ResearchApproval = {
    id: ids.approval,
    sessionId,
    userId,
    action: input.action,
    notes: input.notes ?? null,
    approvedSourceIds: input.approvedSourceIds,
    waivedGapIds: input.waivedGapIds,
    createdAt: fixedNow,
  };
  store.approvals.push(approval);
  updateSession(store, 'queued', 'reporting');

  const reportingRun: ResearchRun = {
    id: ids.reportingRun,
    sessionId,
    status: 'queued',
    attempt: 1,
    currentAttemptId: null,
    metadata: { stage: 'reporting', approvalId: ids.approval, sourceResearchRunId: ids.researchRun },
    workerId: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    error: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
  store.runs.set(reportingRun.id, reportingRun);
  store.queuedRunIds.push(reportingRun.id);
  store.events.push({
    id: `event_${String(store.events.length + 1).padStart(2, '0')}`,
    sessionId,
    runId: ids.reportingRun,
    phase: 'reporting',
    eventType: 'approval_recorded',
    severity: 'info',
    actor: 'user',
    stepId: 'approval_recorded',
    message: 'Replay approval queued reporting work.',
    metadata: { approvalId: ids.approval, sourceResearchRunId: ids.researchRun, approvedSourceIds: input.approvedSourceIds },
    createdAt: fixedNow,
  });
  return { ok: true as const, action: approval.action, run: reportingRun, runId: reportingRun.id, status: reportingRun.status };
}

function publishReportInMemory(
  store: ReplayStore,
  sessionId: string,
  report: ResearchReport,
  finalAudit: { ok: boolean; issues: string[] },
  context?: PublicationContext,
) {
  assertSession(store, sessionId);
  store.publicationContexts.push(context ?? {});
  if (!context?.runId || !context.attemptId || !context.workerId) throw new Error('Replay report publication requires run, attempt, and worker fence.');
  const openCriticalGapIds = store.gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open').map((gap) => gap.id);
  if (openCriticalGapIds.length > 0) {
    updateSession(store, 'awaiting_approval', 'reviewing');
    return { ok: false as const, code: 'critical_gaps_unresolved' as const, status: 'awaiting_approval' as const, openCriticalGapIds };
  }

  store.audits.push({
    id: `audit_${store.audits.length + 1}`,
    sessionId,
    runId: context.runId,
    auditType: 'final_review',
    ok: finalAudit.ok,
    issues: finalAudit.issues,
    createdAt: fixedNow,
  });
  store.report = report;
  updateSession(store, 'report_ready', 'complete');
  const run = store.runs.get(context.runId);
  if (run) {
    run.status = 'completed';
    run.completedAt = fixedNow;
    run.leaseExpiresAt = null;
    run.updatedAt = fixedNow;
  }
  store.events.push({
    id: `event_${String(store.events.length + 1).padStart(2, '0')}`,
    sessionId,
    runId: context.runId,
    attemptId: context.attemptId,
    phase: 'complete',
    eventType: 'report_ready',
    severity: 'info',
    actor: 'worker',
    stepId: 'report_ready',
    message: 'Report is ready.',
    correlationId: context.correlationId,
    metadata: { reportId: report.id },
    createdAt: fixedNow,
  });
  return { ok: true as const, idempotent: false };
}

function claimNextQueuedRun(store: ReplayStore, workerId: string, leaseMs: number) {
  const runId = store.queuedRunIds.shift();
  if (!runId) return null;
  const run = store.runs.get(runId);
  if (!run) return null;
  const attemptId = run.id === ids.researchRun ? ids.researchAttempt : ids.reportingAttempt;
  run.status = 'leased';
  run.workerId = workerId;
  run.currentAttemptId = attemptId;
  run.leaseExpiresAt = new Date(Date.parse(fixedNow) + leaseMs).toISOString();
  run.updatedAt = fixedNow;
  return { ...run };
}

function heartbeatRun(store: ReplayStore, runId: string, workerId: string, attemptId: string | undefined) {
  const run = store.runs.get(runId);
  if (!run || run.workerId !== workerId || run.currentAttemptId !== attemptId) return null;
  if (!['leased', 'running'].includes(run.status)) return null;
  run.leaseExpiresAt = new Date(Date.parse(fixedNow) + 60000).toISOString();
  return { ...run };
}

function updateRun(
  store: ReplayStore,
  runId: string,
  status: RunStatus,
  updates: { error?: string | null; startedAt?: string | null; completedAt?: string | null; workerId?: string; attemptId?: string | null } = {},
) {
  const run = store.runs.get(runId);
  if (!run) throw new Error(`Replay run not found: ${runId}`);
  run.status = status;
  run.workerId = updates.workerId ?? run.workerId;
  run.currentAttemptId = updates.attemptId === undefined ? run.currentAttemptId : updates.attemptId;
  run.error = updates.error === undefined ? run.error : updates.error;
  run.startedAt = updates.startedAt === undefined ? run.startedAt : updates.startedAt;
  run.completedAt = updates.completedAt === undefined ? (status === 'completed' || status === 'awaiting_approval' ? fixedNow : run.completedAt) : updates.completedAt;
  run.leaseExpiresAt = status === 'running' || status === 'leased' ? run.leaseExpiresAt : null;
  run.updatedAt = fixedNow;
  return { ...run };
}

function updateSession(store: ReplayStore, status: ResearchStatus, phase: ResearchPhase) {
  store.session.status = status;
  store.session.phase = phase;
  store.session.updatedAt = fixedNow;
}

function replayFixture(store: ReplayStore): EvalFixture {
  if (!store.report) throw new Error('Replay report is missing.');
  return {
    id: 'orchestration-replay-approved-reporting',
    prompt: store.session.query,
    expected: {
      requiredCaveats: ['regulatory uncertainty', 'human oversight'],
      minimumCitationCoverage: 1,
      forbiddenPhrases: ['guaranteed approval', 'risk-free'],
      requireClaimIds: true,
      shouldPass: true,
      minimumScores: {
        correctness: 0.9,
        safety: 0.9,
        completeness: 1,
        quality: 0.9,
      },
    },
    actual: {
      report: store.report,
      sources: store.sources,
    },
  };
}

function buildAssertions(
  store: ReplayStore,
  context: {
    approvalDecision: ReturnType<typeof recordApprovalDecision>;
    reportBeforeApproval: ResearchReport | null;
    reportingProcessed: boolean;
    researchProcessed: boolean;
    researchRunAfterWorker: ResearchRun | undefined;
    sessionAfterResearch: ResearchSession;
  },
): ReplayAssertion[] {
  const reportingRun = store.runs.get(ids.reportingRun);
  const knownSourceIds = new Set(store.sources.map((source) => source.id));
  const reportSections = store.report?.sections ?? [];
  const researchCost = store.costs.find((cost) => cost.runId === ids.researchRun);
  const reportingCost = store.costs.find((cost) => cost.runId === ids.reportingRun);
  const lineageKeys = store.events.map((event) => event.stepId ?? event.eventType ?? event.phase);

  return [
    assertion('research_worker_processed', context.researchProcessed, 'processNextRun should process the queued research run.'),
    assertion(
      'research_awaiting_approval',
      context.researchRunAfterWorker?.status === 'awaiting_approval' && context.sessionAfterResearch.status === 'awaiting_approval',
      'Research must stop at HITL approval.',
    ),
    assertion('no_report_before_approval', context.reportBeforeApproval === null, 'Report must not exist before approval.'),
    assertion(
      'artifact_replacement_fenced',
      store.artifactFences.some((fence) => fence?.runId === ids.researchRun && fence.attemptId === ids.researchAttempt && fence.workerId === 'worker_replay'),
      'Research artifacts must be written with run/attempt/worker fence.',
    ),
    assertion(
      'approval_queues_distinct_reporting_run',
        context.approvalDecision.ok &&
        context.approvalDecision.runId === ids.reportingRun &&
        context.approvalDecision.run?.metadata.stage === 'reporting' &&
        context.approvalDecision.run?.metadata.approvalId === ids.approval &&
        context.approvalDecision.run?.metadata.sourceResearchRunId === ids.researchRun &&
        context.approvalDecision.runId !== ids.researchRun,
      'Approval should queue a distinct reporting run with approval and source research lineage.',
    ),
    assertion('reporting_worker_processed', context.reportingProcessed, 'processNextRun should process the queued reporting run.'),
    assertion(
      'reporting_publish_fenced',
      store.publicationContexts.some((publication) => publication.runId === ids.reportingRun && publication.attemptId === ids.reportingAttempt && publication.workerId === 'worker_replay'),
      'Report publication must include run/attempt/worker fence.',
    ),
    assertion('no_direct_report_ready_write', store.directReportReadyStateWrites === 0, 'Pipeline must not directly write report_ready through updateSessionState.'),
    assertion('reporting_run_completed_by_publish', reportingRun?.status === 'completed' && store.session.status === 'report_ready' && store.session.phase === 'complete', 'Publish should finalize reporting run and session.'),
    assertion(
      'report_citations_known_sources',
      reportSections.length > 0 && reportSections.every((section) => section.sourceIds.every((sourceId) => knownSourceIds.has(sourceId))),
      'Every report section must cite known source IDs.',
    ),
    assertion('report_claim_ids_present', reportSections.length > 0 && reportSections.every((section) => (section.claimIds?.length ?? 0) > 0), 'Every report section must carry claim IDs.'),
    assertion('no_open_critical_gaps_at_publish', store.gaps.every((gap) => gap.severity !== 'critical' || gap.status !== 'open'), 'No open critical gaps may remain at publish.'),
    assertion('research_cost_recorded', Boolean(researchCost) && (researchCost?.usage.exaSearches ?? 0) === 2, 'Research cost must include two deterministic searches.'),
    assertion('reporting_cost_recorded', Boolean(reportingCost) && (reportingCost?.usage.modelCalls.length ?? 0) === 3, 'Reporting cost must include report, citation audit, and final review calls.'),
    assertion(
      'ordered_event_lineage',
      containsInOrder(lineageKeys, ['planner', 'exa_search', 'source_evaluator', 'learning_extractor', 'claim_audit', 'awaiting_approval', 'approval_recorded', 'report_writer', 'report_ready']) &&
        store.events.filter((event) => event.runId === ids.researchRun).every((event) => event.attemptId === ids.researchAttempt || event.stepId === undefined) &&
        store.events
          .filter((event) => event.runId === ids.reportingRun && event.stepId !== 'approval_recorded')
          .every((event) => event.attemptId === ids.reportingAttempt || event.stepId === undefined),
      'Events should preserve planning/search/eval/extract/review/approval/reporting/report_ready lineage.',
    ),
    assertion(
      'no_live_external_clients',
      store.searchQueries.length === 2 && store.agentCalls.length === 9,
      'Replay must use deterministic in-memory agents/search and no live clients.',
    ),
  ];
}

function assertion(id: string, passed: boolean, details: string): ReplayAssertion {
  return { id, passed, details };
}

function containsInOrder(values: string[], expected: string[]) {
  let cursor = 0;
  for (const value of values) {
    if (value === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

function regulatorSource(): ResearchSource {
  return {
    id: 'src_regulator_guidance',
    title: 'Regulator guidance on AI governance',
    url: 'https://example.com/regulator-ai-governance',
    canonicalUrl: 'https://example.com/regulator-ai-governance',
    domain: 'example.com',
    snippet: 'AI governance requires documented controls and human oversight.',
    content: 'Financial institutions should preserve human oversight and document controls while regulatory uncertainty remains.',
    publishedAt: '2026-01-10',
    score: 0.94,
    credibility: 'high',
    relevanceReason: 'Primary regulatory guidance replay fixture.',
  };
}

function auditSource(): ResearchSource {
  return {
    id: 'src_audit_trails',
    title: 'Audit trail controls for AI workflows',
    url: 'https://example.com/audit-trail-controls',
    canonicalUrl: 'https://example.com/audit-trail-controls',
    domain: 'example.com',
    snippet: 'Audit trails and exception routing preserve accountability.',
    content: 'Compliance AI workflows need audit trails, exception routing, and review queues to preserve accountability.',
    publishedAt: '2026-02-15',
    score: 0.92,
    credibility: 'high',
    relevanceReason: 'Operational control replay fixture.',
  };
}

function assertSession(store: ReplayStore, sessionId: string) {
  if (store.session.id !== sessionId) throw new Error(`Replay session not found: ${sessionId}`);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function deterministicReplayCost(usage: RunUsage) {
  return estimateRunCost(usage);
}
