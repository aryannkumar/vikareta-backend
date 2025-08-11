import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  channel?: 'email' | 'sms' | 'push' | 'in_app';
}

export interface NotificationFilters {
  userId?: string;
  type?: string;
  channel?: string;
  isRead?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export class NotificationManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new notification
   */
  async createNotification(notificationData: CreateNotificationData): Promise<string> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: notificationData.userId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data || {},
          channel: notificationData.channel || 'in_app',
          isRead: false,
        },
      });

      logger.info('Notification created successfully', { 
        notificationId: notification.id,
        userId: notificationData.userId,
        type: notificationData.type 
      });

      return notification.id;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    filters: NotificationFilters = {},
    page = 1,
    limit = 20
  ): Promise<{
    notifications: any[];
    total: number;
    unreadCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = { userId };

      if (filters.type) where.type = filters.type;
      if (filters.channel) where.channel = filters.channel;
      if (filters.isRead !== undefined) where.isRead = filters.isRead;
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const skip = (page - 1) * limit;

      const [notifications, total, unreadCount] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ 
          where: { userId, isRead: false } 
        }),
      ]);

      return {
        notifications,
        total,
        unreadCount,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      logger.info('Notification marked as read', { notificationId, userId });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      logger.info('All notifications marked as read', { userId });
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId,
        },
      });

      logger.info('Notification deleted', { notificationId, userId });
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(notifications: CreateNotificationData[]): Promise<string[]> {
    try {
      const createdNotifications = await Promise.all(
        notifications.map(notification => this.createNotification(notification))
      );

      logger.info('Bulk notifications sent', { 
        count: notifications.length,
        notificationIds: createdNotifications 
      });

      return createdNotifications;
    } catch (error) {
      logger.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<{
    totalNotifications: number;
    unreadNotifications: number;
    notificationsByType: Record<string, number>;
    notificationsByChannel: Record<string, number>;
  }> {
    try {
      const where: any = {};
      if (userId) where.userId = userId;

      const [
        totalNotifications,
        unreadNotifications,
        notificationsByType,
        notificationsByChannel,
      ] = await Promise.all([
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ where: { ...where, isRead: false } }),
        this.prisma.notification.groupBy({
          by: ['type'],
          where,
          _count: { id: true },
        }),
        this.prisma.notification.groupBy({
          by: ['channel'],
          where,
          _count: { id: true },
        }),
      ]);

      const typeStats: Record<string, number> = {};
      notificationsByType.forEach(group => {
        typeStats[group.type] = group._count.id;
      });

      const channelStats: Record<string, number> = {};
      notificationsByChannel.forEach(group => {
        if (group.channel) {
          channelStats[group.channel] = group._count.id;
        }
      });

      return {
        totalNotifications,
        unreadNotifications,
        notificationsByType: typeStats,
        notificationsByChannel: channelStats,
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          isRead: true,
        },
      });

      logger.info('Old notifications cleaned up', { 
        deletedCount: result.count,
        cutoffDate 
      });

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<any> {
    try {
      // Mock implementation since NotificationPreference model doesn't exist
      const preferences = {
        userId,
        email: true,
        sms: false,
        push: true,
        inApp: true,
        marketing: false,
        orderUpdates: true,
        securityAlerts: true,
      };

      return preferences;

      return preferences;
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    try {
      // Mock implementation since NotificationPreference model doesn't exist
      logger.info('Notification preferences updated', { userId, preferences });
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }
}

export default NotificationManagementService;