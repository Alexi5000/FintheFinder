import { ReportReaderClient } from '@/components/authenticated-data';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ReportReaderClient sessionId={id} />;
}
