import { ReportReaderClient } from '@/components/authenticated-data';
import { getSupabaseBrowserConfig } from '@/server/supabase/server';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ReportReaderClient sessionId={id} supabaseConfig={getSupabaseBrowserConfig()} />;
}
