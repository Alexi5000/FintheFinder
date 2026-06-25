create or replace function public.record_research_approval_decision(
  p_session_id uuid,
  p_user_id uuid,
  p_action text,
  p_notes text default null,
  p_approved_source_ids jsonb default '[]'::jsonb,
  p_waived_gap_ids jsonb default '[]'::jsonb,
  p_trace_id text default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_record public.research_sessions%rowtype;
  active_run public.research_runs%rowtype;
  approval_id uuid := gen_random_uuid();
  approval_event_id uuid := gen_random_uuid();
  queued_event_id uuid;
  new_run_id uuid;
  queued_run public.research_runs%rowtype;
  now_value timestamptz := now();
  normalized_notes text := nullif(trim(coalesce(p_notes, '')), '');
  open_critical_gap_ids text[] := array[]::text[];
  unwaived_critical_gap_ids text[] := array[]::text[];
begin
  p_approved_source_ids := coalesce(p_approved_source_ids, '[]'::jsonb);
  p_waived_gap_ids := coalesce(p_waived_gap_ids, '[]'::jsonb);

  if p_action not in ('approve','reject','follow_up') then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'invalid_approval_request', 'details', jsonb_build_object('requestedAction', p_action))
    );
  end if;

  if p_notes is not null and length(p_notes) > 2000 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'invalid_approval_request', 'details', jsonb_build_object('field', 'notes'))
    );
  end if;

  if jsonb_typeof(p_approved_source_ids) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'invalid_approval_request', 'details', jsonb_build_object('field', 'approvedSourceIds'))
    );
  end if;

  if jsonb_typeof(p_waived_gap_ids) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'invalid_approval_request', 'details', jsonb_build_object('field', 'waivedGapIds'))
    );
  end if;

  select *
  into session_record
  from public.research_sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'session_not_found'));
  end if;

  if session_record.status <> 'awaiting_approval' then
    return jsonb_build_object(
      'ok', false,
      'error',
      jsonb_build_object(
        'code', 'approval_not_available',
        'details', jsonb_build_object('currentStatus', session_record.status, 'requestedAction', p_action)
      )
    );
  end if;

  if p_action in ('approve','follow_up') then
    select *
    into active_run
    from public.research_runs
    where session_id = p_session_id
      and status in ('queued','leased','running')
    order by created_at desc
    limit 1
    for update;

    if found then
      return jsonb_build_object(
        'ok', false,
        'error',
        jsonb_build_object(
          'code', 'active_run_conflict',
          'details', jsonb_build_object('runId', active_run.id, 'status', active_run.status)
        )
      );
    end if;
  end if;

  if p_action = 'approve' then
    select coalesce(array_agg(id order by id), array[]::text[])
    into open_critical_gap_ids
    from (
      select id
      from public.claim_gaps
      where session_id = p_session_id
        and severity = 'critical'
        and status = 'open'
      for update
    ) as open_critical_gaps;

    if coalesce(jsonb_array_length(p_waived_gap_ids), 0) > 0 and normalized_notes is null then
      return jsonb_build_object(
        'ok', false,
        'error',
        jsonb_build_object(
          'code', 'waiver_notes_required',
          'details', jsonb_build_object('openCriticalGapIds', to_jsonb(open_critical_gap_ids))
        )
      );
    end if;

    select coalesce(array_agg(gap_id order by gap_id), array[]::text[])
    into unwaived_critical_gap_ids
    from unnest(open_critical_gap_ids) as gap_id
    where not exists (
      select 1
      from jsonb_array_elements_text(p_waived_gap_ids) as waived(id)
      where waived.id = gap_id
    );

    if array_length(unwaived_critical_gap_ids, 1) is not null then
      return jsonb_build_object(
        'ok', false,
        'error',
        jsonb_build_object(
          'code', 'critical_gaps_unresolved',
          'details', jsonb_build_object('openCriticalGapIds', to_jsonb(unwaived_critical_gap_ids))
        )
      );
    end if;
  end if;

  if p_action in ('approve','follow_up') then
    new_run_id := gen_random_uuid();

    insert into public.research_runs (
      id,
      session_id,
      status,
      attempt,
      metadata,
      created_at,
      updated_at
    )
    values (
      new_run_id,
      p_session_id,
      'queued',
      1,
      case
        when p_action = 'approve' then jsonb_build_object(
          'stage', 'reporting',
          'approvedBy', p_user_id,
          'approvedSourceIds', p_approved_source_ids,
          'waivedGapIds', p_waived_gap_ids
        )
        else jsonb_build_object(
          'stage', 'research',
          'requestedBy', p_user_id,
          'followUpNotes', normalized_notes
        )
      end,
      now_value,
      now_value
    )
    on conflict (session_id) where status in ('queued','leased','running') do nothing
    returning * into queued_run;

    if not found then
      select *
      into active_run
      from public.research_runs
      where session_id = p_session_id
        and status in ('queued','leased','running')
      order by created_at desc
      limit 1;

      return jsonb_build_object(
        'ok', false,
        'error',
        jsonb_build_object(
          'code', 'active_run_conflict',
          'details', jsonb_build_object('runId', active_run.id, 'status', active_run.status)
        )
      );
    end if;
  end if;

  if p_action = 'approve' and jsonb_array_length(p_waived_gap_ids) > 0 then
    update public.claim_gaps
    set status = 'waived',
        resolution = coalesce(normalized_notes, 'Waived during human approval.'),
        resolved_at = now_value
    where session_id = p_session_id
      and id in (select jsonb_array_elements_text(p_waived_gap_ids));
  end if;

  insert into public.research_approvals (
    id,
    session_id,
    user_id,
    action,
    notes,
    approved_source_ids,
    waived_gap_ids,
    created_at
  )
  values (
    approval_id,
    p_session_id,
    p_user_id,
    p_action,
    normalized_notes,
    p_approved_source_ids,
    p_waived_gap_ids,
    now_value
  );

  insert into public.research_events (
    id,
    session_id,
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
    approval_event_id,
    p_session_id,
    'reviewing',
    'approval_recorded',
    'info',
    'user',
    'human_approval',
    case when p_action = 'approve' then 'Human approval recorded.' else format('Human %s recorded.', p_action) end,
    p_trace_id,
    p_correlation_id,
    case
      when p_action = 'approve' then jsonb_build_object('approvedSourceIds', p_approved_source_ids, 'waivedGapIds', p_waived_gap_ids)
      else jsonb_build_object('notes', normalized_notes)
    end,
    now_value
  );

  if p_action = 'reject' then
    update public.research_sessions
    set status = 'rejected',
        phase = 'reviewing',
        updated_at = now_value
    where id = p_session_id;

    return jsonb_build_object(
      'ok', true,
      'action', p_action,
      'approvalId', approval_id,
      'eventId', approval_event_id,
      'run', null,
      'runId', null,
      'status', null,
      'session', jsonb_build_object('id', p_session_id, 'status', 'rejected', 'phase', 'reviewing')
    );
  end if;

  update public.research_sessions
  set status = 'queued',
      phase = case when p_action = 'approve' then 'reporting' else 'planning' end,
      updated_at = now_value
  where id = p_session_id;

  queued_event_id := gen_random_uuid();
  insert into public.research_events (
    id,
    session_id,
    run_id,
    phase,
    event_type,
    severity,
    message,
    trace_id,
    correlation_id,
    metadata,
    created_at
  )
  values (
    queued_event_id,
    p_session_id,
    queued_run.id,
    case when p_action = 'approve' then 'reporting' else 'planning' end,
    'state_transition',
    'info',
    'Research run queued.',
    p_trace_id,
    p_correlation_id,
    jsonb_build_object('runId', queued_run.id, 'stage', queued_run.metadata ->> 'stage'),
    now_value
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'approvalId', approval_id,
    'eventId', approval_event_id,
    'queuedEventId', queued_event_id,
    'run', to_jsonb(queued_run),
    'runId', queued_run.id,
    'status', queued_run.status,
    'session',
    jsonb_build_object(
      'id', p_session_id,
      'status', 'queued',
      'phase', case when p_action = 'approve' then 'reporting' else 'planning' end
    )
  );
end;
$$;

revoke execute on function public.record_research_approval_decision(uuid, uuid, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.record_research_approval_decision(uuid, uuid, text, text, jsonb, jsonb, text, text) to service_role;
