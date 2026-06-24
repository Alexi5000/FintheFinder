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
});
