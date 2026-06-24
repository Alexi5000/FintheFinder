# Agent Evals

Fin should be evaluated like a research system, not only like a web app.

## Evaluation Dimensions

| Dimension | What Good Looks Like |
| --- | --- |
| Source quality | Finds primary, recent, authoritative, and diverse sources |
| Relevance | Filters generic or tangential sources |
| Evidence extraction | Produces specific claims with source-backed evidence |
| Contradictions | Flags conflicting findings and uncertainty |
| Citation coverage | Every material report section maps to source IDs |
| Report quality | Executive summary is clear, nuanced, and actionable |

## Harness Shape

Offline evals use a deterministic three-role adversarial harness:

- Planner: converts each fixture into caveat, citation, forbidden-phrase, and score-baseline checks.
- Generator: extracts citation coverage, unknown source IDs, missing caveats, blocked source IDs, blocked source credibility, missing claim IDs, and overclaiming signals from the actual report.
- Evaluator: produces the four-axis score, compares it with fixture baselines, and flags regressions.

## Fixture Set

Add fixtures under `tests/fixtures/evals/` with:

- Prompt
- Expected source characteristics through optional blocked source IDs and blocked credibility levels
- Required caveats
- Minimum citation coverage
- Required claim-ID coverage when the claim ledger is part of the acceptance rule
- Expected pass/fail outcome
- Minimum score baselines for passing fixtures
- Report acceptance rubric

Fixtures are Zod-validated before execution. Adversarial report candidates may intentionally include empty section citations so the deterministic harness can prove citation and malformed-output failures without bypassing fixture parsing.

Current offline scenarios cover:

- Passing regulatory-compliance synthesis with claim IDs and full citation coverage
- Passing corrected citation coverage
- Unknown citation/source ID mismatch
- Placeholder or malformed report output
- Missing claim IDs
- Citation-free overclaiming
- Cited but unsafe overclaiming
- Prompt-injection text copied into a report
- SEO-spam and low-credibility source laundering
- Stale/conflicting source reliance

## Release Rule

Any model, prompt, or agent-role change should run against the fixture set before release. Failed evals should block promotion unless the rubric is intentionally updated.

Negative-control fixtures are allowed and expected to pass the harness only when the evaluator observes the intended failure.

## Persisted Offline History

`npm run evals:persist` records the deterministic offline suite in Supabase as one `eval_runs` row plus one `eval_results` row per fixture. The write path uses a service-role-only transaction function, so a proof run is not recorded unless its result rows are recorded with it.

Required environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

Use `npm run evals -- docs/benchmark/offline-eval-summary.json` when a checked file artifact is needed. Use `npm run evals:persist` when a release or demo needs durable run history. Persisted history is exposed at `GET /api/research/evals/history?suite=offline&limit=20`.

## Live Proof Mode

`npm run evals:live` is fail-closed. It requires OpenAI, Exa, and Supabase environment variables plus `docs/demo/live-demo.json`. The manifest must point at an eval output artifact from the configured live run, and `npm run demo:record` must pass against the same manifest before the live proof can be treated as recorded evidence. Missing credentials or missing evidence should fail the command instead of silently passing offline fixtures.

Live eval proof is not persisted by `npm run evals:persist`; it remains tied to `docs/demo/live-demo.json`, the referenced eval output artifact, and `npm run evals:live`.

The offline eval summary is also exposed at `GET /api/research/evals` for inspection in deployed environments. That endpoint recomputes fixtures and should not be described as historical proof.
