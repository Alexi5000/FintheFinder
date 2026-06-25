<div align="center">

<img src="assets/icon.png" alt="Fin the Finder logo" width="112" />

<h1>Fin the Finder</h1>

<p>
  <strong>Evidence-first deep research built on Mastra agents, typed contracts, Supabase persistence, and production proof gates.</strong>
</p>

<p>
  <a href="https://github.com/Alexi5000/FintheFinder/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Alexi5000/FintheFinder/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Alexi5000/FintheFinder/releases/tag/v1.0.0"><img alt="Release v1.0.0" src="https://img.shields.io/badge/release-v1.0.0-0f766e" /></a>
  <a href="LICENSE"><img alt="License Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue" /></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca" />
  <img alt="Mastra 1.x" src="https://img.shields.io/badge/Mastra-1.x-7c3aed" />
  <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-configurable-111827" />
  <img alt="Exa" src="https://img.shields.io/badge/Exa-search-f97316" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ecf8e" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-coverage-6e9f18" />
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-e2e-2ead33" />
</p>

<p>
  <a href="#about">About</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#built-with-mastra">Mastra Architecture</a> &middot;
  <a href="#proof-and-release-status">Proof Gates</a> &middot;
  <a href="#benchmarks">Benchmarks</a> &middot;
  <a href="#api">API</a> &middot;
  <a href="#security-and-contributing">Security</a> &middot;
  <a href="#security-and-contributing">Contributing</a>
</p>

<img src="assets/fin-hero.png" alt="Fin the Finder product visual" width="100%" />

</div>

## About

Fin the Finder is a Mastra-based deep research workspace for analysts who need more than a long answer. It plans a research run, searches the web, evaluates source quality, extracts evidence-backed learnings, checks contradictions, audits citations, records human decisions, and exports cited reports.

The repo started from the Mastra deep research template. The value added here is the production foundation around that template: typed contracts, Supabase-backed state, queued execution, provenance-bound demo export, eval gates, cost rows, OpenTelemetry hooks, redacted logging, CI, Docker, and explicit FDE evidence docs.

This project intentionally separates shipped proof from future proof. The current release is offline-gated and ready for configured-provider runs, but it does not claim a recorded live benchmark until real credentials, media, Supabase rows, eval output, and benchmark rows all point to the same run.

## Proof And Release Status

| Surface | Status |
| --- | --- |
| Release | `v1.0.0` |
| Package version | `1.0.0` |
| Health route version | `1.0.0` |
| License | Apache-2.0 |
| CI | GitHub Actions CI configured and green on the current published branch |
| Proof tier | Offline-gated production foundation |
| Live proof | Pending real OpenAI, Exa, Supabase credentials and recorded media |
| Source of truth | `docs/FDE_GATES.md`, `docs/BENCHMARK.md`, `docs/ARCHITECTURE.md` |

## Built With Mastra

Fin follows Mastra's agent, tool, and workflow model, then wraps it in product-grade contracts and proof surfaces.

| Mastra primitive | Fin implementation | Production hardening |
| --- | --- | --- |
| Agents | Planner, research, source evaluator, learning extractor, contradiction checker, citation auditor, report writer, final reviewer, and web summarization agents | Role-specific prompts, structured outputs, citation and contradiction gates, final review before report readiness |
| Tools | `webSearchTool`, `evaluateResultTool`, `extractLearningsTool` | Typed inputs, Exa timeout handling, canonical URL normalization, duplicate filtering, source quality scoring |
| Workflows | `researchWorkflow`, `generateReportWorkflow` | Explicit approval step, report generation path, replayable orchestration fixtures |
| Runtime | Next.js API routes plus Mastra registry | Queued worker path, durable leases, typed errors, redacted Pino logging |
| Persistence | Supabase Postgres and Auth | Sessions, sources, learnings, approvals, run events, claims, reports, costs, post-mortems, scoped memory, RLS |
| Evaluation | Offline evals, orchestration replay, benchmark drift checks, live eval command | Regression thresholds, expected versus actual fixtures, cost and quality records |
| Observability | Structured events and OpenTelemetry hooks | Trace IDs, `eval.*` attributes, cost rows, failure post-mortem generation |
| Proof export | `demo:export`, `demo:record`, `evals:live` | Provenance-bound manifest tied to Supabase rows, report artifacts, approval records, and local media |

## Product Capabilities

