import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { config } from '@/config/environment';
import { createClient } from 'redis';
import { prisma } from '@/lib/prisma';

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    message: 'Vikareta Backend API is running',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: '1.0.0',
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
  } catch (error) {
    healthChecks.database.status = 'unhealthy';
  }

  // Check Redis connection
  try {
    const redisClient = createClient({ url: config.redis.url });
    await redisClient.connect();
    await redisClient.ping();
    healthChecks.redis.status = 'healthy';
    await redisClient.quit();
  } catch (error) {
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