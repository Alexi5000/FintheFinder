# ADR 0002: Zod Contracts With Generated JSON Schema

Status: Accepted  
Date: 2026-06-24

## Context

Fin has API payloads, model outputs, eval fixtures, and database adapters that can drift.

## Decision

Keep Zod as the runtime validation source and generate committed JSON Schema plus a SHA-256 drift hash in `contracts/`.

## Consequences

CI can fail when contracts drift. Supabase generated types remain the persistence source and need adapter tests where row shapes differ from API contracts.
