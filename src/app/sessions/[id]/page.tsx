import Link from 'next/link';

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="stack">
      <section className="panel">
        <div className="eyebrow">Session Detail</div>
        <h1 className="h1">{id}</h1>
        <p className="muted">
          This dedicated detail route is wired for authenticated session inspection. Use the API with a Supabase bearer token to load sources, learnings, events, approvals, and reports.
        </p>
      </section>
      <div className="metric-grid">
        <div className="metric">
          <strong>Sources</strong>
          <span className="muted">Persisted per run</span>
        </div>
        <div className="metric">
          <strong>Learnings</strong>
          <span className="muted">Evidence-backed</span>
        </div>
        <div className="metric">
          <strong>Events</strong>
          <span className="muted">Traceable phases</span>
        </div>
        <div className="metric">
          <strong>Report</strong>
          <span className="muted">Cited markdown</span>
        </div>
      </div>
      <Link className="button secondary" href={`/reports/${id}`}>
        Open report view
      </Link>
    </div>
  );
}
