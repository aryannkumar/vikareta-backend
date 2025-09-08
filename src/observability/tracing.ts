import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { logger } from '@/utils/logger';

let started = false;
let sdk: NodeSDK | null = null;

export const startTracing = async () => {
  if (started) return;
  
  try {
    // Check if Jaeger is enabled
    const jaegerEnabled = process.env.JAEGER_ENABLED !== 'false';
    if (!jaegerEnabled) {
      logger.info('Jaeger tracing disabled via JAEGER_ENABLED=false');
      return;
    }

    const jaegerUrl = process.env.JAEGER_ENDPOINT || 'http://jaeger.vikareta.com:14268/api/traces';
    const serviceName = process.env.SERVICE_NAME || 'vikareta-backend';
    
    logger.info(`Initializing Jaeger tracing to ${jaegerUrl}`);
    logger.info(`Service name: ${serviceName}`);
    logger.info(`Service version: ${process.env.npm_package_version || '1.0.0'}`);

    // Create Jaeger exporter
    const jaegerExporter = new JaegerExporter({ 
      endpoint: jaegerUrl,
    });

    // Initialize SDK with service name via environment variable
    process.env.OTEL_SERVICE_NAME = serviceName;
    process.env.OTEL_SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

    sdk = new NodeSDK({
      traceExporter: jaegerExporter,
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { 
          enabled: true,
        },
        '@opentelemetry/instrumentation-express': { 
          enabled: true,
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      })]
    });
    
    await sdk.start();
    started = true;
    logger.info(`OpenTelemetry tracing started successfully for ${serviceName} using Jaeger exporter`);
    
  } catch (err: any) {
    logger.error('Tracing initialization failed:', {
      error: err.message,
      stack: err.stack,
      jaegerEndpoint: process.env.JAEGER_ENDPOINT,
      serviceName: process.env.SERVICE_NAME
    });
    // Don't throw - tracing should be non-fatal
  }
};

export const shutdownTracing = async () => {
  try { if (sdk) await sdk.shutdown(); } catch (err) { logger.warn('Tracing shutdown error', err); }
};
