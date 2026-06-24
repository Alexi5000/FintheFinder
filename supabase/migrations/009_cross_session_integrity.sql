do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_sources_id_session_unique'
      and conrelid = 'public.research_sources'::regclass
  ) then
    alter table public.research_sources
      add constraint research_sources_id_session_unique unique (id, session_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_claims_id_session_unique'
      and conrelid = 'public.research_claims'::regclass
  ) then
    alter table public.research_claims
      add constraint research_claims_id_session_unique unique (id, session_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_runs_id_session_unique'
      and conrelid = 'public.research_runs'::regclass
  ) then
    alter table public.research_runs
      add constraint research_runs_id_session_unique unique (id, session_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_evaluations_source_session_fkey'
      and conrelid = 'public.source_evaluations'::regclass
  ) then
    alter table public.source_evaluations
      add constraint source_evaluations_source_session_fkey
      foreign key (source_id, session_id) references public.research_sources(id, session_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_learnings_source_session_fkey'
      and conrelid = 'public.research_learnings'::regclass
  ) then
    alter table public.research_learnings
      add constraint research_learnings_source_session_fkey
      foreign key (source_id, session_id) references public.research_sources(id, session_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'claim_gaps_claim_session_fkey'
      and conrelid = 'public.claim_gaps'::regclass
  ) then
    alter table public.claim_gaps
      add constraint claim_gaps_claim_session_fkey
      foreign key (claim_id, session_id) references public.research_claims(id, session_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_run_costs_run_session_fkey'
      and conrelid = 'public.research_run_costs'::regclass
  ) then
    alter table public.research_run_costs
      add constraint research_run_costs_run_session_fkey
      foreign key (run_id, session_id) references public.research_runs(id, session_id) on delete cascade;
  end if;
end $$;

create or replace function public.ensure_run_child_session_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.run_id is not null and not exists (
    select 1
    from public.research_runs r
    where r.id = new.run_id
      and r.session_id = new.session_id
  ) then
    raise exception 'run parent must belong to child session' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_research_events_run_session on public.research_events;
create trigger ensure_research_events_run_session
  before insert or update of run_id, session_id
  on public.research_events
  for each row
  execute function public.ensure_run_child_session_integrity();

drop trigger if exists ensure_research_audits_run_session on public.research_audits;
create trigger ensure_research_audits_run_session
  before insert or update of run_id, session_id
  on public.research_audits
  for each row
  execute function public.ensure_run_child_session_integrity();

drop trigger if exists ensure_research_post_mortems_run_session on public.research_post_mortems;
create trigger ensure_research_post_mortems_run_session
  before insert or update of run_id, session_id
  on public.research_post_mortems
  for each row
  execute function public.ensure_run_child_session_integrity();

create or replace function public.ensure_claim_evidence_session_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.research_claims c
    join public.research_sources s on s.id = new.source_id
    where c.id = new.claim_id
      and c.session_id = s.session_id
  ) then
    raise exception 'claim evidence source must belong to claim session' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_claim_evidence_source_session on public.claim_evidence;
create trigger ensure_claim_evidence_source_session
  before insert or update of claim_id, source_id
  on public.claim_evidence
  for each row
  execute function public.ensure_claim_evidence_session_integrity();

create or replace function public.ensure_claim_jsonb_graph_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text;
  evidence_id text;
