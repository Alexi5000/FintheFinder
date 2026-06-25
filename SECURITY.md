# Security Policy

## Supported Versions

Security work targets the current `main` branch.

## Reporting

Do not open a public issue for secrets, auth bypasses, or data exposure. Report privately to the maintainer with:

- Summary
- Impact
- Reproduction steps
- Affected commit or version
- Suggested mitigation, if known

## Secrets

Never commit:

- OpenAI API keys
- Exa API keys
- Supabase service-role keys
- Supabase JWTs
- Bearer tokens
- Raw production research data

Use `.env` locally and deployment environment variables in hosted environments.

Memory writes and notebook authoring artifacts are scanned for obvious secret-like keys, token-shaped values, private keys, and oversized confidential payloads. These checks are guardrails, not permission to store secrets; keep provider credentials and live customer data out of Supabase memory rows and notebooks.

## App Security Baseline

- API routes require Supabase bearer tokens for user-owned data.
- Supabase row-level security isolates user sessions and reports. Authenticated clients have ownership-scoped reads; session state, approval, and memory mutations go through hosted API/service-role paths.
- Server logs redact keys, tokens, prompts, and sensitive payloads; `tests/unit/logger.test.ts` covers nested fields and secret-like error messages.
- Memory and notebook validation rejects obvious secret-like content before repository writes or benchmark authoring artifacts are accepted.
- Run-event payloads are immutable after insert, and direct event deletes are blocked outside parent session cascade cleanup.
- Research report claims are checked against source IDs and URLs.
- Rate limiting is applied to session creation and research runs; `tests/unit/rate-limit.test.ts` covers budget exhaustion, reset windows, and per-key isolation.
