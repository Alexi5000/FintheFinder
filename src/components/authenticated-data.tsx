'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Loader2, Play, RefreshCw, Save, XCircle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { ClaimGap, ResearchApproval, ResearchClaim, ResearchMemory, ResearchPostMortem, ResearchRun, ResearchSession, ResearchSessionDetail, RunCost } from '@/lib/schemas';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unauthenticated' | 'unconfigured';
  data?: T;
  message?: string;
};

async function getBearerToken() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return { kind: 'unconfigured' as const };
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { kind: 'unauthenticated' as const };
  return { kind: 'ready' as const, token };
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getBearerToken();
  if (token.kind === 'unconfigured') throw new Error('Supabase browser configuration is missing.');
  if (token.kind === 'unauthenticated') throw new Error('Use an existing Supabase Auth session to inspect hosted research data.');
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token.token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  return payload as T;
}

function useAuthedResource<T>(path: string, initialData?: T) {
  const [state, setState] = useState<LoadState<T>>(initialData ? { status: 'ready', data: initialData } : { status: 'idle' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await authedFetch<T>(path) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected data loading failure.';
      const status = message.includes('configuration') ? 'unconfigured' : message.includes('Supabase Auth session') ? 'unauthenticated' : 'error';
      setState({ status, message });
    }
  }, [path]);

  useEffect(() => {
    if (initialData) return;
    queueMicrotask(() => {
      void load();
    });
  }, [initialData, load]);

  return { state, reload: load };
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel stack">
      <div>
        <div className="eyebrow">{title}</div>
        <p className="muted">{body}</p>
      </div>
      <Link className="button secondary" href="/">
        Open workspace
      </Link>
    </section>
  );
}

function StatusBlock<T>({ state, loadingLabel }: { state: LoadState<T>; loadingLabel: string }) {
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <section className="panel center-row">
        <Loader2 size={16} />
        <span className="muted">{loadingLabel}</span>
      </section>
    );
  }
  if (state.status === 'unconfigured') {
    return <EmptyState title="Supabase Not Configured" body="Add Supabase URL and anon key values to inspect hosted research records from the UI." />;
  }
  if (state.status === 'unauthenticated') {
    return <EmptyState title="Supabase Session Required" body={state.message ?? 'Use an existing Supabase Auth session before loading hosted research data.'} />;
  }
  if (state.status === 'error') {
    return <EmptyState title="Data Load Failed" body={state.message ?? 'The authenticated API returned an error.'} />;
  }
  return null;
}

