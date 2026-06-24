import { NextResponse } from 'next/server';
import { approvalRequestSchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { addApproval, addEvent, enqueueResearchRun, getOpenCriticalGaps, getSessionDetail, updateSessionState, waiveClaimGaps } from '@/server/research/repository';
import { getUserFromRequest, hasSupabaseConfig } from '@/server/supabase/server';
import { withSpan } from '@/server/telemetry';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!hasSupabaseConfig()) return apiError('supabase_not_configured', 'Supabase is not configured.', 503);
    const user = await getUserFromRequest(request);
    if (!user) return apiError('unauthorized', 'Sign in to approve research.', 401);

    const { id } = await context.params;
    await getSessionDetail(user.id, id);
    const input = approvalRequestSchema.parse(await request.json());

    return await withSpan(
      'api.research.approval',
      {
        'research.session_id': id,
        'research.approval_action': input.action,
        'research.waived_gap_count': input.waivedGapIds.length,
      },
      async () => {
        if (input.action === 'approve') {
          const openCriticalGaps = await getOpenCriticalGaps(id);
          const waived = new Set(input.waivedGapIds);
          const unwaivedCriticalGaps = openCriticalGaps.filter((gap) => !waived.has(gap.id));

          if (openCriticalGaps.length > 0 && input.waivedGapIds.length > 0 && !input.notes?.trim()) {
            return apiError('waiver_notes_required', 'Critical gap waivers require reviewer notes.', 422, {
              openCriticalGapIds: openCriticalGaps.map((gap) => gap.id),
            });
          }

          if (unwaivedCriticalGaps.length > 0) {
            return apiError('critical_gaps_unresolved', 'Resolve or explicitly waive critical claim gaps before approving report generation.', 409, {
              openCriticalGapIds: unwaivedCriticalGaps.map((gap) => gap.id),
            });
          }

          await waiveClaimGaps(id, input.waivedGapIds, input.notes ?? 'Waived during human approval.');
          await addApproval(id, user.id, input.action, input.notes, input.approvedSourceIds, input.waivedGapIds);
          await addEvent(
            id,
            'reviewing',
            'Human approval recorded.',
            { approvedSourceIds: input.approvedSourceIds, waivedGapIds: input.waivedGapIds },
            { eventType: 'approval_recorded', actor: 'user', stepId: 'human_approval' },
          );
          const run = await enqueueResearchRun(
            id,
            { stage: 'reporting', approvedBy: user.id, approvedSourceIds: input.approvedSourceIds, waivedGapIds: input.waivedGapIds },
            'reporting',
          );
          return NextResponse.json({ ok: true, runId: run.id, status: run.status, run }, { status: 202 });
        }

        await addApproval(id, user.id, input.action, input.notes, input.approvedSourceIds, input.waivedGapIds);
        await addEvent(id, 'reviewing', `Human ${input.action} recorded.`, { notes: input.notes ?? null }, { eventType: 'approval_recorded', actor: 'user', stepId: 'human_approval' });
        if (input.action === 'reject') await updateSessionState(id, 'rejected', 'reviewing');
        if (input.action === 'follow_up') {
          const run = await enqueueResearchRun(id, { stage: 'research', requestedBy: user.id, followUpNotes: input.notes ?? null }, 'planning');
          return NextResponse.json({ ok: true, runId: run.id, status: run.status, run }, { status: 202 });
        }

        return NextResponse.json({ ok: true });
      },
    );
  } catch (error) {
    return parseError(error);
  }
}
