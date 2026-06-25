import { SessionsClient } from '@/components/authenticated-data';
import { getSupabaseBrowserConfig } from '@/server/supabase/server';

export default function SessionsPage() {
  return <SessionsClient supabaseConfig={getSupabaseBrowserConfig()} />;
}
