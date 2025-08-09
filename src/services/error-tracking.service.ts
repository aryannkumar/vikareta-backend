/**
 * Error Tracking and Incident Response Service
 * Comprehensive error monitoring and alerting for Vikareta platform
 */

import { logger } from '../utils/logger';
import { cacheService } from './cache.service';
import Redis from 'ioredis';

interface ErrorEvent {
  id: string;
  timestamp: Date;
  level: 'error' | 'warn' | 'fatal';
  message: string;
  stack?: string;
  context: {
    userId?: string;
    requestId?: string;
    endpoint?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
    environment: string;
    version: string;
  };
  metadata?: Record<string, any>;
  fingerprint: string; // For grouping similar errors
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

interface IncidentAlert {
  id: string;
  type: 'error_spike' | 'critical_error' | 'service_down' | 'performance_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  status: 'open' | 'acknowledged' | 'resolved';
  affectedServices: string[];
  metrics: Record<string, any>;
  escalationLevel: number;
}

interface ErrorPattern {
  fingerprint: string;
  pattern: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedUsers: Set<string>;
  endpoints: Set<string>;
}

class ErrorTrackingService {
  private redis: Redis | null = null;
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private activeIncidents: Map<string, IncidentAlert> = new Map();
  private errorThresholds = {
    errorSpike: 10, // errors per minute
    criticalErrorThreshold: 5, // critical errors per minute
    errorRateThreshold: 0.05, // 5% error rate
    responseTimeThreshold: 5000 // 5 seconds
  };

  constructor() {
    // Skip Redis connection in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      this.startIncidentDetection();
    }
    this.setupErrorMonitoring();
  }

  /**
   * Track an error event
   */
  async trackError(error: Error, context: Partial<ErrorEvent['context']> = {}): Promise<void> {
    try {
      const fingerprint = this.generateFingerprint(error);
      const errorEvent: ErrorEvent = {
        id: this.generateId(),
        timestamp: new Date(),
        level: this.determineErrorLevel(error),
        message: error.message,
        stack: error.stack,
        context: {
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0',
          ...context
        },
        fingerprint,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date()
      };

      // Store error in Redis
      await this.storeError(errorEvent);
      
      // Update error patterns
      await this.updateErrorPattern(errorEvent);
      
      // Check for incident conditions
      await this.checkForIncidents(errorEvent);
      
      // Log error
      logger.error('Error tracked', {
        id: errorEvent.id,
        fingerprint: errorEvent.fingerprint,
        message: errorEvent.message,
        context: errorEvent.context
      });

    } catch (trackingError) {
      logger.error('Failed to track error:', trackingError);
    }
  }

  /**
   * Store error in Redis with expiration
   */
  private async storeError(errorEvent: ErrorEvent): Promise<void> {
    if (!this.redis) return;
    
    const key = `error:${errorEvent.id}`;
    await this.redis.setex(key, 86400, JSON.stringify(errorEvent)); // Store for 24 hours
    
    // Add to error timeline
    await this.redis.zadd('error_timeline', Date.now(), errorEvent.id);
    
    // Keep only last 10000 errors in timeline
    await this.redis.zremrangebyrank('error_timeline', 0, -10001);
    
    // Update error counters
    await this.redis.incr('error_count_total');
    await this.redis.incr(`error_count_${errorEvent.level}`);
    
    // Update hourly error count
    const hourKey = `error_count_hour:${Math.floor(Date.now() / 3600000)}`;
    await this.redis.incr(hourKey);
    await this.redis.expire(hourKey, 86400); // Expire after 24 hours
  }

