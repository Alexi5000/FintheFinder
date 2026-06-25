import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseHarness = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: { getSession: vi.fn() } })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseHarness.createClient,
}));

describe('Supabase browser runtime config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('uses explicit runtime public config when build-time env is absent', async () => {
    const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');

    const client = createSupabaseBrowserClient({ url: 'https://runtime.supabase.co', anonKey: 'runtime-anon' });

    expect(client).toBeTruthy();
    expect(supabaseHarness.createClient).toHaveBeenCalledWith('https://runtime.supabase.co', 'runtime-anon');
  });

  it('falls back to build-time public env for local development', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://build.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'build-anon';
    const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');

    createSupabaseBrowserClient();

    expect(supabaseHarness.createClient).toHaveBeenCalledWith('https://build.supabase.co', 'build-anon');
  });

  it('fails closed when neither runtime config nor public env is present', async () => {
    const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');

    expect(createSupabaseBrowserClient()).toBeNull();
    expect(supabaseHarness.createClient).not.toHaveBeenCalled();
  });
});
