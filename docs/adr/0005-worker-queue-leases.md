# ADR 0005: Worker Queue Leases

Date: 2026-06-24

## Status

Accepted

## Context

Research runs can outlive a short API request. The hosted path therefore uses a Next.js API service to enqueue work and a worker process to claim and execute queued runs. A long-running worker must not allow another worker to reclaim the same run because a lease expired mid-stage.

## Decision

Use Supabase/Postgres as the durable queue source of truth. The queue claim RPC marks one run as leased with `for update skip locked`, records the owning `worker_id`, and writes `research_job_leases`. While the worker is active it heartbeats through `extend_research_run_lease`; status updates from the worker include the expected `worker_id`.

The queue RPCs are `security definer` functions but execution is revoked from `public`, `anon`, and `authenticated`, and granted to the service-role runtime only.

## Consequences

- The API remains responsive because `/run` only enqueues.
- The worker can survive long model/search stages without duplicate processing.
- The service-role boundary is explicit and must stay server/worker only.
- Local tests mock repository behavior; full lease behavior should be exercised against Supabase before live release.
