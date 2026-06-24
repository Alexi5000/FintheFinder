import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ZodError, z } from 'zod';

const supabaseHarness = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseHarness.createClient,
}));

vi.mock('@/lib/config', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));

describe('HTTP and Supabase request security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseHarness.getUser.mockResolvedValue({ data: { user: { id: 'user_1' } }, error: null });
    supabaseHarness.createClient.mockReturnValue({ auth: { getUser: supabaseHarness.getUser } });
  });

  it('does not leak internal exception messages through API errors', async () => {
    const { parseError } = await import('@/server/http');

    const response = parseError(new Error('secret token user_2 confidential report text'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: { code: 'internal_error', message: 'Unexpected server error.' } });
  });

  it('keeps Zod validation details for client-correctable payload errors', async () => {
    const { parseError } = await import('@/server/http');

    const response = parseError(new ZodError(z.object({ query: z.string().min(3) }).safeParse({ query: '' }).error!.issues));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('validation_error');
    expect(payload.error.details.fieldErrors.query).toBeDefined();
  });

  it('requires an explicit Bearer authorization scheme before calling Supabase Auth', async () => {
    const { getUserFromRequest } = await import('@/server/supabase/server');

    for (const authorization of [undefined, '', 'Bearer', 'Bearer   ', 'Basic abc', 'Token abc', 'ApiKey abc']) {
      const request = new Request('http://localhost/api/research/sessions', authorization ? { headers: { authorization } } : undefined);
      await expect(getUserFromRequest(request)).resolves.toBeNull();
    }

    expect(supabaseHarness.createClient).not.toHaveBeenCalled();
    expect(supabaseHarness.getUser).not.toHaveBeenCalled();
  });

  it('accepts case-insensitive Bearer tokens and trims the token value', async () => {
    const { getUserFromRequest } = await import('@/server/supabase/server');

    const user = await getUserFromRequest(new Request('http://localhost/api/research/sessions', { headers: { authorization: 'bearer   access-token   ' } }));

    expect(user).toEqual({ id: 'user_1' });
    expect(supabaseHarness.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'service-role-key', expect.any(Object));
    expect(supabaseHarness.getUser).toHaveBeenCalledWith('access-token');
  });
});
