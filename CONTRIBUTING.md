# Contributing

## Development Flow

```bash
npm install
cp .env.example .env
npm run typecheck
npm run lint
npm run test
```

## Pull Request Standard

Every production PR should include:

- Clear product or engineering purpose
- Tests for changed behavior
- Updated docs for new commands, APIs, env vars, or operations
- No generated build output
- No secrets

## Code Style

- TypeScript strict mode stays on.
- Shared request/response shapes belong in `src/lib/schemas.ts`.
- API routes should validate input and return typed error envelopes.
- Agent outputs should use structured schemas where practical.
- Keep prompts specific, evidence-oriented, and citation-aware.

## Before Merge

```bash
npm run verify
```
