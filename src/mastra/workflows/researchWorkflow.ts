import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { researchPacketSchema } from '@/lib/schemas';

const getUserQueryStep = createStep({
  id: 'get-user-query',
  inputSchema: z.object({}),
  outputSchema: z.object({
    query: z.string(),
  }),
  resumeSchema: z.object({
    query: z.string().min(3),
  }),
  suspendSchema: z.object({
    message: z.object({
      query: z.string(),
    }),
  }),
  execute: async ({ resumeData, suspend }) => {
    if (resumeData) {
      return { query: resumeData.query };
    }

    await suspend({
      message: {
        query: 'What would you like Fin to research?',
      },
    });

    return { query: '' };
  },
});

const researchStep = createStep({
  id: 'research',
  inputSchema: z.object({
    query: z.string().min(3),
  }),
  outputSchema: z.object({
    researchData: researchPacketSchema,
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('researchAgent');
    const result = await agent.generate(
      [
        {
          role: 'user',
          content: `Research this topic thoroughly and stop after one follow-up round: "${inputData.query}".

Use webSearchTool, evaluateResultTool, and extractLearningsTool. Return queries, searchResults, evaluations, learnings, completedQueries, and phase.`,
        },
      ],
      {
        maxSteps: 18,
        structuredOutput: { schema: researchPacketSchema },
      },
    );

    return {
      researchData: result.object,
      summary: `Research completed on "${inputData.query}" with ${result.object.searchResults.length} sources and ${result.object.learnings.length} learnings.`,
    };
  },
});

const approvalStep = createStep({
  id: 'approval',
  inputSchema: z.object({
    researchData: researchPacketSchema,
    summary: z.string(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    researchData: researchPacketSchema,
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  suspendSchema: z.object({
    summary: z.string(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (resumeData) {
      return {
        approved: resumeData.approved,
        researchData: inputData.researchData,
      };
    }

    await suspend({
      summary: inputData.summary,
      message: 'Is this research sufficient?',
    });

    return {
      approved: false,
      researchData: inputData.researchData,
    };
  },
});

export const researchWorkflow = createWorkflow({
  id: 'research-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    approved: z.boolean(),
    researchData: researchPacketSchema,
  }),
  steps: [getUserQueryStep, researchStep, approvalStep],
});

researchWorkflow.then(getUserQueryStep).then(researchStep).then(approvalStep).commit();
