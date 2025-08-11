import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { WalletService } from '../wallet.service';

const prisma = new PrismaClient();

export interface BudgetStatus {
  totalBudget: number;
  spentAmount: number;
  remainingBudget: number;
  dailySpent: number;
  dailyRemaining: number;
  isExhausted: boolean;
  lockedAmountId?: string | null;
}

export interface BudgetLockRequest {
  businessId: string;
  campaignId: string;
  amount: number;
  lockReason?: string;
}

export interface BudgetDeductionRequest {
  campaignId: string;
  cost: number;
  eventType: 'impression' | 'click' | 'conversion';
  eventId: string;
  description?: string;
}

export class AdBudgetManagerService {
  private walletService: WalletService;

  constructor() {
    this.walletService = new WalletService();
  }

  /**
   * Lock budget amount for an advertisement campaign
   */
  async lockBudget(request: BudgetLockRequest): Promise<string> {
    try {
      // Validate request
      if (request.amount <= 0) {
        throw new Error('Budget amount must be greater than 0');
      }

      if (request.amount > 1000000) {
        throw new Error('Budget amount cannot exceed ₹10,00,000');
      }

      // Check if campaign exists
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: request.campaignId },
        include: { lockedAmounts: true },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.businessId !== request.businessId) {
        throw new Error('Unauthorized: Campaign does not belong to this business');
      }

      // Check if budget is already locked for this campaign
      const activeLock = campaign.lockedAmounts.find(lock => lock.status === 'active');
      if (activeLock) {
        throw new Error('Budget is already locked for this campaign');
      }

