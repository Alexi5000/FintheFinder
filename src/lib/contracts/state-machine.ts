import { z } from 'zod';

export const workflowStateSchema = z.enum([
  'draft',
  'queued',
  'planning',
  'searching',
  'evaluating',
  'extracting',
  'claim_audit',
  'awaiting_approval',
  'reporting',
  'final_review',
  'report_ready',
  'rejected',
  'failed',
]);

export const workflowActionSchema = z.enum([
  'enqueue',
  'start_planning',
  'start_searching',
  'start_evaluating',
  'start_extracting',
  'start_claim_audit',
  'request_approval',
  'approve',
  'request_follow_up',
  'reject',
  'start_reporting',
  'start_final_review',
  'publish_report',
  'fail',
]);

export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const workflowTransitions: Record<WorkflowState, Partial<Record<WorkflowAction, WorkflowState>>> = {
  draft: { enqueue: 'queued', fail: 'failed' },
  queued: { start_planning: 'planning', fail: 'failed' },
  planning: { start_searching: 'searching', fail: 'failed' },
  searching: { start_evaluating: 'evaluating', fail: 'failed' },
  evaluating: { start_extracting: 'extracting', fail: 'failed' },
  extracting: { start_claim_audit: 'claim_audit', fail: 'failed' },
  claim_audit: { request_approval: 'awaiting_approval', fail: 'failed' },
  awaiting_approval: {
    approve: 'reporting',
    reject: 'rejected',
    request_follow_up: 'queued',
    fail: 'failed',
  },
  reporting: { start_final_review: 'final_review', fail: 'failed' },
  final_review: { publish_report: 'report_ready', request_approval: 'awaiting_approval', fail: 'failed' },
  report_ready: {},
  rejected: {},
  failed: {},
};

export function nextWorkflowState(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const next = workflowTransitions[state][action];
  if (!next) {
    throw new Error(`Invalid research workflow transition: ${state} -> ${action}`);
  }
  return next;
}

export function canTransitionWorkflow(state: WorkflowState, action: WorkflowAction): boolean {
  return Boolean(workflowTransitions[state][action]);
}
