import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sourceEvaluationSchema, sourceSchema } from '@/lib/schemas';
import { logger } from '@/server/logger';

export const evaluateResultTool = createTool({
  id: 'evaluate-result',
  description: 'Evaluate if a search result is relevant to the research query.',
  inputSchema: z.object({
    query: z.string().describe('The original research query'),
    result: sourceSchema.describe('The search result to evaluate'),
    existingUrls: z.array(z.string()).describe('URLs that have already been processed').optional(),
  }),
  outputSchema: sourceEvaluationSchema,
  execute: async (inputData, context) => {
    try {
      const { query, result, existingUrls = [] } = inputData;

      if (existingUrls.includes(result.canonicalUrl) || existingUrls.includes(result.url)) {
        return sourceEvaluationSchema.parse({
          sourceId: result.id,
          isRelevant: false,
          score: 0,
          credibility: 'unknown',
          reason: 'URL already processed',
          risks: ['duplicate_url'],
        });
      }

      const evaluationAgent = context.mastra?.getAgent('evaluationAgent');
      if (!evaluationAgent) {
        throw new Error('evaluationAgent is not registered in Mastra.');
      }

      const response = await evaluationAgent.generate(
        [
          {
            role: 'user',
            content: `Evaluate whether this source helps answer the query: "${query}".

Source:
Title: ${result.title}
URL: ${result.url}
Content snippet: ${(result.content ?? '').slice(0, 1200)}

Return a strict JSON-compatible object with sourceId, isRelevant, score from 0 to 1, credibility, reason, and risks.`,
          },
        ],
        {
          structuredOutput: { schema: sourceEvaluationSchema },
        },
      );

      return response.object;
    } catch (error) {
      logger.warn({ error }, 'source evaluation failed');
      return sourceEvaluationSchema.parse({
        sourceId: inputData.result.id,
        isRelevant: false,
        score: 0,
        credibility: 'unknown',
        reason: 'Error in evaluation',
        risks: ['evaluation_error'],
      });
    }
  },
});
