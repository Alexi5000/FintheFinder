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

    if p_status in ('awaiting_approval','completed','failed','cancelled') then
      delete from public.research_job_leases
      where run_id = transitioned.id
        and worker_id = p_worker_id;
    end if;
  end if;

  return transitioned;
end;
$$;

revoke execute on function public.transition_research_run(uuid, uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.transition_research_run(uuid, uuid, text, text, text, timestamptz, timestamptz) to service_role;
