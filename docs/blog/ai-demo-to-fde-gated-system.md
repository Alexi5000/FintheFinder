# From AI Demo To FDE-Gated System

The fastest way for an AI research app to lose trust is to make product claims that only exist in prose. Fin’s build-out uses a gate matrix: every claim needs a code path, a test or eval, and a demo artifact.

The important shift is from “the agent can produce a report” to “the system can explain why this report is ready.” That requires typed contracts, state transitions, claim gaps, cost telemetry, and human approval. It is less glamorous than a single generated answer, but it is the work that makes the product inspectable.

The first production slice adds the foundation: green audit, contract drift checks, offline evals, claim-ledger primitives, plateau scoring, and cost estimation. The next slice moves long-running research out of synchronous API routes and into a worker with durable leases.
