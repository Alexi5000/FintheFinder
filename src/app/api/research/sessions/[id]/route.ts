import { NextResponse } from 'next/server';
import { apiError, parseError } from '@/server/http';
import { getSessionDetail } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to view this research session.', 401);
    const { id } = await context.params;
    return NextResponse.json({ session: await getSessionDetail(user.id, id) });
  } catch (error) {
    return parseError(error);
  }
}
