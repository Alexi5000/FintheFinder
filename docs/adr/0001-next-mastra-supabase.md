# ADR 0001: Next.js, Mastra, And Supabase

Status: Accepted  
Date: 2026-06-24

## Context

Fin needs a web product surface, typed server routes, agent orchestration, and durable user-owned research records.

## Decision

Use Next.js for UI/API, Mastra for agents/tools, and Supabase Postgres/Auth for production persistence and user isolation.

## Consequences

The app can ship as a familiar TypeScript product while keeping research records queryable. Long-running work must move to a dedicated worker so API routes do not own production execution latency.
