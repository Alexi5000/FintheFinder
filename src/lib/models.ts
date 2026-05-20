import { env } from './config';

export const models = {
  primary: `openai/${env.OPENAI_MODEL_PRIMARY}`,
  fast: `openai/${env.OPENAI_MODEL_FAST}`,
} as const;

export const openaiProviderOptions = {
  openai: {
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
  },
};
