import { getProviderStatus } from '@/lib/config';
import { ResearchWorkspace } from '@/components/research-workspace';

export default function HomePage() {
  const status = getProviderStatus();
  const providerReady = status.openai && status.exa && status.supabase;

  return (
    <div className="workspace-grid">
      <ResearchWorkspace providerReady={providerReady} />
      <aside className="stack">
        <section className="panel">
          <h2 className="h2">Production Readiness</h2>
          <div className="stack">
            <span className={status.openai ? 'status good' : 'status bad'}>OpenAI {status.openai ? 'ready' : 'missing'}</span>
            <span className={status.exa ? 'status good' : 'status bad'}>Exa {status.exa ? 'ready' : 'missing'}</span>
            <span className={status.supabase ? 'status good' : 'status bad'}>Supabase {status.supabase ? 'ready' : 'missing'}</span>
          </div>
        </section>
        <section className="panel">
          <h2 className="h2">Agent Stack</h2>
          <p className="muted">
            Planner, search, evaluation, extraction, contradiction review, citation audit, report writing, and final review are registered as typed Mastra agents.
          </p>
        </section>
      </aside>
    </div>
  );
}
