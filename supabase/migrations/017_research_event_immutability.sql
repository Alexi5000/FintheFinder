create or replace function public.prevent_research_event_payload_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.id is not distinct from old.id
    and new.session_id is not distinct from old.session_id
    and new.attempt_id is not distinct from old.attempt_id
    and new.phase is not distinct from old.phase
    and new.event_type is not distinct from old.event_type
    and new.severity is not distinct from old.severity
    and new.actor is not distinct from old.actor
    and new.step_id is not distinct from old.step_id
    and new.message is not distinct from old.message
    and new.duration_ms is not distinct from old.duration_ms
    and new.trace_id is not distinct from old.trace_id
    and new.correlation_id is not distinct from old.correlation_id
    and new.metadata is not distinct from old.metadata
    and new.created_at is not distinct from old.created_at
    and old.run_id is not null
    and new.run_id is null
  ) then
    return new;
  end if;

  raise exception 'research events are immutable after insert' using errcode = '23514';
end;
$$;

drop trigger if exists prevent_research_event_payload_update on public.research_events;
create trigger prevent_research_event_payload_update
  before update
  on public.research_events
  for each row
  execute function public.prevent_research_event_payload_update();

revoke execute on function public.prevent_research_event_payload_update() from public, anon, authenticated;

create or replace function public.prevent_research_event_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception 'research events may only be deleted by parent session cascade' using errcode = '23514';
end;
$$;

drop trigger if exists prevent_research_event_delete on public.research_events;
create trigger prevent_research_event_delete
  before delete
  on public.research_events
  for each row
  execute function public.prevent_research_event_delete();

revoke execute on function public.prevent_research_event_delete() from public, anon, authenticated;
