import { beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryHarness = vi.hoisted(() => ({
  activeSpan: undefined as undefined | {
    end: ReturnType<typeof vi.fn>;
    recordException: ReturnType<typeof vi.fn>;
    setAttribute: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@opentelemetry/api', () => ({
  context: {
    active: vi.fn(() => ({})),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
  trace: {
    getSpan: vi.fn(() => undefined),
    getTracer: vi.fn(() => ({
      startActiveSpan: vi.fn((_name: string, _options: unknown, callback: (span: typeof telemetryHarness.activeSpan) => Promise<unknown>) => {
        telemetryHarness.activeSpan = {
          end: vi.fn(),
          recordException: vi.fn(),
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
        };
        return callback(telemetryHarness.activeSpan);
      }),
    })),
  },
}));

vi.mock('@/lib/config', () => ({
  env: {
    OTEL_ENABLED: false,
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_SERVICE_NAME: 'fin-test',
  },
}));

describe('telemetry redaction', () => {
  beforeEach(() => {
    telemetryHarness.activeSpan = undefined;
  });

  it('redacts sensitive span attributes before recording them', async () => {
    const { withSpan } = await import('@/server/telemetry');

    await withSpan(
      'test.span',
      {
        authorization: 'Bearer live-secret-token',
        query: 'confidential research question',
        'research.session_id': 'session_1',
        provider: 'sk-test-secret-key',
      },
      async () => 'ok',
    );

    expect(telemetryHarness.activeSpan?.setAttribute).toHaveBeenCalledWith('authorization', '[redacted]');
    expect(telemetryHarness.activeSpan?.setAttribute).toHaveBeenCalledWith('query', '[redacted]');
    expect(telemetryHarness.activeSpan?.setAttribute).toHaveBeenCalledWith('research.session_id', 'session_1');
    expect(telemetryHarness.activeSpan?.setAttribute).toHaveBeenCalledWith('provider', '[redacted]');
  });

  it('records sanitized exception details and preserves the thrown error', async () => {
    const { withSpan } = await import('@/server/telemetry');
    const original = new Error('provider failed with Bearer live-secret-token sk-test-secret-key confidential report text');

    await expect(withSpan('test.error', {}, async () => {
      throw original;
    })).rejects.toBe(original);

    const recordedError = telemetryHarness.activeSpan?.recordException.mock.calls[0]?.[0] as Error;
    expect(recordedError).toBeInstanceOf(Error);
    expect(recordedError.message).toBe('Unexpected server error.');
    expect(recordedError.message).not.toContain('live-secret-token');
    expect(recordedError.message).not.toContain('sk-test-secret-key');
    expect(recordedError.message).not.toContain('confidential report text');
    expect(telemetryHarness.activeSpan?.setStatus).toHaveBeenCalledWith({ code: 2, message: 'Unexpected server error.' });
    expect(telemetryHarness.activeSpan?.end).toHaveBeenCalled();
  });
});
