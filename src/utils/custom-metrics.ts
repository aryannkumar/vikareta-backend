
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('vikareta-backend');

export class CustomMetrics {
  static recordBusinessMetric(name: string, value: number, labels?: Record<string, string>) {
    const span = tracer.startSpan(`business.${name}`);
    span.setAttributes({
      'metric.name': name,
      'metric.value': value,
      ...labels,
    });
    span.end();
  }

  static recordUserAction(action: string, userId: string, metadata?: any) {
    const span = tracer.startSpan(`user.${action}`);
    span.setAttributes({
      'user.id': userId,
      'user.action': action,
      ...metadata,
    });
    span.end();
  }

  static recordPerformanceMetric(operation: string, duration: number, success: boolean) {
    const span = tracer.startSpan(`performance.${operation}`);
    span.setAttributes({
      'operation.duration': duration,
      'operation.success': success,
    });
    span.setStatus({
      code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    });
    span.end();
  }

  static startSpan(name: string) {
    return tracer.startSpan(name);
  }

  static setCustomContext(contextData: Record<string, any>) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(contextData);
    }
  }

  static setUserContext(user: { id: string; email?: string; role?: string }) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes({
        'user.id': user.id,
        'user.email': user.email || '',
        'user.role': user.role || '',
      });
    }
  }
}
