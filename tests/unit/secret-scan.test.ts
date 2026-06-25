import { describe, expect, it } from 'vitest';
import { formatSecretFindings, scanForSecretLikeContent } from '@/lib/secret-scan';

describe('secret-like content scanner', () => {
  it('detects secret-like keys and token-shaped values', () => {
    const findings = scanForSecretLikeContent({
      api_key: 'sk-test_1234567890abcdef1234567890',
      note: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
    });

    expect(findings.map((finding) => finding.reason)).toEqual(expect.arrayContaining(['secret-like key "api_key" is not allowed', 'OpenAI-style API key', 'bearer token']));
    expect(formatSecretFindings(findings)).toContain('api_key');
  });

  it('allows operational token-count metadata that is not a credential', () => {
    expect(scanForSecretLikeContent({ usage: { totalTokens: 1200, model: 'gpt-5.5' } })).toEqual([]);
  });

  it('detects camelCase credential keys without blocking token counters', () => {
    const findings = scanForSecretLikeContent({
      provider: { refreshToken: 'stored refresh material' },
      usage: { totalTokens: 1200 },
    });

    expect(findings.map((finding) => finding.reason)).toEqual(['secret-like key "refreshToken" is not allowed']);
  });
});
