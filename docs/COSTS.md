# Cost Policy

Fin must never publish a fixed cost-per-run number without measured usage and a pricing snapshot date.

## Budget Controls

- Use `src/server/research/cost-model.ts` for deterministic estimates.
- Treat unknown models as the conservative `unknown` pricing row.
- Budget-exhausted runs with open critical gaps must go to `awaiting_approval`, not `report_ready`.

## Current Status

Offline cost math is implemented and tested. Hosted worker stages persist run-cost rows with model tokens, Exa search count, dated pricing, and measurement method. When Mastra returns provider usage, the row is marked `provider_usage`; otherwise the pipeline falls back to deterministic estimates. Session detail, run JSON, and the authenticated UI expose the row.

Live benchmark proof is still pending. Public benchmark rows must label persisted run costs as `estimated` or `provider_usage` exactly as recorded on the run.
