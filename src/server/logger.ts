import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'OPENAI_API_KEY',
      'EXA_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      '*.authorization',
      '*.apiKey',
      '*.token',
      '*.prompt',
      '*.query',
    ],
    censor: '[redacted]',
  },
});
