# Architecture

Fin the Finder is a hosted multi-user research product with a Next.js surface and a Mastra agent core.

## System Shape

```text
User
  -> Next.js workspace
  -> API route validation
  -> Supabase Auth check
  -> Research queue and worker
  -> Mastra agents and tools
  -> Exa search and OpenAI model calls
  -> Supabase persisted session state
  -> cited report export
```

## Core Domains

| Domain | Responsibility |
| --- | --- |
| `src/app` | Product routes, API handlers, report export |
| `src/lib/contracts` | Shared Zod contracts and generated JSON Schema source |
| `src/server/research` | Search, citation audit, report formatting, pipeline orchestration, persistence repository |
| `src/mastra` | Agents, tools, workflows, and Mastra instance registration |
| `supabase/migrations` | Database schema and row-level security |

## Agent Roles

| Agent | Purpose |
| --- | --- |
| Research Planner | Converts broad topics into focused search plans |
| Research Agent | Orchestrates tool usage in the Mastra workflow |
| Evaluation Agent | Scores relevance and credibility |
| Learning Extraction Agent | Extracts evidence-backed claims and follow-up questions |
| Web Summarizer | Compresses source text while preserving evidence |
| Contradiction Checker | Flags conflicts, weak evidence, and missing caveats |
| Citation Auditor | Checks report claims against source IDs and URLs |
| Report Agent | Produces cited analyst-grade report drafts |
| Final Reviewer | Reviews final quality before report readiness |

## Data Model

Supabase stores:

- `research_sessions`
- `research_sources`
- `source_evaluations`
- `research_learnings`
- `research_reports`
- `research_events`
- `research_approvals`
- `research_runs`
- `research_run_attempts`
- `research_job_leases`
- `research_claims`
- `claim_evidence`
- `claim_gaps`
- `research_audits`
- `research_run_costs`
- `research_post_mortems`
- `research_memories`
- `eval_runs`
- `eval_results`
- `pricing_snapshots`

All user-owned tables have row-level security. Authenticated clients receive ownership-scoped read access, while session state, approval decisions, and memory mutations go through hosted API routes backed by service-role persistence. Server routes use Supabase Auth bearer tokens to resolve the current user and enforce ownership before mutating data.

## Runtime Notes

Mastra LibSQL remains local workflow storage for development. Product records are persisted in Supabase so the web app has durable session history and report access.

Worker run transitions are attempt-fenced. `transition_research_run` verifies the current worker attempt before changing run state, and terminal transitions also clear the companion `research_job_leases` row so operations do not see completed work as still leased.

Worker-owned artifact replacement is transaction-fenced in Supabase. The worker pipeline proves current `research_run_attempts` ownership before persistence, then the `replace_research_artifacts` RPC locks the run/attempt rows, verifies the worker and unexpired lease, and rebuilds sources, evaluations, learnings, claims, evidence, gaps, audits, and optional report data in one database transaction.

Final report publication is also a Supabase-owned transaction. The reporting worker calls `publish_research_report_for_attempt`, which validates the report payload, treats exact replay after a committed publish as idempotent success, locks the current run/attempt/session, rechecks open critical gaps, and either returns the session/run to approval or commits the final audit, report row, `report_ready` event, session completion, run completion, attempt completion, and job-lease cleanup atomically. `016_exact_report_publication_replay.sql` upgrades committed retries so the replayed report fields and final-review audit issues must match the stored rows before idempotent success is returned. Non-test callers without the run/attempt/worker fence fail before direct report writes.

Human approval decisions are also transaction-owned by Supabase. The hosted approval route validates auth and request shape, then calls `record_research_approval_decision`, which locks the owned session, rechecks `awaiting_approval`, applies critical-gap rules, records the approval event, and either queues the next run or rejects the session atomically.

Run events are append-only product evidence within the session lifecycle. The application inserts events through the repository and Supabase prevents payload updates or direct deletes after insert, while still allowing foreign-key cleanup paths that set `run_id` to `null` if a referenced run is deleted or remove events during parent session cascade.
