import { Router } from 'express';
import { authenticateAdmin } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all routes
router.use(authenticateAdmin);

/**
 * GET /api/admin/notifications
 * Get all notifications with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '10', status, type } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      }),
      prisma.notification.count({ where: whereClause })
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * GET /api/admin/notifications/:id
 * Get notification by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification'
    });
  }
});

/**
 * PUT /api/admin/notifications/:id
 * Update notification
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isRead } = req.body;

    const notification = await prisma.notification.update({
      where: { id },
      data: { status, isRead },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification'
    });
  }
});

/**
 * DELETE /api/admin/notifications/:id
 * Delete notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.notification.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});

/**
 * GET /api/admin/notifications/stats
 * Get notification statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        }
      };
    }

    const notifications = await prisma.notification.findMany({
      where: dateFilter,
      select: {
        type: true,
        status: true,
        isRead: true,
        createdAt: true
      }
    });

    const stats = {
      total: notifications.length,
      byType: notifications.reduce((acc: any, notif) => {
        acc[notif.type] = (acc[notif.type] || 0) + 1;
        return acc;
      }, {}),
      byStatus: notifications.reduce((acc: any, notif) => {
        acc[notif.status] = (acc[notif.status] || 0) + 1;
        return acc;
      }, {}),
      readCount: notifications.filter(n => n.isRead).length,
      unreadCount: notifications.filter(n => !n.isRead).length
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification statistics'
    });
  }
});

/**
 * POST /api/admin/notifications/bulk-update
 * Bulk update notifications
 */
router.post('/bulk-update', async (req, res) => {
  try {
    const { ids, status, isRead } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required'
      });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (isRead !== undefined) updateData.isRead = isRead;

    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: updateData
    });

    res.json({
      success: true,
      message: `Updated ${ids.length} notifications`
    });
  } catch (error) {
    console.error('Error bulk updating notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update notifications'
    });
  }
});

/**
 * GET /api/admin/notifications/templates
 * Get notification templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification templates'
    });
  }
});

/**
 * POST /api/admin/notifications/templates
 * Create notification template
 */
router.post('/templates', async (req, res) => {
  try {
    const { name, type, title, content, variables } = req.body;

    const template = await prisma.notificationTemplate.create({
      data: {
        name,
        type,
        title,
        content,
        variables: variables || []
      }
    });

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error creating notification template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create notification template'
    });
  }
});

/**
 * PUT /api/admin/notifications/templates/:id
 * Update notification template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, title, content, variables } = req.body;

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        name,
        type,
        title,
        content,
        variables: variables || []
      }
    });

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error updating notification template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification template'
    });
  }
});

/**
 * DELETE /api/admin/notifications/templates/:id
 * Delete notification template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.notificationTemplate.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Notification template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification template'
    });
  }
});

export default router;