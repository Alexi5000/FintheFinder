# ADR 0005: Worker Queue Leases

Date: 2026-06-24

## Status

Accepted

## Context

Research runs can outlive a short API request. The hosted path therefore uses a Next.js API service to enqueue work and a worker process to claim and execute queued runs. A long-running worker must not allow another worker to reclaim the same run because a lease expired mid-stage.

## Decision

Use Supabase/Postgres as the durable queue source of truth. The queue claim RPC marks one run as leased with `for update skip locked`, records the owning `worker_id`, writes `research_job_leases`, and creates a durable `research_run_attempts` row. While the worker is active it heartbeats through `extend_research_run_lease` with the current attempt token; expired leases cannot be revived by the old worker. Terminal status updates, failure artifacts, and worker-owned pipeline persistence are written only after the worker proves ownership with a successful heartbeat and matching attempt token. The fenced `transition_research_run` RPC clears run/attempt leases and deletes the companion job-lease row when a run reaches `awaiting_approval`, `completed`, `failed`, or `cancelled`. Full artifact replacement goes through `replace_research_artifacts`, a service-role-only RPC that locks the run and attempt rows, verifies the current worker lease, and rebuilds the research artifact graph in one transaction. Final report publication goes through `publish_research_report_for_attempt`, which applies the same attempt fence, handles exact replay idempotently, returns late critical-gap blocks to approval, and commits the report-ready event plus run/attempt/job-lease terminal state atomically.

The queue RPCs are `security definer` functions but execution is revoked from `public`, `anon`, and `authenticated`, and granted to the service-role runtime only.

The worker runtime is isolated from CLI/default dependency wiring so unit tests can exercise queue behavior without importing Mastra, provider clients, or Supabase connections.

## Consequences

- The API remains responsive because `/run` only enqueues.
- The worker can survive long model/search stages without duplicate processing.
- The service-role boundary is explicit and must stay server/worker only.
- Local worker runtime and migration tests cover repository boundaries; full configured Supabase lease behavior should be exercised before live release.
