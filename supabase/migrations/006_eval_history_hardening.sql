alter table public.eval_results
  add column if not exists expected_pass boolean not null default true,
  add column if not exists observed_pass boolean not null default true,
  add column if not exists regressions jsonb not null default '[]'::jsonb;

update public.eval_results result_row
set
  expected_pass = coalesce((summary_result.value->>'expectedPass')::boolean, result_row.expected_pass),
  observed_pass = coalesce((summary_result.value->>'observedPass')::boolean, result_row.observed_pass),
  regressions = coalesce(summary_result.value->'regressions', result_row.regressions)
from public.eval_runs run
cross join lateral jsonb_array_elements(coalesce(run.summary->'results', '[]'::jsonb)) as summary_result(value)
where run.id = result_row.eval_run_id
  and summary_result.value->>'id' = result_row.fixture_id;

drop policy if exists "Authenticated users can read eval runs" on public.eval_runs;
create policy "Authenticated users can read eval runs"
  on public.eval_runs
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read eval results" on public.eval_results;
create policy "Authenticated users can read eval results"
  on public.eval_results
  for select
  using (auth.role() = 'authenticated');

create index if not exists eval_runs_suite_created_idx on public.eval_runs(suite, created_at desc);
create index if not exists eval_runs_created_idx on public.eval_runs(created_at desc);
create index if not exists eval_results_fixture_idx on public.eval_results(fixture_id);
create index if not exists eval_results_run_fixture_idx on public.eval_results(eval_run_id, fixture_id);

create or replace function public.record_eval_run(
  p_id uuid,
  p_suite text,
  p_status text,
  p_summary jsonb,
  p_results jsonb,
  p_created_at timestamptz
)
returns public.eval_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.eval_runs%rowtype;
begin
  insert into public.eval_runs(id, suite, status, summary, created_at)
  values (p_id, p_suite, p_status, p_summary, p_created_at)
  returning * into inserted;

  insert into public.eval_results(
    id,
    eval_run_id,
    fixture_id,
    passed,
    expected_pass,
    observed_pass,
    scores,
    issues,
    regressions,
    created_at
  )
  select
    (result->>'id')::uuid,
    p_id,
    result->>'fixtureId',
    coalesce((result->>'passed')::boolean, false),
    coalesce((result->>'expectedPass')::boolean, true),
    coalesce((result->>'observedPass')::boolean, false),
    coalesce(result->'scores', '{}'::jsonb),
    coalesce(result->'issues', '[]'::jsonb),
    coalesce(result->'regressions', '[]'::jsonb),
    p_created_at
  from jsonb_array_elements(p_results) as result;

  return inserted;
end;
$$;

revoke all on function public.record_eval_run(uuid, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.record_eval_run(uuid, text, text, jsonb, jsonb, timestamptz) to service_role;
