# ADR 0006: Observability, Cost, And Scoped Memory

Date: 2026-06-24

## Status

Accepted

## Context

The product claim is not just that Fin can generate reports. A production research system must explain what happened during a run, what it cost, what failed, and which durable memory was used or written.

## Decision

Add three production surfaces behind shared contracts:

- OpenTelemetry spans for API and worker execution, with trace IDs propagated into run events when available.
- Append-only run events whose payload fields are immutable after insert and whose direct deletes are blocked, except for foreign-key cleanup that can clear a deleted run reference or remove events during parent session cascade.
- `research_run_costs` rows that store model usage, Exa search count, pricing date, total USD, and whether the row is `provider_usage` or `estimated`.
- `research_memories` rows scoped to either user or session, limited to explicit namespaces: preferences, source cache, procedures, and run summaries.

Post-mortems are persisted on worker failure and linked to run events. The UI exposes current run cost, post-mortem state, approval waivers, and scoped memory from authenticated routes.

## Consequences

- Portfolio claims can point to run JSON, event rows, cost rows, and UI proof instead of prose.
- Provider usage is preferred when Mastra returns token accounting; deterministic estimates remain the fallback.
- Memory is explicit product data, not hidden transcript retention.
- Memory writes use the hosted API boundary so schema, size, ownership, and secret-like content checks cannot be bypassed by authenticated table writes.
- Live benchmark proof still requires configured OpenAI, Exa, Supabase, and recorded artifacts.
