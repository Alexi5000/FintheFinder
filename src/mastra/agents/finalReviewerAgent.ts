import { Agent } from '@mastra/core/agent';
import { models, openaiProviderOptions } from '@/lib/models';

export const finalReviewerAgent = new Agent({
  id: 'final-reviewer',
  name: 'Final Reviewer',
  description: 'Performs final product-quality review before a report is marked ready.',
  instructions: `You are the final reviewer for a production research assistant. Check clarity, factual grounding, citation coverage, uncertainty labeling, and executive usefulness. Be strict.`,
  model: models.primary,
  defaultOptions: {
    providerOptions: openaiProviderOptions,
  },
});
