import type { ResearchMemory, ResearchPhase, ResearchRun, ResearchRunEvent, ResearchSession, ResearchStatus, RunStatus } from '@/lib/schemas';

type PipelineStageResult = {
  status: 'awaiting_approval' | 'completed';
};

type ProviderStatus = {
  openai: boolean;
  exa: boolean;
  supabase: boolean;
  models?: Record<string, unknown>;
};

type WorkerLogMethod = (metadata: Record<string, unknown>, message: string) => void;
type WorkerTimer = ReturnType<typeof setInterval>;

type EventOptions = Partial<
  Pick<ResearchRunEvent, 'runId' | 'attemptId' | 'eventType' | 'severity' | 'actor' | 'stepId' | 'durationMs' | 'traceId' | 'correlationId'>
>;

export type WorkerConfig = {
  heartbeatMs: number;
  leaseMs: number;
  once: boolean;
  pollMs: number;
  processOnce: boolean;
  workerId: string;
};

export type WorkerDependencies = {
  addEvent: (sessionId: string, phase: ResearchPhase, message: string, metadata?: Record<string, unknown>, options?: EventOptions) => Promise<unknown>;
  claimNextQueuedRun: (workerId: string, leaseMs: number) => Promise<ResearchRun | null>;
  clearInterval: (timer: WorkerTimer) => void;
  createPostMortem: (sessionId: string, runId: string | undefined, rootCause: string, affectedStep?: string) => Promise<unknown>;
  getProviderStatus: () => ProviderStatus;
  getSessionById: (sessionId: string) => Promise<ResearchSession>;
  hasSupabaseConfig: () => boolean;
  heartbeatResearchRun: (runId: string, workerId: string, leaseMs: number) => Promise<ResearchRun | null>;
  initTelemetry: () => void;
  logger: {
    error: WorkerLogMethod;
    info: WorkerLogMethod;
    warn: WorkerLogMethod;
  };
  newCorrelationId: (prefix?: string) => string;
  runApprovedReportSession: (sessionId: string, query: string, options: { run: ResearchRun; correlationId: string }) => Promise<PipelineStageResult>;
  runResearchSession: (sessionId: string, query: string, options: { run: ResearchRun; correlationId: string }) => Promise<PipelineStageResult>;
  saveRunSummaryMemory: (userId: string, sessionId: string, runId: string, value: Record<string, unknown>) => Promise<ResearchMemory>;
  setInterval: (handler: () => void, timeout: number) => WorkerTimer;
  sleep: (ms: number) => Promise<void>;
  updateRunStatus: (
    runId: string,
    status: RunStatus,
    updates?: { error?: string | null; startedAt?: string | null; completedAt?: string | null; workerId?: string },
  ) => Promise<ResearchRun>;
  updateSessionState: (sessionId: string, status: ResearchStatus, phase: ResearchPhase) => Promise<unknown>;
  withSpan: <T>(name: string, attributes: Record<string, string | number | boolean>, callback: () => Promise<T>) => Promise<T>;
};

type LeaseState = {
  lost: boolean;
};

class WorkerLeaseLostError extends Error {
  constructor(runId: string, workerId: string) {
    super(`Worker ${workerId} lost the lease for run ${runId}.`);
    this.name = 'WorkerLeaseLostError';
  }
}

export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env, pid = process.pid): WorkerConfig {
  const leaseMs = readPositiveIntegerEnv(env.WORKER_LEASE_MS, 10 * 60 * 1000, 'WORKER_LEASE_MS');
  const heartbeatMs = readPositiveIntegerEnv(env.WORKER_HEARTBEAT_MS, Math.max(1, Math.floor(leaseMs / 3)), 'WORKER_HEARTBEAT_MS');
  const pollMs = readPositiveIntegerEnv(env.WORKER_POLL_MS, 5000, 'WORKER_POLL_MS');
  const workerId = (env.WORKER_ID ?? `worker-${pid}`).trim();

  if (!workerId) throw new Error('WORKER_ID must be a non-empty string.');
  if (heartbeatMs > Math.floor(leaseMs / 2)) {
    throw new Error('WORKER_HEARTBEAT_MS must be no more than half of WORKER_LEASE_MS.');
  }

  return {
    heartbeatMs,
    leaseMs,
    once: env.WORKER_ONCE === '1',
    pollMs,
    processOnce: env.WORKER_PROCESS_ONCE === '1',
    workerId,
  };
}

