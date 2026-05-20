import type {
  ResearchLearning,
  ResearchReport,
  ResearchRunEvent,
  ResearchSession,
  ResearchSessionDetail,
  ResearchSource,
  SourceEvaluation,
  ResearchPhase,
  ResearchStatus,
} from '@/lib/schemas';
import { nowIso, titleFromQuery } from '@/lib/utils';
import { createSupabaseAdmin } from '@/server/supabase/server';

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

  const [sources, evaluations, learnings, events, report] = await Promise.all([
    getSources(sessionId),
    getEvaluations(sessionId),
    getLearnings(sessionId),
    getEvents(sessionId),
    getReport(sessionId),
  ]);

  return { ...session, sources, evaluations, learnings, events, report };
}

export async function updateSessionState(sessionId: string, status: ResearchStatus, phase: ResearchPhase) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('research_sessions')
    .update({ status, phase, updated_at: nowIso() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function replaceResearchArtifacts(
  sessionId: string,
  artifacts: {
    sources: ResearchSource[];
    evaluations: SourceEvaluation[];
    learnings: ResearchLearning[];
    report?: ResearchReport;
  },
) {
  const supabase = createSupabaseAdmin();
  await Promise.all([
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

export async function addApproval(sessionId: string, userId: string, action: string, notes?: string, approvedSourceIds: string[] = []) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('research_approvals').insert({
    id: crypto.randomUUID(),
    session_id: sessionId,
    user_id: userId,
    action,
    notes: notes ?? null,
    approved_source_ids: approvedSourceIds,
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
}

export async function addEvent(sessionId: string, phase: ResearchPhase, message: string, metadata: Record<string, unknown> = {}) {
  const supabase = createSupabaseAdmin();
  const event: ResearchRunEvent = {
    id: crypto.randomUUID(),
    sessionId,
    phase,
    message,
    metadata,
    createdAt: nowIso(),
  };
  const { error } = await supabase.from('research_events').insert({
    id: event.id,
    session_id: sessionId,
    phase,
    message,
    metadata,
    created_at: event.createdAt,
  });
  if (error) throw new Error(error.message);
  return event;
}

export async function getEvents(sessionId: string): Promise<ResearchRunEvent[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from('research_events').select('*').eq('session_id', sessionId).order('created_at');
  return requireRows(data, error).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    phase: row.phase,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
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
