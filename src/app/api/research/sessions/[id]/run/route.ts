import { NextResponse } from 'next/server';
import { apiError, parseError } from '@/server/http';
import { checkRateLimit } from '@/server/rate-limit';
import { getSessionDetail } from '@/server/research/repository';
import { runResearchSession } from '@/server/research/pipeline';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to run this research session.', 401);

    const rate = checkRateLimit(`run:${user.id}`);
    if (!rate.ok) return apiError('rate_limited', 'Too many research runs. Try again shortly.', 429);

    const { id } = await context.params;
    const session = await getSessionDetail(user.id, id);
    const result = await runResearchSession(session.id, session.query);
    return NextResponse.json({ result });
  } catch (error) {
    return parseError(error);
  }
}
