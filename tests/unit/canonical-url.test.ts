import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, domainFromUrl } from '@/server/research/canonical-url';

describe('canonical URL helpers', () => {
  it('normalizes tracking parameters and host casing', () => {
    expect(canonicalizeUrl('https://WWW.Example.com/path/?utm_source=x&b=1#frag')).toBe('https://example.com/path?b=1');
  });

  it('extracts normalized domains', () => {
    expect(domainFromUrl('https://www.openai.com/research')).toBe('openai.com');
  });
});
