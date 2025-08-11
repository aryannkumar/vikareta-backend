import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../notification.service';
import { logger } from '../../utils/logger';

export class AdNotificationService {
  private prisma: PrismaClient;
  private notificationService: NotificationService;

  constructor(prisma?: PrismaClient, notificationService?: NotificationService) {
    this.prisma = prisma || new PrismaClient();
    this.notificationService = notificationService || new NotificationService();
  }
  /**
   * Check budget alerts for all active campaigns
   */
  async checkBudgetAlerts(): Promise<void> {
    try {
      const activeCampaigns = await this.prisma.adCampaign.findMany({
        where: {
          status: 'active',
          endDate: {
            gte: new Date(),
          },
        },
        include: {
          business: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      for (const campaign of activeCampaigns) {
        // Check if budget is exhausted
        if (campaign.spentAmount >= campaign.budget) {
          await this.sendBudgetExhaustedAlert(campaign);
        }
        // Check for low budget warning (90% spent)
        else if (Number(campaign.spentAmount) / Number(campaign.budget) >= 0.9) {
          await this.sendLowBudgetWarning(campaign);
        }

        // Check daily budget limits
        if (campaign.dailyBudget) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const dailySpent = await this.getDailySpent(campaign.id, today, tomorrow);
          if (Number(dailySpent) >= Number(campaign.dailyBudget)) {
            await this.sendDailyBudgetReachedAlert(campaign);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking budget alerts:', error);
    }
  }

  /**
   * Check performance alerts for campaigns
   */
  async checkPerformanceAlerts(): Promise<void> {
    try {
      const campaigns = await this.prisma.adCampaign.findMany({
        where: {
          status: 'active',
          createdAt: {
            lte: new Date(Date.now() - 24 * 60 * 60 * 1000), // At least 24 hours old
          },
        },
        include: {
          business: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      for (const campaign of campaigns) {
        const analytics = await this.getCampaignAnalytics(campaign.id);
        
        if (analytics.impressions > 100) { // Only check if sufficient data
          // Check CTR
          if (analytics.ctr < 1.0) { // Less than 1%
            await this.sendLowCTRAlert(campaign, analytics);
          }

          // Check CPC
          if (analytics.cpc > 10.0) { // More than $10
            await this.sendHighCPCAlert(campaign, analytics);
          }

          // Check conversions
          if (analytics.conversions === 0 && analytics.clicks > 50) {
            await this.sendLowConversionsAlert(campaign, analytics);
          }

          // Check ROAS
          if (analytics.roas < 1.0 && analytics.conversions > 0) {
            await this.sendPoorROASAlert(campaign, analytics);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking performance alerts:', error);
    }
  }

  /**
   * Send pending approval alert to admins
   */
  async sendPendingApprovalAlert(): Promise<void> {
    try {
      const pendingCount = await this.prisma.adApproval.count({
        where: {
          status: 'pending',
        },
      });

      if (pendingCount > 0) {
        const admins = await this.prisma.user.findMany({
          where: {
            email: {
              contains: 'admin',
            },
          },
        });

        const priority: 'high' | 'normal' = pendingCount > 10 ? 'high' : 'normal';
        
        const notifications = admins.map(admin => ({
          userId: admin.id,
          templateName: 'admin_alert_pending_approval',
          channel: 'email' as const,
          recipient: admin.email || '',
          priority,
          variables: {
            alertTitle: 'Pending Campaign Approvals',
            alertMessage: `${pendingCount} campaigns are waiting for approval`,
            pendingCount,
          },
        }));

        await this.notificationService.sendBulkNotifications(notifications);
      }
    } catch (error) {
      logger.error('Error sending pending approval alert:', error);
    }
  }

  /**
   * Send system health alert to admins
   */
  async sendSystemHealthAlert(healthData: {
    adServingLatency?: number;
    errorRate?: number;
    activeNetworks?: number;
    totalNetworks?: number;
  }): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          email: {
            contains: 'admin',
          },
        },
      });

      const alerts: Array<{
        templateName: string;
        priority: 'high' | 'critical' | 'normal';
        variables: Record<string, any>;
      }> = [];

      // Check latency
      if (healthData.adServingLatency && healthData.adServingLatency > 500) {
        const priority: 'high' | 'critical' = healthData.adServingLatency > 1000 ? 'critical' : 'high';
        alerts.push({
          templateName: 'admin_alert_system_health',
          priority,
          variables: {
            alertTitle: 'High Ad Serving Latency',
            alertMessage: `Ad serving latency is ${healthData.adServingLatency}ms`,
            metric: 'latency',
            value: healthData.adServingLatency,
          },
        });
      }

      // Check error rate (expecting decimal, e.g., 0.08 = 8%)
      if (healthData.errorRate && healthData.errorRate > 0.05) { // 5%
        const errorRatePercent = healthData.errorRate * 100;
        alerts.push({
          templateName: 'admin_alert_system_health',
          priority: 'high' as const,
          variables: {
            alertTitle: 'High Error Rate',
            alertMessage: `Ad system error rate is ${errorRatePercent.toFixed(1)}%`,
            metric: 'errorRate',
            value: healthData.errorRate,
          },
        });
      }

      // Check network availability
      if (healthData.activeNetworks && healthData.totalNetworks) {
        const availabilityRatio = healthData.activeNetworks / healthData.totalNetworks;
        if (availabilityRatio < 0.5) {
          alerts.push({
            templateName: 'admin_alert_system_health',
            priority: 'high' as const,
            variables: {
              alertTitle: 'External Network Issues',
              alertMessage: `Only ${healthData.activeNetworks}/${healthData.totalNetworks} ad networks are active`,
              metric: 'networkAvailability',
              value: availabilityRatio,
            },
          });
        }
      }

      if (alerts.length > 0) {
        const notifications = admins.flatMap(admin =>
          alerts.map(alert => ({
            userId: admin.id,
            channel: 'email' as const,
            recipient: admin.email || '',
            ...alert,
          }))
        );

        await this.notificationService.sendBulkNotifications(notifications);
      }
    } catch (error) {
      logger.error('Error sending system health alert:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(dateRange: { start: Date; end: Date }): Promise<{
    totalSent: number;
    budgetAlerts: number;
    performanceAlerts: number;
    adminAlerts: number;
    deliveryRate: number;
  }> {
    try {
      const notifications = await this.prisma.notification.findMany({
        where: {
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      const totalSent = notifications.length;
      let budgetAlerts = 0;
      let performanceAlerts = 0;
      let adminAlerts = 0;
      let successfulDeliveries = 0;

      notifications.forEach(notification => {
        const type = (notification as any).templateName || 
                    (notification as any).templateId || 
                    notification.type || 
                    'unknown';
        
        if (type.includes('budget') || type.includes('ad_budget') || type.includes('ad_low_budget')) {
          budgetAlerts++;
        } else if (type.includes('performance') || type.includes('ad_performance')) {
          performanceAlerts++;
        } else if (type.includes('admin') || type.includes('admin_alert')) {
          adminAlerts++;
        }

        // Assume successful delivery if status is not 'failed'
        if (notification.status !== 'failed') {
          successfulDeliveries++;
        }
      });

      const deliveryRate = totalSent > 0 ? successfulDeliveries / totalSent : 0;

      return {
        totalSent,
        budgetAlerts,
        performanceAlerts,
        adminAlerts,
        deliveryRate,
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      return {
        totalSent: 0,
        budgetAlerts: 0,
        performanceAlerts: 0,
        adminAlerts: 0,
        deliveryRate: 0,
      };
    }
  }

  // Private helper methods
  private async sendBudgetExhaustedAlert(campaign: any): Promise<void> {
    // Check if we already sent this alert in the last 24 hours
    const existingAlert = await this.prisma.notification.findFirst({
      where: {
        userId: campaign.businessId,
        type: 'ad_budget_exhausted',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (!existingAlert) {
      await this.notificationService.sendNotification({
        userId: campaign.businessId,
        templateName: 'ad_budget_exhausted',
        channel: 'email',
        recipient: campaign.business.email || '',
        priority: 'high',
        variables: {
          campaignName: campaign.name,
          campaignId: campaign.id,
          totalBudget: campaign.budget,
          spentAmount: campaign.spentAmount,
        },
      });
    }
  }

  private async sendLowBudgetWarning(campaign: any): Promise<void> {
    // Check if we already sent this alert in the last 24 hours
    const existingAlert = await this.prisma.notification.findFirst({
      where: {
        userId: campaign.businessId,
        type: 'ad_low_budget_warning',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (!existingAlert) {
      await this.notificationService.sendNotification({
        userId: campaign.businessId,
        templateName: 'ad_low_budget_warning',
        channel: 'email',
        recipient: campaign.business.email || '',
        priority: 'normal',
        variables: {
          campaignName: campaign.name,
          campaignId: campaign.id,
          totalBudget: campaign.budget,
          spentAmount: campaign.spentAmount,
          percentageSpent: Math.round((Number(campaign.spentAmount) / Number(campaign.budget)) * 100),
        },
      });
    }
  }

  private async sendDailyBudgetReachedAlert(campaign: any): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const existingAlert = await this.prisma.notification.findFirst({
      where: {
        userId: campaign.businessId,
        type: 'ad_daily_budget_reached',
        createdAt: {
          gte: new Date(today + 'T00:00:00.000Z'),
        },
      },
    });

    if (!existingAlert) {
      await this.notificationService.sendNotification({
        userId: campaign.businessId,
        templateName: 'ad_daily_budget_reached',
        channel: 'email',
        recipient: campaign.business.email || '',
        priority: 'normal',
        variables: {
          campaignName: campaign.name,
          campaignId: campaign.id,
          dailyBudget: campaign.dailyBudget,
          date: today,
        },
      });
    }
  }

  private async sendLowCTRAlert(campaign: any, analytics: any): Promise<void> {
    await this.notificationService.sendNotification({
      userId: campaign.businessId,
      templateName: 'ad_performance_low_ctr',
      channel: 'email',
      recipient: campaign.business.email || '',
      priority: 'normal',
      variables: {
        campaignName: campaign.name,
        campaignId: campaign.id,
        currentValue: `${analytics.ctr.toFixed(2)}%`,
        suggestions: 'Review and improve ad creative, targeting, and messaging',
      },
    });
  }

  private async sendHighCPCAlert(campaign: any, analytics: any): Promise<void> {
    await this.notificationService.sendNotification({
      userId: campaign.businessId,
      templateName: 'ad_performance_high_cpc',
      channel: 'email',
      recipient: campaign.business.email || '',
      priority: 'normal',
      variables: {
        campaignName: campaign.name,
        campaignId: campaign.id,
        currentValue: `$${analytics.cpc.toFixed(2)}`,
        suggestions: 'Lower bid amounts, improve quality score, or refine targeting',
      },
    });
  }

  private async sendLowConversionsAlert(campaign: any, analytics: any): Promise<void> {
    await this.notificationService.sendNotification({
      userId: campaign.businessId,
      templateName: 'ad_performance_low_conversions',
      channel: 'email',
      recipient: campaign.business.email || '',
      priority: 'normal',
      variables: {
        campaignName: campaign.name,
        campaignId: campaign.id,
        currentValue: analytics.conversions.toString(),
        suggestions: 'Optimize landing page, review conversion tracking, or adjust targeting',
      },
    });
  }

  private async sendPoorROASAlert(campaign: any, analytics: any): Promise<void> {
    await this.notificationService.sendNotification({
      userId: campaign.businessId,
      templateName: 'ad_performance_poor_roas',
      channel: 'email',
      recipient: campaign.business.email || '',
      priority: 'normal',
      variables: {
        campaignName: campaign.name,
        campaignId: campaign.id,
        currentValue: `${analytics.roas.toFixed(2)}x`,
        suggestions: 'Review pricing strategy, improve conversion rates, or reduce costs',
      },
    });
  }

  private async getDailySpent(campaignId: string, start: Date, end: Date): Promise<number> {
    const result = await this.prisma.impressionRecord.aggregate({
      where: {
        advertisement: {
          campaignId,
        },
        viewedAt: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        cost: true,
      },
    });

    return Number(result._sum?.cost) || 0;
  }

  private async getCampaignAnalytics(campaignId: string): Promise<{
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    roas: number;
  }> {
    // Get analytics from the database
    const analytics = await this.prisma.adAnalytics.findFirst({
      where: {
        campaignId,
        date: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (!analytics) {
      return {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
        roas: 0,
      };
    }

    return {
      impressions: analytics.impressions,
      clicks: analytics.clicks,
      conversions: analytics.conversions,
      ctr: Number(analytics.ctr),
      cpc: Number(analytics.cpc),
      roas: Number(analytics.roas),
    };
  }
}