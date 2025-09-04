import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { NotificationService } from '@/services/notification.service';

export const processNotificationQueueJob = async (): Promise<void> => {
  try {
    const notificationService = new NotificationService();
    
    // Get pending notifications
    const pendingNotifications = await prisma.notification.findMany({
      where: {
        status: 'pending',
        scheduledFor: {
          lte: new Date(),
        },
      },
      take: 100, // Process 100 notifications at a time
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (pendingNotifications.length === 0) {
      logger.info('No pending notifications to process');
      return;
    }

    let processedCount = 0;
    let failedCount = 0;

    for (const notification of pendingNotifications) {
      try {
        await notificationService.sendNotification(notification.id);
        processedCount++;
      } catch (error) {
        logger.error(`Failed to process notification ${notification.id}:`, error);
        failedCount++;
      }
    }

    logger.info(`Processed ${processedCount} notifications, ${failedCount} failed`);
  } catch (error) {
    logger.error('Error in process notification queue job:', error);
    throw error;
  }
};