export function SessionsClient() {
  const { state, reload } = useAuthedResource<{ sessions: ResearchSession[] }>('/api/research/sessions');
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading research sessions..." />;

  const sessions = state.data?.sessions ?? [];
  return (
    <section className="panel stack">
      <div className="split-row">
        <div>
          <div className="eyebrow">Session History</div>
          <h1 className="h1">Research sessions</h1>
        </div>
        <button className="button secondary" onClick={reload} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="muted">No research sessions exist for this user yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Phase</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <Link href={`/sessions/${session.id}`}>{session.title}</Link>
                </td>
                <td>
                  <span className="status">{session.status}</span>
                </td>
                <td>{session.phase}</td>
                <td>{new Date(session.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Link className="button" href="/">
        <Play size={16} />
        Start a new session
      </Link>
    </section>
  );
}

export function SessionDetailClient({
  sessionId,
  initialClaims,
  initialMemories,
  initialSession,
}: {
  sessionId: string;
  initialClaims?: { claims: ResearchClaim[]; gaps: ClaimGap[] };
  initialMemories?: ResearchMemory[];
  initialSession?: ResearchSessionDetail;
}) {
  const { state, reload } = useAuthedResource<{ session: ResearchSessionDetail }>(
    `/api/research/sessions/${sessionId}`,
    initialSession ? { session: initialSession } : undefined,
  );
  const [actionStatus, setActionStatus] = useState('');
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading session detail..." />;

  const session = state.data?.session;
  if (!session) return null;
  const currentRun = session.currentRun;
  const currentRunCost = session.currentRunCost ?? null;
  const currentPostMortem = session.currentPostMortem ?? null;

  async function postAction(path: string, body?: unknown) {
    setActionStatus('Submitting...');
    try {
      const result = await authedFetch<{ runId?: string; status?: string }>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setActionStatus(result.runId ? `Queued run ${result.runId}` : 'Saved.');
      await reload();
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Action failed.');
    }
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="split-row">
          <div>
            <div className="eyebrow">Session Detail</div>
            <h1 className="h1">{session.title}</h1>
          </div>
          <span className="status">{session.status}</span>
        </div>
        <p className="muted">{session.query}</p>
        <div className="action-row">
          <button className="button" type="button" onClick={() => postAction(`/api/research/sessions/${session.id}/run`)}>
            <Play size={16} />
            Queue research
          </button>
          <button className="button secondary" onClick={reload} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {actionStatus ? <p className="muted">{actionStatus}</p> : null}
      </section>

      <div className="metric-grid">
        <Metric label="Sources" value={session.sources.length} />
        <Metric label="Learnings" value={session.learnings.length} />
        <Metric label="Events" value={session.events.length} />
        <Metric label="Approvals" value={session.approvals.length} />
        <Metric label="Report" value={session.report ? 'Ready' : 'Pending'} />
      </div>

      <RunPanel run={currentRun ?? null} cost={currentRunCost} postMortem={currentPostMortem} />
      {session.status === 'awaiting_approval' ? <ApprovalGatePanel initialClaims={initialClaims} session={session} postAction={postAction} /> : null}
      <ApprovalHistoryPanel approvals={session.approvals} />
      <ClaimsPanel initialClaims={initialClaims} sessionId={session.id} />
      <MemoryPanel initialMemories={initialMemories} sessionId={session.id} />
      <ArtifactsPanel session={session} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 5 }).format(value);
}

function formatMemoryValue(value: Record<string, unknown>) {
  if (typeof value.note === 'string') return value.note;
  if (typeof value.status === 'string' && typeof value.runId === 'string') return `${value.status} - ${value.runId}`;
  return JSON.stringify(value);
}

function RunPanel({ run, cost, postMortem }: { run: ResearchRun | null; cost: RunCost | null; postMortem: ResearchPostMortem | null }) {
  if (!run) {
    return (
      <section className="panel">
        <h2 className="h2">Current run</h2>
        <p className="muted">No queued worker run exists yet.</p>
      </section>
    );
  }
  return (
    <section className="panel stack">
      <div className="split-row">
        <div>
          <h2 className="h2">Current run</h2>
          <p className="muted">{run.id}</p>
        </div>
        <span className="status">{run.status}</span>
      </div>
      <div className="kv-grid">
        <span>Stage</span>
        <strong>{String(run.metadata.stage ?? 'research')}</strong>
        <span>Attempt</span>
        <strong>{run.attempt}</strong>
        <span>Worker</span>
        <strong>{run.workerId ?? 'unclaimed'}</strong>
        <span>Updated</span>
        <strong>{new Date(run.updatedAt).toLocaleString()}</strong>
        <span>Cost</span>
        <strong>{cost ? `${formatUsd(cost.totalUsd)} ${cost.measurementMethod}` : 'pending'}</strong>
        {cost ? (
          <>
            <span>Pricing</span>
            <strong>{cost.pricingEffectiveDate}</strong>
            <span>Usage</span>
            <strong>
              {cost.usage.modelCalls.length} calls, {cost.usage.exaSearches} searches
            </strong>
          </>
        ) : null}
      </div>
      {postMortem ? (
        <div className="callout danger">
          <strong>Post-mortem</strong>
          <p>{postMortem.rootCause}</p>
          <p className="muted">
            {postMortem.affectedStep ?? 'unknown step'} - {new Date(postMortem.createdAt).toLocaleString()}
          </p>
        </div>
      ) : null}
      <Link className="button secondary" href={`/api/research/runs/${run.id}`}>
        Inspect run JSON
      </Link>
    </section>
  );
}

function ApprovalGatePanel({
  initialClaims,
  session,
  postAction,
}: {
  initialClaims?: { claims: ResearchClaim[]; gaps: ClaimGap[] };
  session: ResearchSessionDetail;
  postAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const { state, reload } = useAuthedResource<{ claims: ResearchClaim[]; gaps: ClaimGap[] }>(`/api/research/sessions/${session.id}/claims`, initialClaims);
  const [selectedWaivers, setSelectedWaivers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading approval gate..." />;

  const gaps = state.data?.gaps ?? [];
  const openCriticalGaps = gaps.filter((gap) => gap.severity === 'critical' && gap.status === 'open');
  const selected = new Set(selectedWaivers);
  const allCriticalWaived = openCriticalGaps.every((gap) => selected.has(gap.id));
  const canApprove = openCriticalGaps.length === 0 || (allCriticalWaived && notes.trim().length > 0);

  function toggleWaiver(gapId: string) {
    setSelectedWaivers((current) => (current.includes(gapId) ? current.filter((id) => id !== gapId) : [...current, gapId]));
  }

  async function submit(action: 'approve' | 'follow_up' | 'reject') {
    await postAction(`/api/research/sessions/${session.id}/approval`, {
      action,
      notes: notes.trim() || undefined,
      approvedSourceIds: action === 'approve' ? session.sources.map((source) => source.id) : [],
      waivedGapIds: action === 'approve' ? selectedWaivers : [],
    });
    setSelectedWaivers([]);
    setNotes('');
    await reload();
  }

  return (
    <section className="panel stack">
      <div className="split-row">
        <div>
          <h2 className="h2">Human approval gate</h2>
          <p className="muted">
            {openCriticalGaps.length ? `${openCriticalGaps.length} critical gap${openCriticalGaps.length === 1 ? '' : 's'} open` : 'No critical gaps open'}
          </p>
        </div>
        <button className="button secondary" onClick={reload} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {openCriticalGaps.length ? (
        <div className="stack">
          {openCriticalGaps.map((gap) => (
            <label className="checkbox-row" key={gap.id}>
              <input checked={selectedWaivers.includes(gap.id)} onChange={() => toggleWaiver(gap.id)} type="checkbox" />
              <span>{gap.description}</span>
            </label>
          ))}
        </div>
      ) : null}
      <textarea className="textarea compact" onChange={(event) => setNotes(event.target.value)} placeholder="Reviewer notes" value={notes} />
      <div className="action-row">
        <button className="button secondary" disabled={!canApprove} onClick={() => submit('approve')} type="button">
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button className="button secondary" onClick={() => submit('follow_up')} type="button">
          <RefreshCw size={16} />
          Follow up
        </button>
        <button className="button secondary danger" onClick={() => submit('reject')} type="button">
          <XCircle size={16} />
          Reject
        </button>
      </div>
    </section>
  );
}

function ApprovalHistoryPanel({ approvals }: { approvals: ResearchApproval[] }) {
  return (
    <section className="panel stack">
      <div>
        <h2 className="h2">Approval history</h2>
        <p className="muted">{approvals.length ? `${approvals.length} recorded decision${approvals.length === 1 ? '' : 's'}` : 'No human decisions recorded yet.'}</p>
      </div>
      {approvals.length ? (
        <div className="stack">
          {approvals.slice(0, 5).map((approval) => (
            <article className="memory-row" key={approval.id}>
              <div className="split-row">
                <strong>{approval.action}</strong>
                <span className="status">{new Date(approval.createdAt).toLocaleString()}</span>
              </div>
              {approval.notes ? <p>{approval.notes}</p> : <p className="muted">No reviewer notes.</p>}
              <p className="muted">
                {approval.approvedSourceIds.length} approved sources, {approval.waivedGapIds.length} waived gaps
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ClaimsPanel({ initialClaims, sessionId }: { initialClaims?: { claims: ResearchClaim[]; gaps: ClaimGap[] }; sessionId: string }) {
  const { state, reload } = useAuthedResource<{ claims: ResearchClaim[]; gaps: ClaimGap[] }>(`/api/research/sessions/${sessionId}/claims`, initialClaims);
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading claims and gaps..." />;

  const claims = state.data?.claims ?? [];
  const gaps = state.data?.gaps ?? [];
  return (
    <section className="panel stack">
      <div className="split-row">
        <div>
          <h2 className="h2">Claims and gaps</h2>
          <p className="muted">Report readiness is blocked while critical gaps remain open.</p>
        </div>
        <button className="button secondary" onClick={reload} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <div className="two-column">
        <div className="stack">
          <strong>Supported claims</strong>
          {claims.length ? claims.map((claim) => <p key={claim.id}>{claim.text}</p>) : <p className="muted">No claims persisted yet.</p>}
        </div>
        <div className="stack">
          <strong>Open gaps</strong>
          {gaps.length ? (
            gaps.map((gap) => (
              <p key={gap.id}>
                <span className="status bad">{gap.severity}</span> {gap.description}
              </p>
            ))
          ) : (
            <p className="muted">No claim gaps persisted yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MemoryPanel({ initialMemories, sessionId }: { initialMemories?: ResearchMemory[]; sessionId: string }) {
  const { state, reload } = useAuthedResource<{ memories: ResearchMemory[] }>(
    `/api/research/memory?sessionId=${sessionId}`,
    initialMemories ? { memories: initialMemories } : undefined,
  );
  const [note, setNote] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading research memory..." />;

  const memories = state.data?.memories ?? [];

  async function saveNote() {
    if (!note.trim()) return;
    setSaveStatus('Saving...');
    try {
      await authedFetch<{ memory: ResearchMemory }>('/api/research/memory', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          scope: 'session',
          namespace: 'procedure',
          key: `operator-note:${Date.now()}`,
          value: { note: note.trim(), recordedAt: new Date().toISOString(), source: 'session_ui' },
        }),
      });
      setNote('');
      setSaveStatus('Saved.');
      await reload();
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Save failed.');
    }
  }

  return (
    <section className="panel stack">
      <div className="split-row">
        <div>
          <h2 className="h2">Research memory</h2>
          <p className="muted">{memories.length ? `${memories.length} scoped memories` : 'No scoped memories yet'}</p>
        </div>
        <button className="button secondary" onClick={reload} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <div className="action-row">
        <input className="input" onChange={(event) => setNote(event.target.value)} placeholder="Session memory note" value={note} />
        <button className="button secondary" disabled={!note.trim()} onClick={saveNote} type="button">
          <Save size={16} />
          Save
        </button>
      </div>
      {saveStatus ? <p className="muted">{saveStatus}</p> : null}
      <div className="stack">
        {memories.slice(0, 6).map((memory) => (
          <article className="memory-row" key={memory.id}>
            <div className="split-row">
              <strong>{memory.namespace}</strong>
              <span className="status">{memory.scope}</span>
            </div>
            <p className="muted">{formatMemoryValue(memory.value)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ArtifactsPanel({ session }: { session: ResearchSessionDetail }) {
  return (
    <section className="panel stack">
      <div className="split-row">
        <h2 className="h2">Research artifacts</h2>
        <Link className="button secondary" href={`/reports/${session.id}`}>
          Open report
        </Link>
      </div>
      <div className="two-column">
        <div className="stack">
          <strong>Sources</strong>
          {session.sources.length ? (
            session.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            ))
          ) : (
            <p className="muted">No sources persisted yet.</p>
          )}
        </div>
        <div className="stack">
          <strong>Events</strong>
          {session.events.slice(-6).map((event) => (
            <p key={event.id} className="muted">
              {event.phase}: {event.message}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReportReaderClient({ initialSession, sessionId }: { initialSession?: ResearchSessionDetail; sessionId: string }) {
  const { state, reload } = useAuthedResource<{ session: ResearchSessionDetail }>(
    `/api/research/sessions/${sessionId}`,
    initialSession ? { session: initialSession } : undefined,
  );
  const [exportStatus, setExportStatus] = useState('');
  if (state.status !== 'ready') return <StatusBlock state={state} loadingLabel="Loading report..." />;

  const session = state.data?.session;
  const report = session?.report;

  async function exportMarkdown() {
    setExportStatus('Preparing markdown export...');
    try {
      const token = await getBearerToken();
      if (token.kind === 'unconfigured') throw new Error('Supabase browser configuration is missing.');
      if (token.kind === 'unauthenticated') throw new Error('Use an existing Supabase Auth session to export reports.');
      const response = await fetch(`/api/reports/${sessionId}/export.md`, { headers: { authorization: `Bearer ${token.token}` } });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const markdown = await response.text();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${session?.title ?? 'fin-report'}.md`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase();
      anchor.click();
      URL.revokeObjectURL(url);
      setExportStatus('Markdown exported.');
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  return (
    <article className="panel stack report-reader">
      <div className="split-row">
        <div>
          <div className="eyebrow">Report Reader</div>
          <h1 className="h1">{report?.title ?? session?.title ?? sessionId}</h1>
        </div>
        <div className="action-row">
          {report ? (
            <button className="button" type="button" onClick={exportMarkdown}>
              <Download size={16} />
              Export markdown
            </button>
          ) : null}
          <button className="button secondary" onClick={reload} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
      {exportStatus ? <p className="muted">{exportStatus}</p> : null}
      {report ? <pre className="markdown-preview">{report.markdown}</pre> : <p className="muted">No report exists yet. Approve the research packet to queue report generation.</p>}
    </article>
  );
}
