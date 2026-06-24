import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/research/evals/route';

describe('eval API', () => {
  it('returns the offline eval regression summary', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mode).toBe('offline');
    expect(payload.passed).toBe(true);
    expect(payload.total).toBeGreaterThanOrEqual(3);
  });
});
