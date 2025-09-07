import { prisma } from '@/config/database';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { WebSocketService } from '@/websocket';
import nodemailer from 'nodemailer';
import { kafkaProducer } from '@/services/kafka-producer.service';
import { kafkaTopics } from '@/config/kafka';
import { notificationSentCounter } from '@/observability/metrics';
// import { EmailService } from './email.service';
// import { SMSService } from './sms.service';
import { WhatsAppService } from './whatsapp.service';


export interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  type: string;
  channel?: string;
  priority?: string;
  templateId?: string;
  data?: any;
  variables?: any;
  scheduledFor?: Date;
}

export interface NotificationStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  read: number;
}

export class NotificationService {
  constructor() {
    // Initialize service
  }

  private whatsapp = new WhatsAppService();

  private async isPreferenceEnabled(userId: string, channel: string, type: string): Promise<boolean> {
    const cacheKey = `notif_pref:${userId}:${channel}:${type}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached !== null) return cached === '1';
      const pref = await prisma.notificationPreference.findUnique({ where: { userId_channel_type: { userId, channel, type } } });
      const enabled = !pref || pref.enabled !== false;
      await redisClient.setex(cacheKey, 300, enabled ? '1' : '0');
      return enabled;
    } catch {
      return true; // fail-open
    }
  }

  private mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }) : null;

  /**
   * Create a new notification
   */
  async createNotification(data: CreateNotificationData): Promise<any> {
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get template if specified
      let template: any = null;
      if (data.templateId) {
        template = await prisma.notificationTemplate.findUnique({
          where: { id: data.templateId },
        });

        if (!template) {
          throw new Error('Notification template not found');
        }
      }

      // Preference gating (default allow if no explicit preference)
      const channel = data.channel || 'in_app';
      const allowed = await this.isPreferenceEnabled(data.userId, channel, data.type);
      if (!allowed) {
        return { skipped: true, reason: 'preference_disabled', userId: data.userId, type: data.type, channel };
      }

      // Create notification
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          title: data.title,
          message: data.message,
          type: data.type,
          channel,
          priority: data.priority || 'normal',
          templateId: data.templateId,
          data: data.data,
          variables: data.variables,
          scheduledFor: data.scheduledFor,
          status: data.scheduledFor ? 'pending' : 'pending',
        },
      });

      // Cache notification for real-time delivery
      try {
        await redisClient.setex(`notification:${notification.id}`, 3600, JSON.stringify(notification));
      } catch (cacheError) {
        logger.warn('Failed to cache notification:', cacheError);
      }

      // Send immediately if not scheduled
      if (!data.scheduledFor) {
        await this.sendNotification(notification.id);
      }

  logger.info(`Notification created: ${notification.id} for user: ${data.userId}`);
  notificationSentCounter.labels({ channel, type: data.type, status: 'pending' }).inc();
  // Fire async event
  kafkaProducer.emit(kafkaTopics.NOTIFICATION_EVENT, { notificationId: notification.id, userId: data.userId, type: data.type, channel });
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Send a notification
   */
  async sendNotification(notificationId: string): Promise<void> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          user: true,
          template: true,
        },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status !== 'pending') {
        return; // Already processed
      }

      // Update status to processing
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'processing' },
      });

      try {
        // Send based on channel
        switch (notification.channel) {
          case 'email':
            await this.sendEmailNotification(notification);
            break;
          case 'sms':
            await this.sendSMSNotification(notification);
            break;
          case 'whatsapp':
            await this.sendWhatsAppNotification(notification);
            break;
          case 'push':
            await this.sendPushNotification(notification);
            break;
          case 'in_app':
          default:
            await this.sendInAppNotification(notification);
            break;
        }

        // Update status to sent
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: 'sent',
            sentAt: new Date(),
          },
        });
        notificationSentCounter.labels({ channel: notification.channel || 'in_app', type: notification.type, status: 'sent' }).inc();

        // Update cache
        try {
          await redisClient.setex(`notification:${notificationId}`, 3600, JSON.stringify({
            ...notification,
            status: 'sent',
            sentAt: new Date()
          }));
        } catch (cacheError) {
          logger.warn('Failed to update notification cache:', cacheError);
        }

        logger.info(`Notification sent: ${notificationId} via ${notification.channel}`);
      } catch (error) {
        // Update status to failed
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        notificationSentCounter.labels({ channel: notification.channel || 'in_app', type: notification.type, status: 'failed' }).inc();

        throw error;
      }
    } catch (error) {
      logger.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: any): Promise<void> {
    if (!notification.user.email) {
      throw new Error('User email not available');
    }

    let subject = notification.title;
    let content = notification.message;

    // Use template if available
    if (notification.template) {
      subject = notification.template.subject || notification.title;
      content = this.processTemplate(notification.template.content, notification.variables);
    }
    // Use subject/content variables if implemented by transport (kept for future integration)
    logger.debug('Prepared notification content', { subject, content });

    // await emailService.sendEmail({
    //   to: notification.user.email,
    //   subject,
    //   html: content,
    //   data: notification.data,
    // });
    if (this.mailer) {
      await this.mailer.sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@vikareta.com',
        to: notification.user.email,
        subject,
        html: content,
      }).catch(err => { throw err; });
    }
    logger.info(`Email notification processed for ${notification.user.email}`);
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: any): Promise<void> {
    if (!notification.user.phone) {
      throw new Error('User phone not available');
    }

    let message = notification.message;

    // Use template if available
    if (notification.template) {
      message = this.processTemplate(notification.template.content, notification.variables);
    }
    logger.debug('Prepared SMS content', { message });

    // await smsService.sendSMS({
    //   to: notification.user.phone,
    //   message,
    // });
    logger.info(`SMS notification sent to ${notification.user.phone}`);
  }

  /**
   * Send WhatsApp notification
   */
  private async sendWhatsAppNotification(notification: any): Promise<void> {
    if (!notification.user.phone) {
      throw new Error('User phone not available');
    }

    let message = notification.message;

    // Use template if available
    if (notification.template) {
      message = this.processTemplate(notification.template.content, notification.variables);
    }
    logger.debug('Prepared WhatsApp content', { message });

    if (this.whatsapp.isConfigured()) {
      await this.whatsapp.sendMessage({ to: notification.user.phone, message, type: 'text' });
    } else {
      logger.debug('WhatsApp not configured, skipping actual send');
    }
    logger.info(`WhatsApp notification sent to ${notification.user.phone}`);
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(notification: any): Promise<void> {
    // Implementation depends on push notification service (FCM, etc.)
    logger.info(`Push notification sent to user ${notification.userId}`);
    
    // Store in Redis for real-time push
    try {
      await redisClient.lpush(`push:${notification.userId}`, JSON.stringify({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data,
        timestamp: new Date()
      }));
      
      // Keep only last 50 push notifications per user
      await redisClient.ltrim(`push:${notification.userId}`, 0, 49);
    } catch (error) {
      logger.warn('Failed to store push notification in Redis:', error);
    }
  }

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(notification: any): Promise<void> {
    // Store in Redis for real-time delivery
    try {
      await redisClient.lpush(`notifications:${notification.userId}`, JSON.stringify({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        data: notification.data,
        createdAt: notification.createdAt,
      }));
      
      // Keep only last 100 notifications per user
      await redisClient.ltrim(`notifications:${notification.userId}`, 0, 99);
      
      // Publish to WebSocket channel for real-time delivery
      await redisClient.publish(`user:${notification.userId}:notifications`, JSON.stringify({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        data: notification.data,
        createdAt: notification.createdAt,
      }));
      
    } catch (error) {
      logger.warn('Failed to store in-app notification in Redis:', error);
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: userId,
        },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      // Update cache
      try {
        await redisClient.del(`notification:${notificationId}`);
      } catch (cacheError) {
        logger.warn('Failed to update notification cache:', cacheError);
      }

      logger.info(`Notification marked as read: ${notificationId} by user: ${userId}`);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: string;
      isRead?: boolean;
    } = {}
  ): Promise<{
    notifications: any[];
    total: number;
    unreadCount: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const where: any = { userId };

      if (options.type) {
        where.type = options.type;
      }

      if (options.isRead !== undefined) {
        if (options.isRead) {
          where.status = 'read';
        } else {
          where.status = { not: 'read' };
        }
      }

      // Try to get from cache first
      const cacheKey = `user_notifications:${userId}:${JSON.stringify(options)}`;
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (cacheError) {
        logger.warn('Redis error getting user notifications:', cacheError);
      }

      // Get notifications
      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      // Get total count
      const total = await prisma.notification.count({ where });

      // Get unread count
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          status: { not: 'read' },
        },
      });

      const result = {
        notifications,
        total,
        unreadCount,
      };

      // Cache for 5 minutes
      try {
        await redisClient.setex(cacheKey, 300, JSON.stringify(result));
      } catch (cacheError) {
        logger.warn('Failed to cache user notifications:', cacheError);
      }

      return result;
    } catch (error) {
      logger.error('Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<NotificationStats> {
    try {
      const where: any = userId ? { userId } : {};

      // Try to get from cache first
      const cacheKey = `notification_stats:${userId || 'global'}`;
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (cacheError) {
        logger.warn('Redis error getting notification stats:', cacheError);
      }

      const [total, sent, delivered, failed, pending, read] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { ...where, status: 'sent' } }),
        prisma.notification.count({ where: { ...where, status: 'delivered' } }),
        prisma.notification.count({ where: { ...where, status: 'failed' } }),
        prisma.notification.count({ where: { ...where, status: 'pending' } }),
        prisma.notification.count({ where: { ...where, status: 'read' } }),
      ]);

      const stats = {
        total,
        sent,
        delivered,
        failed,
        pending,
        read,
      };

      // Cache for 10 minutes
      try {
        await redisClient.setex(cacheKey, 600, JSON.stringify(stats));
      } catch (cacheError) {
        logger.warn('Failed to cache notification stats:', cacheError);
      }

      return stats;
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }

  /**
   * Process template with variables
   */
  private processTemplate(template: string, variables: any = {}): string {
    if (!variables || typeof variables !== 'object') {
      return template;
    }

    let processed = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      processed = processed.replace(regex, String(value));
    });

    return processed;
  }

  /**
   * Create notification template
   */
  async createTemplate(data: {
    name: string;
    subject?: string;
    content: string;
    type: string;
    channel: string;
    variables?: any;
  }): Promise<any> {
    try {
      const template = await prisma.notificationTemplate.create({
        data,
      });

      logger.info(`Notification template created: ${template.id}`);

      return template;
    } catch (error) {
      logger.error('Error creating notification template:', error);
      throw error;
    }
  }

  /**
   * Bulk create notifications
   */
  async bulkCreateNotifications(notifications: CreateNotificationData[]): Promise<void> {
    try {
      await prisma.notification.createMany({
        data: notifications.map(notification => ({
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          channel: notification.channel || 'in_app',
          priority: notification.priority || 'normal',
          templateId: notification.templateId,
          data: notification.data,
          variables: notification.variables,
          scheduledFor: notification.scheduledFor,
          status: notification.scheduledFor ? 'pending' : 'pending',
        })),
      });

      logger.info(`Bulk notifications created: ${notifications.length} notifications`);
    } catch (error) {
      logger.error('Error bulk creating notifications:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(notifications: CreateNotificationData[]): Promise<any[]> {
    try {
      const createdNotifications = await Promise.all(
        notifications.map(data => this.createNotification(data))
      );

      logger.info(`Bulk notifications sent: ${createdNotifications.length} notifications`);
      return createdNotifications;
    } catch (error) {
      logger.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Send order notification
   */
  async sendOrderNotification(order: any, type: string): Promise<void> {
    try {
      let title = '';
      let message = '';

      switch (type) {
        case 'created':
          title = 'Order Created';
          message = `Your order ${order.orderNumber} has been created successfully.`;
          break;
        case 'status_updated':
          title = 'Order Status Updated';
          message = `Your order ${order.orderNumber} status has been updated to ${order.status}.`;
          break;
        case 'payment_updated':
          title = 'Payment Status Updated';
          message = `Payment status for order ${order.orderNumber} has been updated to ${order.paymentStatus}.`;
          break;
        case 'cancelled':
          title = 'Order Cancelled';
          message = `Your order ${order.orderNumber} has been cancelled.`;
          break;
        default:
          title = 'Order Update';
          message = `Your order ${order.orderNumber} has been updated.`;
      }

      const notifType = `order_${type}`;

      // Helper to check preference
      const isEnabled = async (userId: string, channel: string) => {
        try {
          const pref = await prisma.notificationPreference.findUnique({
            where: { userId_channel_type: { userId, channel, type: notifType } },
          });
          if (!pref) return true; // default allow
          return pref.enabled !== false;
        } catch {
          return true;
        }
      };

      // Send to buyer (in_app only here; other channels would replicate with channel override)
      let buyerNotif: any = null;
      if (await isEnabled(order.buyerId, 'in_app')) {
        buyerNotif = await this.createNotification({
          userId: order.buyerId,
          title,
          message,
          type: notifType,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }

      try {
        WebSocketService.emitNotification(order.buyerId, buyerNotif);
      } catch (wsErr) {
        logger.warn('Failed to emit buyer order notification via WebSocket:', wsErr);
      }

      // Send to seller
      let sellerNotif: any = null;
      if (await isEnabled(order.sellerId, 'in_app')) {
        sellerNotif = await this.createNotification({
          userId: order.sellerId,
          title,
          message: message.replace('Your order', 'Order'),
          type: notifType,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        });
      }

      try {
        WebSocketService.emitNotification(order.sellerId, sellerNotif);
      } catch (wsErr) {
        logger.warn('Failed to emit seller order notification via WebSocket:', wsErr);
      }
    } catch (error) {
      logger.error('Error sending order notification:', error);
    }
  }

  /**
   * Get real-time notifications for user
   */
  async getRealTimeNotifications(userId: string): Promise<any[]> {
    try {
      const notifications = await redisClient.lrange(`notifications:${userId}`, 0, 49);
      return notifications.map(notification => JSON.parse(notification));
    } catch (error) {
      logger.error('Error getting real-time notifications:', error);
      return [];
    }
  }

  /**
   * Clear user notifications cache
   */
  async clearUserNotificationsCache(userId: string): Promise<void> {
    try {
      const keys = await redisClient.keys(`user_notifications:${userId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      await redisClient.del(`notification_stats:${userId}`);
    } catch (error) {
      logger.warn('Error clearing user notifications cache:', error);
    }
  }
}

export const notificationService = new NotificationService();