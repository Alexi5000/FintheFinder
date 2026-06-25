// Committed migration-derived Supabase type surface.
// This is not live-generated; parity is enforced by tests and type checks.
// Regenerate from a real Supabase project only when credentials and a project ref are available.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type DbResearchStatus = 'draft' | 'queued' | 'running' | 'awaiting_approval' | 'approved' | 'rejected' | 'report_ready' | 'failed';
type DbResearchPhase = 'intake' | 'planning' | 'searching' | 'evaluating' | 'extracting' | 'reviewing' | 'reporting' | 'complete' | 'failed';
type DbRunStatus = 'queued' | 'leased' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
type DbSourceCredibility = 'high' | 'medium' | 'low' | 'unknown';
type DbEventType =
  | 'session_created'
  | 'state_transition'
  | 'agent_started'
  | 'agent_completed'
  | 'tool_started'
  | 'tool_completed'
  | 'claim_gap_opened'
  | 'approval_recorded'
  | 'report_ready'
  | 'error'
  | 'post_mortem_created';
type DbEventSeverity = 'debug' | 'info' | 'warn' | 'error';
type DbEventActor = 'system' | 'user' | 'worker' | 'agent' | 'tool';
type DbApprovalAction = 'approve' | 'reject' | 'follow_up';
type DbClaimStatus = 'proposed' | 'supported' | 'contradicted' | 'unsupported' | 'waived';
type DbClaimSeverity = 'low' | 'medium' | 'high' | 'critical';
type DbClaimGapStatus = 'open' | 'closed' | 'waived';
type DbEvalRunStatus = 'passed' | 'failed';
type DbRunCostMeasurementMethod = 'estimated' | 'provider_usage';
type DbResearchMemoryScope = 'user' | 'session';
type DbResearchMemoryNamespace = 'preference' | 'source_cache' | 'procedure' | 'run_summary';

type ResearchSessionsRow = {
  id: string;
  user_id: string;
  query: string;
  title: string;
  status: DbResearchStatus;
  phase: DbResearchPhase;
  created_at: string;
  updated_at: string;
};

type ResearchSourcesRow = {
  id: string;
  session_id: string;
  title: string;
  url: string;
  canonical_url: string;
  domain: string;
  snippet: string;
  content: string;
  published_at: string | null;
  score: number;
  credibility: DbSourceCredibility;
  relevance_reason: string;
};

type SourceEvaluationsRow = {
  id: string;
  session_id: string;
  source_id: string;
  is_relevant: boolean;
  score: number;
  credibility: DbSourceCredibility;
  reason: string;
  risks: Json;
};

type ResearchLearningsRow = {
  id: string;
  session_id: string;
  source_id: string;
  claim: string;
  evidence: string;
  follow_up_questions: Json;
};

type ResearchReportsRow = {
  id: string;
  session_id: string;
  title: string;
  executive_summary: string;
  sections: Json;
  citations: Json;
  markdown: string;
  created_at: string;
};

type ResearchEventsRow = {
  id: string;
  session_id: string;
  run_id: string | null;
  attempt_id: string | null;
  phase: DbResearchPhase;
  event_type: DbEventType | null;
  severity: DbEventSeverity;
  actor: DbEventActor | null;
  step_id: string | null;
  message: string;
  duration_ms: number | null;
  trace_id: string | null;
  correlation_id: string | null;
  metadata: Json;
  created_at: string;
};

type ResearchApprovalsRow = {
  id: string;
  session_id: string;
  user_id: string;
  action: DbApprovalAction;
  notes: string | null;
  approved_source_ids: Json;
  waived_gap_ids: Json;
  created_at: string;
};

