import { NextResponse } from 'next/server';
import { upsertResearchMemorySchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { getSessionDetail, listResearchMemories, upsertResearchMemory } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to inspect research memory.', 401);

    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined;
    if (sessionId) await getSessionDetail(user.id, sessionId);

    return NextResponse.json({ memories: await listResearchMemories(user.id, { sessionId }) });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to write research memory.', 401);

    const input = upsertResearchMemorySchema.parse(await request.json());
    if (input.scope === 'session' && input.sessionId) await getSessionDetail(user.id, input.sessionId);

    return NextResponse.json({ memory: await upsertResearchMemory(user.id, input) });
  } catch (error) {
    return parseError(error);
  }
}
