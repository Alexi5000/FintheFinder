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
});
