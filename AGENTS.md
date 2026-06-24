# Fin The Finder Agent Memory

This file is the repo-level procedural memory for Codex, human maintainers, and future agent workers.

## Project Shape

Fin The Finder is an evidence-first deep research product built with Next.js 16, React 19, TypeScript, Mastra 1.x, OpenAI, Exa, Supabase, Zod, Vitest, Playwright, and Pino. The production direction is a Next.js web/API service plus a durable Node worker; Mastra provides agents and tools, and Supabase/Postgres is the source of truth.

## Required Local Gates

Run these before claiming a slice is done:

```bash
npm run typecheck
npm run lint
npm run contracts:check
npm run notebooks:check
npm run test:coverage
npm run evals
npm run build
npm run audit
npm run smoke
```

Use `npm run test:e2e` for UI or routing changes.

## Skills Vs Tools

- Skills are procedural playbooks: how Fin plans, evaluates, audits, approves, and reports research.
- Tools are executable capabilities: web search, result evaluation, learning extraction, contract sync, evals, smoke checks.
- A skill may describe when to call a tool; a tool must have typed input/output and safe failure behavior.

## Generated Files

- Do not edit `.mastra/output/*`, `.next/*`, `coverage/*`, `playwright-report/*`, or `test-results/*`.
- Regenerate Mastra output with `npm run build:mastra`.
- Regenerate contract artifacts with `npm run contracts:sync`.
- Repo-owned raster assets are documented in `docs/GENERATED_ARTIFACTS.md`.

## Security Rules

- Never log raw prompts, bearer tokens, service-role keys, provider keys, or confidential research material.
- Keep `npm audit --audit-level=moderate` green. If an upstream advisory cannot be fixed, document the exception in `docs/OPERATIONS.md` with owner and review date.
- Supabase service-role access belongs only on the server/worker side.

## Implementation Rules

- Keep `src/lib/schemas.ts` as the compatibility export; add new contract definitions under `src/lib/contracts`.
- Prefer pure modules with unit tests before wiring provider or persistence behavior.
- Every public capability claim must map to `docs/FDE_GATES.md` evidence.
