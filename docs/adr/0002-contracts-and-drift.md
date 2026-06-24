# ADR 0002: Zod Contracts With Generated JSON Schema

Status: Accepted  
Date: 2026-06-24

## Context

Fin has API payloads, model outputs, eval fixtures, and database adapters that can drift.

## Decision

Keep Zod as the runtime validation source and generate committed JSON Schema plus a SHA-256 drift hash in `contracts/`.

## Consequences

CI can fail when API contracts drift. Supabase migrations are also checked against the Zod contracts for table columns, enum/check constraints, event contract constraints, RLS posture, service-role RPC boundaries, and repository adapter payload shape. If generated Supabase `Database` types are refreshed from a configured project, they must match the same migration parity tests before replacing or narrowing repository row types.
