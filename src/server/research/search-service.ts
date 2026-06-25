import Exa from 'exa-js';
import { env } from '@/lib/config';
import { nowIso } from '@/lib/utils';
import type { ResearchSource } from '@/lib/schemas';
import { canonicalizeUrl, domainFromUrl } from './canonical-url';

type SearchOptions = {
  numResults?: number;
  timeoutMs?: number;
};

export class SearchProviderError extends Error {
  constructor(message: string, readonly reason: 'missing_key' | 'timeout' | 'provider_error') {
    super(message);
  }
}

export async function searchWeb(query: string, options: SearchOptions = {}): Promise<ResearchSource[]> {
  if (!env.EXA_API_KEY) {
    throw new SearchProviderError('EXA_API_KEY is not configured.', 'missing_key');
  }

  const exa = new Exa(env.EXA_API_KEY);
  const timeoutMs = options.timeoutMs ?? 20000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new SearchProviderError('Exa search timed out.', 'timeout')), timeoutMs);
  });

  try {
    const response = await Promise.race([
      exa.search(query, {
        numResults: options.numResults ?? 6,
        contents: {
          text: {
            maxCharacters: 10000,
          },
          summary: true,
          livecrawl: 'always',
        },
      }),
      timeout,
    ]);

    const seen = new Set<string>();
    return response.results.flatMap((result, index) => {
      if (!result.url) return [];

      const canonicalUrl = canonicalizeUrl(result.url);
      if (seen.has(canonicalUrl)) return [];
      seen.add(canonicalUrl);

      return [
        {
          id: `src_${Buffer.from(canonicalUrl).toString('base64url').slice(0, 18)}`,
          title: result.title || domainFromUrl(result.url),
          url: result.url,
          canonicalUrl,
          domain: domainFromUrl(result.url),
          snippet: result.summary || result.text.slice(0, 400) || '',
          content: result.text || '',
          publishedAt: result.publishedDate || null,
          score: Math.max(0, 1 - index * 0.08),
          credibility: 'unknown',
          relevanceReason: `Retrieved by Exa for "${query}" at ${nowIso()}.`,
        } satisfies ResearchSource,
      ];
    });
  } catch (error) {
    if (error instanceof SearchProviderError) throw error;
    throw new SearchProviderError(error instanceof Error ? error.message : 'Exa search failed.', 'provider_error');
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
