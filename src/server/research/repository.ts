import type {
  ClaimAudit,
  ClaimEvidence,
  ClaimGap,
  ResearchLearning,
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

  const [sources, evaluations, learnings, events, report, currentRun] = await Promise.all([
    getSources(sessionId),
    getEvaluations(sessionId),
    getLearnings(sessionId),
    getEvents(sessionId),
    getReport(sessionId),
    getLatestRunForSession(sessionId),
  ]);

  const [currentRunCost, currentPostMortem] = currentRun
    ? await Promise.all([getRunCostForRun(currentRun.id), getPostMortemForRun(currentRun.id)])
    : [null, null];

  return { ...session, currentRun, currentRunCost, currentPostMortem, sources, evaluations, learnings, events, report };
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
  if (active && ((active.metadata as Record<string, unknown> | null)?.stage ?? 'research') === stage) {
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
      metadata,
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

export async function heartbeatResearchRun(runId: string, workerId: string, leaseMs: number): Promise<ResearchRun | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .rpc('extend_research_run_lease', { p_run_id: runId, p_worker_id: workerId, p_lease_ms: leaseMs })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunRow(data as Record<string, unknown>) : null;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  updates: { error?: string | null; startedAt?: string | null; completedAt?: string | null; workerId?: string } = {},
): Promise<ResearchRun> {
  const supabase = createSupabaseAdmin();
  const patch: Record<string, unknown> = {
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
    usage,
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
  artifacts: {
    sources: ResearchSource[];
    evaluations: SourceEvaluation[];
    learnings: ResearchLearning[];
    claims?: ResearchClaim[];
    claimEvidence?: ClaimEvidence[];
    claimGaps?: ClaimGap[];
    audits?: Array<{ runId?: string; auditType: string; audit: ClaimAudit | { ok: boolean; issues: string[] } }>;
    report?: ResearchReport;
  },
) {
  const supabase = createSupabaseAdmin();
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
        risks: evaluation.risks,
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
        follow_up_questions: learning.followUpQuestions,
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
        source_ids: claim.sourceIds,
        evidence_ids: claim.evidenceIds,
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
        issues: 'issues' in audit ? audit.issues : audit.openGaps,
        created_at: nowIso(),
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (artifacts.report) {
    await saveReport(artifacts.report);
  }
}

export async function saveReport(report: ResearchReport) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('research_reports').insert({
    id: report.id,
    session_id: report.sessionId,
    title: report.title,
    executive_summary: report.executiveSummary,
    sections: report.sections,
    citations: report.citations,
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
    issues: audit.issues ?? [],
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
}

export async function addApproval(
  sessionId: string,
  userId: string,
  action: string,
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
    approved_source_ids: approvedSourceIds,
    waived_gap_ids: waivedGapIds,
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
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
    value: input.value,
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
    metadata,
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
    metadata: row.metadata ?? {},
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
      sourceIds: row.source_ids ?? [],
      evidenceIds: row.evidence_ids ?? [],
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
    risks: row.risks ?? [],
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
    followUpQuestions: row.follow_up_questions ?? [],
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
    sections: data.sections,
    citations: data.citations,
    markdown: data.markdown,
    createdAt: data.created_at,
  };
}

async function assertSessionOwnership(userId: string, sessionId: string) {
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
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    status: row.status as RunStatus,
    attempt: Number(row.attempt ?? 1),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
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