type ResearchRunsRow = {
  id: string;
  session_id: string;
  status: DbRunStatus;
  attempt: number;
  current_attempt_id: string | null;
  metadata: Json;
  worker_id: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type ResearchRunAttemptsRow = {
  id: string;
  run_id: string;
  session_id: string;
  attempt: number;
  worker_id: string;
  status: DbRunStatus;
  lease_expires_at: string | null;
  heartbeat_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
};

type ResearchJobLeasesRow = {
  id: string;
  run_id: string;
  worker_id: string;
  lease_expires_at: string;
  heartbeat_at: string;
  created_at: string;
};

type ResearchClaimsRow = {
  id: string;
  session_id: string;
  text: string;
  status: DbClaimStatus;
  severity: DbClaimSeverity;
  source_ids: Json;
  evidence_ids: Json;
  created_at: string;
};

type ClaimEvidenceRow = {
  id: string;
  claim_id: string;
  source_id: string;
  quote: string;
  confidence: number;
  created_at: string;
};

type ClaimGapsRow = {
  id: string;
  session_id: string;
  claim_id: string | null;
  description: string;
  severity: DbClaimSeverity;
  status: DbClaimGapStatus;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
};

type ResearchAuditsRow = {
  id: string;
  session_id: string;
  run_id: string | null;
  audit_type: string;
  ok: boolean;
  issues: Json;
  created_at: string;
};

type EvalRunsRow = {
  id: string;
  suite: string;
  status: DbEvalRunStatus;
  summary: Json;
  created_at: string;
};

type EvalResultsRow = {
  id: string;
  eval_run_id: string;
  fixture_id: string;
  passed: boolean;
  expected_pass: boolean;
  observed_pass: boolean;
  scores: Json;
  issues: Json;
  regressions: Json;
  created_at: string;
};

type ResearchPostMortemsRow = {
  id: string;
  session_id: string;
  run_id: string | null;
  root_cause: string;
  affected_step: string | null;
  action_items: Json;
  created_at: string;
};

type PricingSnapshotsRow = {
  id: string;
  effective_date: string;
  provider: string;
  pricing: Json;
  created_at: string;
};

type ResearchRunCostsRow = {
  id: string;
  run_id: string;
  session_id: string;
  usage: Json;
  model_cost_usd: number;
  search_cost_usd: number;
  total_usd: number;
  pricing_effective_date: string;
  measurement_method: DbRunCostMeasurementMethod;
  created_at: string;
};

type ResearchMemoriesRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  scope: DbResearchMemoryScope;
  namespace: DbResearchMemoryNamespace;
  key: string;
  value: Json;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      research_sessions: TableDefinition<ResearchSessionsRow, Optional<ResearchSessionsRow, 'created_at' | 'updated_at'>, Partial<ResearchSessionsRow>>;
      research_sources: TableDefinition<ResearchSourcesRow, Optional<ResearchSourcesRow, 'snippet' | 'content' | 'published_at' | 'score' | 'credibility' | 'relevance_reason'>, Partial<ResearchSourcesRow>>;
      source_evaluations: TableDefinition<SourceEvaluationsRow, Optional<SourceEvaluationsRow, 'risks'>, Partial<SourceEvaluationsRow>>;
      research_learnings: TableDefinition<ResearchLearningsRow, Optional<ResearchLearningsRow, 'follow_up_questions'>, Partial<ResearchLearningsRow>>;
      research_reports: TableDefinition<ResearchReportsRow, Optional<ResearchReportsRow, 'created_at'>, Partial<ResearchReportsRow>>;
      research_events: TableDefinition<ResearchEventsRow, Optional<ResearchEventsRow, 'run_id' | 'attempt_id' | 'event_type' | 'severity' | 'actor' | 'step_id' | 'duration_ms' | 'trace_id' | 'correlation_id' | 'metadata' | 'created_at'>, Partial<ResearchEventsRow>>;
      research_approvals: TableDefinition<ResearchApprovalsRow, Optional<ResearchApprovalsRow, 'notes' | 'approved_source_ids' | 'waived_gap_ids' | 'created_at'>, Partial<ResearchApprovalsRow>>;
      research_runs: TableDefinition<ResearchRunsRow, Optional<ResearchRunsRow, 'attempt' | 'current_attempt_id' | 'metadata' | 'worker_id' | 'lease_expires_at' | 'started_at' | 'completed_at' | 'error' | 'created_at' | 'updated_at'>, Partial<ResearchRunsRow>>;
      research_run_attempts: TableDefinition<ResearchRunAttemptsRow, Optional<ResearchRunAttemptsRow, 'lease_expires_at' | 'heartbeat_at' | 'started_at' | 'completed_at' | 'error' | 'created_at'>, Partial<ResearchRunAttemptsRow>>;
      research_job_leases: TableDefinition<ResearchJobLeasesRow, Optional<ResearchJobLeasesRow, 'heartbeat_at' | 'created_at'>, Partial<ResearchJobLeasesRow>>;
      research_claims: TableDefinition<ResearchClaimsRow, Optional<ResearchClaimsRow, 'source_ids' | 'evidence_ids' | 'created_at'>, Partial<ResearchClaimsRow>>;
      claim_evidence: TableDefinition<ClaimEvidenceRow, Optional<ClaimEvidenceRow, 'created_at'>, Partial<ClaimEvidenceRow>>;
      claim_gaps: TableDefinition<ClaimGapsRow, Optional<ClaimGapsRow, 'claim_id' | 'resolution' | 'created_at' | 'resolved_at'>, Partial<ClaimGapsRow>>;
      research_audits: TableDefinition<ResearchAuditsRow, Optional<ResearchAuditsRow, 'run_id' | 'issues' | 'created_at'>, Partial<ResearchAuditsRow>>;
      eval_runs: TableDefinition<EvalRunsRow, Optional<EvalRunsRow, 'created_at'>, Partial<EvalRunsRow>>;
      eval_results: TableDefinition<EvalResultsRow, Optional<EvalResultsRow, 'expected_pass' | 'observed_pass' | 'issues' | 'regressions' | 'created_at'>, Partial<EvalResultsRow>>;
      research_post_mortems: TableDefinition<ResearchPostMortemsRow, Optional<ResearchPostMortemsRow, 'run_id' | 'affected_step' | 'action_items' | 'created_at'>, Partial<ResearchPostMortemsRow>>;
      pricing_snapshots: TableDefinition<PricingSnapshotsRow, Optional<PricingSnapshotsRow, 'created_at'>, Partial<PricingSnapshotsRow>>;
      research_run_costs: TableDefinition<ResearchRunCostsRow, Optional<ResearchRunCostsRow, 'usage' | 'model_cost_usd' | 'search_cost_usd' | 'total_usd' | 'measurement_method' | 'created_at'>, Partial<ResearchRunCostsRow>>;
      research_memories: TableDefinition<ResearchMemoriesRow, Optional<ResearchMemoriesRow, 'session_id' | 'value' | 'created_at' | 'updated_at'>, Partial<ResearchMemoriesRow>>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_next_research_run: {
        Args: { p_worker_id: string; p_lease_ms: number };
        Returns: ResearchRunsRow;
      };
      extend_research_run_lease: {
        Args: { p_run_id: string; p_attempt_id: string; p_worker_id: string; p_lease_ms: number };
        Returns: ResearchRunsRow;
      };
      transition_research_run: {
        Args: {
          p_run_id: string;
          p_attempt_id: string;
          p_worker_id: string;
          p_status: DbRunStatus;
          p_error?: string | null;
          p_started_at?: string | null;
          p_completed_at?: string | null;
        };
        Returns: ResearchRunsRow;
      };
      replace_research_artifacts: {
        Args: { p_session_id: string; p_run_id: string; p_attempt_id: string; p_worker_id: string; p_payload: Json };
        Returns: void;
      };
      ensure_research_approval_owner: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      ensure_run_child_session_integrity: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      ensure_claim_evidence_session_integrity: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      ensure_claim_jsonb_graph_integrity: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      ensure_approval_jsonb_graph_integrity: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      ensure_memory_session_owner: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      prevent_research_parent_session_update: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      prevent_research_session_owner_update: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      record_eval_run: {
        Args: { p_id: string; p_suite: string; p_status: DbEvalRunStatus; p_summary: Json; p_results: Json; p_created_at: string };
        Returns: EvalRunsRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DbTableName = keyof Database['public']['Tables'];
export type DbFunctionName = keyof Database['public']['Functions'];
export type DbRow<TableName extends DbTableName> = Database['public']['Tables'][TableName]['Row'];
export type DbInsert<TableName extends DbTableName> = Database['public']['Tables'][TableName]['Insert'];
export type DbUpdate<TableName extends DbTableName> = Database['public']['Tables'][TableName]['Update'];
export type DbFunctionArgs<FunctionName extends DbFunctionName> = Database['public']['Functions'][FunctionName]['Args'];
export type DbFunctionReturns<FunctionName extends DbFunctionName> = Database['public']['Functions'][FunctionName]['Returns'];

export const databaseTableNames = [
  'research_sessions',
  'research_sources',
  'source_evaluations',
  'research_learnings',
  'research_reports',
  'research_events',
  'research_approvals',
  'research_runs',
  'research_run_attempts',
  'research_job_leases',
  'research_claims',
  'claim_evidence',
  'claim_gaps',
  'research_audits',
  'eval_runs',
  'eval_results',
  'research_post_mortems',
  'pricing_snapshots',
  'research_run_costs',
  'research_memories',
] as const satisfies readonly DbTableName[];

export const databaseFunctionNames = [
  'claim_next_research_run',
  'extend_research_run_lease',
  'transition_research_run',
  'replace_research_artifacts',
  'ensure_research_approval_owner',
  'ensure_run_child_session_integrity',
  'ensure_claim_evidence_session_integrity',
  'ensure_claim_jsonb_graph_integrity',
  'ensure_approval_jsonb_graph_integrity',
  'ensure_memory_session_owner',
  'prevent_research_parent_session_update',
  'prevent_research_session_owner_update',
  'record_eval_run',
] as const satisfies readonly DbFunctionName[];
