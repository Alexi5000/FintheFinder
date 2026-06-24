# Testing

## Local Gates

```bash
npm run typecheck
npm run lint
npm run contracts:check
npm run notebooks:check
npm run test:coverage
npm run evals
npm run build
npm run audit
npm run smoke
```

## Unit Tests

Current unit coverage includes:

- Shared Zod schemas
- Canonical URL normalization
- Citation auditing
- Missing Exa provider behavior
- Pipeline HITL/cost behavior
- Repository persistence mapping for costs, memories, and post-mortems

Add new unit tests for every new schema, service, and agent contract.

## E2E Tests

Playwright is configured in `playwright.config.ts`.

```bash
npm run test:e2e
```

E2E coverage should prioritize:

- Workspace loads without configured providers
- Settings exposes provider status
- Authenticated session flow
- Report export flow

## Agent Quality Evals

Future eval fixtures should score:

- Source quality
- Citation coverage
- Contradiction handling
- Report completeness
- Uncertainty labeling

Every prompt or model change should be evaluated against the fixture set before release.

Use a positional output path when a checked JSON artifact is needed:

```bash
npm run evals -- artifacts/evals/offline-summary.json
```

Use Supabase-backed history when a release or demo needs durable proof rows:

```bash
npm run evals:persist
```

`npm run evals:persist` is offline-only and requires Supabase environment variables. `npm run evals:live` remains the fail-closed configured-live proof check.
