<div align="center">

<img src="assets/icon.png" alt="Fin the Finder logo" width="110" />

# Fin the Finder

**An evidence-first AI deep research workspace built with Next.js, Mastra, OpenAI, Exa, and Supabase.**

Fin plans research, searches the web, evaluates source quality, extracts evidence-backed learnings, checks citations, and is being hardened behind FDE gates so every production claim has code, tests, evals, and demo evidence.

[About](docs/ABOUT.md) - [Architecture](docs/ARCHITECTURE.md) - [FDE Gates](docs/FDE_GATES.md) - [Benchmark](docs/BENCHMARK.md) - [API](docs/API.md) - [Operations](docs/OPERATIONS.md) - [Security](SECURITY.md)

<img src="assets/fin-hero.png" alt="Fin the Finder product visual" width="100%" />

</div>

## Why This Exists

Research tools often stop at search results or a long model answer. Fin is designed as an agentic research product: it keeps source records, run events, learnings, approvals, claims, evals, costs, and reports as first-class data so research can be reviewed, resumed, audited, and improved.

The goal is a serious engineering repo, not a demo claim. `docs/FDE_GATES.md` is the source of truth for what is implemented, partially built, or still planned.

## Proof Tier

Current status: **offline-gated**. The repo is gated by deterministic contracts, tests, lint, audit, Docker build, smoke checks, offline evals, and benchmark drift locally and in CI.

Configured-provider research is implemented behind OpenAI, Exa, and Supabase credentials, but recorded live proof is still pending. Do not treat Fin as having a measured live demo or cost-per-run claim until `docs/demo/live-demo.json`, `npm run demo:record`, `npm run evals:live`, and the Live Run Log in `docs/BENCHMARK.md` all reference the same real run artifacts.

## Product Capabilities

- Mastra agent stack for planner, source evaluator, extractor, contradiction checker, citation auditor, report writer, and final reviewer roles; full hosted-path wiring is tracked in the FDE gates.
- Environment-driven OpenAI primary and fast model configuration; exact model IDs are recorded in live proof before benchmark claims.
- Exa search integration with timeout handling, canonical URL normalization, duplicate filtering, and typed source records.
- Supabase Auth and Postgres schema for multi-user sessions, source records, learnings, approvals, events, runs, claims, costs, post-mortems, memory, and reports.
- Next.js product shell with workspace, About, session history, session detail, report reader, settings, health, and API routes.
- Cited markdown report export.
- Structured logging with redaction for keys, tokens, prompts, and sensitive payloads.
- Contract generation, offline evals, persisted eval history, claim-ledger primitives, plateau scoring, persisted cost estimates, OpenTelemetry hooks, scoped memory, coverage gate, and audit-green dependency baseline.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16, React 19, TypeScript |
| Agent orchestration | Mastra 1.x |
| Models | OpenAI via configurable primary and fast model defaults |
| Search | Exa |
| Persistence | Supabase Postgres and Auth |
| Validation | Zod |
| Tests | Vitest, Playwright |
| Logging | Pino |

## Quick Start

```bash
npm install
cp .env.example .env
npm run typecheck
npm run lint
npm run contracts:check
npm run test:coverage
npm run evals
npm run build
npm run audit
npm run dev
```

Open `http://localhost:3000`.

For live research runs, configure:

```bash
OPENAI_API_KEY=""
EXA_API_KEY=""
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js product app |
| `npm run dev:mastra` | Start Mastra development server |
| `npm run build` | Build Next.js and Mastra |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run unit tests with coverage thresholds |
| `npm run test:e2e` | Run Playwright tests |
| `npm run contracts:sync` | Regenerate JSON Schema contracts |
| `npm run contracts:check` | Verify committed contracts and drift hash |
| `npm run evals` | Run deterministic offline eval fixtures |
| `npm run evals:persist` | Record deterministic offline eval history in Supabase |
| `npm run benchmark:check` | Verify checked-in fixture expected-vs-evaluation benchmark evidence |
| `npm run notebooks:check` | Validate authoring notebooks are non-runtime artifacts |
| `npm run audit` | Run npm audit at moderate severity |
| `npm run smoke` | Run repository and contract smoke checks |
| `npm run verify` | Run the main local verification suite |

## Repository Map

```text
src/app/                 Next.js UI and API routes
src/components/          Client UI components
src/lib/                 Shared config, contracts, schemas, utilities
src/mastra/              Agents, tools, workflows, Mastra registry
src/server/              Server services: research pipeline, evals, logging
contracts/               Generated JSON Schema contracts and drift hash
notebooks/               Authoring-only eval/design notebooks
supabase/migrations/     Production database schema and RLS
tests/unit/              Unit tests
tests/e2e/               Playwright tests
docs/                    Architecture, setup, API, testing, operations, FDE gates
assets/                  Repo visuals and brand assets
```

## Current Verification Snapshot

The current local implementation is expected to pass:

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

`npm audit --audit-level=moderate` currently passes with zero vulnerabilities after direct package updates plus targeted overrides for patched transitive dependencies.

## License

Apache-2.0. See [LICENSE](LICENSE).
