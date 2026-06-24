import { getProviderStatus } from '@/lib/config';
import { logger } from '@/server/logger';
import { runApprovedReportSession, runResearchSession } from '@/server/research/pipeline';
import { addEvent, claimNextQueuedRun, createPostMortem, getSessionById, updateRunStatus, updateSessionState } from '@/server/research/repository';
import { hasSupabaseConfig } from '@/server/supabase/server';

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 5000);
const leaseMs = Number(process.env.WORKER_LEASE_MS ?? 10 * 60 * 1000);
const once = process.env.WORKER_ONCE === '1';
const processOnce = process.env.WORKER_PROCESS_ONCE === '1';
const status = getProviderStatus();

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
  await updateRunStatus(run.id, 'running');
  await addEvent(session.id, session.phase, 'Worker claimed research run.', { stage: run.metadata.stage ?? 'research' }, { runId: run.id, eventType: 'state_transition', actor: 'worker' });

  try {
    const stage = run.metadata.stage === 'reporting' ? 'reporting' : 'research';
    const result =
      stage === 'reporting'
        ? await runApprovedReportSession(session.id, session.query, { run })
        : await runResearchSession(session.id, session.query, { run });

    if (result.status === 'awaiting_approval') {
      await updateRunStatus(run.id, 'awaiting_approval');
    } else {
      await updateRunStatus(run.id, 'completed');
    }
    logger.info({ workerId, runId: run.id, status: result.status }, 'research run processed');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown research worker failure';
    logger.error({ workerId, runId: run.id, error: message }, 'research run failed');
    await updateRunStatus(run.id, 'failed', { error: message });
    await updateSessionState(session.id, 'failed', 'failed');
    await addEvent(session.id, 'failed', 'Research run failed.', { error: message }, { runId: run.id, eventType: 'error', severity: 'error', actor: 'worker' });
    await createPostMortem(session.id, run.id, message, String(run.metadata.stage ?? 'research'));
    return true;
  }
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
