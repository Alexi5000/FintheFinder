import type {
  ApprovalRequest,
  ClaimAudit,
  ClaimEvidence,
  ClaimGap,
  ResearchLearning,
  ResearchApproval,
  ResearchClaim,
  ResearchMemory,
  ResearchPostMortem,
  ResearchReport,
  ResearchRun,
  ResearchRunEvent,
  ResearchSession,
  ResearchSessionDetail,
  ResearchSource,
  RunCost,
  RunUsage,
  SourceEvaluation,
  ResearchPhase,
  ResearchStatus,
  RunStatus,
  UpsertResearchMemoryInput,
} from '@/lib/schemas';
import type { DbUpdate, Json } from '@/lib/supabase/database.types';
import { nowIso, titleFromQuery } from '@/lib/utils';
import { createSupabaseAdmin } from '@/server/supabase/server';
import { activeTraceId } from '@/server/telemetry';

function requireRows<T>(rows: T[] | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  return rows ?? [];
}

function requireRow<T>(row: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Record not found.');
  return row;
}

type ResearchArtifactGraph = {
  sources: ResearchSource[];
  evaluations: SourceEvaluation[];
  learnings: ResearchLearning[];
  claims?: ResearchClaim[];
  claimEvidence?: ClaimEvidence[];
  claimGaps?: ClaimGap[];
  audits?: Array<{ runId?: string; auditType: string; audit: ClaimAudit | { ok: boolean; issues: string[] } }>;
  report?: ResearchReport;
};

type ResearchArtifactReplacementFence = {
  runId: string;
  attemptId: string;
  workerId: string;
};

type ReportPublicationContext = {
  runId?: string;
  attemptId?: string;
  workerId?: string;
  correlationId?: string;
};

export type ReportPublicationResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; code: 'critical_gaps_unresolved'; status: 'awaiting_approval'; openCriticalGapIds: string[] };

export type ApprovalDecisionErrorCode =
  | 'session_not_found'
  | 'approval_not_available'
  | 'waiver_notes_required'
  | 'critical_gaps_unresolved'
  | 'active_run_conflict'
  | 'invalid_approval_request';

export type ApprovalDecisionResult =
  | { ok: true; action: ResearchApproval['action']; run: ResearchRun | null; runId: string | null; status: RunStatus | null }
  | { ok: false; code: ApprovalDecisionErrorCode; details?: unknown };

