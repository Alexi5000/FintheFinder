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

All user-owned tables have row-level security. Server routes use Supabase Auth bearer tokens to resolve the current user and enforce ownership before reading or mutating data.

## Runtime Notes

Mastra LibSQL remains local workflow storage for development. Product records are persisted in Supabase so the web app has durable session history and report access.
