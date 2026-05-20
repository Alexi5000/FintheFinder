import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchWeb } from '@/server/research/search-service';
import { sourceSchema } from '@/lib/schemas';
import { logger } from '@/server/logger';

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for information on a specific query and return normalized source records.',
  inputSchema: z.object({
    query: z.string().min(3).describe('The search query to run'),
    numResults: z.number().int().min(1).max(10).optional(),
  }),
  outputSchema: z.object({
    results: z.array(sourceSchema),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      const results = await searchWeb(inputData.query, { numResults: inputData.numResults ?? 6 });
      return { results };
    } catch (error) {
      logger.warn({ error }, 'web search failed');
      return {
        results: [],
        error: error instanceof Error ? error.message : 'Unknown search failure',
      };
    }
  },
});
