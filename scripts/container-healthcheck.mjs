const mode = (process.argv[2] ?? process.env.CONTAINER_HEALTHCHECK ?? 'web').trim().toLowerCase();

if (mode === 'worker') {
  process.exit(0);
}

const port = process.env.PORT ?? '3000';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);

try {
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
