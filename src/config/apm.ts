import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from './environment';

// Configure Jaeger exporter
function normalizeJaegerEndpoint(raw?: string): string {
  if (!raw) return 'http://jaeger:14268/api/traces';
  try {
    const url = new URL(raw);
    // If provided UI URL (16686), convert to collector (14268) + /api/traces
    if (url.port === '16686') {
      url.port = '14268';
      url.pathname = '/api/traces';
      return url.toString();
    }
    // If pointing to collector but missing path, add /api/traces
    if ((url.port === '' || url.port === '14268') && !url.pathname.includes('/api/traces')) {
      url.port = url.port || '14268';
      url.pathname = '/api/traces';
      return url.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

const jaegerEndpoint = normalizeJaegerEndpoint(config.jaeger?.endpoint);
const jaegerExporter = new JaegerExporter({ endpoint: jaegerEndpoint });

// Configure OpenTelemetry SDK
let sdk: NodeSDK | null = null;

try {
  // Ensure service name is set via env for resource detection
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || config.jaeger?.serviceName || 'vikareta-backend';
  process.env.OTEL_RESOURCE_ATTRIBUTES = [
    process.env.OTEL_RESOURCE_ATTRIBUTES || '',
    `${ATTR_SERVICE_VERSION}=${process.env.npm_package_version || 'unknown'}`,
  ].filter(Boolean).join(',');

  sdk = new NodeSDK({
    traceExporter: jaegerExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable some instrumentations if needed
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  // Initialize the SDK
  if (config.env !== 'test') {
    sdk.start();
    console.log('OpenTelemetry tracing initialized', {
      jaegerEndpoint,
      serviceName: process.env.OTEL_SERVICE_NAME,
    });
  }
} catch (error) {
  console.warn('Failed to initialize OpenTelemetry:', error);
}

export default sdk;