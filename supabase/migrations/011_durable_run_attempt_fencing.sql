alter table public.research_runs
  add column if not exists current_attempt_id uuid;

create table if not exists public.research_run_attempts (
  id uuid primary key,
  run_id uuid not null,
  session_id uuid not null,
  attempt integer not null,
  worker_id text not null,
  status text not null check (status in ('queued','leased','running','awaiting_approval','completed','failed','cancelled')),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique(run_id, attempt)
);

alter table public.research_run_attempts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_run_attempts_run_session_fkey'
      and conrelid = 'public.research_run_attempts'::regclass
  ) then
    alter table public.research_run_attempts
      add constraint research_run_attempts_run_session_fkey
      foreign key (run_id, session_id) references public.research_runs(id, session_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_runs_current_attempt_fkey'
      and conrelid = 'public.research_runs'::regclass
  ) then
    alter table public.research_runs
      add constraint research_runs_current_attempt_fkey
      foreign key (current_attempt_id) references public.research_run_attempts(id) on delete set null;
  end if;
end $$;

create unique index if not exists research_run_attempts_one_active_per_run_idx
  on public.research_run_attempts(run_id)
  where status in ('leased','running');

create index if not exists research_run_attempts_run_created_idx
  on public.research_run_attempts(run_id, created_at desc);

drop policy if exists "Users can read own run attempts" on public.research_run_attempts;
create policy "Users can read own run attempts"
  on public.research_run_attempts
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

insert into public.research_run_attempts(
  id,
  run_id,
  session_id,
  attempt,
  worker_id,
  status,
  lease_expires_at,
  heartbeat_at,
  started_at,
  completed_at,
  error,
  created_at
)
select
  gen_random_uuid(),
  id,
  session_id,
  attempt,
  coalesce(worker_id, 'migration-backfill'),
  status,
  lease_expires_at,
  coalesce(lease_expires_at, updated_at, now()),
  started_at,
  completed_at,
  error,
  created_at
from public.research_runs
where current_attempt_id is null
  and worker_id is not null
  and status in ('leased','running','awaiting_approval','completed','failed','cancelled')
on conflict (run_id, attempt) do nothing;

update public.research_runs r
  set current_attempt_id = a.id
from public.research_run_attempts a
where r.current_attempt_id is null
  and a.run_id = r.id
  and a.attempt = r.attempt;

create or replace function public.claim_next_research_run(p_worker_id text, p_lease_ms integer)
returns public.research_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.research_runs%rowtype;
  claimed public.research_runs%rowtype;
  next_attempt integer;
  attempt_id uuid;
  lease_until timestamptz;
begin
  lease_until := now() + ((p_lease_ms::text || ' milliseconds')::interval);

  select *
  into candidate
  from public.research_runs
  where status = 'queued'
     or (status in ('leased','running') and lease_expires_at < now())
  order by created_at asc
  for update skip locked
  limit 1;

  if candidate.id is null then
    return null;
  end if;

  next_attempt := case
    when candidate.status = 'queued' then greatest(candidate.attempt, 1)
    else candidate.attempt + 1
  end;
  attempt_id := gen_random_uuid();

  update public.research_run_attempts
    set status = 'cancelled',
        completed_at = now(),
        error = coalesce(error, 'Lease expired and run was reclaimed.')
  where run_id = candidate.id
    and status in ('leased','running')
    and (lease_expires_at is null or lease_expires_at < now());

  insert into public.research_run_attempts(id, run_id, session_id, attempt, worker_id, status, lease_expires_at, heartbeat_at, started_at, created_at)
  values (attempt_id, candidate.id, candidate.session_id, next_attempt, p_worker_id, 'leased', lease_until, now(), now(), now());

  update public.research_runs
    set status = 'leased',
        attempt = next_attempt,
        current_attempt_id = attempt_id,
        worker_id = p_worker_id,
        lease_expires_at = lease_until,
        started_at = coalesce(started_at, now()),
        completed_at = null,
        error = null,
        updated_at = now()
  where id = candidate.id
  returning * into claimed;

  insert into public.research_job_leases(id, run_id, worker_id, lease_expires_at, heartbeat_at, created_at)
  values (gen_random_uuid(), claimed.id, p_worker_id, lease_until, now(), now())
  on conflict (run_id) do update
    set worker_id = excluded.worker_id,
        lease_expires_at = excluded.lease_expires_at,
        heartbeat_at = excluded.heartbeat_at;

  return claimed;
