import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return value;
}, z.boolean());

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  OPENAI_MODEL_PRIMARY: z.string().default('gpt-5.5'),
  OPENAI_MODEL_FAST: z.string().default('gpt-5.4-mini'),
  OPENAI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high', 'xhigh']).default('high'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('fin-the-finder'),
  OTEL_ENABLED: booleanFromEnv.default(false),
  RUN_BUDGET_USD: z.coerce.number().positive().default(5),
});

export const env = serverEnvSchema.parse(process.env);

export function getProviderStatus() {
  return {
    openai: Boolean(env.OPENAI_API_KEY),
    exa: Boolean(env.EXA_API_KEY),
    supabase:
      Boolean(env.NEXT_PUBLIC_SUPABASE_URL) &&
      Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    models: {
      primary: env.OPENAI_MODEL_PRIMARY,
      fast: env.OPENAI_MODEL_FAST,
      reasoningEffort: env.OPENAI_REASONING_EFFORT,
    },
  };
}
