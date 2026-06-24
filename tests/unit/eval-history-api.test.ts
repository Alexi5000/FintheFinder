import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeHarness = vi.hoisted(() => ({
  getLatestEvalRun: vi.fn(),
  hasSupabaseConfig: vi.fn(),
  listEvalRuns: vi.fn(),
}));

vi.mock('@/server/evals/history', () => ({
  getLatestEvalRun: routeHarness.getLatestEvalRun,
  listEvalRuns: routeHarness.listEvalRuns,
}));

vi.mock('@/server/supabase/server', () => ({
  hasSupabaseConfig: routeHarness.hasSupabaseConfig,
}));

describe('eval history API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.listEvalRuns.mockResolvedValue([]);
    routeHarness.getLatestEvalRun.mockResolvedValue(null);
  });

  it('returns 503 when Supabase is not configured', async () => {
    routeHarness.hasSupabaseConfig.mockReturnValue(false);
    const { GET } = await import('@/app/api/research/evals/history/route');

    const response = await GET(new Request('http://localhost/api/research/evals/history'));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('supabase_not_configured');
    expect(routeHarness.listEvalRuns).not.toHaveBeenCalled();
  });

  it('returns public persisted history for the requested suite', async () => {
    const run = {
      id: 'eval_run_1',
      suite: 'nightly',
      status: 'passed',
      summary: { passed: true, total: 0, failed: 0, results: [] },
      createdAt: '2026-06-24T00:00:00.000Z',
    };
    routeHarness.listEvalRuns.mockResolvedValue([run]);
    routeHarness.getLatestEvalRun.mockResolvedValue({ ...run, results: [] });
    const { GET } = await import('@/app/api/research/evals/history/route');

    const response = await GET(new Request('http://localhost/api/research/evals/history?limit=3&suite=nightly'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(routeHarness.listEvalRuns).toHaveBeenCalledWith(3, 'nightly');
    expect(routeHarness.getLatestEvalRun).toHaveBeenCalledWith('nightly');
    expect(payload).toEqual({ suite: 'nightly', runs: [run], latest: { ...run, results: [] } });
  });

  it('defaults, clamps, and ignores invalid limits', async () => {
    const { GET } = await import('@/app/api/research/evals/history/route');

    await GET(new Request('http://localhost/api/research/evals/history'));
    await GET(new Request('http://localhost/api/research/evals/history?limit=500'));
    await GET(new Request('http://localhost/api/research/evals/history?limit=nope'));

    expect(routeHarness.listEvalRuns).toHaveBeenNthCalledWith(1, 20, 'offline');
    expect(routeHarness.listEvalRuns).toHaveBeenNthCalledWith(2, 50, 'offline');
    expect(routeHarness.listEvalRuns).toHaveBeenNthCalledWith(3, 20, 'offline');
  });

  it('returns a consistent error envelope for service failures', async () => {
    routeHarness.listEvalRuns.mockRejectedValue(new Error('database unavailable'));
    const { GET } = await import('@/app/api/research/evals/history/route');

    const response = await GET(new Request('http://localhost/api/research/evals/history'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('internal_error');
  });
});
