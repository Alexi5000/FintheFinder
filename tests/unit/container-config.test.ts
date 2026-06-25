import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

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
});
