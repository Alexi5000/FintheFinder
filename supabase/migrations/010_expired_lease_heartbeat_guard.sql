create or replace function public.extend_research_run_lease(p_run_id uuid, p_worker_id text, p_lease_ms integer)
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

  update public.research_runs
    set lease_expires_at = lease_until,
        updated_at = now()
  where id = p_run_id
    and worker_id = p_worker_id
    and status in ('leased','running')
    and lease_expires_at > now()
  returning * into extended;

  if extended.id is not null then
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

revoke execute on function public.extend_research_run_lease(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.extend_research_run_lease(uuid, text, integer) to service_role;
