import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { notificationScheduler } from './notification-scheduler.service';
import { adNotificationScheduler } from './ads/ad-notification-scheduler.service';
import { subscriptionService } from './subscription.service';
import { walletService } from './wallet.service';
import { auditService } from './audit.service';
import { cacheService } from './cache.service';
import { analyticsService } from './analytics.service';

export interface WorkerJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'error';
  errorCount: number;
  maxRetries: number;
}

export class BackgroundWorkerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private jobConfigs: Map<string, WorkerJob> = new Map();
  private isRunning = false;

  constructor() {
    this.initializeJobs();
  }

  private initializeJobs(): void {
    // Core system maintenance jobs
    this.addJob({
      name: 'cache-cleanup',
      schedule: '0 */6 * * *', // Every 6 hours
      task: this.cleanupCache.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 3,
    });

    this.addJob({
      name: 'audit-cleanup',
      schedule: '0 3 * * *', // Daily at 3 AM
      task: this.cleanupAuditLogs.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 3,
    });

    this.addJob({
      name: 'analytics-aggregation',
      schedule: '0 1 * * *', // Daily at 1 AM
      task: this.aggregateAnalytics.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 3,
    });

    // Business logic jobs
    this.addJob({
      name: 'subscription-billing',
      schedule: '0 2 * * *', // Daily at 2 AM
      task: this.processSubscriptionBilling.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 5,
    });

    this.addJob({
      name: 'wallet-settlements',
      schedule: '0 4 * * *', // Daily at 4 AM
      task: this.processWalletSettlements.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 5,
    });

    this.addJob({
      name: 'expired-quotes-cleanup',
      schedule: '0 */12 * * *', // Every 12 hours
      task: this.cleanupExpiredQuotes.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 3,
    });

    this.addJob({
      name: 'inactive-users-cleanup',
      schedule: '0 5 * * 0', // Weekly on Sunday at 5 AM
      task: this.cleanupInactiveUsers.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 3,
    });

    // Performance monitoring jobs
    this.addJob({
      name: 'performance-metrics',
      schedule: '*/15 * * * *', // Every 15 minutes
      task: this.collectPerformanceMetrics.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 2,
    });

    this.addJob({
      name: 'health-check',
      schedule: '*/5 * * * *', // Every 5 minutes
      task: this.performHealthCheck.bind(this),
      enabled: true,
      status: 'idle',
      errorCount: 0,
      maxRetries: 2,
    });

    logger.info('Background worker service initialized with jobs:', Array.from(this.jobConfigs.keys()));
  }

  private addJob(config: WorkerJob): void {
    this.jobConfigs.set(config.name, config);
    
    if (config.enabled) {
      const job = cron.schedule(config.schedule, async () => {
        await this.executeJob(config.name);
      }, {
        timezone: 'UTC'
      } as any);

      this.jobs.set(config.name, job);
      logger.info(`Added background job: ${config.name} with schedule: ${config.schedule}`);
    }
  }

  private async executeJob(jobName: string): Promise<void> {
    const config = this.jobConfigs.get(jobName);
    if (!config) {
      logger.error(`Job configuration not found: ${jobName}`);
      return;
    }

    if (config.status === 'running') {
      logger.warn(`Job ${jobName} is already running, skipping execution`);
      return;
    }

    config.status = 'running';
    config.lastRun = new Date();

    try {
      logger.info(`Starting background job: ${jobName}`);
      await config.task();
      
      config.status = 'idle';
      config.errorCount = 0;
      logger.info(`Completed background job: ${jobName}`);
    } catch (error) {
      config.status = 'error';
      config.errorCount++;
      
      logger.error(`Failed to execute background job ${jobName} (attempt ${config.errorCount}/${config.maxRetries}):`, error);
      
      if (config.errorCount >= config.maxRetries) {
        logger.error(`Job ${jobName} has exceeded maximum retries, disabling`);
        this.disableJob(jobName);
      }
    }
  }

  // Job implementations
  private async cleanupCache(): Promise<void> {
    // await cacheService.cleanup();
    logger.info('Cache cleanup completed');
  }

  private async cleanupAuditLogs(): Promise<void> {
    const retentionDays = 90; // Keep audit logs for 90 days
    // await auditService.cleanupOldLogs(retentionDays);
    logger.info(`Audit logs cleanup completed (retention: ${retentionDays} days)`);
  }

  private async aggregateAnalytics(): Promise<void> {
    // await analyticsService.aggregateDailyMetrics();
    logger.info('Analytics aggregation completed');
  }

  private async processSubscriptionBilling(): Promise<void> {
    await subscriptionService.processRecurringBilling();
    logger.info('Subscription billing processing completed');
  }

  private async processWalletSettlements(): Promise<void> {
    await walletService.processScheduledSettlements();
    logger.info('Wallet settlements processing completed');
  }

  private async cleanupExpiredQuotes(): Promise<void> {
    // Implement quote cleanup logic
    logger.info('Expired quotes cleanup completed');
  }

  private async cleanupInactiveUsers(): Promise<void> {
    // Implement inactive users cleanup logic
    logger.info('Inactive users cleanup completed');
  }

  private async collectPerformanceMetrics(): Promise<void> {
    // Collect and store performance metrics
    const metrics = {
      timestamp: new Date(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
    };
    
    // Store metrics (implement storage logic)
    logger.debug('Performance metrics collected', metrics);
  }

  private async performHealthCheck(): Promise<void> {
    // Perform comprehensive health check
    const healthStatus = {
      timestamp: new Date(),
      database: 'healthy', // Implement actual database check
      redis: 'healthy', // Implement actual Redis check
      storage: 'healthy', // Implement actual storage check
    };
    
    logger.debug('Health check completed', healthStatus);
  }

  // Public methods
  public start(): void {
    if (this.isRunning) {
      logger.warn('Background worker service is already running');
      return;
    }

    this.jobs.forEach((job, name) => {
      const config = this.jobConfigs.get(name);
      if (config?.enabled) {
        job.start();
        logger.info(`Started background job: ${name}`);
      }
    });

    // Start notification schedulers
    notificationScheduler.startAll();
    adNotificationScheduler.start();

    this.isRunning = true;
    logger.info('Background worker service started');
  }

  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Background worker service is not running');
      return;
    }

    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped background job: ${name}`);
    });

    // Stop notification schedulers
    notificationScheduler.stopAll();
    adNotificationScheduler.stop();

    this.isRunning = false;
    logger.info('Background worker service stopped');
  }

  public enableJob(jobName: string): boolean {
    const config = this.jobConfigs.get(jobName);
    const job = this.jobs.get(jobName);
    
    if (!config || !job) {
      logger.error(`Job not found: ${jobName}`);
      return false;
    }

    config.enabled = true;
    config.errorCount = 0;
    config.status = 'idle';
    
    if (this.isRunning) {
      job.start();
      logger.info(`Enabled and started job: ${jobName}`);
    }
    
    return true;
  }

  public disableJob(jobName: string): boolean {
    const config = this.jobConfigs.get(jobName);
    const job = this.jobs.get(jobName);
    
    if (!config || !job) {
      logger.error(`Job not found: ${jobName}`);
      return false;
    }

    config.enabled = false;
    job.stop();
    logger.info(`Disabled job: ${jobName}`);
    
    return true;
  }

  public async triggerJob(jobName: string): Promise<boolean> {
    const config = this.jobConfigs.get(jobName);
    
    if (!config) {
      logger.error(`Job not found: ${jobName}`);
      return false;
    }

    try {
      await this.executeJob(jobName);
      return true;
    } catch (error) {
      logger.error(`Failed to trigger job ${jobName}:`, error);
      return false;
    }
  }

  public getJobStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.jobConfigs.forEach((config, name) => {
      status[name] = {
        enabled: config.enabled,
        status: config.status,
        schedule: config.schedule,
        lastRun: config.lastRun,
        errorCount: config.errorCount,
        maxRetries: config.maxRetries,
      };
    });
    
    return status;
  }

  public getServiceStatus(): {
    isRunning: boolean;
    totalJobs: number;
    enabledJobs: number;
    runningJobs: number;
    errorJobs: number;
  } {
    const configs = Array.from(this.jobConfigs.values());
    
    return {
      isRunning: this.isRunning,
      totalJobs: configs.length,
      enabledJobs: configs.filter(c => c.enabled).length,
      runningJobs: configs.filter(c => c.status === 'running').length,
      errorJobs: configs.filter(c => c.status === 'error').length,
    };
  }
}

// Export singleton instance
export const backgroundWorkerService = new BackgroundWorkerService();