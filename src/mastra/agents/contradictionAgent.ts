import { Agent } from '@mastra/core/agent';
import { models, openaiProviderOptions } from '@/lib/models';

export const contradictionAgent = new Agent({
  id: 'contradiction-checker',
  name: 'Contradiction Checker',
  description: 'Finds conflicts, weak evidence, and missing context across extracted learnings.',
  instructions: `You are a rigorous contradiction checker. Identify factual conflicts, stale evidence, unsupported claims, and missing caveats across a research packet. Prefer precise uncertainty over confident synthesis.`,
  model: models.primary,
  defaultOptions: {
    providerOptions: openaiProviderOptions,
  },
});
