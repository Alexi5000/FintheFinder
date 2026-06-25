create or replace function public.publish_research_report_for_attempt(
  p_session_id uuid,
  p_run_id uuid,
  p_attempt_id uuid,
  p_worker_id text,
  p_report jsonb,
  p_final_audit jsonb,
  p_trace_id text default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_value timestamptz := now();
  audit_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  report_id uuid;
  open_critical_gap_ids jsonb := '[]'::jsonb;
  completed_run public.research_runs%rowtype;
begin
  p_report := coalesce(p_report, '{}'::jsonb);
  p_final_audit := coalesce(p_final_audit, '{}'::jsonb);

  if jsonb_typeof(p_report) <> 'object' then
    raise exception 'report publication payload must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(p_final_audit) <> 'object' then
    raise exception 'report publication audit must be a JSON object' using errcode = '22023';
  end if;

  if nullif(p_report ->> 'id', '') is null
    or nullif(p_report ->> 'title', '') is null
    or nullif(p_report ->> 'executive_summary', '') is null
    or nullif(p_report ->> 'markdown', '') is null
    or nullif(p_report ->> 'created_at', '') is null then
    raise exception 'report publication payload is missing required report fields' using errcode = '22023';
  end if;

  if jsonb_typeof(p_report -> 'sections') is distinct from 'array'
    or jsonb_typeof(p_report -> 'citations') is distinct from 'array' then
    raise exception 'report publication sections and citations must be JSON arrays' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_final_audit -> 'issues', '[]'::jsonb)) is distinct from 'array' then
    raise exception 'report publication audit issues must be a JSON array' using errcode = '22023';
  end if;

  if coalesce((p_final_audit ->> 'ok')::boolean, false) is not true then
    raise exception 'report publication requires an approved final audit' using errcode = '23514';
  end if;

  report_id := (p_report ->> 'id')::uuid;

  select r.*
  into completed_run
  from public.research_runs r
  join public.research_run_attempts a
    on a.id = p_attempt_id
   and a.run_id = r.id
   and a.session_id = r.session_id
  join public.research_sessions s
    on s.id = r.session_id
  join public.research_reports report
    on report.session_id = r.session_id
   and report.id = report_id
  where r.id = p_run_id
    and r.session_id = p_session_id
    and r.current_attempt_id = p_attempt_id
    and r.worker_id = p_worker_id
    and r.status = 'completed'
    and a.worker_id = p_worker_id
    and a.status = 'completed'
    and s.status = 'report_ready'
    and s.phase = 'complete';

  if completed_run.id is not null then
    delete from public.research_job_leases
    where run_id = p_run_id
      and worker_id = p_worker_id;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'report', jsonb_build_object('id', report_id, 'sessionId', p_session_id, 'title', p_report ->> 'title', 'createdAt', p_report ->> 'created_at'),
      'session', jsonb_build_object('id', p_session_id, 'status', 'report_ready', 'phase', 'complete'),
      'run', to_jsonb(completed_run),
      'auditId', null,
      'eventId', null
    );
  end if;

  perform 1
  from public.research_runs r
  join public.research_run_attempts a
    on a.id = p_attempt_id
   and a.run_id = r.id
   and a.session_id = r.session_id
  where r.id = p_run_id
    and r.session_id = p_session_id
    and r.current_attempt_id = p_attempt_id
    and r.worker_id = p_worker_id
    and r.status in ('leased','running')
    and r.lease_expires_at > now()
    and coalesce(r.metadata ->> 'stage', 'research') = 'reporting'
    and a.worker_id = p_worker_id
    and a.status in ('leased','running')
    and a.lease_expires_at > now()
  for update of r, a;

  if not found then
    raise exception 'worker attempt does not own report publication' using errcode = '55000';
  end if;

  perform 1
  from public.research_sessions
  where id = p_session_id
    and status = 'running'
    and phase in ('reporting','reviewing')
  for update;

  if not found then
    raise exception 'session is not publishable for report publication' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into open_critical_gap_ids
  from (
    select id
    from public.claim_gaps
    where session_id = p_session_id
      and severity = 'critical'
      and status = 'open'
    for update
  ) gaps;

  if jsonb_array_length(open_critical_gap_ids) > 0 then
    update public.research_sessions
    set status = 'awaiting_approval',
        phase = 'reviewing',
        updated_at = now_value
    where id = p_session_id;

    insert into public.research_events (
      id,
      session_id,
      run_id,
      attempt_id,
      phase,
      event_type,
      severity,
      actor,
      step_id,
      message,
      trace_id,
      correlation_id,
      metadata,
      created_at
    )
    values (
      event_id,
      p_session_id,
      p_run_id,
      p_attempt_id,
      'reviewing',
      'claim_gap_opened',
      'warn',
      'worker',
      'critical_gap_gate',
      'Report publication blocked by unresolved critical claim gaps.',
      p_trace_id,
      p_correlation_id,
      jsonb_build_object('openCriticalGapIds', open_critical_gap_ids),
      now_value
    );

    update public.research_runs
    set status = 'awaiting_approval',
        completed_at = now_value,
        lease_expires_at = null,
        error = null,
        updated_at = now_value
    where id = p_run_id
      and current_attempt_id = p_attempt_id
      and worker_id = p_worker_id
      and status in ('leased','running')
    returning * into completed_run;

    update public.research_run_attempts
    set status = 'awaiting_approval',
        completed_at = now_value,
        lease_expires_at = null,
        heartbeat_at = now_value,
        error = null
    where id = p_attempt_id
      and run_id = p_run_id
      and worker_id = p_worker_id;

    delete from public.research_job_leases
    where run_id = p_run_id
      and worker_id = p_worker_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'critical_gaps_unresolved',
      'status', 'awaiting_approval',
      'openCriticalGapIds', open_critical_gap_ids,
      'session', jsonb_build_object('id', p_session_id, 'status', 'awaiting_approval', 'phase', 'reviewing'),
      'run', to_jsonb(completed_run),
      'eventId', event_id
    );
  end if;

  insert into public.research_audits (
    id,
    session_id,
    run_id,
    audit_type,
    ok,
    issues,
    created_at
  )
  values (
    audit_id,
    p_session_id,
    p_run_id,
    'final_review',
    true,
    coalesce(p_final_audit -> 'issues', '[]'::jsonb),
    now_value
  );

  insert into public.research_reports (
    id,
    session_id,
    title,
    executive_summary,
    sections,
    citations,
    markdown,
    created_at
  )
  select
    report_id,
    p_session_id,
    report.title,
    report.executive_summary,
    coalesce(report.sections, '[]'::jsonb),
    coalesce(report.citations, '[]'::jsonb),
    report.markdown,
    report.created_at
  from jsonb_to_record(p_report) as report(
    id uuid,
    title text,
    executive_summary text,
    sections jsonb,
    citations jsonb,
    markdown text,
    created_at timestamptz
  );

  update public.research_sessions
  set status = 'report_ready',
      phase = 'complete',
      updated_at = now_value
  where id = p_session_id;

  insert into public.research_events (
    id,
    session_id,
    run_id,
    attempt_id,
    phase,
    event_type,
    severity,
    actor,
    step_id,
    message,
    trace_id,
    correlation_id,
    metadata,
    created_at
  )
  values (
    event_id,
    p_session_id,
    p_run_id,
    p_attempt_id,
    'complete',
    'report_ready',
    'info',
    'worker',
    'report_ready',
    'Report is ready.',
    p_trace_id,
    p_correlation_id,
    jsonb_build_object('reportId', p_report ->> 'id'),
    now_value
  );

  update public.research_runs
  set status = 'completed',
      completed_at = now_value,
      lease_expires_at = null,
      error = null,
      updated_at = now_value
  where id = p_run_id
    and current_attempt_id = p_attempt_id
    and worker_id = p_worker_id
    and status in ('leased','running')
  returning * into completed_run;

  update public.research_run_attempts
  set status = 'completed',
      completed_at = now_value,
      lease_expires_at = null,
      heartbeat_at = now_value,
      error = null
  where id = p_attempt_id
    and run_id = p_run_id
    and worker_id = p_worker_id;

  delete from public.research_job_leases
  where run_id = p_run_id
    and worker_id = p_worker_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'report', jsonb_build_object('id', report_id, 'sessionId', p_session_id, 'title', p_report ->> 'title', 'createdAt', p_report ->> 'created_at'),
    'session', jsonb_build_object('id', p_session_id, 'status', 'report_ready', 'phase', 'complete'),
    'run', to_jsonb(completed_run),
    'auditId', audit_id,
    'eventId', event_id
  );
end;
$$;

revoke execute on function public.publish_research_report_for_attempt(uuid, uuid, uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.publish_research_report_for_attempt(uuid, uuid, uuid, text, jsonb, jsonb, text, text) to service_role;
