import { Router } from 'express';
import { authenticateToken, requireUserType, requireRole } from '@/middleware/authentication.middleware';
import { getSecurityMetrics, getComplianceMetrics, SecurityMonitoringService } from '@/services/security-monitoring.service';
import { logger } from '@/utils/logger';

const router = Router();

// Apply authentication and admin authorization to all routes
router.use(authenticateToken);
router.use(requireUserType('admin'));
router.use(requireRole('admin', 'security_admin'));

/**
 * GET /api/admin/security/metrics
 * Get security metrics and monitoring data
 */
router.get('/metrics', async (req, res) => {
  try {
    const { timeframe = 'medium' } = req.query;

    if (!['short', 'medium', 'long'].includes(timeframe as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeframe. Must be one of: short, medium, long'
      });
    }

    const metrics = await getSecurityMetrics(timeframe as 'short' | 'medium' | 'long');

    if (!metrics) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve security metrics'
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error fetching security metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/security/compliance
 * Get compliance metrics for GDPR/SOX reporting
 */
router.get('/compliance', async (req, res) => {
  try {
    const complianceMetrics = await getComplianceMetrics();

    if (!complianceMetrics) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve compliance metrics'
      });
    }

    res.json({
      success: true,
      data: complianceMetrics
    });
  } catch (error) {
    logger.error('Error fetching compliance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/security/alerts
 * Get recent security alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { limit = 50, severity } = req.query;

    // Get recent alerts from Redis
    const alertIds = await req.app.locals.redis.lrange('security:recent_alerts', 0, parseInt(limit as string) - 1);
    const alerts = [];

    for (const alertId of alertIds) {
      const alertData = await req.app.locals.redis.get(`security:alerts:${alertId}`);
      if (alertData) {
        const alert = JSON.parse(alertData);
        if (!severity || alert.severity === severity) {
          alerts.push(alert);
        }
      }
    }

    res.json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        filters: { severity: severity || 'all' }
      }
    });
  } catch (error) {
    logger.error('Error fetching security alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/security/threats
 * Get current threat analysis
 */
router.get('/threats', async (req, res) => {
  try {
    const threatMetrics = await SecurityMonitoringService.getThreatMetrics();

    res.json({
      success: true,
      data: {
        threats: threatMetrics,
        total: threatMetrics.length,
        summary: {
          critical: threatMetrics.filter(t => t.severity === 'critical').length,
          high: threatMetrics.filter(t => t.severity === 'high').length,
          medium: threatMetrics.filter(t => t.severity === 'medium').length,
          low: threatMetrics.filter(t => t.severity === 'low').length,
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching threat analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/security/cleanup
 * Manually trigger cleanup of old monitoring data
 */
router.post('/cleanup', async (req, res) => {
  try {
    await SecurityMonitoringService.cleanupOldData();

    res.json({
      success: true,
      message: 'Security monitoring data cleanup completed'
    });
  } catch (error) {
    logger.error('Error during security data cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/security/dashboard
 * Get comprehensive security dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [metrics, compliance, alerts] = await Promise.all([
      getSecurityMetrics('medium'),
      getComplianceMetrics(),
      // Get last 10 alerts
      req.app.locals.redis.lrange('security:recent_alerts', 0, 9).then(async (alertIds: string[]) => {
        const alerts = [];
        for (const alertId of alertIds) {
          const alertData = await req.app.locals.redis.get(`security:alerts:${alertId}`);
          if (alertData) {
            alerts.push(JSON.parse(alertData));
          }
        }
        return alerts;
      })
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalAlerts: alerts.length,
          criticalAlerts: alerts.filter((a: any) => a.severity === 'critical').length,
          activeThreats: metrics?.threats?.length || 0,
          lastUpdated: new Date().toISOString(),
        },
        metrics,
        compliance,
        recentAlerts: alerts.slice(0, 5), // Last 5 alerts
      }
    });
  } catch (error) {
    logger.error('Error fetching security dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;