<div align="center">

<img src="assets/icon.png" alt="Fin the Finder logo" width="110" />

# Fin the Finder

**A production-grade AI deep research assistant built with Next.js, Mastra, OpenAI, Exa, and Supabase.**

Fin plans research, searches the web, evaluates source quality, extracts evidence-backed learnings, checks citations, and generates polished markdown reports with a human review loop.

[Architecture](docs/ARCHITECTURE.md) · [Setup](docs/SETUP.md) · [API](docs/API.md) · [Testing](docs/TESTING.md) · [Operations](docs/OPERATIONS.md) · [Security](SECURITY.md)

<img src="assets/fin-hero.png" alt="Fin the Finder product visual" width="100%" />

</div>

## Why This Exists

Research tools often stop at search results or a long model answer. Fin is designed as an agentic research product: it keeps source records, run events, learnings, approvals, and reports as first-class data so research can be reviewed, resumed, audited, and improved.

The goal is a serious engineering repo, not a demo: typed contracts, pinned dependencies, production UI routes, Supabase persistence, Mastra workflows, tests, security posture, and operator documentation.

## Product Capabilities

- Multi-agent Mastra research pipeline with planner, source evaluator, extractor, contradiction checker, citation auditor, report writer, and final reviewer agents.
- GPT-5.5 quality-first defaults through environment-driven model configuration.
- Exa search integration with timeout handling, canonical URL normalization, duplicate filtering, and typed source records.
- Supabase Auth and Postgres schema for multi-user sessions, source records, learnings, approvals, events, and reports.
- Next.js product shell with workspace, session history, session detail, report reader, settings, and API routes.
- Cited markdown report export.
- Structured logging with redaction for keys, tokens, prompts, and sensitive payloads.
- Unit tests for schemas, URL normalization, citation auditing, and provider-failure behavior.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16, React 19, TypeScript |
| Agent orchestration | Mastra 1.x |
| Models | OpenAI via configurable GPT-5.5 primary and GPT-5.4-mini fast defaults |
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
npm run test
npm run build
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
| `npm run test:e2e` | Run Playwright tests |
| `npm run audit` | Run npm audit at moderate severity |
| `npm run verify` | Run the main local verification suite |

## Repository Map

```text
src/app/                 Next.js UI and API routes
src/components/          Client UI components
src/lib/                 Shared config, schemas, utilities
src/mastra/              Agents, tools, workflows, Mastra registry
src/server/              Server services: Supabase, research pipeline, logging
supabase/migrations/     Production database schema and RLS
tests/unit/              Unit tests
tests/e2e/               Playwright tests
docs/                    Architecture, setup, API, testing, operations
assets/                  Repo visuals and brand assets
```

## Current Verification Snapshot

The current local implementation passes:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm audit --audit-level=moderate` currently passes with zero vulnerabilities. The repo pins a `postcss` override to keep the Next.js dependency tree on the patched line without downgrading the framework.

## License

Apache-2.0. See [LICENSE](LICENSE).
