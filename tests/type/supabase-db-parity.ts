import type {
  ApprovalRequest,
  ClaimGap,
  ClaimSeverity,
  ClaimStatus,
  EvalRunStatus,
  ResearchMemory,
  ResearchPhase,
  ResearchRun,
  ResearchRunEvent,
  ResearchSession,
  ResearchSource,
  RunCost,
  RunStatus,
  SourceEvaluation,
} from '@/lib/schemas';
import type { Database, DbFunctionArgs, DbFunctionReturns, DbInsert, DbRow, Json } from '@/lib/supabase/database.types';

type Equal<Actual, Expected> = (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
  ? true
  : false;
type Extends<Actual, Expected> = Actual extends Expected ? true : false;
type Assert<Condition extends true> = Condition;

type ExpectedTables =
  | 'research_sessions'
  | 'research_sources'
  | 'source_evaluations'
  | 'research_learnings'
  | 'research_reports'
  | 'research_events'
  | 'research_approvals'
  | 'research_runs'
  | 'research_run_attempts'
  | 'research_job_leases'
  | 'research_claims'
  | 'claim_evidence'
  | 'claim_gaps'
  | 'research_audits'
  | 'eval_runs'
  | 'eval_results'
  | 'research_post_mortems'
  | 'pricing_snapshots'
  | 'research_run_costs'
  | 'research_memories';

type ExpectedFunctions =
  | 'claim_next_research_run'
  | 'extend_research_run_lease'
  | 'transition_research_run'
  | 'replace_research_artifacts'
  | 'record_research_approval_decision'
  | 'publish_research_report_for_attempt'
  | 'ensure_research_approval_owner'
  | 'ensure_run_child_session_integrity'
  | 'ensure_claim_evidence_session_integrity'
  | 'ensure_claim_jsonb_graph_integrity'
  | 'ensure_approval_jsonb_graph_integrity'
  | 'ensure_memory_session_owner'
  | 'prevent_research_parent_session_update'
  | 'prevent_research_session_owner_update'
  | 'record_eval_run';

export type SupabaseDbParityAssertions = [
  Assert<Equal<keyof Database['public']['Tables'], ExpectedTables>>,
  Assert<Equal<keyof Database['public']['Functions'], ExpectedFunctions>>,
  Assert<Equal<DbRow<'research_sessions'>['status'], ResearchSession['status']>>,
  Assert<Equal<DbRow<'research_sessions'>['phase'], ResearchPhase>>,
  Assert<Equal<DbRow<'research_runs'>['status'], RunStatus>>,
  Assert<Extends<DbRow<'research_runs'>['current_attempt_id'], ResearchRun['currentAttemptId']>>,
  Assert<Equal<DbRow<'research_sources'>['credibility'], ResearchSource['credibility']>>,
  Assert<Equal<DbRow<'source_evaluations'>['credibility'], SourceEvaluation['credibility']>>,
  Assert<Equal<Exclude<DbRow<'research_events'>['event_type'], null>, NonNullable<ResearchRunEvent['eventType']>>>,
  Assert<Equal<DbRow<'research_events'>['severity'], NonNullable<ResearchRunEvent['severity']>>>,
  Assert<Equal<Exclude<DbRow<'research_events'>['actor'], null>, NonNullable<ResearchRunEvent['actor']>>>,
  Assert<Equal<DbRow<'research_approvals'>['action'], ApprovalRequest['action']>>,
  Assert<Equal<DbRow<'research_claims'>['status'], ClaimStatus>>,
  Assert<Equal<DbRow<'research_claims'>['severity'], ClaimSeverity>>,
  Assert<Equal<DbRow<'claim_gaps'>['severity'], ClaimSeverity>>,
  Assert<Equal<DbRow<'claim_gaps'>['status'], ClaimGap['status']>>,
  Assert<Equal<DbRow<'eval_runs'>['status'], EvalRunStatus>>,
  Assert<Equal<DbRow<'research_run_costs'>['measurement_method'], RunCost['measurementMethod']>>,
  Assert<Equal<DbRow<'research_memories'>['scope'], ResearchMemory['scope']>>,
  Assert<Equal<DbRow<'research_memories'>['namespace'], ResearchMemory['namespace']>>,
  Assert<Equal<DbFunctionArgs<'claim_next_research_run'>, { p_worker_id: string; p_lease_ms: number }>>,
  Assert<Equal<DbFunctionArgs<'extend_research_run_lease'>, { p_run_id: string; p_attempt_id: string; p_worker_id: string; p_lease_ms: number }>>,
  Assert<
    Equal<
      keyof DbFunctionArgs<'transition_research_run'>,
      'p_run_id' | 'p_attempt_id' | 'p_worker_id' | 'p_status' | 'p_error' | 'p_started_at' | 'p_completed_at'
    >
  >,
  Assert<Equal<DbFunctionArgs<'transition_research_run'>['p_status'], RunStatus>>,
  Assert<
    Equal<
      keyof DbFunctionArgs<'replace_research_artifacts'>,
      'p_session_id' | 'p_run_id' | 'p_attempt_id' | 'p_worker_id' | 'p_payload'
    >
  >,
  Assert<
    Equal<
      keyof DbFunctionArgs<'record_research_approval_decision'>,
      | 'p_session_id'
      | 'p_user_id'
      | 'p_action'
      | 'p_notes'
      | 'p_approved_source_ids'
      | 'p_waived_gap_ids'
      | 'p_trace_id'
      | 'p_correlation_id'
    >
  >,
  Assert<Equal<DbFunctionArgs<'record_research_approval_decision'>['p_action'], ApprovalRequest['action']>>,
  Assert<
    Equal<
      keyof DbFunctionArgs<'publish_research_report_for_attempt'>,
      | 'p_session_id'
      | 'p_run_id'
      | 'p_attempt_id'
      | 'p_worker_id'
      | 'p_report'
      | 'p_final_audit'
      | 'p_trace_id'
      | 'p_correlation_id'
    >
  >,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_session_id'], string>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_run_id'], string>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_attempt_id'], string>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_worker_id'], string>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_report'], Json>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_final_audit'], Json>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_trace_id'], string | null | undefined>>,
  Assert<Equal<DbFunctionArgs<'publish_research_report_for_attempt'>['p_correlation_id'], string | null | undefined>>,
  Assert<Equal<DbFunctionReturns<'claim_next_research_run'>, DbRow<'research_runs'>>>,
  Assert<Equal<DbFunctionReturns<'extend_research_run_lease'>, DbRow<'research_runs'>>>,
  Assert<Equal<DbFunctionReturns<'transition_research_run'>, DbRow<'research_runs'>>>,
  Assert<Equal<DbFunctionReturns<'replace_research_artifacts'>, void>>,
  Assert<Equal<DbFunctionReturns<'publish_research_report_for_attempt'>, Json>>,
  Assert<Equal<DbFunctionReturns<'record_eval_run'>, DbRow<'eval_runs'>>>,
  Assert<
    Equal<
      keyof DbFunctionArgs<'record_eval_run'>,
      'p_id' | 'p_suite' | 'p_status' | 'p_summary' | 'p_results' | 'p_created_at'
    >
  >,
  Assert<Equal<DbFunctionArgs<'record_eval_run'>['p_status'], EvalRunStatus>>,
  Assert<Extends<DbInsert<'eval_results'>[], DbFunctionArgs<'record_eval_run'>['p_results']>>,
];

