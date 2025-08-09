import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { backgroundWorkerService } from '../services/background-worker.service';
import { taskSchedulerService } from '../services/task-scheduler.service';
import { notificationScheduler } from '../services/notification-scheduler.service';
import { adNotificationScheduler } from '../services/ads/ad-notification-scheduler.service';
import { logger } from '../utils/logger';
// import {  } from '../utils/';

const router = Router();

// Apply authentication and admin requirement to all routes
router.use(authenticate);
// router.use(requireAdmin); // TODO: Implement admin middleware

/**
 * GET /api/admin/workers/status
 * Get overall worker system status
 */
router.get('/status', (async (req: Request, res: Response) => {
  try {
    const backgroundWorkerStatus = backgroundWorkerService.getServiceStatus();
    const taskSchedulerStatus = taskSchedulerService.getServiceStatus();
    const backgroundJobStatus = backgroundWorkerService.getJobStatus();
    const scheduledTaskStatus = taskSchedulerService.getTaskStatus();
    const notificationSchedulerStatus = notificationScheduler.getJobStatus();
    const adNotificationSchedulerStatus = adNotificationScheduler.getStatus();

    const overallStatus = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      services: {
        backgroundWorker: backgroundWorkerStatus,
        taskScheduler: taskSchedulerStatus,
        notificationScheduler: {
          isRunning: true, // Simplified status
          totalJobs: Object.keys(notificationSchedulerStatus).length,
        },
        adNotificationScheduler: {
          isRunning: Object.values(adNotificationSchedulerStatus).some(status => status === true),
          services: adNotificationSchedulerStatus,
        },
      },
      jobs: {
        backgroundJobs: backgroundJobStatus,
        scheduledTasks: scheduledTaskStatus,
        notificationJobs: notificationSchedulerStatus,
      },
    };

    return res.json({
      success: true,
      data: overallStatus,
    });
  } catch (error) {
    logger.error('Failed to get worker status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get worker status',
    });
  }
}));

/**
 * GET /api/admin/workers/background/status
 * Get background worker service status
 */
router.get('/background/status', (async (req: Request, res: Response) => {
  try {
    const serviceStatus = backgroundWorkerService.getServiceStatus();
    const jobStatus = backgroundWorkerService.getJobStatus();

    return res.json({
      success: true,
      data: {
        service: serviceStatus,
        jobs: jobStatus,
      },
    });
  } catch (error) {
    logger.error('Failed to get background worker status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get background worker status',
    });
  }
}));

/**
 * POST /api/admin/workers/background/start
 * Start background worker service
 */
router.post('/background/start', (async (req: Request, res: Response) => {
  try {
    backgroundWorkerService.start();
    
    return res.json({
      success: true,
      message: 'Background worker service started successfully',
    });
  } catch (error) {
    logger.error('Failed to start background worker service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start background worker service',
    });
  }
}));

/**
 * POST /api/admin/workers/background/stop
 * Stop background worker service
 */
router.post('/background/stop', (async (req: Request, res: Response) => {
  try {
    backgroundWorkerService.stop();
    
    return res.json({
      success: true,
      message: 'Background worker service stopped successfully',
    });
  } catch (error) {
    logger.error('Failed to stop background worker service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to stop background worker service',
    });
  }
}));

/**
 * POST /api/admin/workers/background/jobs/:jobName/enable
 * Enable a specific background job
 */
router.post('/background/jobs/:jobName/enable', (async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    const success = backgroundWorkerService.enableJob(jobName);
    
    if (success) {
      return res.json({
        success: true,
        message: `Job '${jobName}' enabled successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Job '${jobName}' not found`,
      });
    }
  } catch (error) {
    logger.error(`Failed to enable job ${req.params.jobName}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to enable job',
    });
  }
}));

/**
 * POST /api/admin/workers/background/jobs/:jobName/disable
 * Disable a specific background job
 */
router.post('/background/jobs/:jobName/disable', (async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    const success = backgroundWorkerService.disableJob(jobName);
    
    if (success) {
      return res.json({
        success: true,
        message: `Job '${jobName}' disabled successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Job '${jobName}' not found`,
      });
    }
  } catch (error) {
    logger.error(`Failed to disable job ${req.params.jobName}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disable job',
    });
  }
}));

/**
 * POST /api/admin/workers/background/jobs/:jobName/trigger
 * Manually trigger a specific background job
 */