  /**
   * Update error pattern tracking
   */
  private async updateErrorPattern(errorEvent: ErrorEvent): Promise<void> {
    const pattern = this.errorPatterns.get(errorEvent.fingerprint);
    
    if (pattern) {
      pattern.count++;
      pattern.lastSeen = errorEvent.timestamp;
      if (errorEvent.context.userId) {
        pattern.affectedUsers.add(errorEvent.context.userId);
      }
      if (errorEvent.context.endpoint) {
        pattern.endpoints.add(errorEvent.context.endpoint);
      }
    } else {
      const newPattern: ErrorPattern = {
        fingerprint: errorEvent.fingerprint,
        pattern: errorEvent.message,
        count: 1,
        firstSeen: errorEvent.timestamp,
        lastSeen: errorEvent.timestamp,
        affectedUsers: new Set(errorEvent.context.userId ? [errorEvent.context.userId] : []),
        endpoints: new Set(errorEvent.context.endpoint ? [errorEvent.context.endpoint] : [])
      };
      this.errorPatterns.set(errorEvent.fingerprint, newPattern);
    }

    // Store pattern in Redis
    const patternKey = `error_pattern:${errorEvent.fingerprint}`;
    const patternData = {
      ...this.errorPatterns.get(errorEvent.fingerprint),
      affectedUsers: Array.from(this.errorPatterns.get(errorEvent.fingerprint)!.affectedUsers),
      endpoints: Array.from(this.errorPatterns.get(errorEvent.fingerprint)!.endpoints)
    };
    if (this.redis) {
      await this.redis.setex(patternKey, 86400, JSON.stringify(patternData));
    }
  }

  /**
   * Check for incident conditions
   */
  private async checkForIncidents(errorEvent: ErrorEvent): Promise<void> {
    // Check for error spike
    await this.checkErrorSpike();
    
    // Check for critical errors
    if (errorEvent.level === 'fatal') {
      await this.createIncident({
        type: 'critical_error',
        severity: 'critical',
        title: 'Critical Error Detected',
        description: `Fatal error: ${errorEvent.message}`,
        affectedServices: [errorEvent.context.endpoint || 'unknown'],
        metrics: { errorId: errorEvent.id }
      });
    }
    
    // Check for service-specific issues
    await this.checkServiceHealth(errorEvent);
  }

  /**
   * Check for error spike incidents
   */
  private async checkErrorSpike(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Get error count in last minute
    const recentErrors = this.redis ? await this.redis.zcount('error_timeline', oneMinuteAgo, now) : 0;
    
    if (recentErrors > this.errorThresholds.errorSpike) {
      await this.createIncident({
        type: 'error_spike',
        severity: 'high',
        title: 'Error Spike Detected',
        description: `${recentErrors} errors in the last minute (threshold: ${this.errorThresholds.errorSpike})`,
        affectedServices: ['platform'],
        metrics: { errorCount: recentErrors, timeWindow: '1 minute' }
      });
    }
  }

  /**
   * Check service health based on error patterns
   */
  private async checkServiceHealth(errorEvent: ErrorEvent): Promise<void> {
    if (!errorEvent.context.endpoint) return;
    
    const endpoint = errorEvent.context.endpoint;
    const pattern = this.errorPatterns.get(errorEvent.fingerprint);
    
    if (pattern && pattern.count > 5 && pattern.endpoints.has(endpoint)) {
      await this.createIncident({
        type: 'service_down',
        severity: 'high',
        title: `Service Issues Detected: ${endpoint}`,
        description: `Repeated errors (${pattern.count}) on endpoint ${endpoint}`,
        affectedServices: [endpoint],
        metrics: { 
          errorCount: pattern.count,
          affectedUsers: pattern.affectedUsers.size,
          pattern: pattern.pattern
        }
      });
    }
  }

