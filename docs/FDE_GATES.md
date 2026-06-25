# FDE Gates

Last updated: 2026-06-24.

Fin is production-ready only when each public claim is implemented, tested, demoed, and documented. A row marked partial or planned is not portfolio-ready copy yet.

| Gate | Current status | Proof artifact | Command or evidence |
| --- | --- | --- | --- |
| Agent-legible procedural memory | Implemented | `AGENTS.md` | File review |
| Skills vs tools distinction | Implemented | `AGENTS.md`, `docs/SKILLS_AND_TOOLS.md`, typed Mastra tools | File review |
| Typed/versioned sprint contracts | Implemented | `docs/sprints/2026-06-24-fde-foundation.md` | File review |
| Three-agent adversarial harness | Implemented as deterministic three-role offline harness | `src/server/evals/offline-eval.ts`, 10 Zod-validated fixtures | `npm run evals` |
| Four-axis grader | Implemented offline seed | `src/server/evals/offline-eval.ts`, `docs/benchmark/offline-eval-summary.json` | `npm run evals` |
| Plateau scorer | Implemented pure module | `src/server/research/plateau-scorer.ts` | `npm run test` |
| Notebook authoring surface | Implemented as non-runtime artifact | `notebooks/` | `npm run notebooks:check` |
| Containerization | Implemented | Non-root `Dockerfile`, web healthcheck, compose restart/healthcheck policy, and worker command | `npm run container:build`, `npx vitest run tests/unit/container-config.test.ts` |
| FDE narrative README/About | Implemented | `README.md`, `docs/ABOUT.md`, `/about` with dynamic package version, offline-gated proof tier, pending configured-live proof state, and narrow-desktop overflow coverage | `npm run build`, Playwright |
| Honest benchmark doc | Implemented | `docs/BENCHMARK.md`, 10-scenario `docs/benchmark/offline-eval-summary.json` | `npm run benchmark:check` |
| Recorded live demo proof | Pending configured credentials | `docs/demo/live-demo.example.json`, `scripts/demo-record.mjs`, demo verifier tests | `npm run demo:record` and `npm run evals:live` after live run |
| ADRs | Implemented | `docs/adr/` | File review |
| Full test coverage for new surface | Implemented baseline; expansion in progress | Unit tests for contracts, repository adapters, Supabase schema/type parity, demo verifier, hosted API routes, worker runtime, logger redaction, rate limiting, smoke health secrecy, and coverage gate | `npm run test:coverage` |
| Contract single source of truth | Implemented | `contracts/schema.json` | `npm run contracts:check` |
| Supabase schema/RLS parity | Implemented | Migration tests cover table columns, SQL/Zod enum checks, event constraints, RLS enablement, ownership policies, API-only approval writes, cross-session graph integrity, service-role RPC grants, active-run uniqueness, lease uniqueness, durable run attempts, transition RPC fencing, transactional artifact replacement fencing, transactional approval decisions, and expired-lease heartbeat rejection; repository tests cover artifact/event DB payload shape and attempt-fenced run/RPC calls | `npx vitest run tests/unit/migrations.test.ts tests/unit/repository.test.ts` |
| Supabase DB type parity | Implemented with committed migration-derived snapshot | `src/lib/supabase/database.types.ts`, typed Supabase clients, compile-only DB parity assertions, migration inventory test | `npm run typecheck`, `npx vitest run tests/unit/migrations.test.ts` |
| Dual runtime behind contract | Implemented | Pure worker runtime, worker queue, durable attempt tokens, lease-guarded pipeline persistence, `/run` enqueue, hosted route tests, Docker web/worker commands | `npx vitest run tests/unit/research-worker.test.ts`, `npx vitest run tests/unit/hosted-api-routes.test.ts`, `npm run container:build` |
| Eval regression detection | Implemented | Fixture score baselines, seven adversarial negative controls, CI eval artifact, eval API, checked benchmark artifact | `npm run evals`, `npm run benchmark:check`, `GET /api/research/evals` |
| Persisted offline eval history | Implemented | Typed eval contracts, Supabase eval history migration/RPC, public-safe projected history API | `npm run evals:persist`, `GET /api/research/evals/history` |
| HITL approval state machine | Implemented | Research stage stops at approval; transactional approval RPC tests cover stale-state rejection, critical-gap blocking, waiver notes, active-run conflict handling, reject, follow-up, reporting enqueue, and `GET /api/research/sessions/:id/approvals` exposes decision history | `npm run test:coverage`, `npx vitest run tests/unit/migrations.test.ts tests/unit/repository.test.ts tests/unit/hosted-api-routes.test.ts` |
| Structured run-events log | Implemented | Run-linked events, trace/correlation fields, cost events, post-mortem events, worker claim events, SSE route formatting | `npm run contracts:check`, `npx vitest run tests/unit/research-worker.test.ts`, `npx vitest run tests/unit/hosted-api-routes.test.ts` |
| Authenticated session UI loaders | Implemented | `/sessions`, `/sessions/[id]`, `/reports/[id]` client loaders | `npm run test:e2e` |
| OpenTelemetry trace surface | Implemented | `src/server/telemetry.ts`, trace-linked run events | `npm run typecheck` |
| Post-mortem generation | Implemented | Worker writes failed-run post-mortems only after lease ownership is proven; persisted root cause is sanitized; lease-loss failure handling avoids stale failed-state writes | `npx vitest run tests/unit/research-worker.test.ts`, Worker/API review |
| Memory surface | Implemented | Supabase memory table, `/api/research/memory`, session UI, best-effort worker run summaries, session ownership route tests | `npm run test:coverage`, `npx vitest run tests/unit/research-worker.test.ts` |
| CI covering production gates | Implemented | `.github/workflows/ci.yml` with Node 24 jobs, current first-party action majors, and hosted `/api/health` smoke after `next start` | GitHub Actions |
| Stale dependency PR cleanup | Implemented script | `scripts/close-stale-deps-prs.sh` | `npm run deps:close-stale-prs` |
| Engineering blog posts | Implemented drafts | `docs/blog/` | File review |
| Standard repo hygiene | Implemented | README, license, changelog, security, contributing, env example, issue templates, PR template | File review |

## Exception Process

Exceptions require an owner, expiry date, risk statement, and follow-up issue. Do not convert planned rows into README claims until the proof column is green.
