import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('database migrations', () => {
  it('hardens approval writes against cross-session pollution', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/005_approval_ownership_hardening.sql'), 'utf8');

    expect(migration).toContain('ensure_research_approval_owner');
    expect(migration).toContain('drop policy if exists "Users can manage own approvals"');
    expect(migration).toContain('s.id = public.research_approvals.session_id');
    expect(migration).toContain('s.user_id = auth.uid()');
    expect(migration).toContain('s.user_id = new.user_id');
  });

  it('creates and hardens persisted eval history tables', () => {
    const baseMigration = readFileSync(join(process.cwd(), 'supabase/migrations/002_fde_production_surfaces.sql'), 'utf8');
    const hardeningMigration = readFileSync(join(process.cwd(), 'supabase/migrations/006_eval_history_hardening.sql'), 'utf8');

    expect(baseMigration).toContain('create table if not exists public.eval_runs');
    expect(baseMigration).toContain('create table if not exists public.eval_results');
    expect(baseMigration).toContain('alter table public.eval_runs enable row level security');
    expect(baseMigration).toContain('alter table public.eval_results enable row level security');

    expect(hardeningMigration).toContain('add column if not exists expected_pass');
    expect(hardeningMigration).toContain('add column if not exists observed_pass');
    expect(hardeningMigration).toContain('add column if not exists regressions');
    expect(hardeningMigration).toContain('jsonb_array_elements(coalesce(run.summary->');
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
});