end;
$$;

drop function if exists public.extend_research_run_lease(uuid, text, integer);

create or replace function public.extend_research_run_lease(p_run_id uuid, p_attempt_id uuid, p_worker_id text, p_lease_ms integer)
returns public.research_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  extended public.research_runs%rowtype;
  lease_until timestamptz;
begin
  lease_until := now() + ((p_lease_ms::text || ' milliseconds')::interval);

  update public.research_runs r
    set lease_expires_at = lease_until,
        updated_at = now()
  where r.id = p_run_id
    and r.current_attempt_id = p_attempt_id
    and r.worker_id = p_worker_id
    and r.status in ('leased','running')
    and r.lease_expires_at > now()
    and exists (
      select 1
      from public.research_run_attempts a
      where a.id = p_attempt_id
        and a.run_id = r.id
        and a.worker_id = p_worker_id
        and a.status in ('leased','running')
        and a.lease_expires_at > now()
    )
  returning * into extended;

  if extended.id is not null then
    update public.research_run_attempts
      set lease_expires_at = lease_until,
          heartbeat_at = now()
    where id = p_attempt_id
      and run_id = extended.id;

    insert into public.research_job_leases(id, run_id, worker_id, lease_expires_at, heartbeat_at, created_at)
    values (gen_random_uuid(), extended.id, p_worker_id, lease_until, now(), now())
    on conflict (run_id) do update
      set worker_id = excluded.worker_id,
          lease_expires_at = excluded.lease_expires_at,
          heartbeat_at = excluded.heartbeat_at;
  end if;

  return extended;
end;
$$;

create or replace function public.transition_research_run(
  p_run_id uuid,
  p_attempt_id uuid,
  p_worker_id text,
  p_status text,
  p_error text default null,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns public.research_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  transitioned public.research_runs%rowtype;
  next_started_at timestamptz;
  next_completed_at timestamptz;
  next_lease_expires_at timestamptz;
begin
  if p_status not in ('running','awaiting_approval','completed','failed','cancelled') then
    raise exception 'invalid research run transition target' using errcode = '23514';
  end if;

  next_started_at := case
    when p_status = 'running' then coalesce(p_started_at, now())
    else p_started_at
  end;
  next_completed_at := case
    when p_status in ('awaiting_approval','completed','failed','cancelled') then coalesce(p_completed_at, now())
    else p_completed_at
  end;
  next_lease_expires_at := case
    when p_status in ('awaiting_approval','completed','failed','cancelled') then null
    else (select lease_expires_at from public.research_runs where id = p_run_id)
  end;

  update public.research_runs r
    set status = p_status,
        started_at = coalesce(next_started_at, started_at),
        completed_at = next_completed_at,
        lease_expires_at = next_lease_expires_at,
        error = case when p_error is not null then p_error else error end,
        updated_at = now()
  where r.id = p_run_id
    and r.current_attempt_id = p_attempt_id
    and r.worker_id = p_worker_id
    and r.status in ('leased','running')
    and r.lease_expires_at > now()
  returning * into transitioned;

  if transitioned.id is not null then
    update public.research_run_attempts
      set status = p_status,
          started_at = coalesce(next_started_at, started_at),
          completed_at = next_completed_at,
          lease_expires_at = next_lease_expires_at,
          heartbeat_at = now(),
          error = case when p_error is not null then p_error else error end
    where id = p_attempt_id
      and run_id = transitioned.id
      and worker_id = p_worker_id;
  end if;

  return transitioned;
end;
$$;

revoke execute on function public.claim_next_research_run(text, integer) from public, anon, authenticated;
revoke execute on function public.extend_research_run_lease(uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.transition_research_run(uuid, uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_next_research_run(text, integer) to service_role;
grant execute on function public.extend_research_run_lease(uuid, uuid, text, integer) to service_role;
grant execute on function public.transition_research_run(uuid, uuid, text, text, text, timestamptz, timestamptz) to service_role;