begin
  if jsonb_typeof(coalesce(new.source_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'claim source_ids must be a JSON array' using errcode = '23514';
  end if;

  if jsonb_typeof(coalesce(new.evidence_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'claim evidence_ids must be a JSON array' using errcode = '23514';
  end if;

  for source_id in select jsonb_array_elements_text(coalesce(new.source_ids, '[]'::jsonb)) loop
    if not exists (
      select 1
      from public.research_sources s
      where s.id = source_id
        and s.session_id = new.session_id
    ) then
      raise exception 'claim source_ids must belong to claim session' using errcode = '23514';
    end if;
  end loop;

  for evidence_id in select jsonb_array_elements_text(coalesce(new.evidence_ids, '[]'::jsonb)) loop
    if not exists (
      select 1
      from public.claim_evidence e
      where e.id = evidence_id
        and e.claim_id = new.id
    ) then
      raise exception 'claim evidence_ids must belong to claim' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists ensure_research_claims_jsonb_graph on public.research_claims;
create trigger ensure_research_claims_jsonb_graph
  before insert or update of session_id, source_ids, evidence_ids
  on public.research_claims
  for each row
  execute function public.ensure_claim_jsonb_graph_integrity();

create or replace function public.ensure_approval_jsonb_graph_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text;
  gap_id text;
begin
  if jsonb_typeof(coalesce(new.approved_source_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'approval approved_source_ids must be a JSON array' using errcode = '23514';
  end if;

  if jsonb_typeof(coalesce(new.waived_gap_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'approval waived_gap_ids must be a JSON array' using errcode = '23514';
  end if;

  for source_id in select jsonb_array_elements_text(coalesce(new.approved_source_ids, '[]'::jsonb)) loop
    if not exists (
      select 1
      from public.research_sources s
      where s.id = source_id
        and s.session_id = new.session_id
    ) then
      raise exception 'approval approved_source_ids must belong to approval session' using errcode = '23514';
    end if;
  end loop;

  for gap_id in select jsonb_array_elements_text(coalesce(new.waived_gap_ids, '[]'::jsonb)) loop
    if not exists (
      select 1
      from public.claim_gaps g
      where g.id = gap_id
        and g.session_id = new.session_id
    ) then
      raise exception 'approval waived_gap_ids must belong to approval session' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists ensure_research_approvals_jsonb_graph on public.research_approvals;
create trigger ensure_research_approvals_jsonb_graph
  before insert or update of session_id, approved_source_ids, waived_gap_ids
  on public.research_approvals
  for each row
  execute function public.ensure_approval_jsonb_graph_integrity();

create or replace function public.ensure_memory_session_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is not null and not exists (
    select 1
    from public.research_sessions s
    where s.id = new.session_id
      and s.user_id = new.user_id
  ) then
    raise exception 'memory user must own research session' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_research_memory_session_owner on public.research_memories;
create trigger ensure_research_memory_session_owner
  before insert or update of session_id, user_id
  on public.research_memories
  for each row
  execute function public.ensure_memory_session_owner();

create or replace function public.prevent_research_parent_session_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is distinct from old.session_id then
    raise exception 'session_id cannot be reassigned for persisted research graph parents' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_research_sources_session_reassignment on public.research_sources;
create trigger prevent_research_sources_session_reassignment
  before update of session_id
  on public.research_sources
  for each row
  execute function public.prevent_research_parent_session_update();

drop trigger if exists prevent_research_claims_session_reassignment on public.research_claims;
create trigger prevent_research_claims_session_reassignment
  before update of session_id
  on public.research_claims
  for each row
  execute function public.prevent_research_parent_session_update();

drop trigger if exists prevent_research_runs_session_reassignment on public.research_runs;
create trigger prevent_research_runs_session_reassignment
  before update of session_id
  on public.research_runs
  for each row
  execute function public.prevent_research_parent_session_update();

create or replace function public.prevent_research_session_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'research session owner cannot be reassigned' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_research_sessions_owner_reassignment on public.research_sessions;
create trigger prevent_research_sessions_owner_reassignment
  before update of user_id
  on public.research_sessions
  for each row
  execute function public.prevent_research_session_owner_update();

revoke execute on function public.ensure_run_child_session_integrity() from public, anon, authenticated;
revoke execute on function public.ensure_claim_evidence_session_integrity() from public, anon, authenticated;
revoke execute on function public.ensure_claim_jsonb_graph_integrity() from public, anon, authenticated;
revoke execute on function public.ensure_approval_jsonb_graph_integrity() from public, anon, authenticated;
revoke execute on function public.ensure_memory_session_owner() from public, anon, authenticated;
revoke execute on function public.prevent_research_parent_session_update() from public, anon, authenticated;
revoke execute on function public.prevent_research_session_owner_update() from public, anon, authenticated;
