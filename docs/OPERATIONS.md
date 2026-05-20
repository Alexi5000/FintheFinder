# Operations

## Verification Policy

Before release, run:

```bash
npm run verify
npm run audit
```

## Audit Policy

`npm audit --audit-level=moderate` currently passes with zero vulnerabilities. The repo uses a direct `postcss` override because npm previously suggested a breaking Next.js downgrade for the advisory.

Policy:

- Do not run `npm audit fix --force`.
- Prefer patched stable framework releases and minimal overrides.
- If a stable release is not available, evaluate a canary release only in a dedicated dependency PR.
- Document any temporary exception with advisory ID, affected package, exploitability, mitigation, and planned review date.

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

## Logging

Pino redacts keys, tokens, prompts, and sensitive fields. Do not log raw model prompts, service-role keys, bearer tokens, or user-provided confidential research material.

## Generated Files

Do not edit `.mastra/output/*` directly. Rebuild Mastra output with:

```bash
npm run build:mastra
```
