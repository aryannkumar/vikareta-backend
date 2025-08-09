/**
 * Performance Monitoring Middleware
 * Comprehensive APM setup for Vikareta platform
 */

import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

interface PerformanceMetrics {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  timestamp: Date;
  userAgent?: string;
  userId?: string;
  dbQueries?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

interface SystemMetrics {
  timestamp: Date;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  activeConnections: number;
  dbConnectionPool: {
    active: number;
    idle: number;
    waiting: number;
  };
  redisConnections: number;
  uptime: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private redis: Redis | null = null;
  private prisma: PrismaClient;
  private startTime: number;
  private requestCount = 0;
  private errorCount = 0;
  private slowQueryThreshold = 1000; // 1 second
  private memoryThreshold = 500 * 1024 * 1024; // 500MB

  private constructor() {
    // Skip Redis connection in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379');
    }
    this.prisma = new PrismaClient();
    this.startTime = Date.now();

    // Skip monitoring setup in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.setupSystemMonitoring();
      this.setupAlerts();
    }
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Express middleware for request performance monitoring
   */
  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = performance.now();
      const startCpuUsage = process.cpuUsage();
      const requestId = req.headers['x-request-id'] as string || this.generateRequestId();

      // Add request ID to response headers
      res.setHeader('X-Request-ID', requestId);

      // Track database queries
      let dbQueryCount = 0;
      if (this.prisma && this.prisma.$executeRaw) {
        const originalQuery = this.prisma.$executeRaw.bind(this.prisma);
        this.prisma.$executeRaw = ((query: any, ...values: any[]) => {
          dbQueryCount++;
          return originalQuery(query, ...values);
        }) as any;
      }

      // Track cache operations (skip in test environment)
      let cacheHits = 0;
      let cacheMisses = 0;
      if (process.env.NODE_ENV !== 'test' && this.redis) {
        const originalGet = this.redis.get.bind(this.redis);
        this.redis.get = async (key: string) => {
          const result = await originalGet(key);
          if (result) cacheHits++;
          else cacheMisses++;
          return result;
        };
      }

      // Capture response
      const originalSend = res.send;
      res.send = function (data: any) {
        const endTime = performance.now();
        const endCpuUsage = process.cpuUsage(startCpuUsage);
        const responseTime = endTime - startTime;

        const metrics: PerformanceMetrics = {
          requestId,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          responseTime,
          memoryUsage: process.memoryUsage(),
          cpuUsage: endCpuUsage,
          timestamp: new Date(),
          userAgent: req.headers['user-agent'] || '',
          userId: (req as any).user?.id,
          dbQueries: dbQueryCount,
          cacheHits,
          cacheMisses
        };

        PerformanceMonitor.getInstance().recordMetrics(metrics);
        return originalSend.call(this, data);
      };

