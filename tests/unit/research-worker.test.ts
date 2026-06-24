import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchRun, ResearchSession } from '@/lib/schemas';
import type { WorkerConfig, WorkerDependencies } from '@/worker/research-worker-runtime';

const baseConfig: WorkerConfig = {
  heartbeatMs: 1000,
  leaseMs: 60000,
  once: false,
  pollMs: 10,
  processOnce: true,
  workerId: 'worker_test',
};

const run: ResearchRun = {
  id: 'run_1',
  sessionId: 'session_1',
  status: 'leased',
  attempt: 1,
  metadata: { stage: 'research' },
  workerId: 'worker_test',
  leaseExpiresAt: null,
  startedAt: null,
  completedAt: null,
  error: null,
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
};

const session: ResearchSession = {
  id: 'session_1',
  userId: 'user_1',
  query: 'Research AI agent evaluation systems',
  title: 'AI Agent Evaluation',
  status: 'queued',
  phase: 'planning',
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
};

async function flushPromises(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

describe('research worker runtime', () => {
  let dependencies: WorkerDependencies;
  let intervalHandle: NodeJS.Timeout;

  beforeEach(() => {
    intervalHandle = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    dependencies = {
      addEvent: vi.fn(async () => undefined),
      claimNextQueuedRun: vi.fn(async () => run),
      clearInterval: vi.fn(),
      createPostMortem: vi.fn(async () => undefined),
      getProviderStatus: vi.fn(() => ({ openai: true, exa: true, supabase: true, models: { primary: 'gpt-5.5', fast: 'gpt-5.4-mini', reasoningEffort: 'high' } })),
      getSessionById: vi.fn(async () => session),
      hasSupabaseConfig: vi.fn(() => true),
      heartbeatResearchRun: vi.fn(async () => run),
      initTelemetry: vi.fn(),
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      newCorrelationId: vi.fn(() => 'corr_run_1'),
      runApprovedReportSession: vi.fn(async () => ({ status: 'completed' })),
      runResearchSession: vi.fn(async () => ({ status: 'awaiting_approval' })),
      saveRunSummaryMemory: vi.fn(async () => ({
        id: 'memory_1',
        userId: 'user_1',
        sessionId: 'session_1',
        scope: 'session',
        namespace: 'run_summary',
        key: 'run:run_1',
        value: {},
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      })),
      setInterval: vi.fn(() => intervalHandle),
      sleep: vi.fn(async () => undefined),
      updateRunStatus: vi.fn(async (_runId, status) => ({ ...run, status })),
      updateSessionState: vi.fn(async () => undefined),
      withSpan: vi.fn(async (_name, _attributes, callback) => callback()),
    };
  });

  it('parses worker configuration from environment defaults and overrides', async () => {
    const { readWorkerConfig } = await import('@/worker/research-worker-runtime');

    expect(readWorkerConfig({}, 1234)).toEqual({
      heartbeatMs: 200000,
      leaseMs: 600000,
      once: false,
      pollMs: 5000,
      processOnce: false,
      workerId: 'worker-1234',
    });

    expect(
      readWorkerConfig(
        {
          WORKER_HEARTBEAT_MS: '250',
          WORKER_ID: 'worker_custom',
          WORKER_LEASE_MS: '900',
          WORKER_ONCE: '1',
          WORKER_POLL_MS: '50',
          WORKER_PROCESS_ONCE: '1',
        },
        1234,
      ),
    ).toEqual({
      heartbeatMs: 250,
      leaseMs: 900,
      once: true,
      pollMs: 50,
      processOnce: true,
      workerId: 'worker_custom',
    });
  });

  it('rejects unsafe worker configuration values', async () => {
    const { readWorkerConfig } = await import('@/worker/research-worker-runtime');

    expect(() => readWorkerConfig({ WORKER_LEASE_MS: 'NaN' }, 1234)).toThrow('WORKER_LEASE_MS must be a positive integer.');
    expect(() => readWorkerConfig({ WORKER_POLL_MS: '0' }, 1234)).toThrow('WORKER_POLL_MS must be a positive integer.');
    expect(() => readWorkerConfig({ WORKER_ID: '   ' }, 1234)).toThrow('WORKER_ID must be a non-empty string.');
    expect(() =>
      readWorkerConfig({ WORKER_LEASE_MS: '1000', WORKER_HEARTBEAT_MS: '800' }, 1234),
    ).toThrow('WORKER_HEARTBEAT_MS must be no more than half of WORKER_LEASE_MS.');
  });

  it('does not claim work when Supabase is not configured', async () => {
    dependencies.hasSupabaseConfig = vi.fn(() => false);
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(false);

    expect(dependencies.claimNextQueuedRun).not.toHaveBeenCalled();
    expect(dependencies.logger.warn).toHaveBeenCalledWith({ workerId: 'worker_test' }, 'supabase is not configured; worker cannot claim research runs');
  });

  it('returns false when no queued run is available', async () => {
    dependencies.claimNextQueuedRun = vi.fn(async () => null);
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(false);

    expect(dependencies.claimNextQueuedRun).toHaveBeenCalledWith('worker_test', 60000);
    expect(dependencies.getSessionById).not.toHaveBeenCalled();
  });

  it('processes research-stage runs to the human approval gate with heartbeat and memory summary', async () => {
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(true);

    expect(dependencies.claimNextQueuedRun).toHaveBeenCalledWith('worker_test', 60000);
    expect(dependencies.updateRunStatus).toHaveBeenNthCalledWith(1, 'run_1', 'running', { workerId: 'worker_test' });
    expect(dependencies.addEvent).toHaveBeenCalledWith(
      'session_1',
      'planning',
      'Worker claimed research run.',
      { stage: 'research' },
      { runId: 'run_1', eventType: 'state_transition', actor: 'worker', correlationId: 'corr_run_1' },
    );
    expect(dependencies.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(intervalHandle.unref).toHaveBeenCalled();
    expect(dependencies.runResearchSession).toHaveBeenCalledWith('session_1', 'Research AI agent evaluation systems', {
      run,
      correlationId: 'corr_run_1',
    });
    expect(dependencies.updateRunStatus).toHaveBeenLastCalledWith('run_1', 'awaiting_approval', { workerId: 'worker_test' });
    expect(dependencies.saveRunSummaryMemory).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      'run_1',
      expect.objectContaining({ runId: 'run_1', stage: 'research', status: 'awaiting_approval', workerId: 'worker_test' }),
    );
    expect(dependencies.clearInterval).toHaveBeenCalledWith(intervalHandle);
  });

  it('processes reporting-stage runs through the approved report pipeline', async () => {
    const reportingRun = { ...run, id: 'run_report', metadata: { stage: 'reporting' } };
    dependencies.claimNextQueuedRun = vi.fn(async () => reportingRun);
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(true);

    expect(dependencies.runApprovedReportSession).toHaveBeenCalledWith('session_1', 'Research AI agent evaluation systems', {
      run: reportingRun,
      correlationId: 'corr_run_1',
    });
    expect(dependencies.updateRunStatus).toHaveBeenLastCalledWith('run_report', 'completed', { workerId: 'worker_test' });
    expect(dependencies.saveRunSummaryMemory).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      'run_report',
      expect.objectContaining({ stage: 'reporting', status: 'completed' }),
    );
  });

  it('defaults unknown worker stages to the research pipeline', async () => {
    const unknownStageRun = { ...run, metadata: { stage: 'unexpected_stage' } };
    dependencies.claimNextQueuedRun = vi.fn(async () => unknownStageRun);
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(true);

    expect(dependencies.runResearchSession).toHaveBeenCalledWith('session_1', 'Research AI agent evaluation systems', {
      run: unknownStageRun,
      correlationId: 'corr_run_1',
    });
    expect(dependencies.runApprovedReportSession).not.toHaveBeenCalled();
    expect(dependencies.saveRunSummaryMemory).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      'run_1',
      expect.objectContaining({ stage: 'research' }),
    );
  });

  it('heartbeats leased runs while pipeline work is active', async () => {
    let resolvePipeline: (value: { status: 'awaiting_approval' }) => void = () => undefined;
    dependencies.runResearchSession = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePipeline = resolve;
        }),
    );
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    const pending = processNextRun(baseConfig, dependencies);
    await flushPromises();

    const heartbeat = vi.mocked(dependencies.setInterval).mock.calls[0]?.[0];
    expect(heartbeat).toEqual(expect.any(Function));
    heartbeat();
    await flushPromises();

    expect(dependencies.heartbeatResearchRun).toHaveBeenCalledWith('run_1', 'worker_test', 60000);

    resolvePipeline({ status: 'awaiting_approval' });
    await expect(pending).resolves.toBe(true);
    expect(dependencies.heartbeatResearchRun).toHaveBeenCalledTimes(2);
  });

  it('does not write terminal state or post-mortems after lease ownership is lost', async () => {
    let resolvePipeline: (value: { status: 'awaiting_approval' }) => void = () => undefined;
    dependencies.heartbeatResearchRun = vi.fn(async () => null);
    dependencies.runResearchSession = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePipeline = resolve;
        }),
    );
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    const pending = processNextRun(baseConfig, dependencies);
    await flushPromises();

    const heartbeat = vi.mocked(dependencies.setInterval).mock.calls[0]?.[0];
    heartbeat();
    await flushPromises();
    resolvePipeline({ status: 'awaiting_approval' });

    await expect(pending).resolves.toBe(false);
    expect(dependencies.updateRunStatus).toHaveBeenCalledTimes(1);
    expect(dependencies.updateRunStatus).toHaveBeenCalledWith('run_1', 'running', { workerId: 'worker_test' });
    expect(dependencies.createPostMortem).not.toHaveBeenCalled();
    expect(dependencies.saveRunSummaryMemory).not.toHaveBeenCalled();
  });

  it('does not convert successful runs into failed runs when run summary memory fails', async () => {
    dependencies.saveRunSummaryMemory = vi.fn(async () => {
      throw new Error('memory table unavailable');
    });
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(true);

    expect(dependencies.updateRunStatus).toHaveBeenLastCalledWith('run_1', 'awaiting_approval', { workerId: 'worker_test' });
    expect(dependencies.updateRunStatus).not.toHaveBeenCalledWith('run_1', 'failed', expect.anything());
    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1', sessionId: 'session_1', runId: 'run_1', errorType: 'Error' }),
      'research worker could not persist run summary memory',
    );
  });

  it('records failed runs, failed session state, post-mortems, and failed run memory', async () => {
    dependencies.runResearchSession = vi.fn(async () => {
      throw new Error('Provider timeout with token sk-live-secret');
    });
    const { processNextRun } = await import('@/worker/research-worker-runtime');

    await expect(processNextRun(baseConfig, dependencies)).resolves.toBe(true);

    const persistedError = 'Research worker failed during pipeline execution. See redacted server logs with the run ID for details.';
    expect(dependencies.updateRunStatus).toHaveBeenLastCalledWith('run_1', 'failed', { error: persistedError, workerId: 'worker_test' });
    expect(dependencies.updateSessionState).toHaveBeenCalledWith('session_1', 'failed', 'failed');
    expect(dependencies.addEvent).toHaveBeenCalledWith(
      'session_1',
      'failed',
      'Research run failed.',
      { error: persistedError },
      { runId: 'run_1', eventType: 'error', severity: 'error', actor: 'worker' },
    );
    expect(dependencies.createPostMortem).toHaveBeenCalledWith('session_1', 'run_1', persistedError, 'research');
    expect(dependencies.saveRunSummaryMemory).toHaveBeenCalledWith(
      'user_1',
      'session_1',
      'run_1',
      expect.objectContaining({ status: 'failed', error: persistedError, workerId: 'worker_test' }),
    );
    expect(dependencies.clearInterval).toHaveBeenCalledWith(intervalHandle);
  });

  it('supports health-check once mode without claiming work', async () => {
    const { startWorker } = await import('@/worker/research-worker-runtime');

    await startWorker({ ...baseConfig, once: true, processOnce: false }, dependencies);

    expect(dependencies.initTelemetry).toHaveBeenCalled();
    expect(dependencies.logger.info).toHaveBeenCalledWith({ workerId: 'worker_test' }, 'research worker one-shot health check complete');
    expect(dependencies.claimNextQueuedRun).not.toHaveBeenCalled();
  });

  it('honors process-once loop mode for restart-safe worker checks', async () => {
    const { workerLoop } = await import('@/worker/research-worker-runtime');

    await workerLoop({ ...baseConfig, processOnce: true }, dependencies);

    expect(dependencies.claimNextQueuedRun).toHaveBeenCalledTimes(1);
    expect(dependencies.sleep).not.toHaveBeenCalled();
  });
});
