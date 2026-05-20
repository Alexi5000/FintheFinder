import { Agent } from '@mastra/core/agent';
import { models, openaiProviderOptions } from '@/lib/models';

export const plannerAgent = new Agent({
  id: 'research-planner',
  name: 'Research Planner',
  description: 'Turns a user research topic into focused search queries and acceptance criteria.',
  instructions: `You are a senior research planner. Convert broad user questions into precise web-search plans. Prefer primary sources, official docs, recent analysis, and high-signal evidence. Avoid vague searches.`,
  model: models.primary,
  defaultOptions: {
    providerOptions: openaiProviderOptions,
  },
});