export function logWorkerBoot(config: WorkerConfig, dependencies: WorkerDependencies) {
  const status = dependencies.getProviderStatus();
  dependencies.logger.info(
    {
      workerId: config.workerId,
      pollMs: config.pollMs,
      leaseMs: config.leaseMs,
      heartbeatMs: config.heartbeatMs,
      providers: {
        openai: status.openai,
        exa: status.exa,
        supabase: status.supabase,
      },
    },
    'research worker booted',
  );
}

export async function processNextRun(config: WorkerConfig, dependencies: WorkerDependencies) {
  if (!dependencies.hasSupabaseConfig()) {
    dependencies.logger.warn({ workerId: config.workerId }, 'supabase is not configured; worker cannot claim research runs');
    return false;
  }

  const run = await dependencies.claimNextQueuedRun(config.workerId, config.leaseMs);
  if (!run) return false;

  const session = await dependencies.getSessionById(run.sessionId);
  const correlationId = dependencies.newCorrelationId('run');

  return dependencies.withSpan(
    'research.worker.process_run',
    {
      'research.run_id': run.id,
      'research.session_id': session.id,
      'research.stage': String(run.metadata.stage ?? 'research'),
      'worker.id': config.workerId,
    },
    async () => processClaimedRun(run, session, correlationId, config, dependencies),
  );
}

export async function workerLoop(config: WorkerConfig, dependencies: WorkerDependencies) {
  do {
    await processNextRun(config, dependencies);
    if (config.processOnce) break;
    await dependencies.sleep(config.pollMs);
  } while (true);
}

export async function startWorker(config: WorkerConfig, dependencies: WorkerDependencies) {
  dependencies.initTelemetry();
  logWorkerBoot(config, dependencies);

  if (config.once && !config.processOnce) {
    dependencies.logger.info({ workerId: config.workerId }, 'research worker one-shot health check complete');
    return;
  }

  await workerLoop(config, dependencies);
}

