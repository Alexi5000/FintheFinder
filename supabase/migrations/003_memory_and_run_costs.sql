create table if not exists public.research_run_costs (
  id uuid primary key,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  usage jsonb not null default '{"modelCalls":[],"exaSearches":0}'::jsonb,
  model_cost_usd numeric not null default 0,
  search_cost_usd numeric not null default 0,
  total_usd numeric not null default 0,
  pricing_effective_date date not null,
  measurement_method text not null default 'estimated' check (measurement_method in ('estimated','provider_usage')),
  created_at timestamptz not null default now(),
  unique(run_id)
);

create table if not exists public.research_memories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.research_sessions(id) on delete cascade,
  scope text not null check (scope in ('user','session')),
  namespace text not null check (namespace in ('preference','source_cache','procedure','run_summary')),
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'user' and session_id is null) or (scope = 'session' and session_id is not null))
);

alter table public.research_run_costs enable row level security;
alter table public.research_memories enable row level security;

create policy "Users can read own run costs"
  on public.research_run_costs
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own research memories"
  on public.research_memories
  for select
  using (
    user_id = auth.uid()
    and (
      session_id is null
      or exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid())
    )
  );

create policy "Users can insert own research memories"
  on public.research_memories
  for insert
  with check (
    user_id = auth.uid()
    and (
      session_id is null
      or exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid())
    )
  );

create policy "Users can update own research memories"
  on public.research_memories
  for update
  using (
    user_id = auth.uid()
    and (
      session_id is null
      or exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid())
    )
  )
  with check (
    user_id = auth.uid()
    and (
      session_id is null
      or exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid())
    )
  );

create policy "Users can delete own research memories"
  on public.research_memories
  for delete
  using (
    user_id = auth.uid()
    and (
      session_id is null
      or exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid())
    )
  );

create index if not exists research_run_costs_session_idx on public.research_run_costs(session_id, created_at desc);
create index if not exists research_memories_user_updated_idx on public.research_memories(user_id, updated_at desc);
create index if not exists research_memories_session_idx on public.research_memories(session_id, updated_at desc);
create unique index if not exists research_memories_user_scope_unique_idx
  on public.research_memories(user_id, namespace, key)
  where scope = 'user' and session_id is null;
create unique index if not exists research_memories_session_scope_unique_idx
  on public.research_memories(user_id, session_id, namespace, key)
  where scope = 'session';
