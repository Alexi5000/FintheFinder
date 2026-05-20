import { NextResponse } from 'next/server';
import { createResearchSessionSchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { checkRateLimit } from '@/server/rate-limit';
import { createSession, listSessions } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to view research sessions.', 401);
    return NextResponse.json({ sessions: await listSessions(user.id) });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to create a research session.', 401);

    const rate = checkRateLimit(`create:${user.id}`);
    if (!rate.ok) return apiError('rate_limited', 'Too many research sessions created. Try again shortly.', 429);

    const input = createResearchSessionSchema.parse(await request.json());
    const session = await createSession(user.id, input.query);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
