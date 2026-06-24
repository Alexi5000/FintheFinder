# Demo Contract

The demo must prove the product path, not only the UI shell.

## Unconfigured Local Demo

```bash
npm install
npm run verify
npm run dev
```

Expected: `/` renders the workspace, provider status shows missing keys, `/settings` shows model defaults, and `/api/health` returns non-secret configuration status.

## Configured Live Demo

1. Configure `.env` from `.env.example`.
2. Run Supabase migrations.
3. Start the web service and worker.
4. Sign in, create a session, enqueue a run, review sources/claims/events, approve, generate a report, export markdown.
5. Record the run ID, exported report, screenshots or video, eval summary, and cost row in `docs/BENCHMARK.md`.

`npm run demo:record` prints the required manual evidence checklist.
