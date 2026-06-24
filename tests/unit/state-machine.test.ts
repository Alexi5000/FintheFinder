import { describe, expect, it } from 'vitest';
import { canTransitionWorkflow, nextWorkflowState } from '@/lib/schemas';

describe('research workflow state machine', () => {
  it('allows the happy path through human approval and final review', () => {
    expect(nextWorkflowState('draft', 'enqueue')).toBe('queued');
    expect(nextWorkflowState('queued', 'start_planning')).toBe('planning');
    expect(nextWorkflowState('claim_audit', 'request_approval')).toBe('awaiting_approval');
    expect(nextWorkflowState('awaiting_approval', 'approve')).toBe('reporting');
    expect(nextWorkflowState('reporting', 'start_final_review')).toBe('final_review');
    expect(nextWorkflowState('final_review', 'publish_report')).toBe('report_ready');
  });

  it('protects terminal states and invalid transitions', () => {
    expect(canTransitionWorkflow('report_ready', 'start_reporting')).toBe(false);
    expect(() => nextWorkflowState('draft', 'publish_report')).toThrow(/Invalid research workflow transition/);
  });

  it('routes follow-up and rejection from the approval gate', () => {
    expect(nextWorkflowState('awaiting_approval', 'request_follow_up')).toBe('queued');
    expect(nextWorkflowState('awaiting_approval', 'reject')).toBe('rejected');
  });
});
