import { SessionDetailClient } from '@/components/authenticated-data';
import { getSupabaseBrowserConfig } from '@/server/supabase/server';

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SessionDetailClient sessionId={id} supabaseConfig={getSupabaseBrowserConfig()} />;
}
