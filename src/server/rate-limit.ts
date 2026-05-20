import { env } from '@/lib/config';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + env.RATE_LIMIT_WINDOW_MS });
    return { ok: true, remaining: env.RATE_LIMIT_MAX - 1 };
  }

  if (existing.count >= env.RATE_LIMIT_MAX) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { ok: true, remaining: env.RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}