      this.requestCount++;
      next();
    };
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // Log slow requests
    if (metrics.responseTime > this.slowQueryThreshold) {
      logger.warn('Slow request detected', {
        requestId: metrics.requestId,
        url: metrics.url,
        responseTime: metrics.responseTime,
        dbQueries: metrics.dbQueries
      });
    }

    // Log errors
    if (metrics.statusCode >= 400) {
      this.errorCount++;
      logger.error('Request error', {
        requestId: metrics.requestId,
        url: metrics.url,
        statusCode: metrics.statusCode,
        responseTime: metrics.responseTime
      });
    }

    // Store metrics in Redis for real-time monitoring
    this.storeMetricsInRedis(metrics);

    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Store metrics in Redis for real-time dashboards
   */
  private async storeMetricsInRedis(metrics: PerformanceMetrics): Promise<void> {
    try {
      // Skip Redis operations in test environment
      if (process.env.NODE_ENV === 'test' || !this.redis) {
        return;
      }

      const key = `metrics:${Date.now()}`;
      await this.redis.setex(key, 3600, JSON.stringify(metrics)); // Store for 1 hour

      // Update real-time counters
      await this.redis.incr('metrics:request_count');
      if (metrics.statusCode >= 400) {
        await this.redis.incr('metrics:error_count');
      }

      // Track response time percentiles
      await this.redis.zadd('metrics:response_times', metrics.responseTime, key);
      await this.redis.zremrangebyrank('metrics:response_times', 0, -1001); // Keep last 1000

    } catch (error) {
      logger.error('Failed to store metrics in Redis:', error);
    }
  }

  /**
   * Setup system-level monitoring
   */
  private setupSystemMonitoring(): void {
    setInterval(() => {
      const systemMetrics: SystemMetrics = {
        timestamp: new Date(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        activeConnections: this.requestCount,
        dbConnectionPool: {
          active: 0, // Would need to implement Prisma connection pool monitoring
          idle: 0,
          waiting: 0
        },
        redisConnections: 1, // Simplified for this example
        uptime: Date.now() - this.startTime
      };

      this.systemMetrics.push(systemMetrics);
      this.storeSystemMetricsInRedis(systemMetrics);

      // Keep only last 100 system metrics
      if (this.systemMetrics.length > 100) {
        this.systemMetrics = this.systemMetrics.slice(-100);
      }

      // Check for memory leaks
      if (systemMetrics.memoryUsage.heapUsed > this.memoryThreshold) {
        logger.warn('High memory usage detected', {
          heapUsed: systemMetrics.memoryUsage.heapUsed,
          threshold: this.memoryThreshold
        });
      }

    }, 30000); // Every 30 seconds
  }

  /**
   * Store system metrics in Redis
   */
  private async storeSystemMetricsInRedis(metrics: SystemMetrics): Promise<void> {
    try {
      // Skip Redis operations in test environment
      if (process.env.NODE_ENV === 'test' || !this.redis) {
        return;
      }

      const key = `system_metrics:${Date.now()}`;
      await this.redis.setex(key, 3600, JSON.stringify(metrics));

      // Update system counters
      await this.redis.set('system:memory_usage', metrics.memoryUsage.heapUsed);
      await this.redis.set('system:uptime', metrics.uptime);

    } catch (error) {
      logger.error('Failed to store system metrics in Redis:', error);
    }
  }

  /**
   * Setup alerting for critical issues
   */
  private setupAlerts(): void {
    setInterval(() => {
      this.checkAlerts();
    }, 60000); // Check every minute
  }

  /**
   * Check for alert conditions
   */
  private async checkAlerts(): Promise<void> {
    try {
      // Check error rate
      const recentMetrics = this.metrics.filter(
        m => Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
      );

      if (recentMetrics.length > 0) {
        const errorRate = recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length;

        if (errorRate > 0.1) { // More than 10% error rate
          await this.sendAlert('HIGH_ERROR_RATE', {
            errorRate: (errorRate * 100).toFixed(2),
            totalRequests: recentMetrics.length,
            timeWindow: '5 minutes'
          });
        }
      }

      // Check average response time
      const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
      if (avgResponseTime > 2000) { // More than 2 seconds average
        await this.sendAlert('SLOW_RESPONSE_TIME', {
          avgResponseTime: avgResponseTime.toFixed(2),
          threshold: '2000ms',
          timeWindow: '5 minutes'
        });
      }

      // Check memory usage
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > this.memoryThreshold) {
        await this.sendAlert('HIGH_MEMORY_USAGE', {
          currentUsage: (currentMemory.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
          threshold: (this.memoryThreshold / 1024 / 1024).toFixed(2) + 'MB'
        });
      }

    } catch (error) {
      logger.error('Failed to check alerts:', error);
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(type: string, data: any): Promise<void> {
    const alert = {
      type,
      data,
      timestamp: new Date(),
      severity: this.getAlertSeverity(type)
    };

    logger.error(`ALERT: ${type}`, alert);

    // Store alert in Redis (skip in test environment)
    if (process.env.NODE_ENV !== 'test' && this.redis) {
      await this.redis.lpush('alerts', JSON.stringify(alert));
      await this.redis.ltrim('alerts', 0, 99); // Keep last 100 alerts
    }

    // Here you would integrate with your alerting system (Slack, PagerDuty, etc.)
    // await this.sendToSlack(alert);
    // await this.sendToPagerDuty(alert);
  }

  /**
   * Get alert severity level
   */
  private getAlertSeverity(type: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'HIGH_ERROR_RATE': 'high',
      'SLOW_RESPONSE_TIME': 'medium',
      'HIGH_MEMORY_USAGE': 'high',
      'DATABASE_CONNECTION_ERROR': 'critical',
      'REDIS_CONNECTION_ERROR': 'high'
    };

    return severityMap[type] || 'medium';
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get performance analytics
   */
  public getAnalytics(timeWindow: number = 3600000): any { // Default 1 hour
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);

    if (recentMetrics.length === 0) {
      return { message: 'No metrics available for the specified time window' };
    }

    const responseTimes = recentMetrics.map(m => m.responseTime);
    const statusCodes = recentMetrics.map(m => m.statusCode);

    return {
      timeWindow: `${timeWindow / 1000}s`,
      totalRequests: recentMetrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p50ResponseTime: this.percentile(responseTimes, 0.5),
      p95ResponseTime: this.percentile(responseTimes, 0.95),
      p99ResponseTime: this.percentile(responseTimes, 0.99),
      errorRate: (statusCodes.filter(code => code >= 400).length / statusCodes.length) * 100,
      statusCodeDistribution: this.getStatusCodeDistribution(statusCodes),
      topSlowEndpoints: this.getTopSlowEndpoints(recentMetrics),
      memoryUsage: process.memoryUsage(),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get status code distribution
   */
  private getStatusCodeDistribution(statusCodes: number[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    statusCodes.forEach(code => {
      const range = `${Math.floor(code / 100)}xx`;
      distribution[range] = (distribution[range] || 0) + 1;
    });
    return distribution;
  }

  /**
   * Get top slow endpoints
   */
  private getTopSlowEndpoints(metrics: PerformanceMetrics[]): any[] {
    const endpointMetrics: Record<string, { count: number; totalTime: number; maxTime: number }> = {};

    metrics.forEach(m => {
      const key = `${m.method} ${m.url}`;
      if (!endpointMetrics[key]) {
        endpointMetrics[key] = { count: 0, totalTime: 0, maxTime: 0 };
      }
      endpointMetrics[key].count++;
      endpointMetrics[key].totalTime += m.responseTime;
      endpointMetrics[key].maxTime = Math.max(endpointMetrics[key].maxTime, m.responseTime);
    });

    return Object.entries(endpointMetrics)
      .map(([endpoint, stats]) => ({
        endpoint,
        averageTime: stats.totalTime / stats.count,
        maxTime: stats.maxTime,
        requestCount: stats.count
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);
  }

  /**
   * Health check endpoint data
   */
  public getHealthCheck(): any {
    const recentMetrics = this.metrics.filter(
      m => Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
    );

    const errorRate = recentMetrics.length > 0
      ? (recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length) * 100
      : 0;

    const avgResponseTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
      : 0;

    return {
      status: errorRate < 5 && avgResponseTime < 1000 ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      metrics: {
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: errorRate.toFixed(2) + '%',
        averageResponseTime: avgResponseTime.toFixed(2) + 'ms'
      },
      memory: process.memoryUsage(),
      version: process.env['npm_package_version'] || '1.0.0'
    };
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
export const performanceMiddleware = performanceMonitor.middleware();