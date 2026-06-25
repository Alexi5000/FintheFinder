import { describe, expect, it } from 'vitest';
import config from '../../vitest.config';

type CoverageConfig = {
  include?: unknown;
  exclude?: unknown;
  thresholds?: unknown;
};

type VitestUserConfig = {
  test?: {
    coverage?: CoverageConfig;
  };
};

describe('coverage gate configuration', () => {
  it('enforces a production baseline over first-party contracts and server code', () => {
    const coverage = (config as VitestUserConfig).test?.coverage;

    expect(coverage?.include).toEqual(['src/lib/**/*.ts', 'src/server/**/*.ts']);
    expect(coverage?.exclude).toContain('src/server/supabase/**');
    expect(coverage?.thresholds).toEqual({
      branches: 55,
      functions: 75,
      lines: 75,
      statements: 70,
    });
  });
});
