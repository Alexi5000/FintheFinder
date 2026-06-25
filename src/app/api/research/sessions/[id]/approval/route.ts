import { NextResponse } from 'next/server';
import { approvalRequestSchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { recordApprovalDecision, type ApprovalDecisionErrorCode, type ApprovalDecisionResult } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';
import { withSpan } from '@/server/telemetry';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to approve research.', 401);

    const { id } = await context.params;
    const input = approvalRequestSchema.parse(await request.json());

    return await withSpan(
      'api.research.approval',
      {
        'research.session_id': id,
        'research.approval_action': input.action,
        'research.waived_gap_count': input.waivedGapIds.length,
      },
      async () => {
        return responseForApprovalDecision(await recordApprovalDecision(user.id, id, input));
      },
    );
  } catch (error) {
    return parseError(error);
  }
}

function responseForApprovalDecision(result: ApprovalDecisionResult) {
  if (!result.ok) return approvalDecisionErrorResponse(result.code, result.details);
  if (result.action === 'reject') return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: true, runId: result.runId, status: result.status, run: result.run }, { status: 202 });
}

function approvalDecisionErrorResponse(code: ApprovalDecisionErrorCode, details: unknown) {
  if (code === 'approval_not_available') {
    return apiError('approval_not_available', 'Research decisions can only be recorded while the session is awaiting approval.', 409, details);
  }
  if (code === 'waiver_notes_required') {
    return apiError('waiver_notes_required', 'Critical gap waivers require reviewer notes.', 422, details);
  }
  if (code === 'critical_gaps_unresolved') {
    return apiError('critical_gaps_unresolved', 'Resolve or explicitly waive critical claim gaps before approving report generation.', 409, details);
  }
  if (code === 'active_run_conflict') {
    return apiError('active_run_conflict', 'A research run is already active for this session.', 409, details);
  }
  if (code === 'session_not_found') {
    return apiError('session_not_found', 'Research session was not found for this user.', 404);
  }
  return apiError('invalid_approval_request', 'The approval decision request is invalid.', 422, details);
}
