import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

const servers: Server[] = [];

describe('smoke script hosted health validation', () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it('accepts the non-secret health contract shape', async () => {
    const url = await startHealthServer({
      ok: true,
      service: 'fin-the-finder',
      version: '1.0.0',
      providers: { openai: 'missing', exa: 'configured', supabase: 'missing' },
      contracts: { version: 1 },
    });

    const result = await runSmoke(url);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"hosted health"');
  });

  it('rejects health payloads that expose provider secrets', async () => {
    const url = await startHealthServer({
      ok: true,
      service: 'fin-the-finder',
      providers: { openai: 'sk-test-secret-key', exa: 'configured', supabase: 'missing' },
      contracts: { version: 1 },
    });

    const result = await runSmoke(url);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('provider openai must be configured or missing');
    expect(result.stderr).toContain('health payload must not expose OpenAI-style keys');
  });
});

function runSmoke(url: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, SMOKE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function startHealthServer(payload: unknown) {
  const server = createServer((request, response) => {
    if (request.url !== '/api/health') {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