- Deep research pipeline with planner, search, evaluation, extraction, contradiction checking, citation auditing, report writing, and final review.
- OpenAI model configuration through environment variables, with model IDs recorded before live benchmark claims.
- Exa search integration with timeout handling, canonical URLs, duplicate filtering, and typed source records.
- Supabase Auth and Postgres schema for multi-user sessions, source records, learnings, approvals, events, runs, claims, costs, post-mortems, memory, and reports.
- Next.js product shell with workspace, About, session history, session detail, report reader, settings, health, and API routes.
- Cited markdown report export with claim and source lineage.
- Structured logging with redaction for keys, tokens, prompts, and sensitive payloads.
- Contract generation, offline evals, replayable orchestration, persisted eval history, claim ledger primitives, plateau scoring, cost estimates, OpenTelemetry hooks, scoped memory, coverage gate, Docker, and audit-green dependency baseline.

## Quick Start

```bash
npm install
cp .env.example .env
npm run typecheck
npm run lint
npm run contracts:check
npm run test:coverage
npm run evals
npm run evals:replay
npm run build
npm run audit
npm run dev
```

Open `http://localhost:3000`.

For configured-provider research runs, set:

```bash
OPENAI_API_KEY=""
EXA_API_KEY=""
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

## Benchmarks

Benchmarks are documented in [docs/BENCHMARK.md](docs/BENCHMARK.md). The current benchmark posture is intentionally split:

- Offline fixture evidence is tracked and gateable today.
- Credential-free orchestration replay verifies the worker and pipeline path without provider secrets.
- Configured-live benchmark rows remain pending until a real run has matching Supabase lineage, cost rows, final audit, report artifacts, eval output, and recorded media.

Run the local benchmark gate:

```bash
npm run benchmark:check
```

## Live Proof Workflow

Fin only claims recorded live proof when all artifacts describe the same real session.

```bash
npm run demo:export -- --reporting-run-id <id> --media <path>
npm run demo:record
npm run evals:live
```

Before a live claim is approved, `docs/demo/live-demo.json`, the recorded media, the Supabase reporting run, the research run, the approval row, the final audit, the cost row, and the Live Run Log in `docs/BENCHMARK.md` must agree.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js product app |
| `npm run dev:mastra` | Start the Mastra development server |
| `npm run build` | Build Next.js and Mastra |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run unit tests with coverage thresholds |
| `npm run test:e2e` | Run Playwright tests |
| `npm run contracts:sync` | Regenerate JSON Schema contracts |
| `npm run contracts:check` | Verify committed contracts and drift hash |
| `npm run evals` | Run deterministic offline eval fixtures |
| `npm run evals:replay` | Run credential-free worker and pipeline orchestration replay |
| `npm run evals:persist` | Record deterministic offline eval history in Supabase |
| `npm run benchmark:check` | Verify checked-in benchmark evidence |
| `npm run notebooks:check` | Validate notebooks are authoring surfaces, not runtime dependencies |
| `npm run audit` | Run npm audit at moderate severity |
| `npm run smoke` | Run repository and contract smoke checks |
| `npm run demo:export` | Export configured-live proof artifacts from Supabase by reporting run ID and recorded media |
| `npm run demo:record` | Validate configured-live proof manifest and local artifacts |
| `npm run verify` | Run the main local verification suite |
| `npm run container:build` | Build the production Docker image |

## Repository Map

```text
src/app/                 Next.js UI and API routes
src/components/          Client UI components
src/lib/                 Shared config, contracts, schemas, utilities
src/mastra/              Agents, tools, workflows, Mastra registry
src/server/              Server services: research pipeline, evals, logging
src/worker/              Queued research worker
contracts/               Generated JSON Schema contracts and drift hash
notebooks/               Authoring-only eval and design notebooks
supabase/migrations/     Production database schema and RLS
tests/unit/              Unit tests
tests/e2e/               Playwright tests
docs/                    Architecture, setup, API, testing, operations, FDE gates
assets/                  Repo visuals and brand assets
```

## API

The typed API surface is documented in [docs/API.md](docs/API.md). The health route reports the current service version and provider configuration status:

```bash
curl http://localhost:3000/api/health
```

Expected version fields for this release:

```json
{
  "service": "fin-the-finder",
  "version": "1.0.0"
}
```

## Current Verification Snapshot

The production foundation is expected to pass:

```bash
npm run typecheck
npm run lint
npm run contracts:check
npm run notebooks:check
npm run test:coverage
npm run evals
npm run evals:replay
npm run benchmark:check
npm run build
npm run audit
npm run smoke
```

`npm run verify` runs the same main gate in one command. `npm run container:build` validates the Docker production image.

## Repo Hygiene

- License, changelog, security policy, contribution guide, AGENTS memory, issue templates, PR template, Dependabot, and CI workflow are present.
- Architecture decisions are captured in [docs/adr](docs/adr).
- FDE status is tracked in [docs/FDE_GATES.md](docs/FDE_GATES.md).
- Benchmark honesty is tracked in [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Security And Contributing

Security policy: [SECURITY.md](SECURITY.md)

Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)

Agent instructions: [AGENTS.md](AGENTS.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
