# FDE Gates

Last updated: 2026-06-24.

Fin is production-ready only when each public claim is implemented, tested, demoed, and documented. A row marked partial or planned is not portfolio-ready copy yet.

| Gate | Current status | Proof artifact | Command or evidence |
| --- | --- | --- | --- |
| Agent-legible procedural memory | Implemented | `AGENTS.md` | File review |
| Skills vs tools distinction | Implemented | `AGENTS.md`, `docs/SKILLS_AND_TOOLS.md`, typed Mastra tools | File review |
| Typed/versioned sprint contracts | Implemented | `docs/sprints/2026-06-24-fde-foundation.md` | File review |
| Three-agent adversarial harness | Implemented offline seed | `src/server/evals/offline-eval.ts`, fixtures | `npm run evals` |
| Four-axis grader | Implemented offline seed | `src/server/evals/offline-eval.ts` | `npm run evals` |
| Plateau scorer | Implemented pure module | `src/server/research/plateau-scorer.ts` | `npm run test` |
| Notebook authoring surface | Implemented as non-runtime artifact | `notebooks/` | `npm run notebooks:check` |
| Containerization | Implemented | `Dockerfile`, `docker-compose.yml` | `npm run container:build` |
| FDE narrative README/About | Implemented | `README.md`, `docs/ABOUT.md`, `/about` | `npm run build`, Playwright |
| Honest benchmark doc | Implemented | `docs/BENCHMARK.md`, `docs/benchmark/offline-eval-summary.json` | `npm run benchmark:check` |
| Recorded live demo proof | Pending configured credentials | `docs/demo/live-demo.example.json`, `scripts/demo-record.mjs`, demo verifier tests | `npm run demo:record` and `npm run evals:live` after live run |
| ADRs | Implemented | `docs/adr/` | File review |
| Full test coverage for new surface | Implemented | Unit tests and coverage gate | `npm run test:coverage` |
| Contract single source of truth | Implemented | `contracts/schema.json` | `npm run contracts:check` |
| Dual runtime behind contract | Implemented | Worker queue, `/run` enqueue, Docker web/worker commands | `npm run worker`, `npm run container:build` |
| Eval regression detection | Implemented | Fixture score baselines, negative controls, CI eval artifact, eval API, checked benchmark artifact | `npm run evals`, `npm run benchmark:check`, `GET /api/research/evals` |
| Persisted offline eval history | Implemented | Typed eval contracts, Supabase eval history migration/RPC, public history API | `npm run evals:persist`, `GET /api/research/evals/history` |
| HITL approval state machine | Implemented | Research stage stops at approval; approvals block or waive critical gaps before reporting; `GET /api/research/sessions/:id/approvals` exposes decision history | `npm run typecheck`, API review |
| Structured run-events log | Implemented | Run-linked events, trace/correlation fields, cost events, post-mortem events | `npm run contracts:check` |
| Authenticated session UI loaders | Implemented | `/sessions`, `/sessions/[id]`, `/reports/[id]` client loaders | `npm run test:e2e` |
| OpenTelemetry trace surface | Implemented | `src/server/telemetry.ts`, trace-linked run events | `npm run typecheck` |
| Post-mortem generation | Implemented | Worker writes failed-run post-mortems and `post_mortem_created` events | Worker/API review |
| Memory surface | Implemented | Supabase memory table, `/api/research/memory`, session UI, worker run summaries | `npm run typecheck` |
| CI covering production gates | Implemented | `.github/workflows/ci.yml` | GitHub Actions |
| Stale dependency PR cleanup | Implemented script | `scripts/close-stale-deps-prs.sh` | `npm run deps:close-stale-prs` |
| Engineering blog posts | Implemented drafts | `docs/blog/` | File review |
| Standard repo hygiene | Implemented | README, license, changelog, security, contributing, env example, issue templates, PR template | File review |

## Exception Process

Exceptions require an owner, expiry date, risk statement, and follow-up issue. Do not convert planned rows into README claims until the proof column is green.
