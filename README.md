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
  <a href="#why-this-exists">Why this exists</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#built-with-mastra">Mastra Architecture</a> &middot;
  <a href="#proof-and-release-status">Proof Gates</a> &middot;
  <a href="#reviewer-path">Reviewer Path</a> &middot;
  <a href="#benchmarks">Benchmarks</a> &middot;
  <a href="#api">API</a> &middot;
  <a href="#security-and-contributing">Security</a> &middot;
  <a href="#security-and-contributing">Contributing</a>
</p>

<img src="assets/fin-hero.png" alt="Fin the Finder product visual" width="100%" />

</div>

## Why this exists

**What it does.** Fin the Finder runs a Mastra-based deep research pipeline: it plans a research run, searches the web through Exa, scores source quality, extracts evidence-backed learnings, checks contradictions, audits citations, stops at a human approval gate, and exports a cited markdown report. Session state, sources, claims, approvals, costs and reports persist in Supabase Postgres, and execution runs through a queued worker.

**Who it serves.** Analysts and research-ops teams who need research output they can inspect, approve, resume and reproduce rather than a single long model answer, and engineers who want a worked example of hardening a Mastra agent template into a reviewable service with typed contracts, evals and proof artifacts.

**Why Alex built it.** The repository began as the Mastra deep research template (initial commit `9e7959b`, 2025-10-17, authored by `mastra-cloud[bot]`). The first README rewrite (`13665e7`, 2026-02-18: "state-of-the-art README, cover art, icon, and branding") framed the problem as research that costs hours of tab-skimming and note-taking, and the answer as a research assistant where "you stay in the loop". The production layer followed in `5158d2b` (2026-05-19: "ship production v1 foundation") and PR #1 (`4f809f7`, 2026-06-24: "Build FDE foundation and queued research worker"), which added typed contracts, Supabase-backed state, queued execution, provenance-bound demo export, eval gates, cost rows, OpenTelemetry hooks, redacted logging, CI and Docker. `docs/FDE_GATES.md` records the standard the project holds itself to: a public claim counts only when it is implemented, tested, demoed and documented.

This project intentionally separates shipped proof from future proof. The current release has deterministic offline gates plus one recorded configured-live proof run where real credentials, media, Supabase rows, eval output, cost evidence, and the benchmark row all point to the same session.

**Real-world use case (2025 to 2026 evidence).** **Verified in this repository.** A compliance analyst asks for current official guidance on AI audit logs for enterprise compliance, scoped narrowly and cited to primary sources. The recorded 2026-07-01 configured-live run executed exactly that prompt: six Exa searches, 21,965 tokens on `gpt-4o-mini`, a measured provider cost of $0.17287, a human approval row, and a cited report in `docs/demo/artifacts/report.md`, all bound together by `docs/demo/live-demo.json` and re-validated by `npm run demo:record` (see the Live Run Log in `docs/BENCHMARK.md`). The surrounding platform direction supports this pattern: Mastra 1.0 locked its agent and workflow APIs in January 2026 and reports production use at companies including Replit, PayPal and Sanity[^1]; Exa shipped Exa 2.0 with an agentic "Deep" search type in October 2025[^2] and Exa 2.1 with higher-quality fast and agentic search in November 2025[^3]; and Exa's own research-agent write-up describes planner, task and observer roles, structured JSON output and token-level observability as production requirements for research agents[^4].

## Proof And Release Status

| Surface | Status |
| --- | --- |
| Release | `v1.0.0` |
| Package version | `1.0.0` |
| Health route version | `1.0.0` |
| License | Apache-2.0 |
| CI | GitHub Actions CI configured and green on the current published branch |
| Proof tier | Offline-gated production foundation with recorded configured-live proof |
| Live proof | Passed on 2026-07-01 with session `f6487144-8db9-4833-88e2-999c31a352ba`, reporting run `9dea3bb6-a4a2-4dfd-b9d9-8714a0ea654d`, manifest `docs/demo/live-demo.json`, and measured cost `$0.17287` |
| Source of truth | `docs/FDE_GATES.md`, `docs/BENCHMARK.md`, `docs/ARCHITECTURE.md` |

