import { randomUUID } from 'node:crypto';
import { context, trace, SpanStatusCode, type Span, type SpanOptions } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { env } from '@/lib/config';
import { logger } from './logger';

let initialized = false;

export function initTelemetry() {
  if (initialized || !env.OTEL_ENABLED) return;
  initialized = true;

  const provider = new NodeTracerProvider({
    spanProcessors: env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? [
          new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
            }),
          ),
        ]
      : [],
  });

  provider.register();
  logger.info({ serviceName: env.OTEL_SERVICE_NAME, exporterConfigured: Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT) }, 'telemetry initialized');
}

export function getTracer() {
  initTelemetry();
  return trace.getTracer(env.OTEL_SERVICE_NAME);
}

export async function withSpan<T>(name: string, attributes: Record<string, string | number | boolean | undefined>, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T> {
  return getTracer().startActiveSpan(name, options ?? {}, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) span.setAttribute(key, value);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function activeTraceId() {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId;
  return traceId && traceId !== '00000000000000000000000000000000' ? traceId : undefined;
}

export function newCorrelationId(prefix = 'corr') {
  return `${prefix}_${randomUUID()}`;
}
