import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type SupabaseBrowserConfig = {
  anonKey?: string;
  url?: string;
};

export function createSupabaseBrowserClient(config?: SupabaseBrowserConfig) {
  const url = config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = config?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient<Database>(url, anonKey);
}
