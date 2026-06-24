import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { readWorkerConfig, startWorker, type WorkerDependencies } from './research-worker-runtime';

export * from './research-worker-runtime';

export const defaultWorkerDependencies: WorkerDependencies = {
  addEvent,
  claimNextQueuedRun,
  clearInterval,
  createPostMortem,
  getProviderStatus,
  getSessionById,
  hasSupabaseConfig,
  heartbeatResearchRun,
  initTelemetry,
  logger,
  newCorrelationId,
  runApprovedReportSession,
  runResearchSession,
  saveRunSummaryMemory,
  setInterval,
  sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  updateRunStatus,
  updateSessionState,
  withSpan,
};

function isMainModule() {
  return Boolean(process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase());
}

if (isMainModule()) {
  startWorker(readWorkerConfig(), defaultWorkerDependencies).catch((error) => {
    logger.error({ error }, 'research worker crashed');
    process.exit(1);
  });
}
