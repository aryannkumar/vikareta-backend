/**
 * Monitoring Dashboard API Routes
 * Real-time monitoring endpoints for Vikareta platform
 */

import { Router, Request, Response } from 'express';
import { performanceMonitor } from '../middleware/performance-monitoring';
import { cacheService } from '../services/cache.service';
import { errorTrackingService } from '../services/error-tracking.service';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const router = Router();
const prisma = new PrismaClient();
const redis = process.env.NODE_ENV !== 'test' ? new Redis(process.env.REDIS_URL || 'redis://localhost:6379') : null;

/**
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthData = performanceMonitor.getHealthCheck();
    
    // Check database connectivity
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    
    // Check Redis connectivity
    const redisHealth = await cacheService.healthCheck();
    
    const overallHealth = {
      ...healthData,
      database: {
        status: 'healthy',
        latency: dbLatency
      },
      redis: redisHealth,
      timestamp: new Date()
    };
    
    const statusCode = overallHealth.status === 'healthy' && 
                      redisHealth.status === 'healthy' ? 200 : 503;
    
    return res.status(statusCode).json(overallHealth);
  } catch (error) {
    logger.error('Health check failed:', error);
    return res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

/**
 * Performance metrics endpoint
 */
router.get('/metrics/performance', async (req: Request, res: Response) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow as string) || 3600000; // 1 hour default
    const analytics = performanceMonitor.getAnalytics(timeWindow);
    
    return res.json({
      success: true,
      data: analytics,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Cache statistics endpoint
 */
router.get('/metrics/cache', async (req: Request, res: Response) => {
  try {
    const cacheStats = cacheService.getStats();
    const redisInfo = redis ? await redis.info('memory') : null;
    
    return res.json({
      success: true,
      data: {
        stats: cacheStats,
        redis: {
          memory: redisInfo,
          connected: redis ? redis.status === 'ready' : false
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get cache metrics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Error analytics endpoint
 */
router.get('/metrics/errors', async (req: Request, res: Response) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow as string) || 86400000; // 24 hours default
    const errorAnalytics = await errorTrackingService.getErrorAnalytics(timeWindow);
    
    return res.json({
      success: true,
      data: errorAnalytics,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get error analytics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Database metrics endpoint
 */
router.get('/metrics/database', async (req: Request, res: Response) => {
  try {
    // Get database statistics
    const dbStats = await getDatabaseStats();
    
    return res.json({
      success: true,
      data: dbStats,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get database metrics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Business metrics endpoint
 */
router.get('/metrics/business', async (req: Request, res: Response) => {
  try {
    const businessMetrics = await getBusinessMetrics();
    
    return res.json({
      success: true,
      data: businessMetrics,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get business metrics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Real-time dashboard data endpoint
 */
router.get('/dashboard/realtime', async (req: Request, res: Response) => {
  try {
    const [
      healthCheck,
      performanceMetrics,
      cacheStats,
      errorAnalytics,
      businessMetrics
    ] = await Promise.all([
      performanceMonitor.getHealthCheck(),
      performanceMonitor.getAnalytics(300000), // Last 5 minutes
      cacheService.getStats(),
      errorTrackingService.getErrorAnalytics(300000), // Last 5 minutes
      getBusinessMetrics()
    ]);

    const dashboardData = {
      health: healthCheck,
      performance: performanceMetrics,
      cache: cacheStats,
      errors: errorAnalytics,
      business: businessMetrics,
      timestamp: new Date()
    };

    return res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Incident management endpoints
 */
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const incidents = await errorTrackingService.getIncidentHistory(limit);
    
    return res.json({
      success: true,
      data: incidents,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Failed to get incidents:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/incidents/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;
    
    await errorTrackingService.resolveIncident(id, resolution);
    
    return res.json({
      success: true,
      message: 'Incident resolved successfully'
    });
  } catch (error) {
    logger.error('Failed to resolve incident:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Alert configuration endpoints
 */
router.get('/alerts/config', async (req: Request, res: Response) => {
  try {
    const alertConfig = redis ? await redis.get('alert_config') : null;
    
    return res.json({
      success: true,
      data: alertConfig ? JSON.parse(alertConfig) : getDefaultAlertConfig()
    });
  } catch (error) {
    logger.error('Failed to get alert config:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/alerts/config', async (req: Request, res: Response) => {
  try {
    const config = req.body;
    if (redis) {
      await redis.set('alert_config', JSON.stringify(config));
    }
    
    return res.json({
      success: true,
      message: 'Alert configuration updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update alert config:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * System operations endpoints
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    await cacheService.clearAll();
    
    return res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('Failed to clear cache:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/cache/warm', async (req: Request, res: Response) => {
  try {
    await cacheService.warmCache();
    
    return res.json({
      success: true,
      message: 'Cache warming initiated successfully'
    });
  } catch (error) {
    logger.error('Failed to warm cache:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Helper function to get database statistics
 */
async function getDatabaseStats(): Promise<any> {
  const stats = await prisma.$queryRaw`
    SELECT 
      schemaname,
      tablename,
      n_tup_ins as inserts,
      n_tup_upd as updates,
      n_tup_del as deletes,
      n_live_tup as live_tuples,
      n_dead_tup as dead_tuples,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
    LIMIT 20;
  `;

  const connectionInfo = await prisma.$queryRaw`
    SELECT 
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active_connections,
      count(*) FILTER (WHERE state = 'idle') as idle_connections
    FROM pg_stat_activity;
  `;

  const databaseSize = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size;
  `;

  return {
    tableStats: stats,
    connections: connectionInfo,
    size: databaseSize
  };
}

/**
 * Helper function to get business metrics
 */
async function getBusinessMetrics(): Promise<any> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    dailyStats,
    weeklyStats,
    activeUsers,
    revenueStats
  ] = await Promise.all([
    // Daily statistics
    prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE created_at >= ${oneDayAgo}) as new_users,
        (SELECT COUNT(*) FROM products WHERE created_at >= ${oneDayAgo}) as new_products,
        (SELECT COUNT(*) FROM rfqs WHERE created_at >= ${oneDayAgo}) as new_rfqs,
        (SELECT COUNT(*) FROM orders WHERE created_at >= ${oneDayAgo}) as new_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE created_at >= ${oneDayAgo} AND status = 'completed') as daily_revenue
    `,
    
    // Weekly statistics
    prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE created_at >= ${oneWeekAgo}) as weekly_new_users,
        (SELECT COUNT(*) FROM orders WHERE created_at >= ${oneWeekAgo}) as weekly_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE created_at >= ${oneWeekAgo} AND status = 'completed') as weekly_revenue
    `,
    
    // Active users (users with activity in last 24 hours)
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT user_id) as active_users
      FROM (
        SELECT buyer_id as user_id FROM orders WHERE created_at >= ${oneDayAgo}
        UNION
        SELECT seller_id as user_id FROM orders WHERE created_at >= ${oneDayAgo}
        UNION
        SELECT buyer_id as user_id FROM rfqs WHERE created_at >= ${oneDayAgo}
        UNION
        SELECT seller_id as user_id FROM quotes WHERE created_at >= ${oneDayAgo}
      ) active_users_union
    `,
    
    // Revenue statistics
    prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_completed_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value
      FROM orders 
      WHERE status = 'completed'
    `
  ]);

  return {
    daily: (dailyStats as any[])[0],
    weekly: (weeklyStats as any[])[0],
    activeUsers: (activeUsers as any[])[0],
    revenue: (revenueStats as any[])[0],
    timestamp: new Date()
  };
}

/**
 * Default alert configuration
 */
function getDefaultAlertConfig(): any {
  return {
    errorRate: {
      threshold: 5, // 5%
      timeWindow: 300, // 5 minutes
      enabled: true
    },
    responseTime: {
      threshold: 2000, // 2 seconds
      timeWindow: 300, // 5 minutes
      enabled: true
    },
    memoryUsage: {
      threshold: 80, // 80%
      enabled: true
    },
    diskUsage: {
      threshold: 85, // 85%
      enabled: true
    },
    databaseConnections: {
      threshold: 80, // 80% of max connections
      enabled: true
    },
    notifications: {
      slack: {
        enabled: true,
        webhook: process.env.SLACK_WEBHOOK_URL
      },
      email: {
        enabled: true,
        recipients: ['admin@vikareta.com']
      },
      pagerduty: {
        enabled: false,
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY
      }
    }
  };
}

export default router;