const mode = (process.argv[2] ?? process.env.CONTAINER_HEALTHCHECK ?? 'web').trim().toLowerCase();

const port = process.env.PORT ?? '3000';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);

try {
  if (mode === 'worker') {
    checkWorkerConfig(process.env);
    checkSupabaseConfig(process.env);
    process.exit(0);
  }

  const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true || payload?.service !== 'fin-the-finder') {
    throw new Error('health endpoint returned an unhealthy payload');
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'container healthcheck failed');
  process.exit(1);
} finally {
  clearTimeout(timeout);
}

function checkWorkerConfig(env) {
  const leaseMs = readPositiveIntegerEnv(env.WORKER_LEASE_MS, 10 * 60 * 1000, 'WORKER_LEASE_MS');
  const heartbeatMs = readPositiveIntegerEnv(env.WORKER_HEARTBEAT_MS, Math.max(1, Math.floor(leaseMs / 3)), 'WORKER_HEARTBEAT_MS');
  readPositiveIntegerEnv(env.WORKER_POLL_MS, 5000, 'WORKER_POLL_MS');

  if (!String(env.WORKER_ID ?? `worker-${process.pid}`).trim()) {
    throw new Error('WORKER_ID must be a non-empty string.');
  }
  if (heartbeatMs > Math.floor(leaseMs / 2)) {
    throw new Error('WORKER_HEARTBEAT_MS must be no more than half of WORKER_LEASE_MS.');
  }
}

function checkSupabaseConfig(env) {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!String(env[name] ?? '').trim()) {
      throw new Error(`Worker healthcheck requires ${name}.`);
    }
  }
}

function readPositiveIntegerEnv(value, fallback, name) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
