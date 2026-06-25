import { afterEach, describe, expect, it, vi } from 'vitest';

describe('rate limit buckets', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/lib/config');
  });

  it('rejects requests after the per-key window budget is exhausted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const { checkRateLimit } = await loadRateLimit({ max: 2, windowMs: 1000 });

    expect(checkRateLimit('run:user_1')).toEqual({ ok: true, remaining: 1 });
    expect(checkRateLimit('run:user_1')).toEqual({ ok: true, remaining: 0, resetAt: Date.parse('2026-06-24T00:00:01.000Z') });
    expect(checkRateLimit('run:user_1')).toEqual({ ok: false, remaining: 0, resetAt: Date.parse('2026-06-24T00:00:01.000Z') });
  });

  it('isolates buckets by key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const { checkRateLimit } = await loadRateLimit({ max: 1, windowMs: 1000 });

    expect(checkRateLimit('run:user_1').ok).toBe(true);
    expect(checkRateLimit('run:user_1').ok).toBe(false);
    expect(checkRateLimit('run:user_2')).toEqual({ ok: true, remaining: 0 });
  });

  it('resets a key after the window expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const { checkRateLimit } = await loadRateLimit({ max: 1, windowMs: 1000 });

    expect(checkRateLimit('create:user_1').ok).toBe(true);
    expect(checkRateLimit('create:user_1').ok).toBe(false);

    vi.setSystemTime(new Date('2026-06-24T00:00:01.001Z'));
    expect(checkRateLimit('create:user_1')).toEqual({ ok: true, remaining: 0 });
  });
});

async function loadRateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  vi.resetModules();
  vi.doMock('@/lib/config', () => ({
    env: {
      RATE_LIMIT_MAX: max,
      RATE_LIMIT_WINDOW_MS: windowMs,
    },
  }));
  return import('@/server/rate-limit');
}
