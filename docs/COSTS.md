# Cost Policy

Fin must never publish a fixed cost-per-run number without measured usage and a pricing snapshot date.

## Budget Controls

- Use `src/server/research/cost-model.ts` for deterministic estimates.
- Treat unknown models as the conservative `unknown` pricing row.
- Budget-exhausted runs with open critical gaps must go to `awaiting_approval`, not `report_ready`.
- Budget exhaustion without open critical gaps is a warning event, not a hard publication block.

## Current Status

Offline cost math is implemented and tested. Hosted worker stages persist run-cost rows with model tokens, Exa search count, dated pricing, measurement method, budget state, and remaining-budget metadata. When Mastra returns provider usage, the row is marked `provider_usage`; otherwise the pipeline falls back to deterministic estimates. Session detail, run JSON, and the authenticated UI expose the row.

The pipeline emits a warning when a run exceeds `RUN_BUDGET_USD`. If critical claim gaps are still open at that point, the worker emits a `budget_gate` event, returns the session to `awaiting_approval`, and refuses to publish the report until a human resolves or waives the gaps through the approval flow.

The 2026-07-01 live benchmark proof records persisted provider usage of `$0.17287` for session `f6487144-8db9-4833-88e2-999c31a352ba`. Public benchmark rows must label persisted run costs as `estimated` or `provider_usage` exactly as recorded on the run.
