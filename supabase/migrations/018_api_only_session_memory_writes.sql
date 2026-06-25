drop policy if exists "Users can manage own sessions" on public.research_sessions;

create policy "Users can read own sessions"
  on public.research_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own research memories" on public.research_memories;
drop policy if exists "Users can update own research memories" on public.research_memories;
drop policy if exists "Users can delete own research memories" on public.research_memories;

-- Session and memory mutations must go through hosted API routes. Those routes
-- use service-role persistence after auth, rate-limit, ownership, state-machine,
-- schema, size, and secret-like content validation. Authenticated clients keep
-- read access through the ownership-scoped select policies only.
