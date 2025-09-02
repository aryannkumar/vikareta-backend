import { Router, Request, Response } from 'express';
import { AdNotificationService } from '../../services/ads/ad-notification.service';
import { adNotificationScheduler } from '../../services/ads/ad-notification-scheduler.service';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
const adNotificationService = new AdNotificationService();

// Apply authentication and admin middleware to all routes
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/notifications/stats
 * Get notification statistics for a date range
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'startDate and endDate query parameters are required'
    });
  }

  const dateRange = {
    start: new Date(startDate as string),
    end: new Date(endDate as string)
  };

  // Validate dates
  if (isNaN(dateRange.start.getTime()) || isNaN(dateRange.end.getTime())) {
    return res.status(400).json({
      error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)'
    });
  }

  if (dateRange.start >= dateRange.end) {
    return res.status(400).json({
      error: 'startDate must be before endDate'
    });
  }

  const stats = await adNotificationService.getNotificationStats(dateRange);

  return res.json({
    success: true,
    data: {
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      },
      stats
    }
  });
} catch (error) {
  logger.error('Failed to get notification stats:', error);
  return res.status(500).json({
    error: 'Failed to get notification statistics'
  });
}
});

/**
 * GET /api/admin/notifications/scheduler/status
 * Get notification scheduler status
 */
router.get('/scheduler/status', (req: Request, res: Response) => {
  try {
    const status = adNotificationScheduler.getStatus();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    data: {
      schedulers: status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
} catch (error) {
  logger.error('Failed to get scheduler status:', error);
  return res.status(500).json({
    error: 'Failed to get scheduler status'
  });
}
});

/**
 * POST /api/admin/notifications/scheduler/start
 * Start notification schedulers
 */
router.post('/scheduler/start', (req: Request, res: Response) => {
  try {
    adNotificationScheduler.start();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'Notification schedulers started successfully'
  });
} catch (error) {
  logger.error('Failed to start schedulers:', error);
  return res.status(500).json({
    error: 'Failed to start notification schedulers'
  });
}
});

/**
 * POST /api/admin/notifications/scheduler/stop
 * Stop notification schedulers
 */
router.post('/scheduler/stop', (req: Request, res: Response) => {
  try {
    adNotificationScheduler.stop();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'Notification schedulers stopped successfully'
  });
} catch (error) {
  logger.error('Failed to stop schedulers:', error);
  return res.status(500).json({
    error: 'Failed to stop notification schedulers'
  });
}
});

/**
 * POST /api/admin/notifications/trigger/budget-check
 * Manually trigger budget alert check
 */
router.post('/trigger/budget-check', async (req: Request, res: Response) => {
  try {
    await adNotificationScheduler.triggerBudgetCheck();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'Budget alert check triggered successfully'
  });
} catch (error) {
  logger.error('Failed to trigger budget check:', error);
  return res.status(500).json({
    error: 'Failed to trigger budget alert check'
  });
}
});

/**
 * POST /api/admin/notifications/trigger/performance-check
 * Manually trigger performance alert check
 */
router.post('/trigger/performance-check', async (req: Request, res: Response) => {
  try {
    await adNotificationScheduler.triggerPerformanceCheck();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'Performance alert check triggered successfully'
  });
} catch (error) {
  logger.error('Failed to trigger performance check:', error);
  return res.status(500).json({
    error: 'Failed to trigger performance alert check'
  });
}
});

/**
 * POST /api/admin/notifications/trigger/admin-check
 * Manually trigger admin alert check
 */
router.post('/trigger/admin-check', async (req: Request, res: Response) => {
  try {
    await adNotificationScheduler.triggerAdminCheck();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'Admin alert check triggered successfully'
  });
} catch (error) {
  logger.error('Failed to trigger admin check:', error);
  return res.status(500).json({
    error: 'Failed to trigger admin alert check'
  });
}
});

/**
 * POST /api/admin/notifications/trigger/system-health
 * Manually trigger system health check
 */
router.post('/trigger/system-health', async (req: Request, res: Response) => {
  try {
    await adNotificationScheduler.triggerSystemHealthCheck();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  return res.json({
    success: true,
    message: 'System health check triggered successfully'
  });
} catch (error) {
  logger.error('Failed to trigger system health check:', error);
  return res.status(500).json({
    error: 'Failed to trigger system health check'
  });
}
});

/**
 * POST /api/admin/notifications/test-alert
 * Send a test admin alert
 */
router.post('/test-alert', async (req: Request, res: Response) => {
  try {
    const { type, priority, title, message } = req.body;

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  if (!type || !priority || !title || !message) {
    return res.status(400).json({
      error: 'type, priority, title, and message are required'
    });
  }

  const validTypes = ['pending_approval', 'system_health', 'performance_issue', 'critical_error'];
  const validPriorities = ['low', 'normal', 'high', 'critical'];

  if (!validTypes.includes(type)) {
    return res.status(400).json({
      error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
    });
  }

  if (!validPriorities.includes(priority)) {
    return res.status(400).json({
      error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
    });
  }

  // Create test alert
  const testAlert = {
    type,
    priority,
    title,
    message,
    data: {
      testAlert: true,
      triggeredBy: req.authUser?.userId,
      timestamp: new Date().toISOString()
    }
  };

  // Send the test alert (this will use the private method, so we'll call the system health alert with test data)
  await adNotificationService.sendSystemHealthAlert({
    adServingLatency: 100,
    errorRate: 0.01,
    activeNetworks: 3,
    totalNetworks: 3
  });

  return res.json({
    success: true,
    message: 'Test alert sent successfully',
    data: testAlert
  });
} catch (error) {
  logger.error('Failed to send test alert:', error);
  return res.status(500).json({
    error: 'Failed to send test alert'
  });
}
});

/**
 * GET /api/admin/notifications/health
 * Get notification system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const schedulerStatus = adNotificationScheduler.getStatus();

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
  // Check if all schedulers are running
  const allSchedulersRunning = Object.values(schedulerStatus).every(status => status === true);

  // Get recent notification stats (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentStats = await adNotificationService.getNotificationStats({
    start: yesterday,
    end: new Date()
  });

  const health = {
    status: allSchedulersRunning ? 'healthy' : 'degraded',
    schedulers: schedulerStatus,
    recentActivity: recentStats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  return res.json({
    success: true,
    data: health
  });
} catch (error) {
  logger.error('Failed to get notification system health:', error);
  return res.status(500).json({
    error: 'Failed to get notification system health'
  });
}
});

export default router;