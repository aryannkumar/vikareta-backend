import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { config } from '@/config/environment';
import Redis from 'ioredis';
import { prisma } from '@/lib/prisma';

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  // Set CORS headers explicitly for health check
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  return res.json({
    success: true,
    message: 'Vikareta Backend API is running',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: '1.0.0',
    cors: {
      origin: origin,
      allowedOrigins: config.cors.allowedOrigins,
    },
  });
}));

// API connectivity test endpoint (removed - no longer needed)

// Detailed health check with dependencies
router.get('/detailed', asyncHandler(async (_req: Request, res: Response) => {
  const healthChecks = {
    api: { status: 'healthy', timestamp: new Date().toISOString() },
    database: { status: 'unknown', timestamp: new Date().toISOString() },
    redis: { status: 'unknown', timestamp: new Date().toISOString() },
  };

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    healthChecks.database.status = 'healthy';
  } catch {
    healthChecks.database.status = 'unhealthy';
  }

  // Check Redis connection using ioredis (short connect)
  try {
    const redisClient = new Redis(config.redis.url, { lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 1 });
    await redisClient.connect();
    await redisClient.ping();
    healthChecks.redis.status = 'healthy';
    await redisClient.quit();
  } catch {
    healthChecks.redis.status = 'unhealthy';
  }

  const overallStatus = Object.values(healthChecks).every(check => check.status === 'healthy') 
    ? 'healthy' 
    : 'degraded';

  return res.json({
    success: true,
    status: overallStatus,
    checks: healthChecks,
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: '1.0.0',
  });
}));

export { router as healthRoutes };