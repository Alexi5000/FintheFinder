# ADR 0004: Generated Artifact Policy

Status: Accepted  
Date: 2026-06-24

## Context

The repo contains generated visual assets, generated contracts, and generated build output.

## Decision

Commit reviewed repo-owned assets and contract artifacts. Do not commit build output. Document generated asset provenance in `docs/GENERATED_ARTIFACTS.md`.

## Consequences

Reviewers can distinguish durable project artifacts from disposable outputs, and CI can regenerate/check contracts consistently.
