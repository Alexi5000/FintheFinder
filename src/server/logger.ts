import pino from 'pino';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'apikey',
  'apiKey',
  'api_key',
  'token',
  'accessToken',
  'access_token',
  'prompt',
  'query',
  'OPENAI_API_KEY',
  'EXA_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

const CENSOR = '[redacted]';

export function createLogger(destination?: pino.DestinationStream) {
  const options: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'authorization',
      'apiKey',
      'api_key',
      'token',
      'accessToken',
      'access_token',
      'prompt',
      'query',
      'OPENAI_API_KEY',
      'EXA_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      '*.authorization',
      '*.apiKey',
      '*.token',
      '*.prompt',
      '*.query',
    ],
    censor: CENSOR,
  },
    hooks: {
      logMethod(args, method) {
        const redactedArgs = args.map((arg) => redactLogValue(arg));
        return (method as (...methodArgs: unknown[]) => void).apply(this, redactedArgs);
      },
    },
  };

  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();

export function redactLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactSecretText(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecretText(value.message),
      stack: value.stack ? redactSecretText(value.stack) : undefined,
    };
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, seen));

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) return [key, CENSOR];
      return [key, redactLogValue(entry, seen)];
    }),
  );
}

function redactSecretText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${CENSOR}`)
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, CENSOR)
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\b/g, CENSOR)
    .replace(/\b(authorization|token|api[_-]?key|secret)\s*[:=]\s*["']?[^"',;\s]+/gi, `$1=${CENSOR}`);
}
