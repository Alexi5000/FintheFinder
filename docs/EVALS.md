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
- Generator: extracts citation coverage, unknown source IDs, missing caveats, and overclaiming signals from the actual report.
- Evaluator: produces the four-axis score, compares it with fixture baselines, and flags regressions.

## Fixture Set

Add fixtures under `tests/fixtures/evals/` with:

- Prompt
- Expected source characteristics
- Required caveats
- Minimum citation coverage
- Expected pass/fail outcome
- Minimum score baselines for passing fixtures
- Report acceptance rubric

## Release Rule

Any model, prompt, or agent-role change should run against the fixture set before release. Failed evals should block promotion unless the rubric is intentionally updated.

Negative-control fixtures are allowed and expected to pass the harness only when the evaluator observes the intended failure.

## Live Proof Mode

`npm run evals:live` is fail-closed. It requires OpenAI, Exa, and Supabase environment variables plus `docs/demo/live-demo.json`. The manifest must point at an eval output artifact from the configured live run. Missing credentials or missing evidence should fail the command instead of silently passing offline fixtures.

The offline eval summary is also exposed at `GET /api/research/evals` for inspection in deployed environments.
