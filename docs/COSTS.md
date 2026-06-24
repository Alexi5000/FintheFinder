# Cost Policy

Fin must never publish a fixed cost-per-run number without measured usage and a pricing snapshot date.

## Budget Controls

- Use `src/server/research/cost-model.ts` for deterministic estimates.
- Treat unknown models as the conservative `unknown` pricing row.
- Budget-exhausted runs with open critical gaps must go to `awaiting_approval`, not `report_ready`.

## Current Status

Offline cost math is implemented and tested. Hosted worker stages persist run-cost rows with estimated model tokens, Exa search count, dated pricing, and measurement method. Session detail, run JSON, and the authenticated UI expose those estimates.

Provider token capture is still pending. Until it is wired end to end, public benchmark rows must label persisted run costs as estimates.
