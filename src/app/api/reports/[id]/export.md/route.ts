import { apiError, parseError } from '@/server/http';
import { getSessionDetail } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to export reports.', 401);
    const { id } = await context.params;
    const session = await getSessionDetail(user.id, id);
    if (!session.report) return apiError('report_not_found', 'No report exists for this session.', 404);
    return new Response(session.report.markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${session.title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.md"`,
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
