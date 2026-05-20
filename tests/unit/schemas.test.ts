import { describe, expect, it } from 'vitest';
import { createResearchSessionSchema, researchPacketSchema } from '@/lib/schemas';

describe('research schemas', () => {
  it('accepts a valid research session request', () => {
    expect(createResearchSessionSchema.parse({ query: 'Research agentic AI evaluation systems' })).toEqual({
      query: 'Research agentic AI evaluation systems',
    });
  });

  it('rejects empty research requests', () => {
    expect(() => createResearchSessionSchema.parse({ query: '  ' })).toThrow();
  });

  it('requires typed research packets', () => {
    expect(() =>
      researchPacketSchema.parse({
        queries: ['agent evals'],
        searchResults: [],
        evaluations: [],
        learnings: [],
        completedQueries: [],
        phase: 'complete',
      }),
    ).not.toThrow();
  });
});
