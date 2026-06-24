alter table public.research_events
  add column if not exists run_id uuid,
  add column if not exists attempt_id uuid,
  add column if not exists event_type text,
  add column if not exists severity text not null default 'info',
  add column if not exists actor text,
  add column if not exists step_id text,
  add column if not exists duration_ms integer,
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

alter table public.research_approvals
  add column if not exists waived_gap_ids jsonb not null default '[]'::jsonb;

create table if not exists public.research_runs (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  status text not null check (status in ('queued','leased','running','awaiting_approval','completed','failed','cancelled')),
  attempt integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  worker_id text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_job_leases (
  id uuid primary key,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  worker_id text not null,
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.research_claims (
  id text primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  text text not null,
  status text not null check (status in ('proposed','supported','contradicted','unsupported','waived')),
  severity text not null check (severity in ('low','medium','high','critical')),
  source_ids jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_evidence (
  id text primary key,
  claim_id text not null references public.research_claims(id) on delete cascade,
  source_id text not null references public.research_sources(id) on delete cascade,
  quote text not null,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_gaps (
  id text primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  claim_id text references public.research_claims(id) on delete cascade,
  description text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null check (status in ('open','closed','waived')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.research_audits (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  audit_type text not null,
  ok boolean not null,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.eval_runs (
  id uuid primary key,
  suite text not null,
  status text not null check (status in ('passed','failed')),
  summary jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.eval_results (
  id uuid primary key,
  eval_run_id uuid not null references public.eval_runs(id) on delete cascade,
  fixture_id text not null,
  passed boolean not null,
  scores jsonb not null,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_post_mortems (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  root_cause text not null,
  affected_step text,
  action_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_snapshots (
  id uuid primary key,
  effective_date date not null,
  provider text not null,
  pricing jsonb not null,
  created_at timestamptz not null default now(),
  unique(effective_date, provider)
);

alter table public.research_runs enable row level security;
alter table public.research_job_leases enable row level security;
alter table public.research_claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.claim_gaps enable row level security;
alter table public.research_audits enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_results enable row level security;
alter table public.research_post_mortems enable row level security;
alter table public.pricing_snapshots enable row level security;

create policy "Users can read own runs"
  on public.research_runs
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own claims"
  on public.research_claims
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own claim evidence"
  on public.claim_evidence
  for select
  using (
    exists (
      select 1
      from public.research_claims c
      join public.research_sessions s on s.id = c.session_id
      where c.id = claim_id and s.user_id = auth.uid()
    )
  );

create policy "Users can read own claim gaps"
  on public.claim_gaps
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own audits"
  on public.research_audits
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own post mortems"
  on public.research_post_mortems
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Authenticated users can read pricing snapshots"
  on public.pricing_snapshots
  for select
  using (auth.role() = 'authenticated');

create index if not exists research_runs_session_created_idx on public.research_runs(session_id, created_at desc);
create index if not exists research_runs_status_created_idx on public.research_runs(status, created_at);
create index if not exists research_runs_queue_idx on public.research_runs(status, lease_expires_at, created_at);
create unique index if not exists research_runs_one_active_per_session_idx
  on public.research_runs(session_id)
  where status in ('queued','leased','running');
create index if not exists research_job_leases_run_idx on public.research_job_leases(run_id);
create index if not exists research_claims_session_idx on public.research_claims(session_id);
create index if not exists claim_gaps_session_status_idx on public.claim_gaps(session_id, status);
create index if not exists research_audits_session_idx on public.research_audits(session_id);
create index if not exists eval_results_run_idx on public.eval_results(eval_run_id);
create index if not exists research_post_mortems_session_idx on public.research_post_mortems(session_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'research_events_run_id_fkey'
  ) then
    alter table public.research_events
      add constraint research_events_run_id_fkey
      foreign key (run_id) references public.research_runs(id) on delete set null;
  end if;
end $$;

create or replace function public.claim_next_research_run(p_worker_id text, p_lease_ms integer)
returns public.research_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.research_runs%rowtype;
begin
  update public.research_runs
    set status = 'leased',
        worker_id = p_worker_id,
        lease_expires_at = now() + ((p_lease_ms::text || ' milliseconds')::interval),
        updated_at = now()
  where id = (
    select id
    from public.research_runs
    where status = 'queued'
       or (status in ('leased','running') and lease_expires_at < now())
    order by created_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke execute on function public.claim_next_research_run(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_research_run(text, integer) to service_role;
