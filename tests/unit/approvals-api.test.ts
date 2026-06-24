import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeHarness = vi.hoisted(() => ({
  getApprovalsForUser: vi.fn(),
  getUserFromRequest: vi.fn(),
  hasSupabaseConfig: vi.fn(),
}));

vi.mock('@/server/research/repository', () => ({
  getApprovalsForUser: routeHarness.getApprovalsForUser,
}));

vi.mock('@/server/supabase/server', () => ({
  getUserFromRequest: routeHarness.getUserFromRequest,
  hasSupabaseConfig: routeHarness.hasSupabaseConfig,
}));

describe('approvals API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeHarness.hasSupabaseConfig.mockReturnValue(true);
    routeHarness.getUserFromRequest.mockResolvedValue({ id: 'user_1' });
    routeHarness.getApprovalsForUser.mockResolvedValue([
      {
        id: 'approval_1',
        sessionId: 'session_1',
        userId: 'user_1',
        action: 'approve',
        notes: null,
        approvedSourceIds: [],
        waivedGapIds: [],
        createdAt: '2026-06-24T00:00:00.000Z',
      },
    ]);
  });

  it('returns 503 when Supabase is not configured', async () => {
    routeHarness.hasSupabaseConfig.mockReturnValue(false);
    const { GET } = await import('@/app/api/research/sessions/[id]/approvals/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_1/approvals'), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(503);
    expect(routeHarness.getUserFromRequest).not.toHaveBeenCalled();
    expect(routeHarness.getApprovalsForUser).not.toHaveBeenCalled();
  });

  it('returns 401 before reading approvals when the user is not authenticated', async () => {
    routeHarness.getUserFromRequest.mockResolvedValue(null);
    const { GET } = await import('@/app/api/research/sessions/[id]/approvals/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_1/approvals'), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(401);
    expect(routeHarness.getApprovalsForUser).not.toHaveBeenCalled();
  });

  it('returns approval history through the user-scoped repository reader', async () => {
    const { GET } = await import('@/app/api/research/sessions/[id]/approvals/route');

    const response = await GET(new Request('http://localhost/api/research/sessions/session_1/approvals'), {
      params: Promise.resolve({ id: 'session_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(routeHarness.getApprovalsForUser).toHaveBeenCalledWith('user_1', 'session_1');
    expect(payload.approvals).toHaveLength(1);
  });
});