export const createSessionInsert = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  query: 'What changed in AI safety policy?',
  title: 'AI safety policy',
  status: 'draft',
  phase: 'intake',
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
} satisfies DbInsert<'research_sessions'>;

export const runInsert = {
  id: '00000000-0000-0000-0000-000000000003',
  session_id: createSessionInsert.id,
  status: 'queued',
  attempt: 1,
  current_attempt_id: null,
  metadata: { stage: 'research' },
  created_at: createSessionInsert.created_at,
  updated_at: createSessionInsert.updated_at,
} satisfies DbInsert<'research_runs'>;

export const eventInsert = {
  id: '00000000-0000-0000-0000-000000000004',
  session_id: createSessionInsert.id,
  run_id: runInsert.id,
  attempt_id: null,
  phase: 'searching',
  event_type: 'tool_completed',
  severity: 'info',
  actor: 'tool',
  step_id: 'web_search',
  message: 'Search completed.',
  duration_ms: 123,
  trace_id: 'trace-1',
  correlation_id: 'corr-1',
  metadata: { sourceCount: 3 },
  created_at: createSessionInsert.created_at,
} satisfies DbInsert<'research_events'>;

export const claimInsert = {
  id: 'claim_1',
  session_id: createSessionInsert.id,
  text: 'The cited source supports the claim.',
  status: 'supported',
  severity: 'medium',
  source_ids: ['source_1'],
  evidence_ids: ['evidence_1'],
  created_at: createSessionInsert.created_at,
} satisfies DbInsert<'research_claims'>;

export const evidenceInsert = {
  id: 'evidence_1',
  claim_id: claimInsert.id,
  source_id: 'source_1',
  quote: 'A short source quote.',
  confidence: 0.9,
  created_at: createSessionInsert.created_at,
} satisfies DbInsert<'claim_evidence'>;

export const approvalInsert = {
  id: '00000000-0000-0000-0000-000000000005',
  session_id: createSessionInsert.id,
  user_id: createSessionInsert.user_id,
  action: 'approve',
  notes: null,
  approved_source_ids: ['source_1'],
  waived_gap_ids: [],
  created_at: createSessionInsert.created_at,
} satisfies DbInsert<'research_approvals'>;

export const costInsert = {
  id: '00000000-0000-0000-0000-000000000006',
  run_id: runInsert.id,
  session_id: createSessionInsert.id,
  usage: { modelCalls: [{ model: 'gpt-5.5', inputTokens: 100, outputTokens: 50 }], exaSearches: 2 },
  model_cost_usd: 0.05,
  search_cost_usd: 0.01,
  total_usd: 0.06,
  pricing_effective_date: '2026-06-24',
  measurement_method: 'estimated',
  created_at: createSessionInsert.created_at,
} satisfies DbInsert<'research_run_costs'>;

export const memoryInsert = {
  id: '00000000-0000-0000-0000-000000000007',
  user_id: createSessionInsert.user_id,
  session_id: createSessionInsert.id,
  scope: 'session',
  namespace: 'run_summary',
  key: `run:${runInsert.id}`,
  value: { summary: 'Completed with one supported claim.' },
  created_at: createSessionInsert.created_at,
  updated_at: createSessionInsert.updated_at,
} satisfies DbInsert<'research_memories'>;
