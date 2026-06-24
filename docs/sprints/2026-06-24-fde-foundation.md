# Sprint Contract: FDE Foundation

Date: 2026-06-24  
Version: 1

## Goal

Make production-readiness claims enforceable through gates, contracts, tests, eval fixtures, audit health, and proof docs.

## In Scope

- Dependency audit remediation.
- Contract sync/check scripts and committed contract artifacts.
- Pure state machine, claim ledger, plateau scorer, cost model, and offline eval runner.
- FDE gate matrix, AGENTS memory, ADRs, benchmark/demo/cost docs, generated artifact disclosure.
- CI, smoke, coverage, health, and container seed.

## Out Of Scope

- Kubernetes, Helm, Terraform.
- Chat, Slack, organization workspaces, PDF ingestion, scheduled monitors.
- Claiming live cost-per-run before measured live usage exists.

## Acceptance

`npm run verify` passes locally and CI has equivalent gates, except live evals which remain manual/nightly with explicit budget caps.