## Reviewer Path

If you are reviewing the repo, start here:

1. Read the proof status table above.
2. Inspect [docs/FDE_GATES.md](docs/FDE_GATES.md) for the evidence matrix.
3. Inspect [docs/demo/live-demo.json](docs/demo/live-demo.json) and [docs/demo/README.md](docs/demo/README.md) for the recorded live proof bundle.
4. Run `npm run demo:record` to validate the checked proof artifacts.
5. Run `npm run verify` to validate the local engineering gate.
6. Read [docs/releases/v1.0.0.md](docs/releases/v1.0.0.md) and [docs/ROADMAP.md](docs/ROADMAP.md) to see what v1 claims and what is intentionally future work.

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
- OpenAI-compatible model configuration through environment variables, with model IDs recorded in live proof artifacts.
- Exa search integration with conservative default retrieval, timeout handling, canonical URLs, duplicate filtering, and typed source records.
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
- Configured-live benchmark evidence is recorded for the 2026-07-01 proof run with matching Supabase lineage, cost rows, final audit, report artifacts, eval output, and recorded media.

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

Current recorded proof:

- Session: `f6487144-8db9-4833-88e2-999c31a352ba`
- Research run: `4ccaaafe-3fe4-47a3-8c03-80fcbf8c4034`
- Reporting run: `9dea3bb6-a4a2-4dfd-b9d9-8714a0ea654d`
- Approval: `d3da714a-b1d6-4047-97ab-12157ae12442`
- Manifest SHA-256: `5ad4e21d448e414ec6a64682c1e7d5436261479d95d6e7ed25f5d21fe6c036a3`
- Measured cost: `$0.17287`
- Artifacts: `docs/demo/live-demo.json`, `docs/demo/artifacts/report.md`, `docs/demo/artifacts/eval-summary.json`, `docs/demo/artifacts/run-export.json`, `docs/demo/artifacts/proof-run-terminal.png`, `docs/demo/artifacts/proof-run-terminal.txt`

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

- License, changelog, security policy, contribution guide, AGENTS memory, issue templates, PR template, and CI workflow are present.
- Architecture decisions are captured in [docs/adr](docs/adr).
- FDE status is tracked in [docs/FDE_GATES.md](docs/FDE_GATES.md).
- Benchmark honesty is tracked in [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Security And Contributing

Security policy: [SECURITY.md](SECURITY.md)

Dependency posture as of 2026-10-20: GitHub reports zero open Dependabot, code-scanning and secret-scanning alerts for this repository. `braces` advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) is a known upstream advisory with no fixed release as of 2026-10-20; this repository mitigates it with a locally built backport (`vendor/braces-3.0.3.tgz`, pinned through npm `overrides`, verified by `npm run audit` via `scripts/verify-braces.cjs`, introduced in PR #15). The backport is not an official patched version; see the "Temporary braces backport" section of [docs/OPERATIONS.md](docs/OPERATIONS.md) for its review date. A local `npm audit` on 2026-10-20 still lists that one advisory as a chain of high-severity entries reached through `micromatch`, `fast-glob`, `find-workspaces`, `@mastra/deployer` and `eslint-config-next`; `scripts/audit-dependencies.cjs` treats only GHSA-vfj7-8cjw-p6xm as covered and fails on any other moderate or higher finding.

Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)

Agent instructions: [AGENTS.md](AGENTS.md)

## License

Apache-2.0. See [LICENSE](LICENSE).

[^1]: Mastra, "Announcing Mastra 1.0!", https://mastra.ai/blog/announcing-mastra-1, published 2026-01-20.
[^2]: Exa, "Introducing Exa 2.0", https://exa.ai/blog/exa-api-2-0, published 2025-10-10.
[^3]: Exa, "Introducing Exa 2.1", https://exa.ai/blog/exa-api-2-1, published 2025-11-24.
[^4]: LangChain, "How Exa built a Web Research Multi-Agent System with LangGraph and LangSmith", https://www.langchain.com/blog/exa, published 2025-07-01.
