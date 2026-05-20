# Testing

## Local Gates

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Unit Tests

Current unit coverage includes:

- Shared Zod schemas
- Canonical URL normalization
- Citation auditing
- Missing Exa provider behavior

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
