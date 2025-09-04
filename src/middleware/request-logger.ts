import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log request
  logger.info(`Incoming ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    body: req.method !== 'GET' ? req.body : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = ((chunk?: any, encoding?: any) => {
    const responseTime = Date.now() - startTime;

    logger.info(`Response ${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms`, {
      statusCode: res.statusCode,
      responseTime,
      contentLength: res.get('Content-Length'),
    });

    // Call original end and return Response
    (originalEnd as any)(chunk, encoding);
    return res;
  }) as typeof res.end;

  next();
};