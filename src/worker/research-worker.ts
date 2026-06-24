import { getProviderStatus } from '@/lib/config';
import { logger } from '@/server/logger';
import { runApprovedReportSession, runResearchSession } from '@/server/research/pipeline';
import {
  addEvent,
  claimNextQueuedRun,
  createPostMortem,
  getSessionById,
  heartbeatResearchRun,
  saveRunSummaryMemory,
  updateRunStatus,
  updateSessionState,
} from '@/server/research/repository';
import { hasSupabaseConfig } from '@/server/supabase/server';
import { initTelemetry, newCorrelationId, withSpan } from '@/server/telemetry';

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 5000);
const leaseMs = Number(process.env.WORKER_LEASE_MS ?? 10 * 60 * 1000);
const heartbeatMs = Number(process.env.WORKER_HEARTBEAT_MS ?? Math.max(30000, Math.floor(leaseMs / 3)));
const once = process.env.WORKER_ONCE === '1';
const processOnce = process.env.WORKER_PROCESS_ONCE === '1';
const status = getProviderStatus();
initTelemetry();

logger.info(
  {
    workerId,
    pollMs,
    leaseMs,
    providers: {
      openai: status.openai,
      exa: status.exa,
      supabase: status.supabase,
    },
  },
  'research worker booted',
);

if (once && !processOnce) {
  logger.info({ workerId }, 'research worker one-shot health check complete');
  process.exit(0);
}

async function processNextRun() {
  if (!hasSupabaseConfig()) {
    logger.warn({ workerId }, 'supabase is not configured; worker cannot claim research runs');
    return false;
  }

  const run = await claimNextQueuedRun(workerId, leaseMs);
  if (!run) return false;

  const session = await getSessionById(run.sessionId);
  const correlationId = newCorrelationId('run');

  return withSpan(
    'research.worker.process_run',
    {
      'research.run_id': run.id,
      'research.session_id': session.id,
      'research.stage': String(run.metadata.stage ?? 'research'),
      'worker.id': workerId,
    },
    async () => {
      let heartbeat: NodeJS.Timeout | undefined;
      await updateRunStatus(run.id, 'running', { workerId });
      await addEvent(
        session.id,
        session.phase,
        'Worker claimed research run.',
        { stage: run.metadata.stage ?? 'research' },
        { runId: run.id, eventType: 'state_transition', actor: 'worker', correlationId },
      );

      try {
        heartbeat = setInterval(() => {
          void heartbeatResearchRun(run.id, workerId, leaseMs).catch((error) => {
            logger.warn({ workerId, runId: run.id, error: error instanceof Error ? error.message : String(error) }, 'research run heartbeat failed');
          });
        }, heartbeatMs);
        heartbeat.unref();

        const stage = run.metadata.stage === 'reporting' ? 'reporting' : 'research';
        const result =
          stage === 'reporting'
            ? await runApprovedReportSession(session.id, session.query, { run, correlationId })
            : await runResearchSession(session.id, session.query, { run, correlationId });

        if (result.status === 'awaiting_approval') {
          await updateRunStatus(run.id, 'awaiting_approval', { workerId });
        } else {
          await updateRunStatus(run.id, 'completed', { workerId });
        }
        await saveRunSummaryMemory(session.userId, session.id, run.id, {
          runId: run.id,
          stage,
          status: result.status,
          workerId,
          completedAt: new Date().toISOString(),
        });
        logger.info({ workerId, runId: run.id, status: result.status }, 'research run processed');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown research worker failure';
        logger.error({ workerId, runId: run.id, error: message }, 'research run failed');
        await updateRunStatus(run.id, 'failed', { error: message, workerId });
        await updateSessionState(session.id, 'failed', 'failed');
        await addEvent(session.id, 'failed', 'Research run failed.', { error: message }, { runId: run.id, eventType: 'error', severity: 'error', actor: 'worker' });
        await createPostMortem(session.id, run.id, message, String(run.metadata.stage ?? 'research'));
        await saveRunSummaryMemory(session.userId, session.id, run.id, {
          runId: run.id,
          stage: String(run.metadata.stage ?? 'research'),
          status: 'failed',
          workerId,
          failedAt: new Date().toISOString(),
          error: message,
        });
        return true;
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }
    },
  );
}

async function loop() {
  do {
    await processNextRun();
    if (processOnce) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (true);
}

loop().catch((error) => {
  logger.error({ error }, 'research worker crashed');
  process.exit(1);
});
