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

Worker timing values must be positive integers. `WORKER_ID` must be non-empty, and `WORKER_HEARTBEAT_MS` must be no more than half of `WORKER_LEASE_MS` so a worker can prove ownership before terminal writes.

Cost and trace defaults:

- `RUN_BUDGET_USD=5`
- `OTEL_ENABLED=false`
- `OTEL_SERVICE_NAME=fin-the-finder`
- `OTEL_EXPORTER_OTLP_ENDPOINT`

## Logging And Telemetry

Pino redacts keys, tokens, prompts, and sensitive fields. Do not log raw model prompts, service-role keys, bearer tokens, or user-provided confidential research material.

API errors preserve validation details but scrub unexpected server exception messages before returning them to clients. Keep raw repository/provider errors in server logs or traces only after redaction review.

OpenTelemetry is initialized lazily for API spans and during worker boot. Run events persist trace IDs when an active span exists and always carry a correlation ID for worker-claimed runs. Post-mortems emit `post_mortem_created` events and are visible from run/session APIs.

Worker-owned pipeline writes and terminal run updates require a successful ownership heartbeat for the current `research_run_attempts` token. If ownership cannot be proven, the worker leaves artifact/report/cost/event persistence, terminal writes, and post-mortem creation to the current lease owner or retry path. Expired leases are not extendable by the stale worker; they must be reclaimed through the queue claim RPC, which records a new attempt.

Approval mutations must go through the hosted API routes. Direct authenticated Supabase writes to `research_approvals` are intentionally denied so stale-state rejection, critical-gap blocking, waiver notes, rejection, and follow-up transitions stay inside the audited HITL state machine. The approval route rejects decisions unless the owned session is currently `awaiting_approval`.

Service-role persistence must keep session-scoped graphs coherent. Cross-session constraints and trigger guards reject child rows whose `source_id`, `claim_id`, `run_id`, approval JSONB IDs, claim JSONB IDs, or memory `session_id` belongs to a different research session/user. Session ownership and parent `session_id` fields are intentionally immutable after insert.

Scoped memory is explicit. The app writes user/session memories through `/api/research/memory`; worker summaries use the `run_summary` namespace and are best-effort after terminal run updates. Do not store raw prompts, secrets, or unredacted confidential source material in memory values.

## Generated Files

Do not edit `.mastra/output/*` directly. Rebuild Mastra output with:

```bash
npm run build:mastra
```

Regenerate contract artifacts with:

```bash
npm run contracts:sync
```
