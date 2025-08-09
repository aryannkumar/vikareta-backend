import * as cron from 'node-cron';
import { notificationService } from './notification.service';
import { logger } from '../utils/logger';

export class NotificationSchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.initializeScheduledJobs();
  }

  private initializeScheduledJobs(): void {
    // Process scheduled notifications every 5 minutes
    this.scheduleJob('process-scheduled', '*/5 * * * *', async () => {
      await notificationService.processScheduledNotifications();
    });

    // Process scheduled batches every 10 minutes
    this.scheduleJob('process-batches', '*/10 * * * *', async () => {
      await notificationService.processScheduledBatches();
    });

    // Send daily digest notifications at 8 AM
    this.scheduleJob('daily-digest', '0 8 * * *', async () => {
      await notificationService.createDigestNotifications('daily');
    });

    // Send weekly digest notifications on Monday at 9 AM
    this.scheduleJob('weekly-digest', '0 9 * * 1', async () => {
      await notificationService.createDigestNotifications('weekly');
    });

    // Send re-engagement notifications every Sunday at 10 AM
    this.scheduleJob('re-engagement', '0 10 * * 0', async () => {
      await notificationService.sendReEngagementNotifications();
    });

    // Cleanup old notifications every day at 2 AM
    this.scheduleJob('cleanup-notifications', '0 2 * * *', async () => {
      await notificationService.cleanupOldNotifications(90); // 90 days retention
    });

    logger.info('Notification scheduler initialized with scheduled jobs');
  }

  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    const job = cron.schedule(schedule, async () => {
      try {
        logger.info(`Starting scheduled job: ${name}`);
        await task();
        logger.info(`Completed scheduled job: ${name}`);
      } catch (error) {
        logger.error(`Failed to execute scheduled job ${name}:`, error);
      }
    }, {
      timezone: 'Asia/Kolkata' // Indian timezone
    });

    this.jobs.set(name, job);
    logger.info(`Scheduled job '${name}' with cron pattern: ${schedule}`);
  }

  // Start all scheduled jobs
  public startAll(): void {
    this.jobs.forEach((job, name) => {
      job.start();
      logger.info(`Started scheduled job: ${name}`);
    });
  }

  // Stop all scheduled jobs
  public stopAll(): void {
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    });
  }

  // Start specific job
  public startJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.start();
      logger.info(`Started scheduled job: ${name}`);
      return true;
    }
    logger.warn(`Scheduled job not found: ${name}`);
    return false;
  }

  // Stop specific job
  public stopJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
      return true;
    }
    logger.warn(`Scheduled job not found: ${name}`);
    return false;
  }

  // Get job status
  public getJobStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.jobs.forEach((_, name) => {
      status[name] = true; // Simplified - assume all jobs are active
    });
    return status;
  }

  // Add custom scheduled job
  public addCustomJob(name: string, schedule: string, task: () => Promise<void>): boolean {
    try {
      if (this.jobs.has(name)) {
        logger.warn(`Job with name '${name}' already exists`);
        return false;
      }

      this.scheduleJob(name, schedule, task);
      return true;
    } catch (error) {
      logger.error(`Failed to add custom job '${name}':`, error);
      return false;
    }
  }

  // Remove scheduled job
  public removeJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      job.destroy();
      this.jobs.delete(name);
      logger.info(`Removed scheduled job: ${name}`);
      return true;
    }
    logger.warn(`Scheduled job not found: ${name}`);
    return false;
  }

  // Manual trigger for specific job type
  public async triggerJob(jobType: string): Promise<boolean> {
    try {
      switch (jobType) {
        case 'process-scheduled':
          await notificationService.processScheduledNotifications();
          break;
        case 'process-batches':
          await notificationService.processScheduledBatches();
          break;
        case 'daily-digest':
          await notificationService.createDigestNotifications('daily');
          break;
        case 'weekly-digest':
          await notificationService.createDigestNotifications('weekly');
          break;
        case 're-engagement':
          await notificationService.sendReEngagementNotifications();
          break;
        case 'cleanup-notifications':
          await notificationService.cleanupOldNotifications(90);
          break;
        default:
          logger.warn(`Unknown job type: ${jobType}`);
          return false;
      }
      
      logger.info(`Manually triggered job: ${jobType}`);
      return true;
    } catch (error) {
      logger.error(`Failed to trigger job ${jobType}:`, error);
      return false;
    }
  }

  // Get next execution times for all jobs
  public getNextExecutionTimes(): Record<string, Date | null> {
    const nextTimes: Record<string, Date | null> = {};
    this.jobs.forEach((_, name) => {
      try {
        // Note: node-cron doesn't provide direct access to next execution time
        // This is a simplified implementation
        nextTimes[name] = null; // Would need additional logic to calculate next execution
      } catch (error) {
        nextTimes[name] = null;
      }
    });
    return nextTimes;
  }
}

// Export singleton instance
export const notificationScheduler = new NotificationSchedulerService();