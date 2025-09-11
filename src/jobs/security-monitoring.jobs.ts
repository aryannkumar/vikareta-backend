import { SecurityMonitoringService } from '@/services/security-monitoring.service';
import { logger } from '@/utils/logger';

/**
 * Security monitoring scheduled jobs
 * These jobs should be run periodically to maintain the security monitoring system
 */

/**
 * Clean up old security monitoring data
 * Should be run daily
 */
export const cleanupSecurityData = async (): Promise<void> => {
  try {
    logger.info('Starting scheduled security data cleanup...');
    await SecurityMonitoringService.cleanupOldData();
    logger.info('Security data cleanup completed successfully');
  } catch (error) {
    logger.error('Error during scheduled security data cleanup:', error);
  }
};

/**
 * Analyze security patterns and generate reports
 * Should be run hourly
 */
export const analyzeSecurityPatterns = async (): Promise<void> => {
  try {
    logger.info('Starting scheduled security pattern analysis...');

    // Get current security metrics
    const metrics = await SecurityMonitoringService.getSecurityMetrics('medium');

    if (metrics && metrics.threats.length > 0) {
      // Log summary of current threats
      const threatSummary = {
        totalThreats: metrics.threats.length,
        critical: metrics.threats.filter((t: any) => t.severity === 'critical').length,
        high: metrics.threats.filter((t: any) => t.severity === 'high').length,
        medium: metrics.threats.filter((t: any) => t.severity === 'medium').length,
        low: metrics.threats.filter((t: any) => t.severity === 'low').length,
      };

      logger.info('Security pattern analysis summary:', threatSummary);

      // Alert if there are critical threats
      if (threatSummary.critical > 0) {
        logger.warn(`CRITICAL SECURITY ALERT: ${threatSummary.critical} critical threats detected`);
      }
    }

    logger.info('Security pattern analysis completed');
  } catch (error) {
    logger.error('Error during scheduled security pattern analysis:', error);
  }
};

/**
 * Generate daily security report
 * Should be run daily at midnight
 */
export const generateDailySecurityReport = async (): Promise<void> => {
  try {
    logger.info('Generating daily security report...');

    const [metrics, compliance] = await Promise.all([
      SecurityMonitoringService.getSecurityMetrics('long'),
      SecurityMonitoringService.getComplianceMetrics(),
    ]);

    const report = {
      date: new Date().toISOString().split('T')[0],
      summary: {
        totalAlerts: metrics?.alerts?.total || 0,
        criticalAlerts: metrics?.alerts?.recent?.filter((a: any) => a.severity === 'critical').length || 0,
        activeThreats: metrics?.threats?.length || 0,
      },
      threats: metrics?.threats || [],
      compliance: compliance,
      recommendations: generateSecurityRecommendations(metrics, compliance),
    };

    // In a real implementation, this would be saved to a database or sent via email
    logger.info('Daily security report generated:', JSON.stringify(report, null, 2));

  } catch (error) {
    logger.error('Error generating daily security report:', error);
  }
};

/**
 * Generate security recommendations based on current metrics
 */
function generateSecurityRecommendations(metrics: any, compliance: any): string[] {
  const recommendations: string[] = [];

  if (metrics?.alerts?.total > 10) {
    recommendations.push('High number of security alerts detected. Consider reviewing access patterns and implementing additional rate limiting.');
  }

  if (metrics?.threats?.some((t: any) => t.severity === 'critical')) {
    recommendations.push('Critical threats detected. Immediate investigation required.');
  }

  if (compliance?.gdpr?.dataBreaches > 0) {
    recommendations.push('Data breaches detected. Ensure GDPR compliance and user notification procedures are followed.');
  }

  if (metrics?.threats?.filter((t: any) => t.eventType === 'AUTH_FAILURE').length > 5) {
    recommendations.push('Multiple authentication failures detected. Consider implementing account lockout policies.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Security posture appears healthy. Continue monitoring.');
  }

  return recommendations;
}

/**
 * Health check for security monitoring system
 * Should be run every 5 minutes
 */
export const securityMonitoringHealthCheck = async (): Promise<boolean> => {
  try {
    // Test basic monitoring functionality
    const metrics = await SecurityMonitoringService.getSecurityMetrics('short');

    if (metrics === null) {
      logger.error('Security monitoring health check failed: Unable to retrieve metrics');
      return false;
    }

    // Check if monitoring data is being collected
    const hasRecentData = metrics.alerts.recent.length > 0 || metrics.threats.length > 0;

    if (!hasRecentData) {
      logger.warn('Security monitoring health check: No recent monitoring data detected');
    }

    logger.debug('Security monitoring health check passed');
    return true;

  } catch (error) {
    logger.error('Security monitoring health check failed:', error);
    return false;
  }
};