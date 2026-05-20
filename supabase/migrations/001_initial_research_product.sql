create table if not exists public.research_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  title text not null,
  status text not null check (status in ('draft','queued','running','awaiting_approval','approved','rejected','report_ready','failed')),
  phase text not null check (phase in ('intake','planning','searching','evaluating','extracting','reviewing','reporting','complete','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_sources (
  id text primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  title text not null,
  url text not null,
  canonical_url text not null,
  domain text not null,
  snippet text not null default '',
  content text not null default '',
  published_at text,
  score numeric not null default 0,
  credibility text not null default 'unknown' check (credibility in ('high','medium','low','unknown')),
  relevance_reason text not null default '',
  unique(session_id, canonical_url)
);

create table if not exists public.source_evaluations (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  source_id text not null references public.research_sources(id) on delete cascade,
  is_relevant boolean not null,
  score numeric not null,
  credibility text not null check (credibility in ('high','medium','low','unknown')),
  reason text not null,
  risks jsonb not null default '[]'::jsonb
);

create table if not exists public.research_learnings (
  id text primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  source_id text not null references public.research_sources(id) on delete cascade,
  claim text not null,
  evidence text not null,
  follow_up_questions jsonb not null default '[]'::jsonb
);

create table if not exists public.research_reports (
  id uuid primary key,
  session_id uuid not null unique references public.research_sessions(id) on delete cascade,
  title text not null,
  executive_summary text not null,
  sections jsonb not null,
  citations jsonb not null,
  markdown text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.research_events (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  phase text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_approvals (
  id uuid primary key,
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('approve','reject','follow_up')),
  notes text,
  approved_source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.research_sessions enable row level security;
alter table public.research_sources enable row level security;
alter table public.source_evaluations enable row level security;
alter table public.research_learnings enable row level security;
alter table public.research_reports enable row level security;
alter table public.research_events enable row level security;
alter table public.research_approvals enable row level security;

create policy "Users can manage own sessions"
  on public.research_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own sources"
  on public.research_sources
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own evaluations"
  on public.source_evaluations
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own learnings"
  on public.research_learnings
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own reports"
  on public.research_reports
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can read own events"
  on public.research_events
  for select
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "Users can manage own approvals"
  on public.research_approvals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists research_sessions_user_updated_idx on public.research_sessions(user_id, updated_at desc);
create index if not exists research_sources_session_idx on public.research_sources(session_id);
create index if not exists research_events_session_created_idx on public.research_events(session_id, created_at);
