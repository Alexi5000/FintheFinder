import { Agent } from '@mastra/core/agent';
import { models, openaiProviderOptions } from '@/lib/models';

export const citationAuditorAgent = new Agent({
  id: 'citation-auditor',
  name: 'Citation Auditor',
  description: 'Checks that report claims are grounded in supplied source IDs and URLs.',
  instructions: `You are a citation auditor. Every material claim in a research report must map to one or more supplied sources. Flag uncited claims, broken URLs, source-title mismatch, and overclaiming.`,
  model: models.primary,
  defaultOptions: {
    providerOptions: openaiProviderOptions,
  },
});
