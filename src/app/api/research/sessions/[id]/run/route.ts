import { NextResponse } from 'next/server';
import { apiError, parseError } from '@/server/http';
import { checkRateLimit } from '@/server/rate-limit';
import { enqueueResearchRun, getSessionDetail } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';
import { withSpan } from '@/server/telemetry';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to run this research session.', 401);

    const rate = checkRateLimit(`run:${user.id}`);
    if (!rate.ok) return apiError('rate_limited', 'Too many research runs. Try again shortly.', 429);

    const { id } = await context.params;
    const session = await getSessionDetail(user.id, id);
    return await withSpan(
      'api.research.enqueue_run',
      {
        'research.session_id': session.id,
        'research.stage': 'research',
      },
      async () => {
        const run = await enqueueResearchRun(session.id, { stage: 'research', requestedBy: user.id }, 'planning');
        return NextResponse.json({ runId: run.id, status: run.status, run }, { status: 202 });
      },
    );
  } catch (error) {
    return parseError(error);
  }
}
