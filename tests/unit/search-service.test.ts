import { beforeEach, describe, expect, it, vi } from 'vitest';

const exaHarness = vi.hoisted(() => ({
  env: { EXA_API_KEY: '' },
  search: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  env: exaHarness.env,
}));

vi.mock('exa-js', () => ({
  default: vi.fn(function MockExa(apiKey: string) {
    exaHarness.constructor(apiKey);
    return { search: exaHarness.search };
  }),
}));

describe('search service', () => {
  beforeEach(() => {
    vi.useRealTimers();
    exaHarness.env.EXA_API_KEY = '';
    exaHarness.search.mockReset();
    exaHarness.constructor.mockReset();
  });

  it('fails closed when Exa is not configured', async () => {
    const { searchWeb, SearchProviderError } = await import('@/server/research/search-service');

    await expect(searchWeb('agent research')).rejects.toMatchObject({
      reason: 'missing_key',
    });
    await expect(searchWeb('agent research')).rejects.toBeInstanceOf(SearchProviderError);
    expect(exaHarness.constructor).not.toHaveBeenCalled();
  });

  it('maps Exa results into canonical typed source records and filters duplicates', async () => {
    exaHarness.env.EXA_API_KEY = 'exa_test_key';
    exaHarness.search.mockResolvedValue({
      results: [
        {
          url: 'https://www.example.com/path/?utm_source=newsletter#section',
          title: 'Primary Source',
          summary: 'Short summary',
          text: 'Full source text',
          publishedDate: '2026-06-20',
        },
        {
          url: 'https://example.com/path',
          title: 'Duplicate Source',
          summary: 'Duplicate summary',
          text: 'Duplicate text',
          publishedDate: '2026-06-21',
        },
        {
          url: 'https://other.example/report',
          title: '',
          summary: '',
          text: 'Fallback snippet from full text.',
          publishedDate: null,
        },
        {
          url: '',
          title: 'Missing URL',
          summary: 'Ignored',
          text: 'Ignored',
          publishedDate: null,
        },
      ],
    });
    const { searchWeb } = await import('@/server/research/search-service');

    const sources = await searchWeb('agent research', { numResults: 3, timeoutMs: 5000 });

    expect(exaHarness.constructor).toHaveBeenCalledWith('exa_test_key');
    expect(exaHarness.search).toHaveBeenCalledWith(
      'agent research',
      expect.objectContaining({
        numResults: 3,
        contents: expect.objectContaining({
          summary: true,
          livecrawl: 'always',
        }),
      }),
    );
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: 'https://example.com/path',
        content: 'Full source text',
        credibility: 'unknown',
        domain: 'example.com',
        publishedAt: '2026-06-20',
        score: 1,
        snippet: 'Short summary',
        title: 'Primary Source',
        url: 'https://www.example.com/path/?utm_source=newsletter#section',
      }),
    );
    expect(sources[0]?.id).toMatch(/^src_/);
    expect(sources[0]?.relevanceReason).toContain('agent research');
    expect(sources[1]).toEqual(
      expect.objectContaining({
        canonicalUrl: 'https://other.example/report',
        domain: 'other.example',
        publishedAt: null,
        score: 0.84,
        snippet: 'Fallback snippet from full text.',
        title: 'other.example',
      }),
    );
  });

  it('wraps provider failures with a typed provider error', async () => {
    exaHarness.env.EXA_API_KEY = 'exa_test_key';
    exaHarness.search.mockRejectedValue(new Error('upstream unavailable'));
    const { searchWeb } = await import('@/server/research/search-service');

    await expect(searchWeb('agent research')).rejects.toMatchObject({
      message: 'upstream unavailable',
      reason: 'provider_error',
    });
  });

  it('times out slow provider calls with a typed timeout error', async () => {
    vi.useFakeTimers();
    exaHarness.env.EXA_API_KEY = 'exa_test_key';
    exaHarness.search.mockReturnValue(new Promise(() => undefined));
    const { searchWeb } = await import('@/server/research/search-service');

    const pending = searchWeb('agent research', { timeoutMs: 25 });
    const assertion = expect(pending).rejects.toMatchObject({
      message: 'Exa search timed out.',
      reason: 'timeout',
    });

    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    vi.useRealTimers();
  });
});
