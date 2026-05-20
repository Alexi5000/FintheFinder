export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <article className="panel stack">
      <div>
        <div className="eyebrow">Report Reader</div>
        <h1 className="h1">Report {id}</h1>
      </div>
      <p className="muted">
        Reports are served from the authenticated API and can be exported as markdown from <code>/api/reports/{id}/export.md</code>.
      </p>
    </article>
  );
}
