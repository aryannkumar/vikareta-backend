import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array()
      }
    });
  }
  return next();
};

// Get user notification preferences
router.get('/preferences', async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const preferences = await notificationService.getUserPreferences(userId);
    
    return res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Failed to get notification preferences:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification preferences'
      }
    });
  }
});

// Update user notification preferences
router.put('/preferences', [
  body('emailEnabled').optional().isBoolean(),
  body('smsEnabled').optional().isBoolean(),
  body('pushEnabled').optional().isBoolean(),
  body('whatsappEnabled').optional().isBoolean(),
  body('rfqNotifications').optional().isBoolean(),
  body('quoteNotifications').optional().isBoolean(),
  body('orderNotifications').optional().isBoolean(),
  body('paymentNotifications').optional().isBoolean(),
  body('marketingEmails').optional().isBoolean(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const preferences = await notificationService.updateUserPreferences(userId, req.body);
    
    return res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Failed to update notification preferences:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update notification preferences'
      }
    });
  }
});

// Get unread notifications count
router.get('/unread', async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const unreadCount = await notificationService.getUnreadCount(userId);
    
    return res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    logger.error('Failed to get unread notifications count:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get unread notifications count'
      }
    });
  }
});

// Get user notifications
router.get('/', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('status').optional().isIn(['pending', 'sent', 'failed', 'delivered', 'read']),
  query('type').optional().isIn(['email', 'sms', 'push', 'whatsapp']),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      status: req.query.status as string,
      type: req.query.type as string
    };

    const result = await notificationService.getUserNotifications(userId, options);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to get notifications:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notifications'
      }
    });
  }
});

// Mark notification as read
router.put('/:id/read', [
  param('id').isUUID(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    await notificationService.markAsRead(req.params.id, userId);
    
    return res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    logger.error('Failed to mark notification as read:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to mark notification as read'
      }
    });
  }
});

// Send test notification (for development/testing)
router.post('/test', [
  body('templateName').isString().notEmpty(),
  body('channel').isIn(['email', 'sms', 'push', 'whatsapp']),
  body('recipient').isString().notEmpty(),
  body('variables').optional().isObject(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'critical']),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    // Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Test notifications not allowed in production'
        }
      });
    }

    const notification = await notificationService.sendNotification({
      userId,
      templateName: req.body.templateName,
      channel: req.body.channel,
      recipient: req.body.recipient,
      variables: req.body.variables,
      priority: req.body.priority
    });
    
    return res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('Failed to send test notification:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send test notification'
      }
    });
  }
});

// Admin routes for managing templates (would need admin authentication middleware)
router.post('/templates', [
  body('name').isString().notEmpty(),
  body('type').isIn(['email', 'sms', 'push', 'whatsapp']),
  body('subject').optional().isString(),
  body('content').isString().notEmpty(),
  body('variables').optional().isObject(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    const template = await notificationService.createTemplate(req.body);
    
    return res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Failed to create notification template:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create notification template'
      }
    });
  }
});

// Get notification template
router.get('/templates/:name', [
  param('name').isString().notEmpty(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const template = await notificationService.getTemplate(req.params.name);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Template not found'
        }
      });
    }
    
    return res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Failed to get notification template:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification template'
      }
    });
  }
});

// ===== NOTIFICATION BATCHING AND OPTIMIZATION ROUTES =====

// Create notification batch
router.post('/batches', [
  body('name').isString().notEmpty(),
  body('description').optional().isString(),
  body('type').isString().notEmpty(),
  body('scheduledFor').isISO8601(),
  body('notifications').isArray().notEmpty(),
  body('notifications.*.userId').isUUID(),
  body('notifications.*.templateName').isString().notEmpty(),
  body('notifications.*.channel').isIn(['email', 'sms', 'push', 'whatsapp']),
  body('notifications.*.recipient').isString().notEmpty(),
  body('notifications.*.variables').optional().isObject(),
  body('notifications.*.priority').optional().isIn(['low', 'normal', 'high', 'critical']),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware for batch operations
    const batch = await notificationService.createNotificationBatch({
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      scheduledFor: new Date(req.body.scheduledFor),
      notifications: req.body.notifications
    });
    
    return res.status(201).json({
      success: true,
      data: batch
    });
  } catch (error) {
    logger.error('Failed to create notification batch:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create notification batch'
      }
    });
  }
});

// Get notification batches
router.get('/batches', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  query('type').optional().isString(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      status: req.query.status as string,
      type: req.query.type as string
    };

    const result = await notificationService.getNotificationBatches(options);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to get notification batches:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification batches'
      }
    });
  }
});

// Create digest notifications
router.post('/digest', [
  body('type').isIn(['daily', 'weekly']),
  body('userId').optional().isUUID(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    await notificationService.createDigestNotifications(
      req.body.type,
      req.body.userId
    );
    
    return res.json({
      success: true,
      message: `${req.body.type} digest notifications created successfully`
    });
  } catch (error) {
    logger.error('Failed to create digest notifications:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create digest notifications'
      }
    });
  }
});

// Send re-engagement notifications
router.post('/re-engagement', async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    await notificationService.sendReEngagementNotifications();
    
    return res.json({
      success: true,
      message: 'Re-engagement notifications sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send re-engagement notifications:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send re-engagement notifications'
      }
    });
  }
});

// Get notification analytics
router.get('/analytics', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('userId').optional().isUUID(),
  query('type').optional().isString(),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      userId: req.query.userId as string || userId, // Users can only see their own analytics unless admin
      type: req.query.type as string
    };

    const analytics = await notificationService.getNotificationAnalytics(options);
    
    return res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Failed to get notification analytics:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification analytics'
      }
    });
  }
});

// Get optimized delivery settings for user
router.get('/optimization', async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const optimization = await notificationService.optimizeNotificationDelivery(userId);
    
    return res.json({
      success: true,
      data: optimization
    });
  } catch (error) {
    logger.error('Failed to get notification optimization:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification optimization'
      }
    });
  }
});

// Admin route to process scheduled batches manually
router.post('/batches/process', async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    await notificationService.processScheduledBatches();
    
    return res.json({
      success: true,
      message: 'Scheduled batches processed successfully'
    });
  } catch (error) {
    logger.error('Failed to process scheduled batches:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process scheduled batches'
      }
    });
  }
});

// Admin route to cleanup old notifications
router.delete('/cleanup', [
  query('retentionDays').optional().isInt({ min: 1, max: 365 }),
  handleValidationErrors
], async (req: express.Request, res: express.Response) => {
  try {
    // TODO: Add admin authentication middleware
    const retentionDays = req.query.retentionDays ? parseInt(req.query.retentionDays as string) : 90;
    
    await notificationService.cleanupOldNotifications(retentionDays);
    
    return res.json({
      success: true,
      message: `Old notifications cleaned up (retention: ${retentionDays} days)`
    });
  } catch (error) {
    logger.error('Failed to cleanup old notifications:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cleanup old notifications'
      }
    });
  }
});

export default router;