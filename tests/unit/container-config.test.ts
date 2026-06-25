import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function runWorkerHealthcheck(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ['scripts/container-healthcheck.mjs', 'worker'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      WORKER_HEARTBEAT_MS: '',
      WORKER_ID: '',
      WORKER_LEASE_MS: '',
      WORKER_POLL_MS: '',
      ...env,
    },
    encoding: 'utf8',
  });
}

const validWorkerHealthEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon_key',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_key',
  WORKER_HEARTBEAT_MS: '60000',
  WORKER_ID: 'worker_healthcheck',
  WORKER_LEASE_MS: '600000',
  WORKER_POLL_MS: '5000',
};

describe('container runtime configuration', () => {
  it('runs the production image as a non-root user with a web healthcheck', () => {
    const dockerfile = readRepoFile('Dockerfile');

    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "scripts/container-healthcheck.mjs"]');
    expect(dockerfile).toContain('CMD ["npm", "run", "start"]');
  });

  it('configures compose healthchecks and restart policies for web and worker services', () => {
    const compose = readRepoFile('docker-compose.yml');

    expect(compose).toMatch(/web:[\s\S]*restart: unless-stopped[\s\S]*CONTAINER_HEALTHCHECK: web[\s\S]*healthcheck:/);
    expect(compose).toMatch(/web:[\s\S]*test: \["CMD", "node", "scripts\/container-healthcheck\.mjs"\]/);
    expect(compose).toMatch(/worker:[\s\S]*restart: unless-stopped[\s\S]*CONTAINER_HEALTHCHECK: worker[\s\S]*healthcheck:/);
    expect(compose).toMatch(/worker:[\s\S]*test: \["CMD", "node", "scripts\/container-healthcheck\.mjs", "worker"\]/);
  });

  it('passes runtime public Supabase config from server pages into browser clients', () => {
    const homePage = readRepoFile('src/app/page.tsx');
    const sessionsPage = readRepoFile('src/app/sessions/page.tsx');
    const sessionDetailPage = readRepoFile('src/app/sessions/[id]/page.tsx');
    const reportPage = readRepoFile('src/app/reports/[id]/page.tsx');
    const browserClient = readRepoFile('src/lib/supabase-browser.ts');

    for (const page of [homePage, sessionsPage, sessionDetailPage, reportPage]) {
      expect(page).toContain('getSupabaseBrowserConfig');
      expect(page).toContain('supabaseConfig=');
    }
    expect(browserClient).toContain('config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL');
    expect(browserClient).toContain('config?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('validates worker healthcheck configuration without claiming work', () => {
    const result = runWorkerHealthcheck(validWorkerHealthEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('fails worker healthcheck on unsafe worker timing', () => {
    const result = runWorkerHealthcheck({ ...validWorkerHealthEnv, WORKER_LEASE_MS: '1000', WORKER_HEARTBEAT_MS: '800' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('WORKER_HEARTBEAT_MS must be no more than half of WORKER_LEASE_MS.');
  });

  it('fails worker healthcheck when Supabase service-role configuration is absent', () => {
    const result = runWorkerHealthcheck({ ...validWorkerHealthEnv, SUPABASE_SERVICE_ROLE_KEY: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Worker healthcheck requires SUPABASE_SERVICE_ROLE_KEY.');
  });
});
