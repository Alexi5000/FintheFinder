import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/config';
import type { Database } from '@/lib/supabase/database.types';
import type { SupabaseBrowserConfig } from '@/lib/supabase-browser';

export function hasSupabaseConfig() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig | undefined {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return undefined;
  return {
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function createSupabaseAdmin() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseBrowserClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authHeader ?? '');
  const token = match?.[1]?.trim();

  if (!token) {
    return null;
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}
