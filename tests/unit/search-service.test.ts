import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  env: {
    EXA_API_KEY: '',
  },
}));

describe('search service', () => {
  it('fails closed when Exa is not configured', async () => {
    const { searchWeb, SearchProviderError } = await import('@/server/research/search-service');
    await expect(searchWeb('agent research')).rejects.toBeInstanceOf(SearchProviderError);
  });
});
