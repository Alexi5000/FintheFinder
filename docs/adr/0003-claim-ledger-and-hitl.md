# ADR 0003: Claim Ledger Before Report Readiness

Status: Accepted  
Date: 2026-06-24

## Context

A cited report can still overclaim, miss critical caveats, or cite weak evidence.

## Decision

Introduce a claim ledger and HITL state machine. Reports should cite claims and claims should cite evidence. Open critical gaps block `report_ready`.

## Consequences

The product gains a reviewable evidence trail. Implementation requires new persistence tables and UI for gaps, approvals, and waivers.

Approval decisions must remain transactional. The hosted route delegates to `record_research_approval_decision` so waiver updates, approval history, run events, session transitions, and follow-on run enqueueing cannot partially commit.
