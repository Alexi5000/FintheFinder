create or replace function public.ensure_research_approval_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.research_sessions s
    where s.id = new.session_id
      and s.user_id = new.user_id
  ) then
    raise exception 'approval user must own research session' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_research_approval_owner on public.research_approvals;
create trigger ensure_research_approval_owner
  before insert or update of session_id, user_id
  on public.research_approvals
  for each row
  execute function public.ensure_research_approval_owner();

drop policy if exists "Users can manage own approvals" on public.research_approvals;

create policy "Users can read own session approvals"
  on public.research_approvals
  for select
  using (
    exists (
      select 1
      from public.research_sessions s
      where s.id = public.research_approvals.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can insert own session approvals"
  on public.research_approvals
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.research_sessions s
      where s.id = public.research_approvals.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can update own session approvals"
  on public.research_approvals
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.research_sessions s
      where s.id = public.research_approvals.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.research_sessions s
      where s.id = public.research_approvals.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can delete own session approvals"
  on public.research_approvals
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.research_sessions s
      where s.id = public.research_approvals.session_id
        and s.user_id = auth.uid()
    )
  );

revoke execute on function public.ensure_research_approval_owner() from public, anon, authenticated;
