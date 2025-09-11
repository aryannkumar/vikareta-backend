import { redisClient } from '@/config/redis';
import { SecurityAudit } from '@/config/security';
import { logger } from '@/utils/logger';

// Security monitoring configuration
export const monitoringConfig = {
  // Alert thresholds
  thresholds: {
    failedLoginAttempts: 5, // per user per hour
    rateLimitHits: 10, // per IP per hour
    suspiciousActivities: 3, // per user per hour
    csrfViolations: 5, // per IP per hour
  },

  // Alert cooldown periods (in milliseconds)
  cooldowns: {
    failedLogin: 60 * 60 * 1000, // 1 hour
    rateLimit: 30 * 60 * 1000, // 30 minutes
    suspiciousActivity: 60 * 60 * 1000, // 1 hour
    csrfViolation: 60 * 60 * 1000, // 1 hour
  },

  // Monitoring windows (in milliseconds)
  windows: {
    short: 15 * 60 * 1000, // 15 minutes
    medium: 60 * 60 * 1000, // 1 hour
    long: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// Security alert types
export enum SecurityAlertType {
  BRUTE_FORCE_ATTACK = 'BRUTE_FORCE_ATTACK',
  RATE_LIMIT_ATTACK = 'RATE_LIMIT_ATTACK',
  CSRF_ATTACK = 'CSRF_ATTACK',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  UNUSUAL_LOCATION = 'UNUSUAL_LOCATION',
  MULTIPLE_FAILED_LOGINS = 'MULTIPLE_FAILED_LOGINS',
  ADMIN_PRIVILEGE_ESCALATION = 'ADMIN_PRIVILEGE_ESCALATION',
  DATA_BREACH_ATTEMPT = 'DATA_BREACH_ATTEMPT',
}

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Security monitoring service
export class SecurityMonitoringService {
  private static readonly ALERT_PREFIX = 'security:alert:';
  private static readonly METRIC_PREFIX = 'security:metric:';
  private static readonly THRESHOLD_PREFIX = 'security:threshold:';

  /**
   * Monitor security events and trigger alerts when thresholds are exceeded
   */
  static async monitorSecurityEvent(
    eventType: string,
    identifier: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      const now = Date.now();
      const key = `${this.METRIC_PREFIX}${eventType}:${identifier}`;

      // Increment event counter
      const count = await redisClient.incr(key);

      // Set expiry on first occurrence
      if (count === 1) {
        await redisClient.expire(key, Math.ceil(monitoringConfig.windows.medium / 1000));
      }

      // Check thresholds and trigger alerts
      await this.checkThresholds(eventType, identifier, count, metadata);

      // Log the monitoring data
      logger.debug(`Security monitoring: ${eventType} for ${identifier}, count: ${count}`);

    } catch (error) {
      logger.error('Security monitoring error:', error);
    }
  }

  /**
   * Check if security thresholds are exceeded and trigger alerts
   */
  private static async checkThresholds(
    eventType: string,
    identifier: string,
    count: number,
    metadata: any
  ): Promise<void> {
    const alertKey = `${this.ALERT_PREFIX}${eventType}:${identifier}`;
    const lastAlert = await redisClient.get(alertKey);

    // Skip if alert was recently triggered (cooldown)
    if (lastAlert) {
      return;
    }

    let alertTriggered = false;
    let alertType: SecurityAlertType;
    let severity: AlertSeverity;

    switch (eventType) {
      case 'AUTH_FAILURE':
        if (count >= monitoringConfig.thresholds.failedLoginAttempts) {
          alertType = SecurityAlertType.MULTIPLE_FAILED_LOGINS;
          severity = AlertSeverity.MEDIUM;
          alertTriggered = true;
        }
        break;

      case 'RATE_LIMIT_EXCEEDED':
        if (count >= monitoringConfig.thresholds.rateLimitHits) {
          alertType = SecurityAlertType.RATE_LIMIT_ATTACK;
          severity = AlertSeverity.HIGH;
          alertTriggered = true;
        }
        break;

      case 'CSRF_INVALID_TOKEN':
        if (count >= monitoringConfig.thresholds.csrfViolations) {
          alertType = SecurityAlertType.CSRF_ATTACK;
          severity = AlertSeverity.HIGH;
          alertTriggered = true;
        }
        break;

      case 'SUSPICIOUS_ACTIVITY':
        if (count >= monitoringConfig.thresholds.suspiciousActivities) {
          alertType = SecurityAlertType.SUSPICIOUS_ACTIVITY;
          severity = AlertSeverity.MEDIUM;
          alertTriggered = true;
        }
        break;
    }

    if (alertTriggered) {
      await this.triggerSecurityAlert(alertType!, severity!, identifier, count, metadata);
      // Set cooldown
      await redisClient.setex(alertKey, Math.ceil(monitoringConfig.cooldowns.failedLogin / 1000), '1');
    }
  }

  /**
   * Trigger a security alert
   */
  private static async triggerSecurityAlert(
    alertType: SecurityAlertType,
    severity: AlertSeverity,
    identifier: string,
    count: number,
    metadata: any
  ): Promise<void> {
    const alertData = {
      alertType,
      severity,
      identifier,
      count,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Log the alert
    SecurityAudit.logSecurityAlert(alertType, severity, alertData);

    // Store alert in Redis for dashboard/metrics
    const alertId = `alert:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.setex(
      `security:alerts:${alertId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(alertData)
    );

    // Add to alert list for recent alerts
    await redisClient.lpush('security:recent_alerts', alertId);
    await redisClient.ltrim('security:recent_alerts', 0, 99); // Keep last 100 alerts

    logger.warn(`Security alert triggered: ${alertType} (${severity}) for ${identifier}`);
  }

  /**
   * Get security metrics for dashboard
   */
  static async getSecurityMetrics(timeframe: 'short' | 'medium' | 'long' = 'medium'): Promise<any> {
    try {
      const window = monitoringConfig.windows[timeframe];
      const now = Date.now();
      const cutoff = now - window;

      // Get recent alerts
      const recentAlertIds = await redisClient.lrange('security:recent_alerts', 0, 9);
      const recentAlerts = [];

      for (const alertId of recentAlertIds) {
        const alertData = await redisClient.get(`security:alerts:${alertId}`);
        if (alertData) {
          recentAlerts.push(JSON.parse(alertData));
        }
      }

      // Get current threat levels
      const threatMetrics = await this.getThreatMetrics();

      return {
        timeframe,
        timestamp: new Date().toISOString(),
        alerts: {
          recent: recentAlerts,
          total: recentAlerts.length,
        },
        threats: threatMetrics,
        summary: {
          activeThreats: threatMetrics.length,
          criticalAlerts: recentAlerts.filter((a: any) => a.severity === 'critical').length,
          highAlerts: recentAlerts.filter((a: any) => a.severity === 'high').length,
        },
      };
    } catch (error) {
      logger.error('Error getting security metrics:', error);
      return null;
    }
  }

  /**
   * Get current threat metrics (public method for dashboard access)
   */
  static async getThreatMetrics(): Promise<any[]> {
    const threats = [];
    const keys = await redisClient.keys(`${this.METRIC_PREFIX}*`);

    for (const key of keys) {
      const count = await redisClient.get(key);
      if (count && parseInt(count) > 0) {
        const [, eventType, identifier] = key.split(':');
        threats.push({
          eventType,
          identifier,
          count: parseInt(count),
          severity: this.calculateThreatSeverity(eventType, parseInt(count)),
        });
      }
    }

    return threats.sort((a, b) => b.count - a.count);
  }

  /**
   * Calculate threat severity based on event type and count
   */
  private static calculateThreatSeverity(eventType: string, count: number): AlertSeverity {
    const thresholds = monitoringConfig.thresholds;

    switch (eventType) {
      case 'AUTH_FAILURE':
        return count >= thresholds.failedLoginAttempts * 2 ? AlertSeverity.CRITICAL :
               count >= thresholds.failedLoginAttempts ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

      case 'RATE_LIMIT_EXCEEDED':
        return count >= thresholds.rateLimitHits * 2 ? AlertSeverity.CRITICAL :
               count >= thresholds.rateLimitHits ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

      case 'CSRF_INVALID_TOKEN':
        return count >= thresholds.csrfViolations * 2 ? AlertSeverity.CRITICAL :
               count >= thresholds.csrfViolations ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;

      case 'SUSPICIOUS_ACTIVITY':
        return count >= thresholds.suspiciousActivities * 2 ? AlertSeverity.HIGH :
               count >= thresholds.suspiciousActivities ? AlertSeverity.MEDIUM : AlertSeverity.LOW;

      default:
        return AlertSeverity.LOW;
    }
  }

  /**
   * Monitor user behavior patterns
   */
  static async monitorUserBehavior(
    userId: string,
    action: string,
    ip: string,
    userAgent: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      // Track user actions
      const actionKey = `user:action:${userId}:${action}`;
      await redisClient.incr(actionKey);
      await redisClient.expire(actionKey, Math.ceil(monitoringConfig.windows.long / 1000));

      // Track IP changes for user
      const ipKey = `user:ip:${userId}`;
      const lastIp = await redisClient.get(ipKey);
      if (lastIp && lastIp !== ip) {
        SecurityAudit.logSecurityEvent('IP_CHANGE', {
          userId,
          oldIp: lastIp,
          newIp: ip,
          userAgent,
        });
      }
      await redisClient.set(ipKey, ip);

      // Track user agent changes
      const uaKey = `user:ua:${userId}`;
      const lastUa = await redisClient.get(uaKey);
      if (lastUa && lastUa !== userAgent) {
        SecurityAudit.logSecurityEvent('USER_AGENT_CHANGE', {
          userId,
          oldUserAgent: lastUa,
          newUserAgent: userAgent,
          ip,
        });
      }
      await redisClient.set(uaKey, userAgent);

      // Check for unusual patterns
      await this.detectUnusualPatterns(userId, action, metadata);

    } catch (error) {
      logger.error('User behavior monitoring error:', error);
    }
  }

  /**
   * Detect unusual user behavior patterns
   */
  private static async detectUnusualPatterns(
    userId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    // Check for rapid password changes
    if (action === 'password_change') {
      const changeCount = await redisClient.incr(`user:password_changes:${userId}`);
      if (changeCount === 1) {
        await redisClient.expire(`user:password_changes:${userId}`, 60 * 60); // 1 hour
      }

      if (changeCount >= 3) {
        await this.triggerSecurityAlert(
          SecurityAlertType.SUSPICIOUS_ACTIVITY,
          AlertSeverity.MEDIUM,
          userId,
          changeCount,
          { action: 'rapid_password_changes', metadata }
        );
      }
    }

    // Check for unusual login times
    if (action === 'login') {
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) { // Unusual hours (before 6 AM or after 10 PM)
        const unusualLogins = await redisClient.incr(`user:unusual_logins:${userId}`);
        if (unusualLogins === 1) {
          await redisClient.expire(`user:unusual_logins:${userId}`, 24 * 60 * 60); // 24 hours
        }

        if (unusualLogins >= 5) {
          await this.triggerSecurityAlert(
            SecurityAlertType.SUSPICIOUS_ACTIVITY,
            AlertSeverity.LOW,
            userId,
            unusualLogins,
            { action: 'unusual_login_hours', hour, metadata }
          );
        }
      }
    }
  }

  /**
   * Clean up old monitoring data
   */
  static async cleanupOldData(): Promise<void> {
    try {
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Clean up old alerts
      const alertKeys = await redisClient.keys('security:alerts:*');
      for (const key of alertKeys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) { // No expiry set
          await redisClient.del(key);
        }
      }

      // Clean up old metrics
      const metricKeys = await redisClient.keys(`${this.METRIC_PREFIX}*`);
      for (const key of metricKeys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) { // No expiry set
          await redisClient.del(key);
        }
      }

      logger.info('Security monitoring data cleanup completed');
    } catch (error) {
      logger.error('Error during security monitoring cleanup:', error);
    }
  }

  /**
   * Get compliance metrics for GDPR/SOX reporting
   */
  static async getComplianceMetrics(): Promise<any> {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // This would typically query a database for compliance events
      // For now, return a basic structure
      return {
        period: {
          start: monthStart.toISOString(),
          end: now.toISOString(),
        },
        gdpr: {
          dataAccessRequests: 0,
          dataDeletionRequests: 0,
          consentWithdrawals: 0,
          dataBreaches: 0,
        },
        sox: {
          adminActions: 0,
          privilegeChanges: 0,
          auditEvents: 0,
        },
        summary: {
          totalEvents: 0,
          complianceViolations: 0,
          lastAudit: now.toISOString(),
        },
      };
    } catch (error) {
      logger.error('Error getting compliance metrics:', error);
      return null;
    }
  }
}

// Export monitoring utilities
export const monitorSecurityEvent = SecurityMonitoringService.monitorSecurityEvent.bind(SecurityMonitoringService);
export const monitorUserBehavior = SecurityMonitoringService.monitorUserBehavior.bind(SecurityMonitoringService);
export const getSecurityMetrics = SecurityMonitoringService.getSecurityMetrics.bind(SecurityMonitoringService);
export const getComplianceMetrics = SecurityMonitoringService.getComplianceMetrics.bind(SecurityMonitoringService);