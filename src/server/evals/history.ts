import {
  evalResultSchema,
  evalRunSchema,
  evalRunWithResultsSchema,
  evalScoresSchema,
  evalSuiteSummarySchema,
  type EvalResult,
  type EvalRun,
  type EvalRunWithResults,
  type EvalSuiteSummary,
} from '@/lib/schemas';
import { nowIso } from '@/lib/utils';
import { createSupabaseAdmin } from '@/server/supabase/server';

const EVAL_RUN_PUBLIC_COLUMNS = 'id,suite,status,summary,created_at';
const EVAL_RESULT_PUBLIC_COLUMNS = 'id,eval_run_id,fixture_id,passed,expected_pass,observed_pass,scores,issues,regressions,created_at';

function requireRows<T>(rows: T[] | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  return rows ?? [];
}

function requireRow<T>(row: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Record not found.');
  return row;
}

export async function saveEvalRun(suite: string, summary: EvalSuiteSummary): Promise<EvalRunWithResults> {
  const parsedSummary = evalSuiteSummarySchema.parse(summary);
  const supabase = createSupabaseAdmin();
  const now = nowIso();
  const runId = crypto.randomUUID();
  const results = parsedSummary.results.map((result) =>
    evalResultSchema.parse({
      id: crypto.randomUUID(),
      evalRunId: runId,
      fixtureId: result.id,
      passed: result.passed,
      expectedPass: result.expectedPass,
      observedPass: result.observedPass,
      scores: result.scores,
      issues: result.issues,
      regressions: result.regressions,
      createdAt: now,
    }),
  );

  const { data, error } = await supabase
    .rpc('record_eval_run', {
      p_id: runId,
      p_suite: suite,
      p_status: parsedSummary.passed ? 'passed' : 'failed',
      p_summary: parsedSummary,
      p_results: results,
      p_created_at: now,
    })
    .single();

  return evalRunWithResultsSchema.parse({ ...mapEvalRunRow(requireRow(data, error)), results });
}

export async function listEvalRuns(limit = 20, suite?: string): Promise<EvalRun[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase.from('eval_runs').select(EVAL_RUN_PUBLIC_COLUMNS);
  if (suite) query = query.eq('suite', suite);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  return requireRows(data, error).map(mapEvalRunRow);
}

export async function getEvalRunWithResults(evalRunId: string): Promise<EvalRunWithResults> {
  const supabase = createSupabaseAdmin();
  const [{ data: runData, error: runError }, { data: resultsData, error: resultsError }] = await Promise.all([
    supabase.from('eval_runs').select(EVAL_RUN_PUBLIC_COLUMNS).eq('id', evalRunId).single(),
    supabase.from('eval_results').select(EVAL_RESULT_PUBLIC_COLUMNS).eq('eval_run_id', evalRunId).order('fixture_id', { ascending: true }),
  ]);
  return evalRunWithResultsSchema.parse({
    ...mapEvalRunRow(requireRow(runData, runError)),
    results: requireRows(resultsData, resultsError).map(mapEvalResultRow),
  });
}

export async function getLatestEvalRun(suite = 'offline'): Promise<EvalRunWithResults | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('eval_runs')
    .select('id')
    .eq('suite', suite)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? getEvalRunWithResults(String((data as Record<string, unknown>).id)) : null;
}

function mapEvalRunRow(row: Record<string, unknown>): EvalRun {
  return evalRunSchema.parse({
    id: String(row.id),
    suite: String(row.suite),
    status: String(row.status),
    summary: sanitizeEvalSuiteSummary(evalSuiteSummarySchema.parse(row.summary)),
    createdAt: String(row.created_at),
  });
}

function mapEvalResultRow(row: Record<string, unknown>): EvalResult {
  const passed = readBoolean(row, 'passed');
  return evalResultSchema.parse({
    id: String(row.id),
    evalRunId: String(row.eval_run_id),
    fixtureId: String(row.fixture_id),
    passed,
    expectedPass: readOptionalBoolean(row, 'expected_pass', true),
    observedPass: readOptionalBoolean(row, 'observed_pass', passed),
    scores: evalScoresSchema.parse(row.scores),
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
    regressions: Array.isArray(row.regressions) ? row.regressions.map(String) : [],
    createdAt: String(row.created_at),
  });
}

function readBoolean(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'boolean') throw new Error(`Expected boolean column ${key}.`);
  return value;
}

function readOptionalBoolean(row: Record<string, unknown>, key: string, fallback: boolean) {
  if (row[key] === undefined || row[key] === null) return fallback;
  return readBoolean(row, key);
}

function sanitizeEvalSuiteSummary(summary: EvalSuiteSummary): EvalSuiteSummary {
  return evalSuiteSummarySchema.parse({
    passed: summary.passed,
    total: summary.total,
    failed: summary.failed,
    results: summary.results.map((result) => ({
      id: result.id,
      passed: result.passed,
      expectedPass: result.expectedPass,
      observedPass: result.observedPass,
      scores: result.scores,
      issues: result.issues,
      regressions: result.regressions,
    })),
  });
}
