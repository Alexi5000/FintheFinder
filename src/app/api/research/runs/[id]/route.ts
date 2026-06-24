import { NextResponse } from 'next/server';
import { apiError, parseError } from '@/server/http';
import { getEvents, getPostMortemForRun, getRunCostForRun, getRunForUser } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to inspect this run.', 401);

    const { id } = await context.params;
    const run = await getRunForUser(user.id, id);
    const [events, cost, postMortem] = await Promise.all([getEvents(run.sessionId, { runId: run.id }), getRunCostForRun(run.id), getPostMortemForRun(run.id)]);
    return NextResponse.json({ run, events, cost, postMortem });
  } catch (error) {
    return parseError(error);
  }
}
