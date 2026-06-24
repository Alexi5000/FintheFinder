# Benchmark And Cost Evidence

Last updated: 2026-06-24.

This is the honest benchmark log. The current repo has an offline eval seed plus persisted run-cost rows; live benchmark rows must be filled from configured runs with real run IDs, exported reports, and measured usage.

## Offline Scenarios

| Scenario | Expected behavior | Current proof |
| --- | --- | --- |
| AI compliance research | Includes regulatory uncertainty, human oversight, full citation coverage, and no unsafe certainty claims | `tests/fixtures/evals/ai-compliance-research.json`, `npm run evals` |
| Citation coverage | Requires every material section to cite a known source | `tests/fixtures/evals/citation-mismatch.json`, `npm run evals` |
| Negative overclaiming control | Fails unsafe certainty, missing citations, and missing human oversight caveat | `tests/fixtures/evals/negative-overclaiming.json`, `npm run evals` |

## Cost Formula

The v0 hosted pipeline cost envelope is:

```text
total = model_input_tokens + model_output_tokens + Exa searches
planner calls = 1
searches = 2-6 queries * 5 results each
evaluation calls = one per source
extraction calls = one per relevant source
report calls = 1
```

The deterministic estimator lives in `src/server/research/cost-model.ts` and uses a dated pricing snapshot. Hosted runs persist `research_run_costs` with `measurementMethod="provider_usage"` when Mastra returns token usage, otherwise `measurementMethod="estimated"`. Pricing must be refreshed before publishing fixed cost claims.

## Live Run Log

| Date | Prompt | Run ID | Model(s) | Exa searches | Tokens | Estimated cost | Eval result | Report |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Pending | Configured live demo run | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

No live measured cost-per-run claim is approved until this table has real usage. Demo rows must report the persisted measurement method and link the run JSON that contains the cost object.