async function processClaimedRun(
  run: ResearchRun,
  session: ResearchSession,
  correlationId: string,
  config: WorkerConfig,
  dependencies: WorkerDependencies,
) {
  let heartbeat: WorkerTimer | undefined;
  const leaseState: LeaseState = { lost: false };

  try {
    await dependencies.updateRunStatus(run.id, 'running', { workerId: config.workerId });
    await dependencies.addEvent(
      session.id,
      session.phase,
      'Worker claimed research run.',
      { stage: run.metadata.stage ?? 'research' },
      { runId: run.id, eventType: 'state_transition', actor: 'worker', correlationId },
    );

    heartbeat = dependencies.setInterval(() => {
      void dependencies
        .heartbeatResearchRun(run.id, config.workerId, config.leaseMs)
        .then((extended) => {
          if (extended) return;
          markLeaseLost(run, config, leaseState, dependencies);
          if (heartbeat) dependencies.clearInterval(heartbeat);
        })
        .catch((error) => {
          dependencies.logger.warn(
            { workerId: config.workerId, runId: run.id, errorType: error instanceof Error ? error.name : typeof error },
            'research run heartbeat failed',
          );
        });
    }, config.heartbeatMs);
    heartbeat.unref?.();

    const stage = stageForRun(run);
    const result =
      stage === 'reporting'
        ? await dependencies.runApprovedReportSession(session.id, session.query, { run, correlationId })
        : await dependencies.runResearchSession(session.id, session.query, { run, correlationId });

    if (!(await proveLeaseOwnership(run, config, leaseState, dependencies))) return false;

    if (result.status === 'awaiting_approval') {
      await dependencies.updateRunStatus(run.id, 'awaiting_approval', { workerId: config.workerId });
    } else {
      await dependencies.updateRunStatus(run.id, 'completed', { workerId: config.workerId });
    }
    await saveRunSummaryMemorySafely(session, run, dependencies, {
      runId: run.id,
      stage,
      status: result.status,
      workerId: config.workerId,
      completedAt: new Date().toISOString(),
    });
    dependencies.logger.info({ workerId: config.workerId, runId: run.id, status: result.status }, 'research run processed');
    return true;
  } catch (error) {
    if (error instanceof WorkerLeaseLostError || leaseState.lost) {
      dependencies.logger.warn({ workerId: config.workerId, runId: run.id }, 'research run stopped after lease ownership was lost');
      return false;
    }

    const persistedMessage = persistedWorkerFailureMessage();
    dependencies.logger.error(
      { workerId: config.workerId, runId: run.id, errorType: error instanceof Error ? error.name : typeof error },
      'research run failed',
    );

    if (!(await proveLeaseOwnership(run, config, leaseState, dependencies))) return false;

    await dependencies.updateRunStatus(run.id, 'failed', { error: persistedMessage, workerId: config.workerId });
    await dependencies.updateSessionState(session.id, 'failed', 'failed');
    await dependencies.addEvent(
      session.id,
      'failed',
      'Research run failed.',
      { error: persistedMessage },
      { runId: run.id, eventType: 'error', severity: 'error', actor: 'worker' },
    );
    await dependencies.createPostMortem(session.id, run.id, persistedMessage, stageForRun(run));
    await saveRunSummaryMemorySafely(session, run, dependencies, {
      runId: run.id,
      stage: stageForRun(run),
      status: 'failed',
      workerId: config.workerId,
      failedAt: new Date().toISOString(),
      error: persistedMessage,
    });
    return true;
  } finally {
    if (heartbeat) dependencies.clearInterval(heartbeat);
  }
}

function readPositiveIntegerEnv(value: string | undefined, fallback: number, name: string) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function stageForRun(run: ResearchRun) {
  return run.metadata.stage === 'reporting' ? 'reporting' : 'research';
}

function persistedWorkerFailureMessage() {
  return 'Research worker failed during pipeline execution. See redacted server logs with the run ID for details.';
}

function markLeaseLost(run: ResearchRun, config: WorkerConfig, leaseState: LeaseState, dependencies: WorkerDependencies) {
  if (leaseState.lost) return;
  leaseState.lost = true;
  dependencies.logger.warn({ workerId: config.workerId, runId: run.id }, 'research run lease ownership was lost');
}

async function proveLeaseOwnership(run: ResearchRun, config: WorkerConfig, leaseState: LeaseState, dependencies: WorkerDependencies) {
  if (leaseState.lost) return false;
  try {
    const extended = await dependencies.heartbeatResearchRun(run.id, config.workerId, config.leaseMs);
    if (extended) return true;
    markLeaseLost(run, config, leaseState, dependencies);
    return false;
  } catch (error) {
    dependencies.logger.warn(
      { workerId: config.workerId, runId: run.id, errorType: error instanceof Error ? error.name : typeof error },
      'could not prove research run lease ownership',
    );
    return false;
  }
}

async function saveRunSummaryMemorySafely(
  session: ResearchSession,
  run: ResearchRun,
  dependencies: WorkerDependencies,
  value: Record<string, unknown>,
) {
  try {
    await dependencies.saveRunSummaryMemory(session.userId, session.id, run.id, value);
  } catch (error) {
    dependencies.logger.warn(
      { userId: session.userId, sessionId: session.id, runId: run.id, errorType: error instanceof Error ? error.name : typeof error },
      'research worker could not persist run summary memory',
    );
  }
}
