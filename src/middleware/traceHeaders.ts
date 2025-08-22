import { Request, Response, NextFunction } from 'express';
import { context, trace } from '@opentelemetry/api';

export function traceHeaders(req: Request, res: Response, next: NextFunction) {
  try {
    const span = trace.getSpan(context.active());
    const spanCtx = span?.spanContext();
    if (spanCtx) {
      res.setHeader('X-Trace-Id', spanCtx.traceId);
      res.setHeader('X-Span-Id', spanCtx.spanId);
    }
  } catch {
    // no-op
  }
  next();
}
