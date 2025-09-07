import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { logger } from '@/utils/logger';

/**
 * Handles aggregation of raw ad events (impressions/clicks) into daily analytics (AdAnalytics table)
 * This service is invoked by Kafka consumers and scheduled jobs. All methods kept idempotent where possible.
 */
export class AdAnalyticsService {
  private getDay(date: Date = new Date()): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  async incrementImpression(campaignId: string): Promise<void> {
    const day = this.getDay();
    try {
      await prisma.adAnalytics.upsert({
        where: { campaignId_date: { campaignId, date: day } },
        update: { impressions: { increment: 1 } },
        create: { campaignId, date: day, impressions: 1, clicks: 0, conversions: 0 },
      });
    } catch (err) {
      logger.error('AdAnalyticsService.incrementImpression error', err);
    }
  }

  async incrementClick(campaignId: string): Promise<void> {
    const day = this.getDay();
    try {
      await prisma.adAnalytics.upsert({
        where: { campaignId_date: { campaignId, date: day } },
        update: { clicks: { increment: 1 } },
        create: { campaignId, date: day, impressions: 0, clicks: 1, conversions: 0 },
      });
    } catch (err) {
      logger.error('AdAnalyticsService.incrementClick error', err);
    }
  }

  async recalcDerivedMetrics(campaignId: string): Promise<void> {
    // Recalculate CTR, CPC, CPM at campaign level (lazy approximate) using aggregated counters
    try {
      const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) return;
      const impressions = campaign.impressions || 0;
      const clicks = campaign.clicks || 0;
      const spent = campaign.spentAmount ? Number(campaign.spentAmount) : 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const cpc = clicks > 0 ? spent / clicks : 0;
      const cpm = impressions > 0 ? (spent / impressions) * 1000 : 0;
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: {
          ctr: new Prisma.Decimal(ctr.toFixed(4)),
          cpc: new Prisma.Decimal(cpc.toFixed(4)),
          cpm: new Prisma.Decimal(cpm.toFixed(4)),
        },
      });
    } catch (err) {
      logger.error('AdAnalyticsService.recalcDerivedMetrics error', err);
    }
  }
}

export const adAnalyticsService = new AdAnalyticsService();
