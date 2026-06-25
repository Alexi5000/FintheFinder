create or replace function public.replace_research_artifacts(
  p_session_id uuid,
  p_run_id uuid,
  p_attempt_id uuid,
  p_worker_id text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_key text;
begin
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'artifact replacement payload must be a JSON object' using errcode = '22023';
  end if;

  foreach payload_key in array array['sources', 'evaluations', 'learnings', 'claims', 'claim_evidence', 'claim_gaps', 'audits'] loop
    if p_payload ? payload_key and jsonb_typeof(p_payload -> payload_key) <> 'array' then
      raise exception 'artifact replacement payload % must be a JSON array', payload_key using errcode = '22023';
    end if;
  end loop;

  if p_payload ? 'report' and jsonb_typeof(p_payload -> 'report') not in ('object', 'null') then
    raise exception 'artifact replacement payload report must be a JSON object or null' using errcode = '22023';
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
    and a.worker_id = p_worker_id
    and a.status in ('leased','running')
    and a.lease_expires_at > now()
  for update of r, a;

  if not found then
    raise exception 'worker attempt does not own research artifact replacement' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload -> 'audits', '[]'::jsonb)) as audit(run_id uuid)
    where audit.run_id is not null
      and audit.run_id <> p_run_id
  ) then
    raise exception 'artifact replacement audits must reference the fenced run' using errcode = '23514';
  end if;

  delete from public.research_audits where session_id = p_session_id;
  delete from public.claim_gaps where session_id = p_session_id;
  delete from public.claim_evidence e
    using public.research_claims c
    where e.claim_id = c.id
      and c.session_id = p_session_id;
  delete from public.research_claims where session_id = p_session_id;
  delete from public.source_evaluations where session_id = p_session_id;
  delete from public.research_learnings where session_id = p_session_id;
  delete from public.research_sources where session_id = p_session_id;
  delete from public.research_reports where session_id = p_session_id;

  insert into public.research_sources (
    id,
    session_id,
    title,
    url,
    canonical_url,
    domain,
    snippet,
    content,
    published_at,
    score,
    credibility,
    relevance_reason
  )
  select
    source.id,
    p_session_id,
    source.title,
    source.url,
    source.canonical_url,
    source.domain,
    coalesce(source.snippet, ''),
    coalesce(source.content, ''),
    source.published_at,
    coalesce(source.score, 0),
    coalesce(source.credibility, 'unknown'),
    coalesce(source.relevance_reason, '')
  from jsonb_to_recordset(coalesce(p_payload -> 'sources', '[]'::jsonb)) as source(
    id text,
    title text,
    url text,
    canonical_url text,
    domain text,
    snippet text,
    content text,
    published_at text,
    score numeric,
    credibility text,
    relevance_reason text
  );

  insert into public.source_evaluations (
    id,
    session_id,
    source_id,
    is_relevant,
    score,
    credibility,
    reason,
    risks
  )
  select
    evaluation.id,
    p_session_id,
    evaluation.source_id,
    evaluation.is_relevant,
    evaluation.score,
    evaluation.credibility,
    evaluation.reason,
    coalesce(evaluation.risks, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_payload -> 'evaluations', '[]'::jsonb)) as evaluation(
    id uuid,
    source_id text,
    is_relevant boolean,
    score numeric,
    credibility text,
    reason text,
    risks jsonb
  );

  insert into public.research_learnings (
    id,
    session_id,
    source_id,
    claim,
    evidence,
    follow_up_questions
  )
  select
    learning.id,
    p_session_id,
    learning.source_id,
    learning.claim,
    learning.evidence,
    coalesce(learning.follow_up_questions, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_payload -> 'learnings', '[]'::jsonb)) as learning(
    id text,
    source_id text,
    claim text,
    evidence text,
    follow_up_questions jsonb
  );

  insert into public.research_claims (
    id,
    session_id,
    text,
    status,
    severity,
    source_ids,
    evidence_ids,
    created_at
  )
  select
    claim.id,
    p_session_id,
    claim.text,
    claim.status,
    claim.severity,
    coalesce(claim.source_ids, '[]'::jsonb),
    '[]'::jsonb,
    claim.created_at
  from jsonb_to_recordset(coalesce(p_payload -> 'claims', '[]'::jsonb)) as claim(
    id text,
    text text,
    status text,
    severity text,
    source_ids jsonb,
    evidence_ids jsonb,
    created_at timestamptz
  );

  insert into public.claim_evidence (
    id,
    claim_id,
    source_id,
    quote,
    confidence,
    created_at
  )
  select
    evidence.id,
    evidence.claim_id,
    evidence.source_id,
    evidence.quote,
    evidence.confidence,
    evidence.created_at
  from jsonb_to_recordset(coalesce(p_payload -> 'claim_evidence', '[]'::jsonb)) as evidence(
    id text,
    claim_id text,
    source_id text,
    quote text,
    confidence numeric,
    created_at timestamptz
  );

  update public.research_claims c
  set evidence_ids = coalesce(claim.evidence_ids, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_payload -> 'claims', '[]'::jsonb)) as claim(
    id text,
    text text,
    status text,
    severity text,
    source_ids jsonb,
    evidence_ids jsonb,
    created_at timestamptz
  )
  where c.id = claim.id
    and c.session_id = p_session_id;

  insert into public.claim_gaps (
    id,
    session_id,
    claim_id,
    description,
    severity,
    status,
    resolution,
    created_at,
    resolved_at
  )
  select
    gap.id,
    p_session_id,
    gap.claim_id,
    gap.description,
    gap.severity,
    gap.status,
    gap.resolution,
    gap.created_at,
    gap.resolved_at
  from jsonb_to_recordset(coalesce(p_payload -> 'claim_gaps', '[]'::jsonb)) as gap(
    id text,
    claim_id text,
    description text,
    severity text,
    status text,
    resolution text,
    created_at timestamptz,
    resolved_at timestamptz
  );

  insert into public.research_audits (
    id,
    session_id,
    run_id,
    audit_type,
    ok,
    issues,
    created_at
  )
  select
    audit.id,
    p_session_id,
    audit.run_id,
    audit.audit_type,
    audit.ok,
    coalesce(audit.issues, '[]'::jsonb),
    audit.created_at
  from jsonb_to_recordset(coalesce(p_payload -> 'audits', '[]'::jsonb)) as audit(
    id uuid,
    run_id uuid,
    audit_type text,
    ok boolean,
    issues jsonb,
    created_at timestamptz
  );

  if p_payload ? 'report' and jsonb_typeof(p_payload -> 'report') = 'object' then
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
      report.id,
      p_session_id,
      report.title,
      report.executive_summary,
      coalesce(report.sections, '[]'::jsonb),
      coalesce(report.citations, '[]'::jsonb),
      report.markdown,
      report.created_at
    from jsonb_to_record(p_payload -> 'report') as report(
      id uuid,
      title text,
      executive_summary text,
      sections jsonb,
      citations jsonb,
      markdown text,
      created_at timestamptz
    );
  end if;
end;
$$;

revoke execute on function public.replace_research_artifacts(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_research_artifacts(uuid, uuid, uuid, text, jsonb) to service_role;
