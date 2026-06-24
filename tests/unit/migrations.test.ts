import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvalActionSchema,
  claimGapSchema,
  claimSeveritySchema,
  claimStatusSchema,
  eventActorSchema,
  eventSeveritySchema,
  evalRunStatusSchema,
  researchMemoryNamespaceSchema,
  researchMemoryScopeSchema,
  researchEventTypeSchema,
  researchPhaseSchema,
  researchStatusSchema,
  runCostSchema,
  runStatusSchema,
  sourceSchema,
} from '@/lib/schemas';

const migrations = [
  '001_initial_research_product.sql',
  '002_fde_production_surfaces.sql',
  '003_memory_and_run_costs.sql',
  '004_queue_lease_hardening.sql',
  '005_approval_ownership_hardening.sql',
  '006_eval_history_hardening.sql',
  '007_event_contract_hardening.sql',
  '008_approval_api_write_hardening.sql',
];

function readMigration(name: string) {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
}

function readAllMigrations() {
  return migrations.map(readMigration).join('\n');
}

describe('database migrations', () => {
  it('hardens approval writes against cross-session pollution', () => {
    const migration = readMigration('005_approval_ownership_hardening.sql');
    const apiWriteHardeningMigration = readMigration('008_approval_api_write_hardening.sql');

    expect(migration).toContain('ensure_research_approval_owner');
    expect(migration).toContain('drop policy if exists "Users can manage own approvals"');
    expect(migration).toContain('s.id = public.research_approvals.session_id');
    expect(migration).toContain('s.user_id = auth.uid()');
    expect(migration).toContain('s.user_id = new.user_id');
    expect(apiWriteHardeningMigration).toContain('drop policy if exists "Users can insert own session approvals"');
    expect(apiWriteHardeningMigration).toContain('drop policy if exists "Users can update own session approvals"');
    expect(apiWriteHardeningMigration).toContain('drop policy if exists "Users can delete own session approvals"');
    expect(apiWriteHardeningMigration).toContain('Approval mutations must go through the hosted API');
  });

  it('creates and hardens persisted eval history tables', () => {
    const baseMigration = readMigration('002_fde_production_surfaces.sql');
    const hardeningMigration = readMigration('006_eval_history_hardening.sql');

    expect(baseMigration).toContain('create table if not exists public.eval_runs');
    expect(baseMigration).toContain('create table if not exists public.eval_results');
    expect(baseMigration).toContain('alter table public.eval_runs enable row level security');
    expect(baseMigration).toContain('alter table public.eval_results enable row level security');

    expect(hardeningMigration).toContain('add column if not exists expected_pass');
    expect(hardeningMigration).toContain('add column if not exists observed_pass');
    expect(hardeningMigration).toContain('add column if not exists regressions');
    expect(hardeningMigration).toContain('jsonb_array_elements(coalesce(run.summary->');
    expect(hardeningMigration).toContain("result->>'fixtureId'");
    expect(hardeningMigration).toContain("result->>'expectedPass'");
    expect(hardeningMigration).toContain("result->>'observedPass'");
    expect(hardeningMigration).toContain("result->'regressions'");
    expect(hardeningMigration).toContain('for select');
    expect(hardeningMigration).toContain("auth.role() = 'authenticated'");
    expect(hardeningMigration).not.toMatch(/for\s+(insert|update|delete)/i);
    expect(hardeningMigration).toContain('eval_runs_suite_created_idx');
    expect(hardeningMigration).toContain('eval_runs_created_idx');
    expect(hardeningMigration).toContain('eval_results_fixture_idx');
    expect(hardeningMigration).toContain('eval_results_run_fixture_idx');
    expect(hardeningMigration).toContain('create or replace function public.record_eval_run');
    expect(hardeningMigration).toContain('grant execute on function public.record_eval_run');
    expect(hardeningMigration).toContain('to service_role');
  });

  it('keeps production Supabase table columns aligned with repository contracts', () => {
    const sql = readAllMigrations();
    const expectedColumns: Record<string, Record<string, string>> = {
      research_sessions: {
        id: 'uuid',
        user_id: 'uuid',
        query: 'text',
        title: 'text',
        status: 'text',
        phase: 'text',
        created_at: 'timestamptz',
        updated_at: 'timestamptz',
      },
      research_sources: {
        id: 'text',
        session_id: 'uuid',
        title: 'text',
        url: 'text',
        canonical_url: 'text',
        domain: 'text',
        snippet: 'text',
        content: 'text',
        published_at: 'text',
        score: 'numeric',
        credibility: 'text',
        relevance_reason: 'text',
      },
      source_evaluations: {
        id: 'uuid',
        session_id: 'uuid',
        source_id: 'text',
        is_relevant: 'boolean',
        score: 'numeric',
        credibility: 'text',
        reason: 'text',
        risks: 'jsonb',
      },
      research_learnings: {
        id: 'text',
        session_id: 'uuid',
        source_id: 'text',
        claim: 'text',
        evidence: 'text',
        follow_up_questions: 'jsonb',
      },
      research_reports: {
        id: 'uuid',
        session_id: 'uuid',
        title: 'text',
        executive_summary: 'text',
        sections: 'jsonb',
        citations: 'jsonb',
        markdown: 'text',
        created_at: 'timestamptz',
      },
      research_events: {
        id: 'uuid',
        session_id: 'uuid',
        run_id: 'uuid',
        attempt_id: 'uuid',
        phase: 'text',
        event_type: 'text',
        severity: 'text',
        actor: 'text',
        step_id: 'text',
        message: 'text',
        duration_ms: 'integer',
        trace_id: 'text',
        correlation_id: 'text',
        metadata: 'jsonb',
        created_at: 'timestamptz',
      },
      research_approvals: {
        id: 'uuid',
        session_id: 'uuid',
        user_id: 'uuid',
        action: 'text',
        notes: 'text',
        approved_source_ids: 'jsonb',
        waived_gap_ids: 'jsonb',
        created_at: 'timestamptz',
      },
      research_runs: {
        id: 'uuid',
        session_id: 'uuid',
        status: 'text',
        attempt: 'integer',
        metadata: 'jsonb',
        worker_id: 'text',
        lease_expires_at: 'timestamptz',
        started_at: 'timestamptz',
        completed_at: 'timestamptz',
        error: 'text',
        created_at: 'timestamptz',
        updated_at: 'timestamptz',
      },
      research_job_leases: {
        id: 'uuid',
        run_id: 'uuid',
        worker_id: 'text',
        lease_expires_at: 'timestamptz',
        heartbeat_at: 'timestamptz',
        created_at: 'timestamptz',
      },
      research_claims: {
        id: 'text',
        session_id: 'uuid',
        text: 'text',
        status: 'text',
        severity: 'text',
        source_ids: 'jsonb',
        evidence_ids: 'jsonb',
        created_at: 'timestamptz',
      },
      claim_evidence: {
        id: 'text',
        claim_id: 'text',
        source_id: 'text',
        quote: 'text',
        confidence: 'numeric',
        created_at: 'timestamptz',
      },
      claim_gaps: {
        id: 'text',
        session_id: 'uuid',
        claim_id: 'text',
        description: 'text',
        severity: 'text',
        status: 'text',
        resolution: 'text',
        created_at: 'timestamptz',
        resolved_at: 'timestamptz',
      },
      research_audits: {
        id: 'uuid',
        session_id: 'uuid',
        run_id: 'uuid',
        audit_type: 'text',
        ok: 'boolean',
        issues: 'jsonb',
        created_at: 'timestamptz',
      },
      eval_runs: {
        id: 'uuid',
        suite: 'text',
        status: 'text',
        summary: 'jsonb',
        created_at: 'timestamptz',
      },
      eval_results: {
        id: 'uuid',
        eval_run_id: 'uuid',
        fixture_id: 'text',
        passed: 'boolean',
        expected_pass: 'boolean',
        observed_pass: 'boolean',
        scores: 'jsonb',
        issues: 'jsonb',
        regressions: 'jsonb',
        created_at: 'timestamptz',
      },
      research_post_mortems: {
        id: 'uuid',
        session_id: 'uuid',
        run_id: 'uuid',
        root_cause: 'text',
        affected_step: 'text',
        action_items: 'jsonb',
        created_at: 'timestamptz',
      },
      pricing_snapshots: {
        id: 'uuid',
        effective_date: 'date',
        provider: 'text',
        pricing: 'jsonb',
        created_at: 'timestamptz',
      },
      research_run_costs: {
        id: 'uuid',
        run_id: 'uuid',
        session_id: 'uuid',
        usage: 'jsonb',
        model_cost_usd: 'numeric',
        search_cost_usd: 'numeric',
        total_usd: 'numeric',
        pricing_effective_date: 'date',
        measurement_method: 'text',
        created_at: 'timestamptz',
      },
      research_memories: {
        id: 'uuid',
        user_id: 'uuid',
        session_id: 'uuid',
        scope: 'text',
        namespace: 'text',
        key: 'text',
        value: 'jsonb',
        created_at: 'timestamptz',
        updated_at: 'timestamptz',
      },
    };

    for (const [table, columns] of Object.entries(expectedColumns)) {
      expect(sql, `${table} table is missing`).toContain(`create table if not exists public.${table}`);
      for (const [column, type] of Object.entries(columns)) {
        expect(sql, `${table}.${column} should be declared as ${type}`).toMatch(columnDeclarationRegex(table, column, type));
      }
    }
  });

  it('keeps SQL check constraints aligned with exported Zod enums', () => {
    const sql = readAllMigrations();
    const enumChecks: Array<{ table: string; column: string; values: string[] }> = [
      { table: 'research_sessions', column: 'status', values: enumValues(researchStatusSchema) },
      { table: 'research_sessions', column: 'phase', values: enumValues(researchPhaseSchema) },
      { table: 'research_sources', column: 'credibility', values: enumValues(objectField(sourceSchema, 'credibility')) },
      { table: 'source_evaluations', column: 'credibility', values: enumValues(objectField(sourceSchema, 'credibility')) },
      { table: 'research_events', column: 'phase', values: enumValues(researchPhaseSchema) },
      { table: 'research_events', column: 'event_type', values: enumValues(researchEventTypeSchema) },
      { table: 'research_events', column: 'severity', values: enumValues(eventSeveritySchema) },
      { table: 'research_events', column: 'actor', values: enumValues(eventActorSchema) },
      { table: 'research_approvals', column: 'action', values: enumValues(approvalActionSchema) },
      { table: 'research_runs', column: 'status', values: enumValues(runStatusSchema) },
      { table: 'research_claims', column: 'status', values: enumValues(claimStatusSchema) },
      { table: 'research_claims', column: 'severity', values: enumValues(claimSeveritySchema) },
      { table: 'claim_gaps', column: 'severity', values: enumValues(claimSeveritySchema) },
      { table: 'claim_gaps', column: 'status', values: enumValues(objectField(claimGapSchema, 'status')) },
      { table: 'eval_runs', column: 'status', values: enumValues(evalRunStatusSchema) },
      { table: 'research_run_costs', column: 'measurement_method', values: enumValues(objectField(runCostSchema, 'measurementMethod')) },
      { table: 'research_memories', column: 'scope', values: enumValues(researchMemoryScopeSchema) },
      { table: 'research_memories', column: 'namespace', values: enumValues(researchMemoryNamespaceSchema) },
    ];

    for (const check of enumChecks) {
      expect(sqlCheckValues(sql, check.table, check.column), `${check.table}.${check.column}`).toEqual(check.values);
    }
  });

  it('enables RLS on every production table and keeps privileged RPCs service-role only', () => {
    const sql = readAllMigrations();
    const initialQueueMigration = readMigration('002_fde_production_surfaces.sql');
    const rlsTables = [
      'research_sessions',
      'research_sources',
      'source_evaluations',
      'research_learnings',
      'research_reports',
      'research_events',
      'research_approvals',
      'research_runs',
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
    ];

    for (const table of rlsTables) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'));
    }

    expect(sql).toContain('create unique index if not exists research_runs_one_active_per_session_idx');
    expect(sql).toContain("where status in ('queued','leased','running')");
    expect(sql).toContain('create unique index if not exists research_job_leases_run_unique_idx');
    expect(initialQueueMigration).toContain('security definer');
    expect(initialQueueMigration).toContain('revoke execute on function public.claim_next_research_run(text, integer) from public, anon, authenticated');
    expect(initialQueueMigration).toContain('grant execute on function public.claim_next_research_run(text, integer) to service_role');

    for (const signature of [
      'public.claim_next_research_run(text, integer)',
      'public.extend_research_run_lease(uuid, text, integer)',
      'public.record_eval_run(uuid, text, text, jsonb, jsonb, timestamptz)',
    ]) {
      expect(sql).toMatch(new RegExp(`revoke (all|execute) on function ${escapeRegex(signature)} from public, anon, authenticated`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function ${escapeRegex(signature)} to service_role`, 'i'));
    }

    expect(sql).toMatch(/create policy "Users can read own runs"[\s\S]*on public\.research_runs[\s\S]*s\.user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/create policy "Users can read own research memories"[\s\S]*on public\.research_memories[\s\S]*user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/create policy "Authenticated users can read eval runs"[\s\S]*for select[\s\S]*auth\.role\(\) = 'authenticated'/i);
    expect(sql).not.toMatch(/on public\.eval_runs[\s\S]{0,160}for\s+(insert|update|delete)/i);
    expect(sql).not.toMatch(/on public\.eval_results[\s\S]{0,160}for\s+(insert|update|delete)/i);
  });
});

function columnDeclarationRegex(table: string, column: string, type: string) {
  return new RegExp(
    [
      `create table if not exists public\\.${table}[\\s\\S]*?\\b${column}\\s+${type}\\b`,
      `alter table public\\.${table}[\\s\\S]*?add column if not exists ${column}\\s+${type}\\b`,
    ].join('|'),
    'i',
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sqlCheckValues(sql: string, table: string, column: string) {
  const tableSql = tableStatement(sql, table);
  const inlineMatch = tableSql.match(new RegExp(`\\b${column}\\s+text[^\\n,]*check \\(${column} in \\(([^)]*)\\)\\)`, 'i'));
  const alterMatch = alterStatements(sql, table)
    .map((statement) => statement.match(new RegExp(`check \\(\\s*(?:${column}\\s+is null\\s+or\\s+)?${column}\\s+in \\(([^)]*)\\)`, 'i')))
    .find(Boolean);
  const match = inlineMatch ?? alterMatch;
  if (!match) throw new Error(`Missing check constraint for ${table}.${column}.`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, value]) => value);
}

function tableStatement(sql: string, table: string) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (!match) throw new Error(`Missing create table statement for ${table}.`);
  return match[1];
}

function alterStatements(sql: string, table: string) {
  return [...sql.matchAll(new RegExp(`alter table public\\.${table}[\\s\\S]*?;`, 'gi'))].map(([statement]) => statement);
}

type MaybeEnumSchema = {
  options?: readonly string[];
  unwrap?: () => unknown;
  _def?: { innerType?: unknown };
};

function enumValues(schema: unknown): string[] {
  const maybeEnum = schema as MaybeEnumSchema;
  if (maybeEnum.options) return [...maybeEnum.options];
  if (maybeEnum.unwrap) return enumValues(maybeEnum.unwrap());
  if (maybeEnum._def?.innerType) return enumValues(maybeEnum._def.innerType);
  throw new Error('Expected a Zod enum-compatible schema.');
}

function objectField(schema: unknown, field: string) {
  return (schema as { shape: Record<string, unknown> }).shape[field];
}
