import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('production research boundaries', () => {
  it('keeps hosted run requests enqueue-only', () => {
    const route = readRepoFile('src/app/api/research/sessions/[id]/run/route.ts');

    expect(route).toContain('enqueueResearchRun');
    expect(route).not.toContain('runResearchSession');
    expect(route).not.toContain('runApprovedReportSession');
    expect(route).not.toContain('runLegacySynchronousResearchSession');
  });

  it('prevents pipeline report readiness from bypassing transactional publication', () => {
    const pipeline = readRepoFile('src/server/research/pipeline.ts');

    expect(pipeline).toContain('publishReport');
    expect(pipeline).not.toContain('runLegacySynchronousResearchSession');
    expect(pipeline).not.toMatch(/import\s+\{[^}]*saveReport[^}]*\}\s+from\s+['"]\.\/repository['"]/);
    expect(pipeline).not.toMatch(/updateSessionState\(sessionId,\s*['"]report_ready['"],\s*['"]complete['"]\)/);
  });

  it('keeps client table writes behind hosted API and immutable event guards', () => {
    const writeHardening = readRepoFile('supabase/migrations/018_api_only_session_memory_writes.sql');
    const eventHardening = readRepoFile('supabase/migrations/017_research_event_immutability.sql');

    expect(writeHardening).toContain('drop policy if exists "Users can manage own sessions"');
    expect(writeHardening).toContain('create policy "Users can read own sessions"');
    expect(writeHardening).toContain('drop policy if exists "Users can insert own research memories"');
    expect(writeHardening).toContain('drop policy if exists "Users can update own research memories"');
    expect(writeHardening).toContain('drop policy if exists "Users can delete own research memories"');
    expect(eventHardening).toContain('prevent_research_event_payload_update');
    expect(eventHardening).toContain('prevent_research_event_delete');
  });
});
