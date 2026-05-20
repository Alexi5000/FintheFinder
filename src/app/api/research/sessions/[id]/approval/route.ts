import { NextResponse } from 'next/server';
import { approvalRequestSchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { addApproval, getSessionDetail, updateSessionState } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to approve research.', 401);

    const { id } = await context.params;
    await getSessionDetail(user.id, id);
    const input = approvalRequestSchema.parse(await request.json());
    await addApproval(id, user.id, input.action, input.notes, input.approvedSourceIds);

    if (input.action === 'approve') await updateSessionState(id, 'approved', 'reviewing');
    if (input.action === 'reject') await updateSessionState(id, 'rejected', 'reviewing');
    if (input.action === 'follow_up') await updateSessionState(id, 'queued', 'planning');

    return NextResponse.json({ ok: true });
  } catch (error) {
    return parseError(error);
  }
}