  /**
   * Create a new incident
   */
  private async createIncident(incidentData: Omit<IncidentAlert, 'id' | 'timestamp' | 'status' | 'escalationLevel'>): Promise<void> {
    const incident: IncidentAlert = {
      id: this.generateId(),
      timestamp: new Date(),
      status: 'open',
      escalationLevel: 0,
      ...incidentData
    };

    // Check if similar incident already exists
    const existingIncident = Array.from(this.activeIncidents.values()).find(
      i => i.type === incident.type && 
           i.affectedServices.some(s => incident.affectedServices.includes(s)) &&
           i.status === 'open'
    );

    if (existingIncident) {
      // Update existing incident
      existingIncident.description += `\n\nUpdate: ${incident.description}`;
      existingIncident.metrics = { ...existingIncident.metrics, ...incident.metrics };
      await this.updateIncident(existingIncident);
      return;
    }

    this.activeIncidents.set(incident.id, incident);
    
    // Store incident in Redis
    if (this.redis) {
      await this.redis.setex(`incident:${incident.id}`, 86400, JSON.stringify(incident));
      
      // Add to incident timeline
      await this.redis.zadd('incident_timeline', Date.now(), incident.id);
    }
    
    // Send alerts
    await this.sendIncidentAlert(incident);
    
    logger.error('Incident created', {
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
      title: incident.title
    });
  }

  /**
   * Update existing incident
   */
  private async updateIncident(incident: IncidentAlert): Promise<void> {
    if (this.redis) {
      await this.redis.setex(`incident:${incident.id}`, 86400, JSON.stringify(incident));
    }
    
    // Send update alert if severity increased
    if (incident.escalationLevel < 2) {
      await this.sendIncidentAlert(incident);
      incident.escalationLevel++;
    }
  }

  /**
   * Send incident alert
   */
  private async sendIncidentAlert(incident: IncidentAlert): Promise<void> {
    const alert = {
      incident,
      timestamp: new Date(),
      environment: process.env.NODE_ENV,
      dashboardUrl: `${process.env.DASHBOARD_URL}/incidents/${incident.id}`
    };

    // Store alert for dashboard
    if (this.redis) {
      await this.redis.lpush('incident_alerts', JSON.stringify(alert));
      await this.redis.ltrim('incident_alerts', 0, 99); // Keep last 100 alerts
    }

    // Here you would integrate with external alerting systems
    await this.sendSlackAlert(alert);
    await this.sendEmailAlert(alert);
    
    if (incident.severity === 'critical') {
      await this.sendPagerDutyAlert(alert);
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: any): Promise<void> {
    try {
      const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!slackWebhookUrl) {
        logger.warn('Slack webhook URL not configured');
        return;
      }

      const slackMessage = {
        text: `🚨 *${alert.incident.severity.toUpperCase()} Alert*`,
        attachments: [
          {
            color: alert.incident.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              {
                title: 'Incident ID',
                value: alert.incident.id,
                short: true
              },
              {
                title: 'Error Type',
                value: alert.incident.errorType,
                short: true
              },
              {
                title: 'Message',
                value: alert.incident.message,
                short: false
              },
              {
                title: 'Occurrences',
                value: alert.incident.occurrences.toString(),
                short: true
              },
              {
                title: 'First Seen',
                value: alert.incident.firstSeen.toISOString(),
                short: true
              }
            ],
            footer: 'Vikareta Error Tracking',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage)
      });

      if (response.ok) {
        logger.info('Slack alert sent successfully', { incidentId: alert.incident.id });
      } else {
        logger.error('Failed to send Slack alert', { 
          incidentId: alert.incident.id,
          status: response.status 
        });
      }
    } catch (error) {
      logger.error('Error sending Slack alert:', error);
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: any): Promise<void> {
    try {
      // Import notification service to send email
      const { notificationService } = await import('./notification.service');
      
      const alertEmails = process.env.ALERT_EMAILS?.split(',') || ['admin@vikareta.com'];
      
      for (const email of alertEmails) {
        await notificationService.sendNotification({
          userId: 'system',
          templateName: 'error_alert',
          channel: 'email',
          recipient: email.trim(),
          variables: {
            incidentId: alert.incident.id,
            severity: alert.incident.severity.toUpperCase(),
            errorType: alert.incident.errorType,
            message: alert.incident.message,
            occurrences: alert.incident.occurrences,
            firstSeen: alert.incident.firstSeen.toISOString(),
            stackTrace: alert.incident.stackTrace || 'N/A',
            dashboardUrl: `${process.env.ADMIN_URL}/incidents/${alert.incident.id}`
          },
          priority: alert.incident.severity === 'critical' ? 'critical' : 'high'
        });
      }
      
      logger.info('Email alert sent successfully', { incidentId: alert.incident.id });
    } catch (error) {
      logger.error('Error sending email alert:', error);
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(alert: any): Promise<void> {
    try {
      const pagerDutyIntegrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;
      if (!pagerDutyIntegrationKey) {
        logger.warn('PagerDuty integration key not configured');
        return;
      }

      const pagerDutyPayload = {
        routing_key: pagerDutyIntegrationKey,
        event_action: 'trigger',
        dedup_key: `vikareta-error-${alert.incident.id}`,
        payload: {
          summary: `${alert.incident.severity.toUpperCase()}: ${alert.incident.errorType}`,
          source: 'Vikareta Backend',
          severity: alert.incident.severity === 'critical' ? 'critical' : 'error',
          component: 'backend-api',
          group: 'vikareta-production',
          class: alert.incident.errorType,
          custom_details: {
            incident_id: alert.incident.id,
            message: alert.incident.message,
            occurrences: alert.incident.occurrences,
            first_seen: alert.incident.firstSeen.toISOString(),
            stack_trace: alert.incident.stackTrace,
            dashboard_url: `${process.env.ADMIN_URL}/incidents/${alert.incident.id}`
          }
        }
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pagerDutyPayload)
      });

      if (response.ok) {
        const result: any = await response.json();
        logger.info('PagerDuty alert sent successfully', { 
          incidentId: alert.incident.id,
          dedupKey: result.dedup_key 
        });
      } else {
        logger.error('Failed to send PagerDuty alert', { 
          incidentId: alert.incident.id,
          status: response.status 
        });
      }
    } catch (error) {
      logger.error('Error sending PagerDuty alert:', error);
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(incidentId: string, resolution: string): Promise<void> {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) return;

    incident.status = 'resolved';
    incident.description += `\n\nResolution: ${resolution}`;
    
    if (this.redis) {
      await this.redis.setex(`incident:${incidentId}`, 86400, JSON.stringify(incident));
    }
    this.activeIncidents.delete(incidentId);
    
    logger.info('Incident resolved', { id: incidentId, resolution });
  }

  /**
   * Setup error monitoring
   */
  private setupErrorMonitoring(): void {
    // Monitor uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.trackError(error, { endpoint: 'uncaught_exception' });
      logger.error('Uncaught exception:', error);
    });

