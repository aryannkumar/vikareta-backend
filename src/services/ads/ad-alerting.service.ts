import { PrismaClient } from '@prisma/client';
import { adLoggingService } from './ad-logging.service';
import { logger } from '../../utils/logger';
import nodemailer from 'nodemailer';
import axios from 'axios';

const prisma = new PrismaClient();

export interface AlertChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: any;
  enabled: boolean;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: any;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  channels: string[];
  cooldownMinutes: number;
  autoResolve: boolean;
  autoResolveMinutes?: number;
}

export class AdAlertingService {
  private alertChannels: AlertChannel[] = [];
  private alertRules: AlertRule[] = [];
  private activeAlerts: Map<string, Alert> = new Map();
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
    this.initializeDefaultChannels();
    this.initializeDefaultRules();
    this.startAlertResolutionCheck();
  }

  // Alert Management
  async createAlert(
    title: string,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    component: string,
    metadata?: any
  ): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      message,
      severity,
      component,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };

    // Store alert in memory and database
    this.activeAlerts.set(alert.id, alert);
    await this.persistAlert(alert);

    // Send notifications
    await this.sendAlertNotifications(alert);

    // Log the alert
    await adLoggingService.logError(
      new Error(`Alert: ${title}`),
      {
        alertId: alert.id,
        component,
        severity,
        metadata,
      },
      severity === 'critical' ? 'critical' : 'high'
    );

    return alert;
  }

  async resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    // Update in database
    await this.updateAlertStatus(alertId, true, new Date());

    // Send resolution notification
    await this.sendResolutionNotification(alert, resolvedBy);

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    await adLoggingService.logAdminAction(
      resolvedBy || 'system',
      'ALERT_RESOLVED',
      alertId,
      { alert }
    );

    return true;
  }

  // Critical System Failure Alerts
  async alertDatabaseFailure(error: Error, context: any) {
    await this.createAlert(
      'Database Connection Failure',
      `Critical database error: ${error instanceof Error ? error.message : String(error)}. System may be unable to serve ads or process transactions.`,
      'critical',
      'database',
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        context,
        impact: 'high',
        actionRequired: 'immediate',
      }
    );
  }

  async alertBudgetSystemFailure(campaignId: string, error: Error) {
    await this.createAlert(
      'Budget System Failure',
      `Critical budget system error for campaign ${campaignId}: ${error instanceof Error ? error.message : String(error)}. Budget deductions may be failing.`,
      'critical',
      'budget_system',
      {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
        impact: 'financial',
        actionRequired: 'immediate',
      }
    );
  }

  async alertHighErrorRate(errorRate: number, timeWindow: string) {
    await this.createAlert(
      'High Error Rate Detected',
      `Error rate has reached ${errorRate.toFixed(2)}% over the last ${timeWindow}. This may indicate system instability.`,
      errorRate > 20 ? 'critical' : 'high',
      'ad_serving',
      {
        errorRate,
        timeWindow,
        threshold: 5,
        impact: 'service_degradation',
      }
    );
  }

  async alertExternalNetworkFailure(networkName: string, failureRate: number) {
    await this.createAlert(
      `External Network Failure: ${networkName}`,
      `External ad network ${networkName} has a failure rate of ${failureRate.toFixed(2)}%. Revenue may be impacted.`,
      failureRate > 50 ? 'high' : 'medium',
      'external_networks',
      {
        networkName,
        failureRate,
        impact: 'revenue_loss',
      }
    );
  }

  async alertCacheFailure(cacheHitRate: number) {
    await this.createAlert(
      'Cache Performance Degraded',
      `Cache hit rate has dropped to ${cacheHitRate.toFixed(2)}%. Ad serving performance may be impacted.`,
      'medium',
      'cache',
      {
        cacheHitRate,
        expectedRate: 80,
        impact: 'performance_degradation',
      }
    );
  }

  async alertFraudDetection(fraudType: string, details: any) {
    await this.createAlert(
      `Fraud Detection Alert: ${fraudType}`,
      `Potential fraud detected: ${fraudType}. Immediate investigation required.`,
      'high',
      'fraud_detection',
      {
        fraudType,
        details,
        impact: 'security_breach',
        actionRequired: 'investigation',
      }
    );
  }

  async alertBudgetExhaustion(campaignId: string, businessId: string) {
    await this.createAlert(
      'Campaign Budget Exhausted',
      `Campaign ${campaignId} has exhausted its budget and has been automatically paused.`,
      'medium',
      'budget_management',
      {
        campaignId,
        businessId,
        impact: 'campaign_paused',
        actionRequired: 'budget_increase',
      }
    );
  }

  // Notification Channels
  private initializeEmailTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  private initializeDefaultChannels() {
    this.alertChannels = [
      {
        id: 'email_admin',
        name: 'Admin Email',
        type: 'email',
        config: {
          recipients: process.env.ADMIN_EMAIL?.split(',') || ['admin@vikareta.com'],
          subject: '[VIKARETA ALERT] {severity} - {title}',
        },
        enabled: !!process.env.ADMIN_EMAIL,
      },
      {
        id: 'slack_alerts',
        name: 'Slack Alerts',
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: '#alerts',
        },
        enabled: !!process.env.SLACK_WEBHOOK_URL,
      },
      {
        id: 'webhook_monitoring',
        name: 'Monitoring Webhook',
        type: 'webhook',
        config: {
          url: process.env.MONITORING_WEBHOOK_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MONITORING_WEBHOOK_TOKEN}`,
          },
        },
        enabled: !!process.env.MONITORING_WEBHOOK_URL,
      },
    ];
  }

  private initializeDefaultRules() {
    this.alertRules = [
      {
        id: 'critical_database_failure',
        name: 'Critical Database Failure',
        description: 'Alert when database becomes unavailable',
        condition: 'database_status == unhealthy',
        threshold: 1,
        severity: 'critical',
        enabled: true,
        channels: ['email_admin', 'slack_alerts'],
        cooldownMinutes: 5,
        autoResolve: true,
        autoResolveMinutes: 10,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds threshold',
        condition: 'error_rate > threshold',
        threshold: 10,
        severity: 'high',
        enabled: true,
        channels: ['email_admin', 'slack_alerts'],
        cooldownMinutes: 15,
        autoResolve: true,
        autoResolveMinutes: 30,
      },
      {
        id: 'budget_system_failure',
        name: 'Budget System Failure',
        description: 'Alert when budget system encounters critical errors',
        condition: 'budget_errors > threshold',
        threshold: 5,
        severity: 'critical',
        enabled: true,
        channels: ['email_admin', 'slack_alerts'],
        cooldownMinutes: 10,
        autoResolve: false,
      },
      {
        id: 'external_network_failure',
        name: 'External Network Failure',
        description: 'Alert when external ad networks fail',
        condition: 'network_failure_rate > threshold',
        threshold: 80,
        severity: 'high',
        enabled: true,
        channels: ['email_admin'],
        cooldownMinutes: 30,
        autoResolve: true,
        autoResolveMinutes: 60,
      },
    ];
  }

  private async sendAlertNotifications(alert: Alert) {
    // Find applicable rules
    const applicableRules = this.alertRules.filter(rule =>
      rule.enabled && rule.severity === alert.severity
    );

    const channelIds = new Set<string>();
    applicableRules.forEach(rule => {
      rule.channels.forEach(channelId => channelIds.add(channelId));
    });

    // Send to each channel
    for (const channelId of channelIds) {
      const channel = this.alertChannels.find(c => c.id === channelId && c.enabled);
      if (channel) {
        await this.sendToChannel(channel, alert);
      }
    }
  }

  private async sendToChannel(channel: AlertChannel, alert: Alert) {
    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailAlert(channel, alert);
          break;
        case 'slack':
          await this.sendSlackAlert(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(channel, alert);
          break;
        case 'sms':
          await this.sendSmsAlert(channel, alert);
          break;
      }
    } catch (error) {
      await adLoggingService.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'send_alert_notification',
          channelId: channel.id,
          alertId: alert.id,
        },
        'medium'
      );
    }
  }

  private async sendEmailAlert(channel: AlertChannel, alert: Alert) {
    if (!this.emailTransporter) return;

    const subject = channel.config.subject
      .replace('{severity}', alert.severity.toUpperCase())
      .replace('{title}', alert.title);

    const html = this.generateEmailTemplate(alert);

    await this.emailTransporter.sendMail({
      from: process.env.SMTP_FROM || 'alerts@vikareta.com',
      to: channel.config.recipients.join(','),
      subject,
      html,
    });
  }

  private async sendSlackAlert(channel: AlertChannel, alert: Alert) {
    const color = this.getSeverityColor(alert.severity);
    const payload = {
      channel: channel.config.channel,
      attachments: [
        {
          color,
          title: `🚨 ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Component',
              value: alert.component,
              short: true,
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true,
            },
            {
              title: 'Alert ID',
              value: alert.id,
              short: true,
            },
          ],
          footer: 'Vikareta Alert System',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    };

    await axios.post(channel.config.webhookUrl, payload);
  }

  private async sendWebhookAlert(channel: AlertChannel, alert: Alert) {
    const payload = {
      alert,
      timestamp: new Date().toISOString(),
      source: 'vikareta-ad-system',
    };

    await axios({
      method: channel.config.method || 'POST',
      url: channel.config.url,
      headers: channel.config.headers || {},
      data: payload,
    });
  }

  private async sendSmsAlert(channel: AlertChannel, alert: Alert) {
    // SMS implementation would depend on your SMS provider (Twilio, AWS SNS, etc.)
    // For now, just log that SMS would be sent
    console.log(`SMS Alert would be sent: ${alert.title}`);
  }

  private async sendResolutionNotification(alert: Alert, resolvedBy?: string) {
    const resolutionMessage = `Alert "${alert.title}" has been resolved${resolvedBy ? ` by ${resolvedBy}` : ' automatically'}.`;

    // Send to same channels as original alert
    for (const channel of this.alertChannels.filter(c => c.enabled)) {
      try {
        if (channel.type === 'slack') {
          await axios.post(channel.config.webhookUrl, {
            channel: channel.config.channel,
            text: `✅ ${resolutionMessage}`,
            attachments: [
              {
                color: 'good',
                fields: [
                  {
                    title: 'Original Alert',
                    value: alert.title,
                    short: false,
                  },
                  {
                    title: 'Resolved At',
                    value: alert.resolvedAt?.toISOString(),
                    short: true,
                  },
                  {
                    title: 'Duration',
                    value: this.formatDuration(alert.timestamp, alert.resolvedAt!),
                    short: true,
                  },
                ],
              },
            ],
          });
        }
      } catch (error) {
        // Log but don't fail on notification errors
        console.error('Failed to send resolution notification:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  // Utility Methods
  private generateEmailTemplate(alert: Alert): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="background-color: ${this.getSeverityColor(alert.severity)}; color: white; padding: 20px;">
              <h1 style="margin: 0; font-size: 24px;">🚨 ${alert.title}</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Severity: ${alert.severity.toUpperCase()}</p>
            </div>
            <div style="padding: 20px;">
              <h2 style="color: #333; margin-top: 0;">Alert Details</h2>
              <p style="color: #666; line-height: 1.6;">${alert.message}</p>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Component:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${alert.component}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Time:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${alert.timestamp.toISOString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Alert ID:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${alert.id}</td>
                </tr>
              </table>
              
              ${alert.metadata ? `
                <h3 style="color: #333; margin-top: 20px;">Additional Information</h3>
                <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(alert.metadata, null, 2)}</pre>
              ` : ''}
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px;">
              Vikareta Advertisement System Alert
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  }

  private formatDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    } else {
      return `${diffMins}m`;
    }
  }

  // Database Operations
  private async persistAlert(alert: Alert) {
    try {
      // TODO: Implement alertLog model in Prisma schema
      // await prisma.alertLog.create({
      //   data: {
      //     alertId: alert.id,
      //     title: alert.title,
      //     message: alert.message,
      //     severity: alert.severity,
      //     component: alert.component,
      //     resolved: alert.resolved,
      //     metadata: alert.metadata || {},
      //     timestamp: alert.timestamp,
      //   },
      // });
      logger.info('Alert would be persisted:', alert);
    } catch (error) {
      console.error('Failed to persist alert:', error instanceof Error ? error.message : String(error));
    }
  }

  private async updateAlertStatus(alertId: string, resolved: boolean, resolvedAt: Date) {
    try {
      // TODO: Implement alertLog model in Prisma schema
      // await prisma.alertLog.update({
      //   where: { alertId },
      //   data: { resolved, resolvedAt },
      // });
      logger.info('Alert status would be updated:', { alertId, resolved, resolvedAt });
    } catch (error) {
      console.error('Failed to update alert status:', error instanceof Error ? error.message : String(error));
    }
  }

  // Auto-resolution
  private startAlertResolutionCheck() {
    setInterval(async () => {
      for (const [alertId, alert] of this.activeAlerts) {
        const rule = this.alertRules.find(r => r.autoResolve && r.severity === alert.severity);
        if (rule && rule.autoResolveMinutes) {
          const autoResolveTime = new Date(alert.timestamp.getTime() + rule.autoResolveMinutes * 60 * 1000);
          if (new Date() > autoResolveTime) {
            await this.resolveAlert(alertId, 'auto-resolution');
          }
        }
      }
    }, 60 * 1000); // Check every minute
  }

  // Public API
  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.activeAlerts.values());
  }

  async getAlertHistory(limit: number = 100): Promise<Alert[]> {
    try {
      // TODO: Implement alertLog model in Prisma schema
      // const alerts = await prisma.alertLog.findMany({
      //   orderBy: { timestamp: 'desc' },
      //   take: limit,
      // });

      // return alerts.map(alert => ({
      return [].map((alert: any) => ({
        id: alert.alertId,
        title: alert.title,
        message: alert.message,
        severity: alert.severity as any,
        component: alert.component,
        timestamp: alert.timestamp,
        resolved: alert.resolved,
        resolvedAt: alert.resolvedAt || undefined,
        metadata: alert.metadata,
      }));
    } catch (error) {
      console.error('Failed to get alert history:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}

export const adAlertingService = new AdAlertingService();