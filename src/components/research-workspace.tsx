'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Props = {
  providerReady: boolean;
};

export function ResearchWorkspace({ providerReady }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function startResearch() {
    setBusy(true);
    setStatus('Creating research session...');
    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setStatus('Sign in with Supabase Auth before starting a hosted research run.');
        return;
      }

      const created = await fetch('/api/research/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query }),
      });
      const createdJson = await created.json();
      if (!created.ok) throw new Error(createdJson.error?.message ?? 'Could not create session.');

      setStatus('Queueing research run...');
      const run = await fetch(`/api/research/sessions/${createdJson.session.id}/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const runJson = await run.json();
      if (!run.ok) throw new Error(runJson.error?.message ?? 'Research run failed.');
      setStatus(`Research run queued: ${runJson.runId}`);
      window.location.href = `/sessions/${createdJson.session.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unexpected research failure.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <div>
        <div className="eyebrow">Research Workspace</div>
        <h1 className="h1">Ask Fin a question worth answering well.</h1>
      </div>
      <div className="composer">
        <textarea
          className="textarea"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Example: Research the latest practical uses of AI agents in compliance-heavy financial services."
        />
        <button className="button" disabled={!providerReady || query.trim().length < 3 || busy} onClick={startResearch}>
          {busy ? <Loader2 size={16} /> : <ArrowRight size={16} />}
          Start research
        </button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}
