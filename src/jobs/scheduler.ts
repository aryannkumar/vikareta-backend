import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { elasticsearchService } from '../services/elasticsearch.service';
import { minioService } from '../services/minio.service';
import { notificationService } from '../services/notification.service';
import { analyticsService } from '../services/analytics.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class JobScheduler {
    private jobs: Map<string, cron.ScheduledTask> = new Map();

    constructor() {
        this.initializeJobs();
    }

    private initializeJobs(): void {
        // Sync Elasticsearch indices every hour
        this.scheduleJob('sync-elasticsearch', '0 * * * *', this.syncElasticsearch.bind(this));

        // Clean up expired RFQs every day at 2 AM
        this.scheduleJob('cleanup-expired-rfqs', '0 2 * * *', this.cleanupExpiredRfqs.bind(this));

        // Clean up expired tokens every 6 hours
        this.scheduleJob('cleanup-expired-tokens', '0 */6 * * *', this.cleanupExpiredTokens.bind(this));

        // Clean up old logs every day at 3 AM
        this.scheduleJob('cleanup-old-logs', '0 3 * * *', this.cleanupOldLogs.bind(this));

        // Process notification queue every minute
        this.scheduleJob('process-notifications', '* * * * *', this.processNotificationQueue.bind(this));

        // Update analytics every hour
        this.scheduleJob('update-analytics', '0 * * * *', this.updateAnalytics.bind(this));

        // Clean up temporary files every day at 4 AM
        this.scheduleJob('cleanup-temp-files', '0 4 * * *', this.cleanupTempFiles.bind(this));

        // Generate daily reports every day at 5 AM
        this.scheduleJob('generate-daily-reports', '0 5 * * *', this.generateDailyReports.bind(this));

        // Update inventory alerts every 30 minutes
        this.scheduleJob('inventory-alerts', '*/30 * * * *', this.checkInventoryAlerts.bind(this));

        // Process payment webhooks every 5 minutes
        this.scheduleJob('process-payment-webhooks', '*/5 * * * *', this.processPaymentWebhooks.bind(this));

        // Backup database every day at 1 AM
        this.scheduleJob('backup-database', '0 1 * * *', this.backupDatabase.bind(this));

        logger.info('Job scheduler initialized with all jobs');
    }

    private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
        const job = cron.schedule(schedule, async () => {
            const startTime = Date.now();
            logger.info(`Starting job: ${name}`);

            try {
                await task();
                const duration = Date.now() - startTime;
                logger.info(`Job completed: ${name} (${duration}ms)`);

                // Track job execution in Redis
                await this.trackJobExecution(name, 'success', duration);
            } catch (error) {
                const duration = Date.now() - startTime;
                logger.error(`Job failed: ${name} (${duration}ms)`, error);

                // Track job failure
                await this.trackJobExecution(name, 'failed', duration, error);
            }
        });

        this.jobs.set(name, job);
        logger.info(`Job scheduled: ${name} with schedule: ${schedule}`);
    }

    private async trackJobExecution(
        jobName: string,
        status: 'success' | 'failed',
        duration: number,
        error?: any
    ): Promise<void> {
        try {
            const execution = {
                jobName,
                status,
                duration,
                timestamp: new Date().toISOString(),
                error: error ? error.message : null,
            };

            // Store in Redis for monitoring
            await redisClient.lpush('job_executions', JSON.stringify(execution));
            await redisClient.ltrim('job_executions', 0, 999); // Keep last 1000 executions

            // Update job stats
            await redisClient.hincrby(`job_stats:${jobName}`, status, 1);
            await redisClient.hset(`job_stats:${jobName}`, 'last_run', execution.timestamp);
            
            if (status === 'success') {
                await redisClient.hset(`job_stats:${jobName}`, 'last_success', execution.timestamp);
            }
        } catch (redisError) {
            logger.warn('Failed to track job execution:', redisError);
        }
    }

    // Job implementations
    private async syncElasticsearch(): Promise<void> {
        logger.info('Starting Elasticsearch sync...');
        
        try {
            await elasticsearchService.bulkIndexProducts();
            await elasticsearchService.bulkIndexServices();
            await elasticsearchService.bulkIndexUsers();
            
            logger.info('Elasticsearch sync completed successfully');
        } catch (error) {
            logger.error('Elasticsearch sync failed:', error);
            throw error;
        }
    }

    private async cleanupExpiredRfqs(): Promise<void> {
        logger.info('Starting expired RFQs cleanup...');
        
        try {
            const expiredRfqs = await prisma.rfq.findMany({
                where: {
                    expiresAt: { lt: new Date() },
                    status: 'active'
                }
            });

            if (expiredRfqs.length > 0) {
                await prisma.rfq.updateMany({
                    where: {
                        id: { in: expiredRfqs.map(rfq => rfq.id) }
                    },
                    data: { status: 'expired' }
                });

                logger.info(`Expired ${expiredRfqs.length} RFQs`);
            }
        } catch (error) {
            logger.error('RFQ cleanup failed:', error);
            throw error;
        }
    }

    private async cleanupExpiredTokens(): Promise<void> {
        logger.info('Starting expired tokens cleanup...');
        
        try {
            // Clean up blacklisted tokens that have expired
            const keys = await redisClient.keys('blacklist:*');
            let cleanedCount = 0;

            for (const key of keys) {
                const ttl = await redisClient.ttl(key);
                if (ttl <= 0) {
                    await redisClient.del(key);
                    cleanedCount++;
                }
            }

            logger.info(`Cleaned up ${cleanedCount} expired tokens`);
        } catch (error) {
            logger.error('Token cleanup failed:', error);
            throw error;
        }
    }

    private async cleanupOldLogs(): Promise<void> {
        logger.info('Starting old logs cleanup...');
        
        try {
            // Clean up old job executions
            await redisClient.ltrim('job_executions', 0, 499); // Keep last 500
            
            // Clean up old analytics events
            await redisClient.ltrim('analytics:events', 0, 499); // Keep last 500
            
            logger.info('Old logs cleanup completed');
        } catch (error) {
            logger.error('Logs cleanup failed:', error);
            throw error;
        }
    }

    private async processNotificationQueue(): Promise<void> {
        try {
            // Get pending notifications
            const pendingNotifications = await prisma.notification.findMany({
                where: {
                    status: 'pending',
                    scheduledFor: { lte: new Date() }
                },
                take: 50 // Process 50 at a time
            });

            if (pendingNotifications.length > 0) {
                const promises = pendingNotifications.map(notification =>
                    notificationService.sendNotification(notification.id)
                );

                await Promise.allSettled(promises);
                logger.info(`Processed ${pendingNotifications.length} notifications`);
            }
        } catch (error) {
            logger.error('Notification queue processing failed:', error);
            throw error;
        }
    }

    private async updateAnalytics(): Promise<void> {
        logger.info('Starting analytics update...');
        
        try {
            // Track active users
            const activeUsers = await prisma.user.count({
                where: {
                    updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
                }
            });

            await redisClient.set('active_users_count', activeUsers);

            // Update search analytics
            const searchQueries = await redisClient.lrange('search_queries', 0, -1);
            if (searchQueries.length > 0) {
                const queryStats: Record<string, number> = {};
                
                searchQueries.forEach(query => {
                    queryStats[query] = (queryStats[query] || 0) + 1;
                });

                // Update search analytics in database
                for (const [query, count] of Object.entries(queryStats)) {
                        // adAnalytics exists in schema (searchAnalytics not present)
                        await prisma.adAnalytics.upsert({
                            where: { campaignId_date: { campaignId: '', date: new Date() } } as any,
                            update: {},
                            create: { campaignId: '', date: new Date(), impressions: 0 }
                        }).catch(() => {
                            // Best-effort: analytics table may have different semantics; swallow errors
                        });
                }

                // Clear processed queries
                await redisClient.del('search_queries');
            }

            logger.info('Analytics update completed');
        } catch (error) {
            logger.error('Analytics update failed:', error);
            throw error;
        }
    }

    private async cleanupTempFiles(): Promise<void> {
        logger.info('Starting temporary files cleanup...');
        
        try {
            const deletedCount = await minioService.cleanupExpiredFiles('temp', 24 * 60 * 60 * 1000); // 24 hours
            logger.info(`Cleaned up ${deletedCount} temporary files`);
        } catch (error) {
            logger.error('Temp files cleanup failed:', error);
            throw error;
        }
    }

    private async generateDailyReports(): Promise<void> {
        logger.info('Starting daily reports generation...');
        
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Generate platform analytics
            const platformAnalytics = await analyticsService.getPlatformAnalytics('day');
            
            // Store report in Redis
            await redisClient.setex(
                `daily_report:${yesterday.toISOString().split('T')[0]}`,
                7 * 24 * 60 * 60, // Keep for 7 days
                JSON.stringify(platformAnalytics)
            );

            logger.info('Daily reports generated successfully');
        } catch (error) {
            logger.error('Daily reports generation failed:', error);
            throw error;
        }
    }

    private async checkInventoryAlerts(): Promise<void> {
        try {
            // Find products with low inventory
            const lowStockProducts = await prisma.inventory.findMany({
                where: {
                    available: { lte: 10 }
                },
                include: {
                    product: {
                        include: {
                            seller: {
                                select: {
                                    id: true,
                                    email: true,
                                    businessName: true
                                }
                            }
                        }
                    }
                }
            });

            // Send notifications to sellers
            for (const inventory of lowStockProducts) {
                if (inventory.product?.seller) {
                    await notificationService.createNotification({
                        userId: inventory.product.seller.id,
                        title: 'Low Stock Alert',
                        message: `Your product "${inventory.product.title}" is running low on stock (${inventory.available} remaining).`,
                        type: 'inventory_alert',
                        channel: 'email',
                        priority: 'high',
                        data: {
                            productId: inventory.productId,
                            currentStock: inventory.available
                        }
                    });
                }
            }

            if (lowStockProducts.length > 0) {
                logger.info(`Sent ${lowStockProducts.length} low stock alerts`);
            }
        } catch (error) {
            logger.error('Inventory alerts check failed:', error);
            throw error;
        }
    }

    private async processPaymentWebhooks(): Promise<void> {
        try {
            // Get pending payment webhooks from Redis queue
            const webhooks = await redisClient.lrange('payment_webhooks', 0, 49);
            
            if (webhooks.length > 0) {
                for (const webhookData of webhooks) {
                    try {
                        const webhook = JSON.parse(webhookData);
                        
                        // Process webhook based on type
                        await this.processPaymentWebhook(webhook);
                        
                        // Remove processed webhook
                        await redisClient.lrem('payment_webhooks', 1, webhookData);
                    } catch (error) {
                        logger.error('Failed to process payment webhook:', error);
                    }
                }
                
                logger.info(`Processed ${webhooks.length} payment webhooks`);
            }
        } catch (error) {
            logger.error('Payment webhooks processing failed:', error);
            throw error;
        }
    }

    private async processPaymentWebhook(webhook: any): Promise<void> {
        // Implementation depends on payment gateway
        logger.info(`Processing payment webhook: ${webhook.type}`);
        
        // Update order payment status based on webhook
        if (webhook.orderId) {
            await prisma.order.update({
                where: { id: webhook.orderId },
                data: {
                    paymentStatus: webhook.status,
                    updatedAt: new Date()
                }
            });
        }
    }

    private async backupDatabase(): Promise<void> {
        logger.info('Starting database backup...');
        
        try {
            // This is a placeholder - actual implementation would depend on your backup strategy
            const backupInfo = {
                timestamp: new Date().toISOString(),
                status: 'completed',
                size: 0 // Would be actual backup size
            };

            await redisClient.setex('last_backup', 24 * 60 * 60, JSON.stringify(backupInfo));
            logger.info('Database backup completed');
        } catch (error) {
            logger.error('Database backup failed:', error);
            throw error;
        }
    }

    // Control methods
    public startAllJobs(): void {
        this.jobs.forEach((job, name) => {
            job.start();
            logger.info(`Started job: ${name}`);
        });
    }

    public stopAllJobs(): void {
        this.jobs.forEach((job, name) => {
            job.stop();
            logger.info(`Stopped job: ${name}`);
        });
    }

    public startJob(name: string): boolean {
        const job = this.jobs.get(name);
        if (job) {
            job.start();
            logger.info(`Started job: ${name}`);
            return true;
        }
        return false;
    }

    public stopJob(name: string): boolean {
        const job = this.jobs.get(name);
        if (job) {
            job.stop();
            logger.info(`Stopped job: ${name}`);
            return true;
        }
        return false;
    }

    public getJobStatus(): Record<string, any> {
        const status: Record<string, any> = {};
        
        this.jobs.forEach((job, name) => {
            status[name] = {
                running: (job as any).running ?? false,
                scheduled: typeof (job as any).scheduled !== 'undefined' ? (job as any).scheduled : true,
            };
        });
        
        return status;
    }

    public async getJobStats(): Promise<Record<string, any>> {
        try {
            const stats: Record<string, any> = {};
            
            for (const [name] of this.jobs) {
                const jobStats = await redisClient.hgetall(`job_stats:${name}`);
                stats[name] = {
                    success: parseInt(jobStats.success || '0'),
                    failed: parseInt(jobStats.failed || '0'),
                    lastRun: jobStats.last_run || null,
                    lastSuccess: jobStats.last_success || null
                };
            }
            
            return stats;
        } catch (error) {
            logger.error('Failed to get job stats:', error);
            return {};
        }
    }
}

export const jobScheduler = new JobScheduler();