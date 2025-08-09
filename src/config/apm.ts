import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import * as Resources from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from './environment';

// Configure Jaeger exporter
const jaegerExporter = new JaegerExporter({
  endpoint: config.jaeger?.endpoint || 'http://jaeger:14268/api/traces',
});

// Configure OpenTelemetry SDK
let sdk: NodeSDK | null = null;

try {
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
    console.log('OpenTelemetry tracing initialized');
  }
} catch (error) {
  console.warn('Failed to initialize OpenTelemetry:', error);
}

export default sdk;