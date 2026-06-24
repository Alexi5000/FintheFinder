# Operations

## Verification Policy

Before release, run:

```bash
npm run verify
npm run test:e2e
```

CI mirrors the release gate with typecheck, lint, contract drift, notebook validation, coverage, offline evals, build, audit, smoke, Playwright, and Docker build jobs.

## Audit Policy

`npm audit --audit-level=moderate` currently passes with zero vulnerabilities.

Policy:

- Do not run `npm audit fix --force`.
- Prefer patched stable framework releases and minimal targeted overrides.
- Current overrides keep `postcss`, `js-yaml`, `gray-matter`, and the Mastra AI SDK provider-utils alias on patched lines while preserving the Next 16 / React 19 / Mastra 1.x stack.
- If a stable release is not available, evaluate a canary release only in a dedicated dependency PR.
- Document any temporary exception with advisory ID, affected package, exploitability, mitigation, owner, and planned review date.

## Runtime Configuration

Required for live research:

- `OPENAI_API_KEY`
- `EXA_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Model defaults:

- `OPENAI_MODEL_PRIMARY=gpt-5.5`
- `OPENAI_MODEL_FAST=gpt-5.4-mini`
- `OPENAI_REASONING_EFFORT=high`

Worker defaults:

- `WORKER_ID`
- `WORKER_HEARTBEAT_MS`
- `WORKER_POLL_MS`
- `WORKER_LEASE_MS`
- `WORKER_ONCE=1` for one-shot health checks
- `WORKER_PROCESS_ONCE=1` to claim and process at most one queued run

## Logging And Telemetry

Pino redacts keys, tokens, prompts, and sensitive fields. Do not log raw model prompts, service-role keys, bearer tokens, or user-provided confidential research material.

OpenTelemetry spans and post-mortem persistence are tracked in `docs/FDE_GATES.md` and are not complete until run IDs, trace IDs, costs, and post-mortems are visible from API/UI evidence.

## Generated Files

Do not edit `.mastra/output/*` directly. Rebuild Mastra output with:

```bash
npm run build:mastra
```

Regenerate contract artifacts with:

```bash
npm run contracts:sync
```
