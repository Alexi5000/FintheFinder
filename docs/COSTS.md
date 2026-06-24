# Cost Policy

Fin must never publish a fixed cost-per-run number without measured usage and a pricing snapshot date.

## Budget Controls

- Use `src/server/research/cost-model.ts` for deterministic estimates.
- Treat unknown models as the conservative `unknown` pricing row.
- Budget-exhausted runs with open critical gaps must go to `awaiting_approval`, not `report_ready`.

## Current Status

Offline cost math is implemented and tested. Provider token capture and UI/API cost display are still planned production work.
