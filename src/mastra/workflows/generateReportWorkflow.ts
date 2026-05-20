import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { researchWorkflow } from './researchWorkflow';
import { reportSchema, researchPacketSchema } from '@/lib/schemas';

const processResearchResultStep = createStep({
  id: 'process-research-result',
  inputSchema: z.object({
    approved: z.boolean(),
    researchData: researchPacketSchema,
  }),
  outputSchema: z.object({
    report: reportSchema.optional(),
    completed: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData.approved) {
      return { completed: false };
    }

    const agent = mastra.getAgent('reportAgent');
    const response = await agent.generate(
      [
        {
          role: 'user',
          content: `Generate a cited report from this approved research packet: ${JSON.stringify(inputData.researchData)}`,
        },
      ],
      {
        structuredOutput: { schema: reportSchema },
      },
    );

    return { report: response.object, completed: true };
  },
});

export const generateReportWorkflow = createWorkflow({
  id: 'generate-report-workflow',
  steps: [researchWorkflow, processResearchResultStep],
  inputSchema: z.object({}),
  outputSchema: z.object({
    report: reportSchema.optional(),
    completed: z.boolean(),
  }),
});

generateReportWorkflow
  .dowhile(researchWorkflow, async ({ inputData }) => inputData.approved !== true)
  .then(processResearchResultStep)
  .commit();
