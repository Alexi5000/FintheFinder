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
5. Run `npm run evals:persist` to record the offline eval proof history for the configured environment.
6. Record the run ID, trace ID, exported report, screenshots or video, eval summary, persisted eval-history row, and cost row in `docs/BENCHMARK.md`.
7. Copy `docs/demo/live-demo.example.json` to `docs/demo/live-demo.json`, fill it with the recorded evidence, and run:

```bash
npm run demo:record
npm run evals:live
```

`npm run demo:record` fails closed until every evidence field is present and local artifact paths exist. Do not claim live demo proof from the example manifest.
`npm run evals:live` also fails closed unless provider credentials and the recorded live eval artifact exist.
