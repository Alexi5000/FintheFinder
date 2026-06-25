import { describe, expect, it } from 'vitest';
import { orchestrationReplaySummarySchema, runOrchestrationReplayEval } from '@/server/evals/replay-eval';

describe('orchestration replay eval', () => {
  it('proves the credential-free research approval reporting path', async () => {
    const summary = await runOrchestrationReplayEval();

    expect(summary.passed).toBe(true);
    expect(summary.mode).toBe('credential_free_orchestration_replay');
    expect(summary.coverage).toEqual(['processNextRun', 'runResearchSession', 'approvalDecision', 'runApprovedReportSession', 'publishReport']);
    expect(summary.artifactCounts).toMatchObject({ sources: 2, evaluations: 2, learnings: 2, claims: 2, approvals: 1, reports: 1 });
    expect(summary.cost).toMatchObject({ researchExaSearches: 2, researchModelCalls: 6, reportingModelCalls: 3, totalModelCalls: 9 });
    expect(summary.providerBoundary).toMatchObject({ liveOpenAiCalls: 0, liveExaCalls: 0, liveSupabaseCalls: 0 });
    expect(summary.assertions.every((assertion) => assertion.passed)).toBe(true);
    expect(summary.evals.passed).toBe(true);
    expect(summary.events.lineage.map((event) => event.stepId ?? event.eventType)).toEqual(
      expect.arrayContaining(['planner', 'exa_search', 'source_evaluator', 'learning_extractor', 'claim_audit', 'approval_recorded', 'report_writer', 'report_ready']),
    );
  });

  it('rejects a summary whose passed flag hides a failed assertion', async () => {
    const summary = await runOrchestrationReplayEval();
    const tampered = {
      ...summary,
      assertions: summary.assertions.map((assertion, index) => (index === 0 ? { ...assertion, passed: false } : assertion)),
    };

    expect(orchestrationReplaySummarySchema.safeParse(tampered).success).toBe(false);
  });
});
