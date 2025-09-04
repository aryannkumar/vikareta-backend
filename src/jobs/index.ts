import cron from 'node-cron';
import { logger } from '@/utils/logger';
import { cleanupExpiredTokensJob } from '@/jobs/cleanup-expired-tokens.job';
import { processNotificationQueueJob } from '@/jobs/process-notification-queue.job';
import { updateAnalyticsJob } from '@/jobs/update-analytics.job';
import { cleanupExpiredRFQsJob } from '@/jobs/cleanup-expired-rfqs.job';
import { processPaymentWebhooksJob } from '@/jobs/process-payment-webhooks.job';
import { generateReportsJob } from '@/jobs/generate-reports.job';
import { backupDatabaseJob } from '@/jobs/backup-database.job';
import { syncElasticsearchJob } from '@/jobs/sync-elasticsearch.job';
import { cleanupOldLogsJob } from '@/jobs/cleanup-old-logs.job';
import { updateInventoryJob } from '@/jobs/update-inventory.job';

export const startCronJobs = (): void => {
  logger.info('🕐 Starting cron jobs...');

  // Cleanup expired tokens - every hour
  cron.schedule('0 * * * *', async () => {
    await runJob('cleanup-expired-tokens', cleanupExpiredTokensJob);
  });

  // Process notification queue - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runJob('process-notification-queue', processNotificationQueueJob);
  });

  // Update analytics - every hour
  cron.schedule('0 * * * *', async () => {
    await runJob('update-analytics', updateAnalyticsJob);
  });

  // Cleanup expired RFQs - every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    await runJob('cleanup-expired-rfqs', cleanupExpiredRFQsJob);
  });

  // Process payment webhooks - every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await runJob('process-payment-webhooks', processPaymentWebhooksJob);
  });

  // Generate reports - daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    await runJob('generate-reports', generateReportsJob);
  });

  // Backup database - daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await runJob('backup-database', backupDatabaseJob);
  });

  // Sync Elasticsearch - every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await runJob('sync-elasticsearch', syncElasticsearchJob);
  });

  // Cleanup old logs - daily at 4 AM
  cron.schedule('0 4 * * *', async () => {
    await runJob('cleanup-old-logs', cleanupOldLogsJob);
  });

  // Update inventory - every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runJob('update-inventory', updateInventoryJob);
  });

  logger.info('✅ Cron jobs started successfully');
};

const runJob = async (jobName: string, jobFunction: () => Promise<void>): Promise<void> => {
  const startTime = Date.now();
  
  try {
    logger.info(`Starting cron job: ${jobName}`);
    await jobFunction();
    const duration = Date.now() - startTime;
    logger.info(`Completed cron job: ${jobName} in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Failed cron job: ${jobName} after ${duration}ms`, error);
  }
};