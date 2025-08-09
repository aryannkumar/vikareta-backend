import { PrismaClient } from '@prisma/client';
import { adLoggingService } from './ad-logging.service';

const prisma = new PrismaClient();

export interface SystemHealthMetrics {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  errorRate?: number;
  throughput?: number;
  uptime?: number;
  lastChecked: Date;
  details?: any;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  cacheHitRate: number;
  activeConnections: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: Date;
}

export class AdMonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private performanceCheckInterval: NodeJS.Timeout | null = null;
  private alertRules: AlertRule[] = [];

  constructor() {
    this.initializeDefaultAlertRules();
    this.startHealthChecks();
    this.startPerformanceMonitoring();
  }

  // System Health Monitoring
  async checkSystemHealth(): Promise<SystemHealthMetrics[]> {
    const healthMetrics: SystemHealthMetrics[] = [];

    // Check Database Health
    const dbHealth = await this.checkDatabaseHealth();
    healthMetrics.push(dbHealth);

    // Check Ad Serving Performance
    const adServingHealth = await this.checkAdServingHealth();
    healthMetrics.push(adServingHealth);

    // Check External Networks
    const externalNetworksHealth = await this.checkExternalNetworksHealth();
    healthMetrics.push(...externalNetworksHealth);

    // Check Cache Performance
    const cacheHealth = await this.checkCacheHealth();
    healthMetrics.push(cacheHealth);

    // Check Budget System
    const budgetHealth = await this.checkBudgetSystemHealth();
    healthMetrics.push(budgetHealth);

    // Log overall system health
    const overallStatus = this.calculateOverallHealth(healthMetrics);
    await adLoggingService.logSystemHealth('overall_system', overallStatus.status, {
      components: healthMetrics.length,
      healthy: healthMetrics.filter(m => m.status === 'healthy').length,
      degraded: healthMetrics.filter(m => m.status === 'degraded').length,
      unhealthy: healthMetrics.filter(m => m.status === 'unhealthy').length,
    });

    return healthMetrics;
  }

  private async checkDatabaseHealth(): Promise<SystemHealthMetrics> {
    const startTime = Date.now();
    
    try {
      // Test database connectivity and performance
      await prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      
      // Check for slow queries
      const slowQueryThreshold = 1000; // 1 second
      const status = responseTime > slowQueryThreshold ? 'degraded' : 'healthy';

      return {
        component: 'database',
        status,
        responseTime,
        lastChecked: new Date(),
        details: {
          connectionPool: await this.getDatabaseConnectionStats(),
        },
      };
    } catch (error) {
      return {
        component: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  private async checkAdServingHealth(): Promise<SystemHealthMetrics> {
    try {
      // Check recent ad serving performance
      const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
      
      const [totalRequests, errors] = await Promise.all([
        prisma.adImpression.count({
          where: {
            createdAt: { gte: last5Minutes },
          },
        }),
        prisma.adClick.count({
          where: {
            createdAt: { gte: last5Minutes },
          },
        }),
      ]);
      
      const avgResponseTime = { _avg: { responseTime: 100 } }; // Mock response time

      const errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 0;
      const responseTime = avgResponseTime._avg.responseTime || 0;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (errorRate > 10 || responseTime > 2000) {
        status = 'unhealthy';
      } else if (errorRate > 5 || responseTime > 1000) {
        status = 'degraded';
      }

      return {
        component: 'ad_serving',
        status,
        responseTime,
        errorRate,
        throughput: totalRequests,
        lastChecked: new Date(),
        details: {
          totalRequests,
          errors,
          avgResponseTime: responseTime,
        },
      };
    } catch (error) {
      return {
        component: 'ad_serving',
        status: 'unhealthy',
        lastChecked: new Date(),
        details: { error: (error as Error).message },
      };
    }
  }

  private async checkExternalNetworksHealth(): Promise<SystemHealthMetrics[]> {
    const networks = await prisma.externalAdNetwork.findMany({
      where: { isActive: true },
    });

    const healthMetrics: SystemHealthMetrics[] = [];

    for (const network of networks) {
      try {
        const last10Minutes = new Date(Date.now() - 10 * 60 * 1000);
        
        // Mock implementation for external network monitoring
        const totalRequests = 100;
        const successfulRequests = 95;
        const avgResponseTime = { _avg: { responseTime: 150 } };

        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;
        const responseTime = avgResponseTime._avg.responseTime || 0;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        if (successRate < 80 || responseTime > 5000) {
          status = 'unhealthy';
        } else if (successRate < 95 || responseTime > 2000) {
          status = 'degraded';
        }

        healthMetrics.push({
          component: `external_network_${network.name}`,
          status,
          responseTime,
          errorRate: 100 - successRate,
          throughput: totalRequests,
          lastChecked: new Date(),
          details: {
            networkName: network.name,
            totalRequests,
            successfulRequests,
            successRate,
          },
        });
      } catch (error) {
        healthMetrics.push({
          component: `external_network_${network.name}`,
          status: 'unhealthy',
          lastChecked: new Date(),
          details: { error: (error as Error).message },
        });
      }
    }

    return healthMetrics;
  }

  private async checkCacheHealth(): Promise<SystemHealthMetrics> {
    try {
      const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
      
      // Mock cache stats implementation
      const cacheStats = { _avg: { responseTime: 50 }, _count: { cacheHit: 100 } };
      const cacheHits = 85;

      const totalRequests = cacheStats._count.cacheHit || 0;
      const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
      const responseTime = cacheStats._avg.responseTime || 0;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (cacheHitRate < 50) {
        status = 'degraded';
      }

      return {
        component: 'cache',
        status,
        responseTime,
        lastChecked: new Date(),
        details: {
          cacheHitRate,
          totalRequests,
          cacheHits,
        },
      };
    } catch (error) {
      return {
        component: 'cache',
        status: 'unhealthy',
        lastChecked: new Date(),
        details: { error: (error as Error).message },
      };
    }
  }

  private async checkBudgetSystemHealth(): Promise<SystemHealthMetrics> {
    try {
      // Check for budget-related errors
      const last10Minutes = new Date(Date.now() - 10 * 60 * 1000);
      
      // Mock budget errors count
      const budgetErrors = 0;

      // Check for stuck budget deductions
      const pendingDeductions = await prisma.lockedAmount.count({
        where: {
          status: 'active',
          createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) }, // Older than 1 hour
        },
      });

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (budgetErrors > 10 || pendingDeductions > 50) {
        status = 'unhealthy';
      } else if (budgetErrors > 5 || pendingDeductions > 20) {
        status = 'degraded';
      }

      return {
        component: 'budget_system',
        status,
        errorRate: budgetErrors,
        lastChecked: new Date(),
        details: {
          budgetErrors,
          pendingDeductions,
        },
      };
    } catch (error) {
      return {
        component: 'budget_system',
        status: 'unhealthy',
        lastChecked: new Date(),
        details: { error: (error as Error).message },
      };
    }
  }

  // Performance Monitoring
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);

    try {
      // Mock performance monitoring data
      const performanceStats = { _avg: { responseTime: 120 }, _count: { id: 1000 } };
      const errorCount = 5;
      const totalRequests = 1000;
      const cacheStats = { _count: { cacheHit: 800 } };
      const cacheHits = 750;

      const averageResponseTime = performanceStats._avg.responseTime || 0;
      const requestsPerSecond = totalRequests / (5 * 60); // 5 minutes in seconds
      const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
      const cacheHitRate = cacheStats._count.cacheHit > 0 ? (cacheHits / cacheStats._count.cacheHit) * 100 : 0;

      return {
        averageResponseTime,
        requestsPerSecond,
        errorRate,
        cacheHitRate,
        activeConnections: await this.getActiveConnectionCount(),
        memoryUsage: this.getMemoryUsage(),
        cpuUsage: await this.getCpuUsage(),
      };
    } catch (error) {
      await adLoggingService.logError(error as Error, { operation: 'performance_monitoring' }, 'high');
      
      return {
        averageResponseTime: 0,
        requestsPerSecond: 0,
        errorRate: 100,
        cacheHitRate: 0,
        activeConnections: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      };
    }
  }

  // Alert System
  private initializeDefaultAlertRules() {
    this.alertRules = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: 'error_rate > threshold',
        threshold: 5,
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        condition: 'avg_response_time > threshold',
        threshold: 2000,
        severity: 'medium',
        enabled: true,
        cooldownMinutes: 10,
      },
      {
        id: 'low_cache_hit_rate',
        name: 'Low Cache Hit Rate',
        condition: 'cache_hit_rate < threshold',
        threshold: 70,
        severity: 'medium',
        enabled: true,
        cooldownMinutes: 30,
      },
      {
        id: 'database_unhealthy',
        name: 'Database Unhealthy',
        condition: 'database_status == unhealthy',
        threshold: 1,
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 5,
      },
      {
        id: 'budget_system_errors',
        name: 'Budget System Errors',
        condition: 'budget_errors > threshold',
        threshold: 10,
        severity: 'high',
        enabled: true,
        cooldownMinutes: 20,
      },
    ];
  }

  async checkAlerts(metrics: PerformanceMetrics, healthMetrics: SystemHealthMetrics[]) {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      // Check cooldown period
      if (rule.lastTriggered) {
        const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) continue;
      }

      let shouldTrigger = false;

      switch (rule.id) {
        case 'high_error_rate':
          shouldTrigger = metrics.errorRate > rule.threshold;
          break;
        case 'slow_response_time':
          shouldTrigger = metrics.averageResponseTime > rule.threshold;
          break;
        case 'low_cache_hit_rate':
          shouldTrigger = metrics.cacheHitRate < rule.threshold;
          break;
        case 'database_unhealthy':
          const dbHealth = healthMetrics.find(h => h.component === 'database');
          shouldTrigger = dbHealth?.status === 'unhealthy';
          break;
        case 'budget_system_errors':
          const budgetHealth = healthMetrics.find(h => h.component === 'budget_system');
          shouldTrigger = (budgetHealth?.details?.budgetErrors || 0) > rule.threshold;
          break;
      }

      if (shouldTrigger) {
        await this.triggerAlert(rule, metrics, healthMetrics);
        rule.lastTriggered = new Date();
      }
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: PerformanceMetrics, healthMetrics: SystemHealthMetrics[]) {
    const alertData = {
      rule: rule.name,
      severity: rule.severity,
      condition: rule.condition,
      threshold: rule.threshold,
      currentMetrics: metrics,
      healthMetrics,
      timestamp: new Date(),
    };

    await adLoggingService.logError(
      new Error(`Alert triggered: ${rule.name}`),
      { 
        alertRule: rule.id,
        alertData,
      },
      rule.severity === 'critical' ? 'critical' : 'high'
    );

    // Send notifications (email, Slack, etc.)
    await this.sendAlertNotification(alertData);
  }

  private async sendAlertNotification(alertData: any) {
    // Implementation would depend on notification system
    // For now, just log the alert
    console.log('ALERT:', JSON.stringify(alertData, null, 2));
    
    // In production, you would integrate with:
    // - Email service
    // - Slack/Discord webhooks
    // - PagerDuty
    // - SMS service
  }

  // Utility Methods
  private calculateOverallHealth(healthMetrics: SystemHealthMetrics[]): { status: 'healthy' | 'degraded' | 'unhealthy' } {
    const unhealthyCount = healthMetrics.filter(m => m.status === 'unhealthy').length;
    const degradedCount = healthMetrics.filter(m => m.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return { status: 'unhealthy' };
    } else if (degradedCount > 0) {
      return { status: 'degraded' };
    } else {
      return { status: 'healthy' };
    }
  }

  private async getDatabaseConnectionStats() {
    // This would depend on your database connection pool implementation
    return {
      active: 10,
      idle: 5,
      total: 15,
    };
  }

  private async getActiveConnectionCount(): Promise<number> {
    // Implementation would depend on your server setup
    return 50;
  }

  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round((usage.heapUsed / usage.heapTotal) * 100);
  }

  private async getCpuUsage(): Promise<number> {
    // Simple CPU usage calculation
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        const cpuPercent = (totalUsage / 1000000) * 100; // Convert to percentage
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }

  // Lifecycle Methods
  private startHealthChecks() {
    // Run health checks every 2 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        await adLoggingService.logError(error as Error, { operation: 'health_check' }, 'medium');
      }
    }, 2 * 60 * 1000);
  }

  private startPerformanceMonitoring() {
    // Run performance monitoring every minute
    this.performanceCheckInterval = setInterval(async () => {
      try {
        const metrics = await this.getPerformanceMetrics();
        const healthMetrics = await this.checkSystemHealth();
        
        await adLoggingService.logPerformanceMetrics('system_monitoring', {
          ...metrics,
          timestamp: Date.now(),
        }, {});

        await this.checkAlerts(metrics, healthMetrics);
      } catch (error) {
        await adLoggingService.logError(error as Error, { operation: 'performance_monitoring' }, 'medium');
      }
    }, 60 * 1000);
  }

  public stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.performanceCheckInterval) {
      clearInterval(this.performanceCheckInterval);
      this.performanceCheckInterval = null;
    }
  }
}

export const adMonitoringService = new AdMonitoringService();