router.post('/background/jobs/:jobName/trigger', (async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    const success = await backgroundWorkerService.triggerJob(jobName);
    
    if (success) {
      return res.json({
        success: true,
        message: `Job '${jobName}' triggered successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Job '${jobName}' not found or failed to execute`,
      });
    }
  } catch (error) {
    logger.error(`Failed to trigger job ${req.params.jobName}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger job',
    });
  }
}));

/**
 * GET /api/admin/workers/scheduler/status
 * Get task scheduler service status
 */
router.get('/scheduler/status', (async (req: Request, res: Response) => {
  try {
    const serviceStatus = taskSchedulerService.getServiceStatus();
    const taskStatus = taskSchedulerService.getTaskStatus();

    return res.json({
      success: true,
      data: {
        service: serviceStatus,
        tasks: taskStatus,
      },
    });
  } catch (error) {
    logger.error('Failed to get task scheduler status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get task scheduler status',
    });
  }
}));

/**
 * POST /api/admin/workers/scheduler/start
 * Start task scheduler service
 */
router.post('/scheduler/start', (async (req: Request, res: Response) => {
  try {
    taskSchedulerService.start();
    
    return res.json({
      success: true,
      message: 'Task scheduler service started successfully',
    });
  } catch (error) {
    logger.error('Failed to start task scheduler service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start task scheduler service',
    });
  }
}));

/**
 * POST /api/admin/workers/scheduler/stop
 * Stop task scheduler service
 */
router.post('/scheduler/stop', (async (req: Request, res: Response) => {
  try {
    taskSchedulerService.stop();
    
    return res.json({
      success: true,
      message: 'Task scheduler service stopped successfully',
    });
  } catch (error) {
    logger.error('Failed to stop task scheduler service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to stop task scheduler service',
    });
  }
}));

/**
 * POST /api/admin/workers/scheduler/tasks/:taskId/enable
 * Enable a specific scheduled task
 */
router.post('/scheduler/tasks/:taskId/enable', (async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const success = taskSchedulerService.enableTask(taskId);
    
    if (success) {
      return res.json({
        success: true,
        message: `Task '${taskId}' enabled successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Task '${taskId}' not found`,
      });
    }
  } catch (error) {
    logger.error(`Failed to enable task ${req.params.taskId}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to enable task',
    });
  }
}));

/**
 * POST /api/admin/workers/scheduler/tasks/:taskId/disable
 * Disable a specific scheduled task
 */
router.post('/scheduler/tasks/:taskId/disable', (async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const success = taskSchedulerService.disableTask(taskId);
    
    if (success) {
      return res.json({
        success: true,
        message: `Task '${taskId}' disabled successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Task '${taskId}' not found`,
      });
    }
  } catch (error) {
    logger.error(`Failed to disable task ${req.params.taskId}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disable task',
    });
  }
}));

/**
 * POST /api/admin/workers/scheduler/tasks/:taskId/trigger
 * Manually trigger a specific scheduled task
 */
router.post('/scheduler/tasks/:taskId/trigger', (async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const success = await taskSchedulerService.triggerTask(taskId);
    
    if (success) {
      return res.json({
        success: true,
        message: `Task '${taskId}' triggered successfully`,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Task '${taskId}' not found or failed to execute`,
      });
    }
  } catch (error) {
    logger.error(`Failed to trigger task ${req.params.taskId}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger task',
    });
  }
}));

/**
 * GET /api/admin/workers/scheduler/tasks/:taskId
 * Get detailed status of a specific scheduled task
 */
router.get('/scheduler/tasks/:taskId', (async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const taskStatus = taskSchedulerService.getTaskStatus(taskId);
    
    if (taskStatus) {
      return res.json({
        success: true,
        data: taskStatus,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `Task '${taskId}' not found`,
      });
    }
  } catch (error) {
    logger.error(`Failed to get task status for ${req.params.taskId}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get task status',
    });
  }
}));

/**
 * GET /api/admin/workers/health
 * Comprehensive health check for all worker services
 */
router.get('/health', (async (req: Request, res: Response) => {
  try {
    const backgroundWorkerStatus = backgroundWorkerService.getServiceStatus();
    const taskSchedulerStatus = taskSchedulerService.getServiceStatus();
    
    const isHealthy = backgroundWorkerStatus.isRunning && 
                     taskSchedulerStatus.isStarted &&
                     backgroundWorkerStatus.errorJobs === 0 &&
                     taskSchedulerStatus.failedTasks === 0;

    const healthData = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        backgroundWorker: {
          status: backgroundWorkerStatus.isRunning ? 'healthy' : 'unhealthy',
          details: backgroundWorkerStatus,
        },
        taskScheduler: {
          status: taskSchedulerStatus.isStarted ? 'healthy' : 'unhealthy',
          details: taskSchedulerStatus,
        },
      },
      systemInfo: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      },
    };

    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json({
      success: true,
      data: healthData,
    });
  } catch (error) {
    logger.error('Worker health check failed:', error);
    return res.status(503).json({
      success: false,
      error: 'Worker health check failed',
    });
  }
}));

export { router as workerManagementRoutes };