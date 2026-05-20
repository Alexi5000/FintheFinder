import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { learningSchema, sourceSchema } from '@/lib/schemas';
import { logger } from '@/server/logger';

export const extractLearningsTool = createTool({
  id: 'extract-learnings',
  description: 'Extract key learnings and follow-up questions from a source.',
  inputSchema: z.object({
    query: z.string().describe('The original research query'),
    result: sourceSchema.describe('The search result to process'),
  }),
  outputSchema: learningSchema,
  execute: async (inputData, context) => {
    try {
      const { query, result } = inputData;
      const learningExtractionAgent = context.mastra?.getAgent('learningExtractionAgent');
      if (!learningExtractionAgent) {
        throw new Error('learningExtractionAgent is not registered in Mastra.');
      }

      const response = await learningExtractionAgent.generate(
        [
          {
            role: 'user',
            content: `The user is researching "${query}".

Extract one evidence-backed learning from this source and generate up to three follow-up questions.

Source ID: ${result.id}
Title: ${result.title}
URL: ${result.url}
Content: ${(result.content ?? '').slice(0, 5000)}

Return id, sourceId, claim, evidence, and followUpQuestions.`,
          },
        ],
        {
          structuredOutput: { schema: learningSchema },
        },
      );

      return response.object;
    } catch (error) {
      logger.warn({ error }, 'learning extraction failed');
      return learningSchema.parse({
        id: crypto.randomUUID(),
        sourceId: inputData.result.id,
        claim: 'Learning extraction failed for this source.',
        evidence: 'The system could not safely extract evidence from this source.',
        followUpQuestions: [],
      });
    }
  },
});
