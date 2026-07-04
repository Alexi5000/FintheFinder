# Roadmap

Fin the Finder v1 is a proof-gated production foundation, not a hosted SaaS launch. The roadmap keeps that boundary clear: finish the reviewable research system first, then add deployment and collaboration surfaces.

## V1.0.0: Proof-Gated Foundation

Status: shipped.

- Mastra research and report-generation agents.
- Exa search with conservative highlights-first retrieval.
- OpenAI-compatible model configuration and OpenRouter-compatible base URL support.
- Supabase schema for sessions, sources, learnings, claims, approvals, events, reports, runs, costs, post-mortems, and scoped memory.
- Human approval gate between research and report generation.
- Citation, contradiction, final-review, and deterministic eval gates.
- Credential-free orchestration replay for worker and pipeline proof.
- Recorded configured-live proof bundle with Supabase lineage, measured provider usage, media, report export, live eval output, and benchmark row.
- CI coverage for typecheck, lint, contracts, notebooks, unit coverage, offline evals, replay evals, benchmark drift, build, audit, smoke, Playwright, and Docker build.

## V1.0.x: Public Review Polish

Status: next maintenance lane.

- Keep `docs/demo/live-demo.json` and `docs/BENCHMARK.md` synchronized with any new proof runs.
- Add a concise reviewer walkthrough with screenshots from the report-reader UI.
- Add release notes for every public tag.
- Keep dependency updates manual and intentional after the proofed baseline.
- Resolve any issue-template feedback from public technical review.

## V1.1: Deployment Pilot

Goal: run Fin as a small hosted pilot without weakening the proof gates.

- Hosted Supabase auth flow and reviewer-safe onboarding.
- Durable worker service with lease extension, retry visibility, and operator dashboard.
- Session list/detail views with filters, live polling, and run-stage visibility.
- Approval UI for gap waivers, rejected claims, and follow-up research.
- Deployment runbook with environment, migrations, worker, health checks, rollback, and backup notes.
- Hosted smoke check that verifies web, worker, Supabase, Exa, model routing, and proof export readiness.

## V1.2: Research Inputs And Exports

Goal: make the proofed workflow useful across more analyst surfaces.

- PDF and document source ingestion.
- Saved source collections.
- Citation styles and bibliography export.
- Notion, Google Docs, Markdown, and Obsidian export.
- Domain-specific research profiles.
- Multi-language research support.

## V1.3: Team And Organization Mode

Goal: support multi-person review without turning Fin into an unfocused platform.

- Organization workspaces.
- Role-aware approvals.
- Admin observability dashboard.
- Scheduled recurring research monitors.
- Team memory boundaries and retention controls.

## Not Planned For V1

- Fully autonomous publishing without human approval.
- Broad web crawling without source budgets and cost caps.
- Enterprise compliance claims beyond the checked proof artifacts.
- Marketplace plugins or arbitrary third-party tools inside the worker runtime.