    // Monitor unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.trackError(error, { endpoint: 'unhandled_rejection' });
      logger.error('Unhandled promise rejection:', error);
    });
  }

  /**
   * Start incident detection monitoring
   */
  private startIncidentDetection(): void {
    setInterval(async () => {
      await this.checkSystemHealth();
      await this.checkPerformanceMetrics();
      await this.escalateUnresolvedIncidents();
    }, 60000); // Check every minute
  }

  /**
   * Check overall system health
   */
  private async checkSystemHealth(): Promise<void> {
    try {
      // Check database connectivity
      // Check Redis connectivity
      // Check external service availability
      
      const healthChecks = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        this.checkExternalServices()
      ]);

      healthChecks.forEach((result, index) => {
        if (result.status === 'rejected') {
          const services = ['database', 'redis', 'external_services'];
          this.createIncident({
            type: 'service_down',
            severity: 'critical',
            title: `${services[index]} Health Check Failed`,
            description: `Health check failed: ${result.reason}`,
            affectedServices: [services[index]],
            metrics: { healthCheck: services[index] }
          });
        }
      });

    } catch (error) {
      logger.error('System health check failed:', error);
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<void> {
    // Implement database health check
    // This would typically involve a simple query
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<void> {
    if (this.redis) {
      await this.redis.ping();
    }
  }

  /**
   * Check external services health
   */
  private async checkExternalServices(): Promise<void> {
    // Check Cashfree API
    // Check DigiLocker API
    // Check other external dependencies
  }

  /**
   * Check performance metrics for degradation
   */
  private async checkPerformanceMetrics(): Promise<void> {
    // This would integrate with the performance monitoring service
    // to check for response time degradation, high error rates, etc.
  }

  /**
   * Escalate unresolved incidents
   */
  private async escalateUnresolvedIncidents(): Promise<void> {
    const now = Date.now();
    const escalationThreshold = 30 * 60 * 1000; // 30 minutes

    for (const incident of this.activeIncidents.values()) {
      if (incident.status === 'open' && 
          now - incident.timestamp.getTime() > escalationThreshold &&
          incident.escalationLevel < 3) {
        
        incident.escalationLevel++;
        incident.severity = incident.severity === 'high' ? 'critical' : 'high';
        
        await this.sendIncidentAlert(incident);
        logger.warn('Incident escalated', { 
          id: incident.id, 
          level: incident.escalationLevel 
        });
      }
    }
  }

  /**
   * Generate error fingerprint for grouping
   */
  private generateFingerprint(error: Error): string {
    const message = error.message.replace(/\d+/g, 'N'); // Replace numbers with N
    const stack = error.stack?.split('\n')[1] || ''; // First line of stack trace
    
    return require('crypto')
      .createHash('md5')
      .update(`${error.name}:${message}:${stack}`)
      .digest('hex');
  }

  /**
   * Determine error level based on error type
   */
  private determineErrorLevel(error: Error): 'error' | 'warn' | 'fatal' {
    if (error.name === 'ValidationError' || error.name === 'BadRequestError') {
      return 'warn';
    }
    
    if (error.name === 'DatabaseError' || error.name === 'PaymentError') {
      return 'fatal';
    }
    
    return 'error';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error analytics
   */
  async getErrorAnalytics(timeWindow: number = 86400000): Promise<any> {
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    // Get errors in time window
    const errorIds = this.redis ? await this.redis.zrangebyscore('error_timeline', cutoff, now) : [];
    
    const analytics = {
      totalErrors: errorIds.length,
      errorsByLevel: { error: 0, warn: 0, fatal: 0 },
      topErrorPatterns: [] as Array<{
        pattern: string;
        count: number;
        affectedUsers: number;
        endpoints: string[];
      }>,
      affectedEndpoints: new Set<string>(),
      affectedUsers: new Set<string>(),
      timeWindow: `${timeWindow / 1000}s`
    };

    // Analyze error patterns
    for (const [fingerprint, pattern] of this.errorPatterns.entries()) {
      if (pattern.lastSeen.getTime() > cutoff) {
        analytics.topErrorPatterns.push({
          pattern: pattern.pattern,
          count: pattern.count,
          affectedUsers: pattern.affectedUsers.size,
          endpoints: Array.from(pattern.endpoints)
        });
        
        pattern.endpoints.forEach(endpoint => analytics.affectedEndpoints.add(endpoint));
        pattern.affectedUsers.forEach(user => analytics.affectedUsers.add(user));
      }
    }

    analytics.topErrorPatterns.sort((a, b) => b.count - a.count);
    
    return {
      ...analytics,
      affectedEndpoints: Array.from(analytics.affectedEndpoints),
      affectedUsers: Array.from(analytics.affectedUsers),
      activeIncidents: Array.from(this.activeIncidents.values())
    };
  }

  /**
   * Get incident history
   */
  async getIncidentHistory(limit: number = 50): Promise<IncidentAlert[]> {
    if (!this.redis) {
      return [];
    }
    
    const incidentIds = await this.redis.zrevrange('incident_timeline', 0, limit - 1);
    const incidents: IncidentAlert[] = [];
    
    for (const id of incidentIds) {
      const incidentData = await this.redis.get(`incident:${id}`);
      if (incidentData) {
        incidents.push(JSON.parse(incidentData));
      }
    }
    
    return incidents;
  }
}

export const errorTrackingService = new ErrorTrackingService();