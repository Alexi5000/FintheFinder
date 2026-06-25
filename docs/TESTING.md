# Testing

## Local Gates

`npm run typecheck` runs the app compiler plus `tsconfig.type-tests.json`, which includes compile-only Supabase DB parity assertions under `tests/type/`.

`npm run test:coverage` instruments first-party contract/server code and enforces the current production baseline: 70% statements, 55% branches, 75% functions, and 75% lines. Raise the baseline as the authenticated UI and hosted adapters gain deeper tests.

```bash
npm run typecheck
npm run lint
npm run contracts:check
npm run notebooks:check
npm run test:coverage
npm run evals
npm run benchmark:check
npm run build
npm run audit
npm run smoke
```

CI also starts the built Next.js server and runs `SMOKE_URL=http://127.0.0.1:3000 npm run smoke` against `/api/health`.

## Unit Tests

Current unit coverage includes:

- Shared Zod schemas
- Authenticated data UI populated rendering for session detail, report reader, run cost, approvals, claims, memory, and artifacts
- Container runtime config for non-root image execution, Docker healthcheck, compose healthchecks, worker healthcheck fail-closed behavior, and restart policy
- Runtime public Supabase browser config for containerized web clients without build-time public env injection
- Coverage gate configuration for first-party contract/server code
- Demo proof verifier CLI behavior
- Hosted API route contracts for queueing runs, run status, SSE events, report export, claims, memory ownership, and transactional HITL approval-decision mapping
- Canonical URL normalization
- Citation auditing
- Logger redaction for nested credentials, prompts, queries, and secret-like error messages
- Exa provider behavior with mocked missing-key, success mapping, canonical duplicate filtering, provider error wrapping, and timeout coverage
- Pipeline HITL/cost behavior, including budget metadata, over-budget warnings, and critical-gap budget gates
- Persisted eval history with public-safe column projection and summary sanitization
- Rate-limit window, reset, and per-key isolation behavior
- Production boundary checks that keep hosted run requests enqueue-only and prevent pipeline report readiness from bypassing transactional publication
- Repository persistence mapping for costs, memories, and post-mortems
- Smoke-script hosted health contract and secret-leak rejection
- Worker runtime config parsing, no-work paths, attempt-token lease heartbeats, lease-guarded pipeline persistence, lease-loss terminal-write blocking, reporting dispatch, sanitized failure artifacts, and best-effort run-summary memory
- Supabase migration parity for table columns, SQL/Zod enum checks, event constraints, RLS, cross-session graph integrity, durable run attempts, attempt-fenced service-role RPCs, terminal job-lease cleanup, transactional artifact replacement fencing, transactional approval decisions, transactional final report publication, non-test report-publication fallback rejection, expired-lease heartbeat rejection, API-only approval writes, and repository artifact/event/publish payload shape
- Supabase DB type parity with a committed migration-derived snapshot, typed clients, RPC/table union checks, and migration inventory tests

Add new unit tests for every new schema, service, and agent contract.

## E2E Tests

Playwright is configured in `playwright.config.ts`.

```bash
npm run test:e2e
```

E2E coverage should prioritize:

- Workspace loads without configured providers
- Settings exposes provider status
- About renders the package version, offline-gated proof tier, pending configured-live proof state, and narrow-desktop layout without horizontal overflow
- Authenticated session flow
- Report export flow

## Agent Quality Evals

Future eval fixtures should score:

- Source quality
- Citation coverage
- Contradiction handling
- Report completeness
- Uncertainty labeling

Every prompt or model change should be evaluated against the fixture set before release.

Use a positional output path when a checked JSON artifact is needed:

```bash
npm run evals -- artifacts/evals/offline-summary.json
```

Use Supabase-backed history when a release or demo needs durable proof rows:

```bash
npm run evals:persist
```

`npm run evals:persist` is offline-only and requires Supabase environment variables. `npm run evals:live` remains the fail-closed configured-live proof check.

## Configured Live Proof

`npm run verify` proves the local deterministic and build gates; it does not prove a configured live demo. Live proof requires real provider/Supabase credentials, `docs/demo/live-demo.json`, local report/eval/media artifacts, a benchmark row, and session-level evidence for the research run, approval, reporting run, per-stage costs, aggregate usage, model calls, token count, and Exa search count. The live proof gate is:

```bash
npm run demo:record
npm run evals:live
```
