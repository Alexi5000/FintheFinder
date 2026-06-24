drop policy if exists "Users can insert own session approvals" on public.research_approvals;
drop policy if exists "Users can update own session approvals" on public.research_approvals;
drop policy if exists "Users can delete own session approvals" on public.research_approvals;

-- Approval mutations must go through the hosted API, where critical-gap,
-- waiver-note, rejection, and follow-up state-machine rules are enforced.
-- The API uses the service-role repository path; authenticated clients keep
-- read access through "Users can read own session approvals" only.
