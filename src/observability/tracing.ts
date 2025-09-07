import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { logger } from '@/utils/logger';

let started = false;
let sdk: NodeSDK | null = null;

export const startTracing = async () => {
  if (started) return;
  try {
  const jaegerUrl = process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
    // If needed, resource attributes can be supplied via OTEL_RESOURCE_ATTRIBUTES env var.
    // e.g. OTEL_RESOURCE_ATTRIBUTES="service.name=vikareta-backend,service.version=1.0.0,deployment.environment=${process.env.NODE_ENV}".
    sdk = new NodeSDK({
      traceExporter: new JaegerExporter({ endpoint: jaegerUrl }),
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false }
      })]
    });
    await sdk.start();
    started = true;
    logger.info('OpenTelemetry tracing started');
  } catch (err: any) {
    logger.warn('Tracing init failed (non-fatal):', err.message);
  }
};

export const shutdownTracing = async () => {
  try { if (sdk) await sdk.shutdown(); } catch (err) { logger.warn('Tracing shutdown error', err); }
};
