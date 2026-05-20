import Link from 'next/link';

export default function SessionsPage() {
  return (
    <section className="panel stack">
      <div>
        <div className="eyebrow">Session History</div>
        <h1 className="h1">Research sessions</h1>
      </div>
      <p className="muted">
        Hosted session history is available through the authenticated API. The UI shell is ready for Supabase-authenticated session listing once project keys are configured.
      </p>
      <Link className="button secondary" href="/">
        Start a new session
      </Link>
    </section>
  );
}
