import { apiError, parseError } from '@/server/http';
import { getEvents, getSessionDetail } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to stream events.', 401);
    const { id } = await context.params;
    await getSessionDetail(user.id, id);
    const events = await getEvents(id);
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