      // Check wallet balance
      const walletBalance = await this.walletService.getWalletBalance(request.businessId);
      if (walletBalance.availableBalance < request.amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${walletBalance.availableBalance}, Required: ₹${request.amount}`);
      }

      // Lock the amount in wallet
      const lockedAmount = await this.walletService.lockAmount({
        userId: request.businessId,
        amount: request.amount,
        lockReason: request.lockReason || 'advertisement_campaign_budget',
        referenceId: request.campaignId,
      });

      // The relation is automatically established through the referenceId in LockedAmount

      logger.info('Budget locked successfully:', {
        campaignId: request.campaignId,
        businessId: request.businessId,
        amount: request.amount,
        lockedAmountId: lockedAmount.id,
      });

      return lockedAmount.id;
    } catch (error) {
      logger.error('Error locking budget:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to lock budget: ${error.message}`);
      }
      throw new Error('Failed to lock budget');
    }
  }

  /**
   * Deduct cost from campaign budget for ad events
   */
  async deductCost(request: BudgetDeductionRequest): Promise<void> {
    try {
      // Validate request
      if (request.cost <= 0) {
        throw new Error('Cost must be greater than 0');
      }

      if (request.cost > 1000) {
        throw new Error('Single event cost cannot exceed ₹1,000');
      }

      // Get campaign with locked amount
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: request.campaignId },
        include: { lockedAmounts: true },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const activeLock = campaign.lockedAmounts.find(lock => lock.status === 'active');
      if (!activeLock) {
        throw new Error('No active budget lock found for this campaign');
      }

      // Check if campaign is active
      if (campaign.status !== 'active') {
        throw new Error('Cannot deduct cost from inactive campaign');
      }

      // Check if there's enough budget remaining
      const currentSpent = campaign.spentAmount.toNumber();
      const totalBudget = campaign.budget.toNumber();
      const remainingBudget = totalBudget - currentSpent;

      if (remainingBudget < request.cost) {
        // Auto-pause campaign if budget is exhausted
        await this.pauseCampaignOnBudgetExhaustion(request.campaignId);
        throw new Error(`Insufficient budget remaining. Available: ₹${remainingBudget}, Required: ₹${request.cost}`);
      }

      // Check daily budget if set
      if (campaign.dailyBudget) {
        const dailySpent = await this.getDailySpent(request.campaignId);
        const dailyBudget = campaign.dailyBudget.toNumber();
        const dailyRemaining = dailyBudget - dailySpent;

        if (dailyRemaining < request.cost) {
          throw new Error(`Daily budget limit reached. Daily remaining: ₹${dailyRemaining}, Required: ₹${request.cost}`);
        }
      }

      // Deduct from wallet by processing a debit transaction
      const wallet = await prisma.wallet.findUnique({
        where: { id: activeLock.walletId },
      });

      if (!wallet) {
        throw new Error('Wallet not found for locked amount');
      }

      await this.walletService.processWalletTransaction({
        walletId: wallet.id,
        transactionType: 'debit',
        amount: request.cost,
        referenceType: 'ad_cost',
        referenceId: request.eventId,
        description: request.description || `${request.eventType} cost for campaign ${campaign.name}`,
      });

      // Update campaign spent amount
      await prisma.adCampaign.update({
        where: { id: request.campaignId },
        data: {
          spentAmount: {
            increment: request.cost,
          },
        },
      });

      logger.info('Cost deducted successfully:', {
        campaignId: request.campaignId,
        cost: request.cost,
        eventType: request.eventType,
        eventId: request.eventId,
        newSpentAmount: currentSpent + request.cost,
      });

      // Check if budget is nearly exhausted and send warning
      const newSpentAmount = currentSpent + request.cost;
      const budgetUtilization = (newSpentAmount / totalBudget) * 100;

      if (budgetUtilization >= 90) {
        await this.sendBudgetWarning(request.campaignId, budgetUtilization);
      }

      // Auto-pause if budget is fully exhausted
      if (newSpentAmount >= totalBudget) {
        await this.pauseCampaignOnBudgetExhaustion(request.campaignId);
      }
    } catch (error) {
      logger.error('Error deducting cost:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to deduct cost: ${error.message}`);
      }
      throw new Error('Failed to deduct cost');
    }
  }

  /**
   * Check budget status for a campaign
   */
  async checkBudgetStatus(campaignId: string): Promise<BudgetStatus> {
    try {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: { lockedAmounts: true },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const totalBudget = campaign.budget.toNumber();
      const spentAmount = campaign.spentAmount.toNumber();
      const remainingBudget = totalBudget - spentAmount;
      const isExhausted = remainingBudget <= 0;

      // Calculate daily spent and remaining
      const dailySpent = await this.getDailySpent(campaignId);
      const dailyBudget = campaign.dailyBudget?.toNumber() || totalBudget;
      const dailyRemaining = Math.max(0, dailyBudget - dailySpent);

      return {
        totalBudget,
        spentAmount,
        remainingBudget: Math.max(0, remainingBudget),
        dailySpent,
        dailyRemaining,
        isExhausted,
        lockedAmountId: campaign.lockedAmounts.find(lock => lock.status === 'active')?.id || null,
      };
    } catch (error) {
      logger.error('Error checking budget status:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to check budget status: ${error.message}`);
      }
      throw new Error('Failed to check budget status');
    }
  }

  /**
   * Release budget lock for a campaign
   */
  async releaseBudget(campaignId: string): Promise<void> {
    try {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: { lockedAmounts: true },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const activeLock = campaign.lockedAmounts.find(lock => lock.status === 'active');
      if (!activeLock) {
        throw new Error('No active locked amount found for this campaign');
      }

      // Release the locked amount
      await this.walletService.releaseLock(
        activeLock.id,
        `Campaign ${campaign.name} completed/cancelled`
      );

      // The relation is automatically updated when the lock is released

      logger.info('Budget released successfully:', {
        campaignId,
        lockedAmountId: activeLock.id,
      });
    } catch (error) {
      logger.error('Error releasing budget:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to release budget: ${error.message}`);
      }
      throw new Error('Failed to release budget');
    }
  }

  /**
   * Pause campaign when budget is exhausted
   */
  async pauseCampaignOnBudgetExhaustion(campaignId: string): Promise<void> {
    try {
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: { status: 'paused' },
      });

      // Send notification to business owner
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          business: {
            select: {
              id: true,
              businessName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (campaign?.business) {
        await this.sendBudgetExhaustedNotification(campaign);
      }

      logger.info('Campaign paused due to budget exhaustion:', { campaignId });
    } catch (error) {
      logger.error('Error pausing campaign on budget exhaustion:', error);
      // Don't throw error as this is a background operation
    }
  }

  /**
   * Get daily spent amount for a campaign
   */
  private async getDailySpent(campaignId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await prisma.impressionRecord.aggregate({
      where: {
        advertisement: {
          campaignId,
        },
        viewedAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      _sum: {
        cost: true,
      },
    });

    const impressionCost = result._sum.cost?.toNumber() || 0;

    const clickResult = await prisma.clickRecord.aggregate({
      where: {
        advertisement: {
          campaignId,
        },
        clickedAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      _sum: {
        cost: true,
      },
    });

    const clickCost = clickResult._sum?.cost?.toNumber() || 0;

    return impressionCost + clickCost;
  }

  /**
   * Send budget warning notification
   */
  private async sendBudgetWarning(campaignId: string, utilizationPercentage: number): Promise<void> {
    try {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          business: {
            select: {
              id: true,
              businessName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!campaign?.business) {
        return;
      }

      // Import notification service dynamically to avoid circular dependency
      const { NotificationService } = await import('../notification.service');
      const notificationService = new NotificationService();

      if (campaign.business.email) {
        await notificationService.sendNotification({
          userId: campaign.business.id,
          templateName: 'ad_budget_warning',
          channel: 'email',
          recipient: campaign.business.email,
          variables: {
            businessName: campaign.business.businessName || 'Business Owner',
            campaignName: campaign.name,
            utilizationPercentage: utilizationPercentage.toFixed(1),
            remainingBudget: (campaign.budget.toNumber() - campaign.spentAmount.toNumber()).toFixed(2),
            totalBudget: campaign.budget.toNumber().toFixed(2),
            campaignId: campaign.id,
            dashboardUrl: `${process.env['BUSINESS_DASHBOARD_URL']}/campaigns/${campaign.id}`,
          },
          priority: 'high',
        });
      }

      logger.info('Budget warning sent:', {
        campaignId,
        businessId: campaign.business.id,
        utilizationPercentage,
      });
    } catch (error) {
      logger.error('Error sending budget warning:', error);
      // Don't throw error as this is a background operation
    }
  }

  /**
   * Real-time budget availability check before ad serving
   */
  async checkBudgetAvailabilityForAdServing(campaignId: string, estimatedCost: number): Promise<{
    available: boolean;
    reason?: string;
    remainingBudget: number;
    dailyRemaining: number;
  }> {
    try {
      const budgetStatus = await this.checkBudgetStatus(campaignId);

      // Check if campaign budget is exhausted
      if (budgetStatus.isExhausted) {
        return {
          available: false,
          reason: 'Campaign budget exhausted',
          remainingBudget: budgetStatus.remainingBudget,
          dailyRemaining: budgetStatus.dailyRemaining,
        };
      }

      // Check if there's enough remaining budget for the estimated cost
      if (budgetStatus.remainingBudget < estimatedCost) {
        return {
          available: false,
          reason: `Insufficient budget. Required: ₹${estimatedCost}, Available: ₹${budgetStatus.remainingBudget}`,
          remainingBudget: budgetStatus.remainingBudget,
          dailyRemaining: budgetStatus.dailyRemaining,
        };
      }

      // Check daily budget limit
      if (budgetStatus.dailyRemaining < estimatedCost) {
        return {
          available: false,
          reason: `Daily budget limit reached. Required: ₹${estimatedCost}, Daily remaining: ₹${budgetStatus.dailyRemaining}`,
          remainingBudget: budgetStatus.remainingBudget,
          dailyRemaining: budgetStatus.dailyRemaining,
        };
      }

      return {
        available: true,
        remainingBudget: budgetStatus.remainingBudget,
        dailyRemaining: budgetStatus.dailyRemaining,
      };
    } catch (error) {
      logger.error('Error checking budget availability for ad serving:', error);
      return {
        available: false,
        reason: 'Budget check failed',
        remainingBudget: 0,
        dailyRemaining: 0,
      };
    }
  }

  /**
   * Batch check budget availability for multiple campaigns
   */
  async batchCheckBudgetAvailability(campaignIds: string[]): Promise<Map<string, BudgetStatus>> {
    try {
      const budgetStatuses = new Map<string, BudgetStatus>();

      // Use Promise.allSettled to handle individual failures gracefully
      const results = await Promise.allSettled(
        campaignIds.map(async (campaignId) => ({
          campaignId,
          status: await this.checkBudgetStatus(campaignId),
        }))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          budgetStatuses.set(result.value.campaignId, result.value.status);
        } else {
          const failedCampaignId = campaignIds[index];
          logger.error(`Failed to check budget for campaign ${failedCampaignId}:`, result.reason);
          // Set default exhausted status for failed checks
          budgetStatuses.set(failedCampaignId, {
            totalBudget: 0,
            spentAmount: 0,
            remainingBudget: 0,
            dailySpent: 0,
            dailyRemaining: 0,
            isExhausted: true,
          });
        }
      });

      return budgetStatuses;
    } catch (error) {
      logger.error('Error in batch budget check:', error);
      return new Map();
    }
  }

  /**
   * Monitor and auto-pause campaigns that exceed budget
   */
  async monitorAndPauseCampaigns(): Promise<{
    pausedCampaigns: string[];
    warningCampaigns: string[];
  }> {
    try {
      const pausedCampaigns: string[] = [];
      const warningCampaigns: string[] = [];

      // Get all active campaigns
      const activeCampaigns = await prisma.adCampaign.findMany({
        where: {
          status: 'active',
          startDate: { lte: new Date() },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
        select: {
          id: true,
          name: true,
          budget: true,
          spentAmount: true,
          dailyBudget: true,
        },
      });

      // Check each campaign's budget status
      for (const campaign of activeCampaigns) {
        const budgetStatus = await this.checkBudgetStatus(campaign.id);

        // Auto-pause if budget is exhausted
        if (budgetStatus.isExhausted) {
          await this.pauseCampaignOnBudgetExhaustion(campaign.id);
          pausedCampaigns.push(campaign.id);
          continue;
        }

        // Send warning if budget utilization is high
        const utilizationPercentage = (budgetStatus.spentAmount / budgetStatus.totalBudget) * 100;
        if (utilizationPercentage >= 80 && utilizationPercentage < 100) {
          await this.sendBudgetWarning(campaign.id, utilizationPercentage);
          warningCampaigns.push(campaign.id);
        }
      }

      logger.info('Campaign budget monitoring completed:', {
        totalCampaigns: activeCampaigns.length,
        pausedCount: pausedCampaigns.length,
        warningCount: warningCampaigns.length,
      });

      return { pausedCampaigns, warningCampaigns };
    } catch (error) {
      logger.error('Error monitoring campaigns:', error);
      return { pausedCampaigns: [], warningCampaigns: [] };
    }
  }

  /**
   * Get budget utilization analytics for a campaign
   */
  async getBudgetUtilizationAnalytics(campaignId: string, days: number = 7): Promise<{
    dailySpend: Array<{ date: string; amount: number }>;
    hourlySpend: Array<{ hour: number; amount: number }>;
    projectedExhaustion: Date | null;
    averageDailySpend: number;
    burnRate: number; // spend per hour
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get daily spend data
      const dailySpendData = await prisma.$queryRaw<Array<{ date: string; amount: number }>>`
        SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(cost), 0) as amount
        FROM (
          SELECT created_at, cost FROM ad_impressions 
          WHERE advertisement_id IN (
            SELECT id FROM advertisements WHERE campaign_id = ${campaignId}
          )
          AND created_at >= ${startDate}
          AND created_at <= ${endDate}
          UNION ALL
          SELECT created_at, cost FROM ad_clicks 
          WHERE advertisement_id IN (
            SELECT id FROM advertisements WHERE campaign_id = ${campaignId}
          )
          AND created_at >= ${startDate}
          AND created_at <= ${endDate}
        ) combined_costs
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      // Get hourly spend data for today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const hourlySpendData = await prisma.$queryRaw<Array<{ hour: number; amount: number }>>`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COALESCE(SUM(cost), 0) as amount
        FROM (
          SELECT created_at, cost FROM ad_impressions 
          WHERE advertisement_id IN (
            SELECT id FROM advertisements WHERE campaign_id = ${campaignId}
          )
          AND created_at >= ${todayStart}
          UNION ALL
          SELECT created_at, cost FROM ad_clicks 
          WHERE advertisement_id IN (
            SELECT id FROM advertisements WHERE campaign_id = ${campaignId}
          )
          AND created_at >= ${todayStart}
        ) combined_costs
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `;

      // Calculate analytics
      const totalSpend = dailySpendData.reduce((sum, day) => sum + Number(day.amount), 0);
      const averageDailySpend = totalSpend / Math.max(days, 1);
      
      const totalHours = hourlySpendData.length || 1;
      const hourlyTotal = hourlySpendData.reduce((sum, hour) => sum + Number(hour.amount), 0);
      const burnRate = hourlyTotal / totalHours;

      // Project budget exhaustion date
      const budgetStatus = await this.checkBudgetStatus(campaignId);
      let projectedExhaustion: Date | null = null;
      
      if (averageDailySpend > 0 && budgetStatus.remainingBudget > 0) {
        const daysUntilExhaustion = budgetStatus.remainingBudget / averageDailySpend;
        projectedExhaustion = new Date();
        projectedExhaustion.setDate(projectedExhaustion.getDate() + Math.ceil(daysUntilExhaustion));
      }

      return {
        dailySpend: dailySpendData.map(d => ({
          date: d.date,
          amount: Number(d.amount),
        })),
        hourlySpend: hourlySpendData.map(h => ({
          hour: Number(h.hour),
          amount: Number(h.amount),
        })),
        projectedExhaustion,
        averageDailySpend,
        burnRate,
      };
    } catch (error) {
      logger.error('Error getting budget utilization analytics:', error);
      return {
        dailySpend: [],
        hourlySpend: [],
        projectedExhaustion: null,
        averageDailySpend: 0,
        burnRate: 0,
      };
    }
  }

  /**
   * Set up automated budget monitoring (to be called by a cron job)
   */
  async setupAutomatedBudgetMonitoring(): Promise<void> {
    try {
      // This would typically be called by a cron job every 5-10 minutes
      await this.monitorAndPauseCampaigns();
      
      // Also check for campaigns that need daily budget reset
      await this.resetDailyBudgetCounters();
      
      logger.info('Automated budget monitoring completed');
    } catch (error) {
      logger.error('Error in automated budget monitoring:', error);
    }
  }

  /**
   * Reset daily budget counters at midnight
   */
  private async resetDailyBudgetCounters(): Promise<void> {
    try {
      const now = new Date();
      const isNewDay = now.getHours() === 0 && now.getMinutes() < 10; // Within first 10 minutes of new day

      if (!isNewDay) {
        return;
      }

      // Get campaigns with daily budgets that were paused due to daily limit
      const pausedCampaigns = await prisma.adCampaign.findMany({
        where: {
          status: 'paused',
          dailyBudget: { not: null },
          // Add a field to track pause reason if needed
        },
      });

      for (const campaign of pausedCampaigns) {
        const dailySpent = await this.getDailySpent(campaign.id);
        const dailyBudget = campaign.dailyBudget?.toNumber() || 0;

        // If daily spent is reset (new day), reactivate campaign if total budget allows
        if (dailySpent === 0 && campaign.spentAmount.toNumber() < campaign.budget.toNumber()) {
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { status: 'active' },
          });

          logger.info('Campaign reactivated after daily budget reset:', {
            campaignId: campaign.id,
            campaignName: campaign.name,
          });
        }
      }
    } catch (error) {
      logger.error('Error resetting daily budget counters:', error);
    }
  }

  /**
   * Send budget exhausted notification
   */
  private async sendBudgetExhaustedNotification(campaign: any): Promise<void> {
    try {
      // Import notification service dynamically to avoid circular dependency
      const { NotificationService } = await import('../notification.service');
      const notificationService = new NotificationService();

      if (campaign.business.email) {
        await notificationService.sendNotification({
          userId: campaign.business.id,
          templateName: 'ad_budget_exhausted',
          channel: 'email',
          recipient: campaign.business.email,
          variables: {
            businessName: campaign.business.businessName || 'Business Owner',
            campaignName: campaign.name,
            totalBudget: campaign.budget.toNumber().toFixed(2),
            campaignId: campaign.id,
            dashboardUrl: `${process.env['BUSINESS_DASHBOARD_URL']}/campaigns/${campaign.id}`,
          },
          priority: 'high',
        });
      }

      // Also send WhatsApp notification if phone is available
      if (campaign.business.phone) {
        await notificationService.sendNotification({
          userId: campaign.business.id,
          templateName: 'ad_budget_exhausted_whatsapp',
          channel: 'whatsapp',
          recipient: campaign.business.phone,
          variables: {
            campaignName: campaign.name,
            totalBudget: campaign.budget.toNumber().toFixed(2),
          },
          priority: 'high',
        });
      }

      logger.info('Budget exhausted notification sent:', {
        campaignId: campaign.id,
        businessId: campaign.business.id,
      });
    } catch (error) {
      logger.error('Error sending budget exhausted notification:', error);
      // Don't throw error as this is a background operation
    }
  }
}

export const adBudgetManager = new AdBudgetManagerService();