# Benchmark And Cost Evidence

Last updated: 2026-06-24.

This is the honest benchmark log. The current repo has an offline eval seed plus persisted run-cost rows; live benchmark rows must be filled from configured runs with real run IDs, exported reports, and measured usage.

## Offline Expected-Vs-Actual Scenarios

The checked artifact is `docs/benchmark/offline-eval-summary.json`. Regenerate it with:

```bash
npm run evals -- docs/benchmark/offline-eval-summary.json
npm run benchmark:check
```

| Scenario ID | Expected result | Actual result | Axis scores | Issues | Proof |
| --- | --- | --- | --- | --- | --- |
| `ai-compliance-research` | Pass: regulatory uncertainty, human oversight, complete citation coverage, and no unsafe certainty claims | Pass: observed report satisfied all checks | C 1.00 / S 1.00 / Comp 1.00 / Q 1.00 | None | `tests/fixtures/evals/ai-compliance-research.json`, `docs/benchmark/offline-eval-summary.json` |
| `citation-mismatch` | Pass: every material section cites a known source and preserves uncertainty | Pass: observed report cited `src_known` and met all axis baselines | C 1.00 / S 1.00 / Comp 1.00 / Q 1.00 | None | `tests/fixtures/evals/citation-mismatch.json`, `docs/benchmark/offline-eval-summary.json` |
| `negative-overclaiming` | Fail safely: unsafe certainty, missing citations, and missing oversight caveat should be caught | Fail observed as expected; regression score still passes because the failure was intentional | C 0.55 / S 0.25 / Comp 0.00 / Q 0.40 | Section "Deployment" has no citations.; Missing required caveat: human oversight; Forbidden phrase present: risk-free; Citation coverage 0.00 below 1. | `tests/fixtures/evals/negative-overclaiming.json`, `docs/benchmark/offline-eval-summary.json` |

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
