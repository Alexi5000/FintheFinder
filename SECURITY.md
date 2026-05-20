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

## App Security Baseline

- API routes require Supabase bearer tokens for user-owned data.
- Supabase row-level security isolates user sessions and reports.
- Server logs redact keys, tokens, prompts, and sensitive payloads.
- Research report claims are checked against source IDs and URLs.
- Rate limiting is applied to session creation and research runs.