export async function createSession(userId: string, query: string): Promise<ResearchSession> {
  const supabase = createSupabaseAdmin();
  const now = nowIso();
  const id = crypto.randomUUID();
  const session: ResearchSession = {
    id,
    userId,
    query,
    title: titleFromQuery(query),
    status: 'draft',
    phase: 'intake',
    createdAt: now,
    updatedAt: now,
  };

  const { error } = await supabase.from('research_sessions').insert({
    id,
    user_id: userId,
    query,
    title: session.title,
    status: session.status,
    phase: session.phase,
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
  await addEvent(id, 'intake', 'Research session created.');
  return session;
}

export async function listSessions(userId: string): Promise<ResearchSession[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('research_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  return requireRows(data, error).map(mapSessionRow);
}

export async function getSessionDetail(userId: string, sessionId: string): Promise<ResearchSessionDetail> {
  const supabase = createSupabaseAdmin();
  const { data: sessionRow, error: sessionError } = await supabase
    .from('research_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  const session = mapSessionRow(requireRow(sessionRow, sessionError));

  const [sources, evaluations, learnings, events, approvals, report, currentRun] = await Promise.all([
    getSources(sessionId),
    getEvaluations(sessionId),
    getLearnings(sessionId),
    getEvents(sessionId),
    getApprovals(sessionId),
    getReport(sessionId),
    getLatestRunForSession(sessionId),
  ]);

  const [currentRunCost, currentPostMortem] = currentRun
    ? await Promise.all([getRunCostForRun(currentRun.id), getPostMortemForRun(currentRun.id)])
    : [null, null];

  return { ...session, currentRun, currentRunCost, currentPostMortem, sources, evaluations, learnings, events, approvals, report };
}

export async function updateSessionState(sessionId: string, status: ResearchStatus, phase: ResearchPhase) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('research_sessions')
    .update({ status, phase, updated_at: nowIso() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function enqueueResearchRun(
  sessionId: string,
  metadata: Record<string, unknown> = { stage: 'research' },
  phase: ResearchPhase = 'planning',
): Promise<ResearchRun> {
  const supabase = createSupabaseAdmin();
  const stage = metadata.stage ?? 'research';
  const { data: active, error: activeError } = await supabase
    .from('research_runs')
    .select('*')
    .eq('session_id', sessionId)
    .in('status', ['queued', 'leased', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error(activeError.message);
  if (active && (recordFromJson(active.metadata).stage ?? 'research') === stage) {
    return mapRunRow(active);
  }

  const now = nowIso();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('research_runs')
    .insert({
      id,
      session_id: sessionId,
      status: 'queued',
      attempt: 1,
      metadata: toJson(metadata),
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  await updateSessionState(sessionId, 'queued', phase);
  await addEvent(sessionId, phase, 'Research run queued.', { runId: id, stage }, { runId: id, eventType: 'state_transition' });
  return mapRunRow(requireRow(data, null));
}

export async function getRunForUser(userId: string, runId: string): Promise<ResearchRun> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('research_runs')
    .select('*, research_sessions!inner(user_id)')
    .eq('id', runId)
    .eq('research_sessions.user_id', userId)
    .single();
  return mapRunRow(requireRow(data, error));
}

export async function getRunById(runId: string): Promise<ResearchRun> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_runs').select('*').eq('id', runId).single();
  return mapRunRow(requireRow(data, error));
}

export async function getLatestRunForSession(sessionId: string): Promise<ResearchRun | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('research_runs')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunRow(data as Record<string, unknown>) : null;
}

export async function getSessionById(sessionId: string): Promise<ResearchSession> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_sessions').select('*').eq('id', sessionId).single();
  return mapSessionRow(requireRow(data, error));
}

export async function claimNextQueuedRun(workerId: string, leaseMs: number): Promise<ResearchRun | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc('claim_next_research_run', { p_worker_id: workerId, p_lease_ms: leaseMs }).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunRow(data as Record<string, unknown>) : null;
}

export async function heartbeatResearchRun(runId: string, workerId: string, leaseMs: number, attemptId?: string | null): Promise<ResearchRun | null> {
  if (!attemptId) return null;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .rpc('extend_research_run_lease', { p_run_id: runId, p_attempt_id: attemptId, p_worker_id: workerId, p_lease_ms: leaseMs })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunRow(data as Record<string, unknown>) : null;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  updates: { error?: string | null; startedAt?: string | null; completedAt?: string | null; workerId?: string; attemptId?: string | null } = {},
): Promise<ResearchRun> {
  const supabase = createSupabaseAdmin();
  if (updates.workerId && updates.attemptId) {
    const { data, error } = await supabase
      .rpc('transition_research_run', {
        p_run_id: runId,
        p_attempt_id: updates.attemptId,
        p_worker_id: updates.workerId,
        p_status: status,
        p_error: updates.error ?? null,
        p_started_at: updates.startedAt ?? null,
        p_completed_at: updates.completedAt ?? null,
      })
      .single();
    return mapRunRow(requireRow(data as Record<string, unknown> | null, error));
  }

  const patch: DbUpdate<'research_runs'> = {
    status,
    updated_at: nowIso(),
  };
  if (status === 'running') patch.started_at = updates.startedAt ?? nowIso();
  if (['completed', 'failed', 'cancelled', 'awaiting_approval'].includes(status)) {
    patch.completed_at = updates.completedAt ?? nowIso();
    patch.lease_expires_at = null;
  }
  if (updates.error !== undefined) patch.error = updates.error;
  if (updates.startedAt !== undefined) patch.started_at = updates.startedAt;
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;

  let query = supabase.from('research_runs').update(patch).eq('id', runId);
  if (updates.workerId) query = query.eq('worker_id', updates.workerId);
  const { data, error } = await query.select('*').single();
  return mapRunRow(requireRow(data, error));
}

export async function getRunCostForRun(runId: string): Promise<RunCost | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_run_costs').select('*').eq('run_id', runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunCostRow(data as Record<string, unknown>) : null;
}

export async function saveRunCost(
  runId: string,
  sessionId: string,
  usage: RunUsage,
  estimate: Pick<RunCost, 'modelCostUsd' | 'searchCostUsd' | 'totalUsd' | 'pricingEffectiveDate'>,
  measurementMethod: RunCost['measurementMethod'] = 'estimated',
): Promise<RunCost> {
  const supabase = createSupabaseAdmin();
  const existing = await getRunCostForRun(runId);
  const payload = {
    run_id: runId,
    session_id: sessionId,
    usage: toJson(usage),
    model_cost_usd: estimate.modelCostUsd,
    search_cost_usd: estimate.searchCostUsd,
    total_usd: estimate.totalUsd,
    pricing_effective_date: estimate.pricingEffectiveDate,
    measurement_method: measurementMethod,
  };

  if (existing) {
    const { data, error } = await supabase.from('research_run_costs').update(payload).eq('id', existing.id).select('*').single();
    return mapRunCostRow(requireRow(data, error));
  }

  const { data, error } = await supabase
    .from('research_run_costs')
    .insert({ id: crypto.randomUUID(), ...payload, created_at: nowIso() })
    .select('*')
    .single();
  return mapRunCostRow(requireRow(data, error));
}

export async function replaceResearchArtifacts(
  sessionId: string,
  artifacts: ResearchArtifactGraph,
  fence?: ResearchArtifactReplacementFence,
) {
  const supabase = createSupabaseAdmin();
  const payload = researchArtifactReplacementPayload(artifacts);

  if (fence) {
    const { error } = await supabase.rpc('replace_research_artifacts', {
      p_session_id: sessionId,
      p_run_id: fence.runId,
      p_attempt_id: fence.attemptId,
      p_worker_id: fence.workerId,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await Promise.all([
    supabase.from('research_audits').delete().eq('session_id', sessionId),
    supabase.from('claim_gaps').delete().eq('session_id', sessionId),
    supabase.from('research_claims').delete().eq('session_id', sessionId),
    supabase.from('research_sources').delete().eq('session_id', sessionId),
    supabase.from('source_evaluations').delete().eq('session_id', sessionId),
    supabase.from('research_learnings').delete().eq('session_id', sessionId),
    supabase.from('research_reports').delete().eq('session_id', sessionId),
  ]);

  if (artifacts.sources.length) {
    const { error } = await supabase.from('research_sources').insert(
      artifacts.sources.map((source) => ({
        id: source.id,
        session_id: sessionId,
        title: source.title,
        url: source.url,
        canonical_url: source.canonicalUrl,
        domain: source.domain,
        snippet: source.snippet,
        content: source.content,
        published_at: source.publishedAt,
        score: source.score,
        credibility: source.credibility,
        relevance_reason: source.relevanceReason,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.evaluations.length) {
    const { error } = await supabase.from('source_evaluations').insert(
      artifacts.evaluations.map((evaluation) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        source_id: evaluation.sourceId,
        is_relevant: evaluation.isRelevant,
        score: evaluation.score,
        credibility: evaluation.credibility,
        reason: evaluation.reason,
        risks: toJson(evaluation.risks),
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.learnings.length) {
    const { error } = await supabase.from('research_learnings').insert(
      artifacts.learnings.map((learning) => ({
        id: learning.id,
        session_id: sessionId,
        source_id: learning.sourceId,
        claim: learning.claim,
        evidence: learning.evidence,
        follow_up_questions: toJson(learning.followUpQuestions),
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.claims?.length) {
    const { error } = await supabase.from('research_claims').insert(
      artifacts.claims.map((claim) => ({
        id: claim.id,
        session_id: sessionId,
        text: claim.text,
        status: claim.status,
        severity: claim.severity,
        source_ids: toJson(claim.sourceIds),
        evidence_ids: toJson([]),
        created_at: claim.createdAt,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.claimEvidence?.length) {
    const { error } = await supabase.from('claim_evidence').insert(
      artifacts.claimEvidence.map((evidence) => ({
        id: evidence.id,
        claim_id: evidence.claimId,
        source_id: evidence.sourceId,
        quote: evidence.quote,
        confidence: evidence.confidence,
        created_at: evidence.createdAt,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const claimsWithEvidenceIds = artifacts.claims?.filter((claim) => claim.evidenceIds.length > 0) ?? [];
  for (const claim of claimsWithEvidenceIds) {
    const { error } = await supabase
      .from('research_claims')
      .update({ evidence_ids: toJson(claim.evidenceIds) })
      .eq('id', claim.id)
      .eq('session_id', sessionId);
    if (error) throw new Error(error.message);
  }

  if (artifacts.claimGaps?.length) {
    const { error } = await supabase.from('claim_gaps').insert(
      artifacts.claimGaps.map((gap) => ({
        id: gap.id,
        session_id: sessionId,
        claim_id: gap.claimId ?? null,
        description: gap.description,
        severity: gap.severity,
        status: gap.status,
        resolution: gap.resolution ?? null,
        created_at: gap.createdAt,
        resolved_at: gap.resolvedAt ?? null,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.audits?.length) {
    const { error } = await supabase.from('research_audits').insert(
      artifacts.audits.map(({ runId, auditType, audit }) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        run_id: runId ?? null,
        audit_type: auditType,
        ok: audit.ok,
        issues: toJson('issues' in audit ? audit.issues : audit.openGaps),
        created_at: nowIso(),
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.report) {
    await saveReport(artifacts.report);
  }
}

function researchArtifactReplacementPayload(artifacts: ResearchArtifactGraph): Json {
  const createdAt = nowIso();
  const payload: Record<string, Json | undefined> = {
    sources: artifacts.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      canonical_url: source.canonicalUrl,
      domain: source.domain,
      snippet: source.snippet,
      content: source.content,
      published_at: source.publishedAt ?? null,
      score: source.score,
      credibility: source.credibility,
      relevance_reason: source.relevanceReason,
    })),
    evaluations: artifacts.evaluations.map((evaluation) => ({
      id: crypto.randomUUID(),
      source_id: evaluation.sourceId,
      is_relevant: evaluation.isRelevant,
      score: evaluation.score,
      credibility: evaluation.credibility,
      reason: evaluation.reason,
      risks: toJson(evaluation.risks),
    })),
    learnings: artifacts.learnings.map((learning) => ({
      id: learning.id,
      source_id: learning.sourceId,
      claim: learning.claim,
      evidence: learning.evidence,
      follow_up_questions: toJson(learning.followUpQuestions),
    })),
    claims: (artifacts.claims ?? []).map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: claim.status,
      severity: claim.severity,
      source_ids: toJson(claim.sourceIds),
      evidence_ids: toJson(claim.evidenceIds),
      created_at: claim.createdAt,
    })),
    claim_evidence: (artifacts.claimEvidence ?? []).map((evidence) => ({
      id: evidence.id,
      claim_id: evidence.claimId,
      source_id: evidence.sourceId,
      quote: evidence.quote,
      confidence: evidence.confidence,
      created_at: evidence.createdAt,
    })),
    claim_gaps: (artifacts.claimGaps ?? []).map((gap) => ({
      id: gap.id,
      claim_id: gap.claimId ?? null,
      description: gap.description,
      severity: gap.severity,
      status: gap.status,
      resolution: gap.resolution ?? null,
      created_at: gap.createdAt,
      resolved_at: gap.resolvedAt ?? null,
    })),
    audits: (artifacts.audits ?? []).map(({ runId, auditType, audit }) => ({
      id: crypto.randomUUID(),
      run_id: runId ?? null,
      audit_type: auditType,
      ok: audit.ok,
      issues: toJson('issues' in audit ? audit.issues : audit.openGaps),
      created_at: createdAt,
    })),
  };

  if (artifacts.report) {
    payload.report = {
      id: artifacts.report.id,
      title: artifacts.report.title,
      executive_summary: artifacts.report.executiveSummary,
      sections: toJson(artifacts.report.sections),
      citations: toJson(artifacts.report.citations),
      markdown: artifacts.report.markdown,
      created_at: artifacts.report.createdAt,
    };
  }

  return toJson(payload);
}

export async function saveReport(report: ResearchReport) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('research_reports').insert({
    id: report.id,
    session_id: report.sessionId,
    title: report.title,
    executive_summary: report.executiveSummary,
    sections: toJson(report.sections),
    citations: toJson(report.citations),
    markdown: report.markdown,
    created_at: report.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function saveResearchAudit(sessionId: string, auditType: string, audit: { ok: boolean; issues?: unknown[] }, runId?: string) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('research_audits').insert({
    id: crypto.randomUUID(),
    session_id: sessionId,
    run_id: runId ?? null,
    audit_type: auditType,
    ok: audit.ok,
    issues: toJson(audit.issues ?? []),
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
}

export async function publishReport(
  sessionId: string,
  report: ResearchReport,
  finalAudit: { ok: boolean; issues?: unknown[] },
  context?: ReportPublicationContext,
): Promise<ReportPublicationResult> {
  if (hasReportPublicationFence(context)) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.rpc('publish_research_report_for_attempt', {
      p_session_id: sessionId,
      p_run_id: context.runId,
      p_attempt_id: context.attemptId,
      p_worker_id: context.workerId,
      p_report: reportPublicationPayload(report),
      p_final_audit: toJson({ ok: finalAudit.ok, issues: finalAudit.issues ?? [] }),
      p_trace_id: activeTraceId() ?? null,
      p_correlation_id: context.correlationId ?? null,
    });
    if (error) throw new Error(error.message);
    return mapReportPublicationResult(data);
  }

  await saveResearchAudit(sessionId, 'final_review', finalAudit, context?.runId);
  await saveReport(report);
  await updateSessionState(sessionId, 'report_ready', 'complete');
  await addEvent(sessionId, 'complete', 'Report is ready.', { reportId: report.id }, {
    runId: context?.runId,
    attemptId: context?.attemptId,
    eventType: 'report_ready',
    actor: 'worker',
    stepId: 'report_ready',
    correlationId: context?.correlationId,
  });
  return { ok: true, idempotent: false };
}

function hasReportPublicationFence(context: ReportPublicationContext | undefined): context is Required<Pick<ReportPublicationContext, 'runId' | 'attemptId' | 'workerId'>> & ReportPublicationContext {
  return Boolean(context?.runId && context.attemptId && context.workerId);
}

function reportPublicationPayload(report: ResearchReport): Json {
  return toJson({
    id: report.id,
    title: report.title,
    executive_summary: report.executiveSummary,
    sections: toJson(report.sections),
    citations: toJson(report.citations),
    markdown: report.markdown,
    created_at: report.createdAt,
  });
}

function mapReportPublicationResult(value: unknown): ReportPublicationResult {
  const record = recordFromJson(value);
  if (record.ok === false && record.code === 'critical_gaps_unresolved') {
    return {
      ok: false,
      code: 'critical_gaps_unresolved',
      status: 'awaiting_approval',
      openCriticalGapIds: stringArrayFromJson(record.openCriticalGapIds),
    };
  }
  return { ok: true, idempotent: record.idempotent === true };
}

export async function addApproval(
  sessionId: string,
  userId: string,
  action: ResearchApproval['action'],
  notes?: string,
  approvedSourceIds: string[] = [],
  waivedGapIds: string[] = [],
) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('research_approvals').insert({
    id: crypto.randomUUID(),
    session_id: sessionId,
    user_id: userId,
    action,
    notes: notes ?? null,
    approved_source_ids: toJson(approvedSourceIds),
    waived_gap_ids: toJson(waivedGapIds),
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
}

export async function getApprovals(sessionId: string): Promise<ResearchApproval[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_approvals').select('*').eq('session_id', sessionId).order('created_at', { ascending: false });
  return requireRows(data, error).map(mapApprovalRow);
}

export async function getApprovalsForUser(userId: string, sessionId: string): Promise<ResearchApproval[]> {
  await assertSessionOwnership(userId, sessionId);
  return getApprovals(sessionId);
}

export async function getOpenCriticalGaps(sessionId: string): Promise<ClaimGap[]> {
  const { gaps } = await getClaimsAndGaps(sessionId);
  return gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
}

export async function waiveClaimGaps(sessionId: string, gapIds: string[], resolution: string) {
  if (gapIds.length === 0) return;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('claim_gaps')
    .update({ status: 'waived', resolution, resolved_at: nowIso() })
    .eq('session_id', sessionId)
    .in('id', gapIds);
  if (error) throw new Error(error.message);
}

export async function recordApprovalDecision(userId: string, sessionId: string, input: ApprovalRequest): Promise<ApprovalDecisionResult> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc('record_research_approval_decision', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_action: input.action,
    p_notes: input.notes ?? null,
    p_approved_source_ids: toJson(input.approvedSourceIds),
    p_waived_gap_ids: toJson(input.waivedGapIds),
    p_trace_id: activeTraceId() ?? null,
    p_correlation_id: null,
  });
  if (error) throw new Error(error.message);
  return mapApprovalDecisionResult(data);
}

export async function listResearchMemories(userId: string, options: { sessionId?: string } = {}): Promise<ResearchMemory[]> {
  const supabase = createSupabaseAdmin();
  if (options.sessionId) await assertSessionOwnership(userId, options.sessionId);

  const userScopedQuery = supabase
    .from('research_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', 'user')
    .is('session_id', null)
    .order('updated_at', { ascending: false });

  if (!options.sessionId) {
    const { data, error } = await userScopedQuery;
    return requireRows(data, error).map(mapMemoryRow);
  }

  const sessionScopedQuery = supabase
    .from('research_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', 'session')
    .eq('session_id', options.sessionId)
    .order('updated_at', { ascending: false });

  const [userScoped, sessionScoped] = await Promise.all([userScopedQuery, sessionScopedQuery]);
  return [...requireRows(sessionScoped.data, sessionScoped.error).map(mapMemoryRow), ...requireRows(userScoped.data, userScoped.error).map(mapMemoryRow)];
}

export async function upsertResearchMemory(userId: string, input: UpsertResearchMemoryInput): Promise<ResearchMemory> {
  if (input.scope === 'user' && input.sessionId) {
    throw new Error('User-scoped memory cannot include a sessionId.');
  }
  if (input.scope === 'session' && !input.sessionId) {
    throw new Error('Session-scoped memory requires a sessionId.');
  }

  const supabase = createSupabaseAdmin();
  const sessionId = input.scope === 'session' ? input.sessionId : undefined;
  if (sessionId) await assertSessionOwnership(userId, sessionId);

  let existingQuery = supabase
    .from('research_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', input.scope)
    .eq('namespace', input.namespace)
    .eq('key', input.key);

  existingQuery = sessionId ? existingQuery.eq('session_id', sessionId) : existingQuery.is('session_id', null);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const now = nowIso();
  const payload = {
    user_id: userId,
    session_id: sessionId ?? null,
    scope: input.scope,
    namespace: input.namespace,
    key: input.key,
    value: toJson(input.value),
    updated_at: now,
  };

  if (existing) {
    const { data, error } = await supabase.from('research_memories').update(payload).eq('id', existing.id).select('*').single();
    return mapMemoryRow(requireRow(data, error));
  }

  const { data, error } = await supabase
    .from('research_memories')
    .insert({ id: crypto.randomUUID(), ...payload, created_at: now })
    .select('*')
    .single();
  return mapMemoryRow(requireRow(data, error));
}

export async function saveRunSummaryMemory(userId: string, sessionId: string, runId: string, value: Record<string, unknown>) {
  return upsertResearchMemory(userId, {
    sessionId,
    scope: 'session',
    namespace: 'run_summary',
    key: `run:${runId}`,
    value,
  });
}

export async function addEvent(
  sessionId: string,
  phase: ResearchPhase,
  message: string,
  metadata: Record<string, unknown> = {},
  options: Partial<Pick<ResearchRunEvent, 'runId' | 'attemptId' | 'eventType' | 'severity' | 'actor' | 'stepId' | 'durationMs' | 'traceId' | 'correlationId'>> = {},
) {
  const supabase = createSupabaseAdmin();
  const event: ResearchRunEvent = {
    id: crypto.randomUUID(),
    sessionId,
    phase,
    message,
    ...options,
    traceId: options.traceId ?? activeTraceId(),
    metadata,
    createdAt: nowIso(),
  };
  const { error } = await supabase.from('research_events').insert({
    id: event.id,
    session_id: sessionId,
    run_id: event.runId ?? null,
    attempt_id: event.attemptId ?? null,
    phase,
    event_type: event.eventType ?? null,
    severity: event.severity ?? 'info',
    actor: event.actor ?? 'system',
    step_id: event.stepId ?? null,
    message,
    duration_ms: event.durationMs ?? null,
    trace_id: event.traceId ?? null,
    correlation_id: event.correlationId ?? null,
    metadata: toJson(metadata),
    created_at: event.createdAt,
  });
  if (error) throw new Error(error.message);
  return event;
}

export async function getEvents(sessionId: string, options: { runId?: string } = {}): Promise<ResearchRunEvent[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase.from('research_events').select('*').eq('session_id', sessionId);
  if (options.runId) query = query.eq('run_id', options.runId);
  const { data, error } = await query.order('created_at').order('id');
  return requireRows(data, error).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id ?? undefined,
    attemptId: row.attempt_id ?? undefined,
    phase: row.phase,
    eventType: row.event_type ?? undefined,
    severity: row.severity ?? undefined,
    actor: row.actor ?? undefined,
    stepId: row.step_id ?? undefined,
    message: row.message,
    durationMs: row.duration_ms ?? undefined,
    traceId: row.trace_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    metadata: recordFromJson(row.metadata),
    createdAt: row.created_at,
  }));
}

export async function getClaimsAndGaps(sessionId: string) {
  const supabase = createSupabaseAdmin();
  const [claimsResult, gapsResult] = await Promise.all([
    supabase.from('research_claims').select('*').eq('session_id', sessionId),
    supabase.from('claim_gaps').select('*').eq('session_id', sessionId).order('created_at'),
  ]);

  return {
    claims: requireRows(claimsResult.data, claimsResult.error).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      text: row.text,
      status: row.status,
      severity: row.severity,
      sourceIds: stringArrayFromJson(row.source_ids),
      evidenceIds: stringArrayFromJson(row.evidence_ids),
      createdAt: row.created_at,
    })),
    gaps: requireRows(gapsResult.data, gapsResult.error).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      claimId: row.claim_id ?? undefined,
      description: row.description,
      severity: row.severity,
      status: row.status,
      resolution: row.resolution ?? undefined,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
    })),
  };
}

export async function getResearchArtifacts(sessionId: string) {
  const [sources, evaluations, learnings, events, report, claimsAndGaps] = await Promise.all([
    getSources(sessionId),
    getEvaluations(sessionId),
    getLearnings(sessionId),
    getEvents(sessionId),
    getReport(sessionId),
    getClaimsAndGaps(sessionId),
  ]);

  return { sources, evaluations, learnings, events, report, ...claimsAndGaps };
}

export async function getPostMortemForRun(runId: string): Promise<ResearchPostMortem | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_post_mortems').select('*').eq('run_id', runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPostMortemRow(data as Record<string, unknown>) : null;
}

export async function createPostMortem(sessionId: string, runId: string | undefined, rootCause: string, affectedStep?: string) {
  const supabase = createSupabaseAdmin();
  const id = crypto.randomUUID();
  const { error } = await supabase.from('research_post_mortems').insert({
    id,
    session_id: sessionId,
    run_id: runId ?? null,
    root_cause: rootCause,
    affected_step: affectedStep ?? null,
    action_items: [],
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
  await addEvent(
    sessionId,
    'failed',
    'Post-mortem created for failed research run.',
    { postMortemId: id, rootCause, affectedStep: affectedStep ?? null },
    { runId, eventType: 'post_mortem_created', severity: 'error', actor: 'worker', stepId: 'post_mortem' },
  );
}

async function getSources(sessionId: string): Promise<ResearchSource[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_sources').select('*').eq('session_id', sessionId);
  return requireRows(data, error).map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    canonicalUrl: row.canonical_url,
    domain: row.domain,
    snippet: row.snippet ?? '',
    content: row.content ?? '',
    publishedAt: row.published_at,
    score: row.score ?? 0,
    credibility: row.credibility ?? 'unknown',
    relevanceReason: row.relevance_reason ?? '',
  }));
}

async function getEvaluations(sessionId: string): Promise<SourceEvaluation[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('source_evaluations').select('*').eq('session_id', sessionId);
  return requireRows(data, error).map((row) => ({
    sourceId: row.source_id,
    isRelevant: row.is_relevant,
    score: row.score,
    credibility: row.credibility,
    reason: row.reason,
    risks: stringArrayFromJson(row.risks),
  }));
}

async function getLearnings(sessionId: string): Promise<ResearchLearning[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_learnings').select('*').eq('session_id', sessionId);
  return requireRows(data, error).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    claim: row.claim,
    evidence: row.evidence,
    followUpQuestions: stringArrayFromJson(row.follow_up_questions),
  }));
}

async function getReport(sessionId: string): Promise<ResearchReport | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_reports').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    sessionId: data.session_id,
    title: data.title,
    executiveSummary: data.executive_summary,
    sections: arrayFromJson<ResearchReport['sections'][number]>(data.sections),
    citations: arrayFromJson<ResearchReport['citations'][number]>(data.citations),
    markdown: data.markdown,
    createdAt: data.created_at,
  };
}

export async function assertSessionOwnership(userId: string, sessionId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_sessions').select('id').eq('id', sessionId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Research session was not found for this user.');
}

function mapSessionRow(row: Record<string, string>): ResearchSession {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    title: row.title,
    status: row.status as ResearchStatus,
    phase: row.phase as ResearchPhase,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRow(row: Record<string, unknown>): ResearchRun {
  const metadata = recordFromJson(row.metadata);
  const currentAttemptId = row.current_attempt_id ? String(row.current_attempt_id) : typeof metadata.attemptId === 'string' ? metadata.attemptId : null;
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    status: row.status as RunStatus,
    attempt: Number(row.attempt ?? 1),
    currentAttemptId,
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

function mapRunCostRow(row: Record<string, unknown>): RunCost {
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

function mapMemoryRow(row: Record<string, unknown>): ResearchMemory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    scope: row.scope === 'session' ? 'session' : 'user',
    namespace:
      row.namespace === 'source_cache' || row.namespace === 'procedure' || row.namespace === 'run_summary'
        ? row.namespace
        : 'preference',
    key: String(row.key),
    value: (row.value as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapApprovalRow(row: Record<string, unknown>): ResearchApproval {
  const action = row.action === 'reject' || row.action === 'follow_up' ? row.action : 'approve';
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    action,
    notes: row.notes ? String(row.notes) : null,
    approvedSourceIds: Array.isArray(row.approved_source_ids) ? row.approved_source_ids.map(String) : [],
    waivedGapIds: Array.isArray(row.waived_gap_ids) ? row.waived_gap_ids.map(String) : [],
    createdAt: String(row.created_at),
  };
}

function mapApprovalDecisionResult(value: unknown): ApprovalDecisionResult {
  const record = recordFromJson(value);
  if (record.ok === true) {
    const action = record.action === 'reject' || record.action === 'follow_up' ? record.action : 'approve';
    const runRecord = recordFromJson(record.run);
    const run = Object.keys(runRecord).length > 0 ? mapRunRow(runRecord) : null;
    return {
      ok: true,
      action,
      run,
      runId: run?.id ?? (record.runId ? String(record.runId) : null),
      status: run?.status ?? (isRunStatus(record.status) ? record.status : null),
    };
  }

  const error = recordFromJson(record.error);
  const code = approvalDecisionErrorCode(error.code);
  return {
    ok: false,
    code,
    details: error.details,
  };
}

function approvalDecisionErrorCode(value: unknown): ApprovalDecisionErrorCode {
  if (
    value === 'session_not_found' ||
    value === 'approval_not_available' ||
    value === 'waiver_notes_required' ||
    value === 'critical_gaps_unresolved' ||
    value === 'active_run_conflict' ||
    value === 'invalid_approval_request'
  ) {
    return value;
  }
  return 'invalid_approval_request';
}

function isRunStatus(value: unknown): value is RunStatus {
  return value === 'queued' || value === 'leased' || value === 'running' || value === 'awaiting_approval' || value === 'completed' || value === 'failed' || value === 'cancelled';
}

function mapPostMortemRow(row: Record<string, unknown>): ResearchPostMortem {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    runId: row.run_id ? String(row.run_id) : null,
    rootCause: String(row.root_cause),
    affectedStep: row.affected_step ? String(row.affected_step) : null,
    actionItems: Array.isArray(row.action_items) ? row.action_items.map(String) : [],
    createdAt: String(row.created_at),
  };
}

function toJson(value: unknown): Json {
  return value as Json;
}

function recordFromJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function arrayFromJson<Item>(value: unknown): Item[] {
  return Array.isArray(value) ? (value as Item[]) : [];
}
