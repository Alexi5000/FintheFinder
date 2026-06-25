import { describe, expect, it } from 'vitest';

describe('logger redaction', () => {
  it('redacts nested credentials, prompts, queries, and secret-like error messages', async () => {
    const chunks: string[] = [];
    const { createLogger } = await import('@/server/logger');
    const logger = createLogger({
      write(chunk: string) {
        chunks.push(chunk);
      },
    });

    logger.warn(
      {
        authorization: 'Bearer live-secret-token',
        request: {
          token: 'session-token-123',
          apiKey: 'sk-test-secret-key',
          prompt: 'private analyst prompt',
          query: 'private analyst query',
        },
        error: new Error('provider failed with sk-test-secret-key token=session-token-123'),
      },
      'request failed with authorization=Bearer live-secret-token',
    );

    const output = chunks.join('');
    expect(output).toContain('[redacted]');
    expect(output).not.toContain('live-secret-token');
    expect(output).not.toContain('session-token-123');
    expect(output).not.toContain('sk-test-secret-key');
    expect(output).not.toContain('private analyst prompt');
    expect(output).not.toContain('private analyst query');
  });

  it('handles circular payloads without leaking raw nested secrets', async () => {
    const { redactLogValue } = await import('@/server/logger');
    const payload: Record<string, unknown> = { token: 'session-token-123' };
    payload.self = payload;

    expect(redactLogValue(payload)).toEqual({ token: '[redacted]', self: '[circular]' });
  });
});
