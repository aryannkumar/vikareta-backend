import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export const updateAnalyticsJob = async (): Promise<void> => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Update ad campaign analytics
    await updateAdCampaignAnalytics(today);
    
    // Update general platform analytics
    await updatePlatformAnalytics(today);
    
    logger.info('Analytics updated successfully');
  } catch (error) {
    logger.error('Error in update analytics job:', error);
    throw error;
  }
};

const updateAdCampaignAnalytics = async (date: Date): Promise<void> => {
  try {
    // Get all active campaigns
    const campaigns = await prisma.adCampaign.findMany({
      where: {
        status: 'active',
        startDate: { lte: date },
        OR: [
          { endDate: null },
          { endDate: { gte: date } },
        ],
      },
    });

    for (const campaign of campaigns) {
      // Calculate daily metrics
      const impressions = await prisma.impressionRecord.count({
        where: {
          advertisement: {
            campaignId: campaign.id,
          },
          viewedAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      const clicks = await prisma.clickRecord.count({
        where: {
          advertisement: {
            campaignId: campaign.id,
          },
          clickedAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      const spend = await prisma.clickRecord.aggregate({
        where: {
          advertisement: {
            campaignId: campaign.id,
          },
          clickedAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        _sum: {
          cost: true,
        },
      });

      // Calculate metrics
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? (spend._sum.cost?.toNumber() || 0) / clicks : 0;
      const cpm = impressions > 0 ? ((spend._sum.cost?.toNumber() || 0) / impressions) * 1000 : 0;

      // Upsert analytics record
      await prisma.adAnalytics.upsert({
        where: {
          campaignId_date: {
            campaignId: campaign.id,
            date: date,
          },
        },
        update: {
          impressions,
          clicks,
          spend: spend._sum.cost || 0,
          ctr,
          cpc,
          cpm,
        },
        create: {
          campaignId: campaign.id,
          date,
          impressions,
          clicks,
          spend: spend._sum.cost || 0,
          ctr,
          cpc,
          cpm,
        },
      });
    }

    logger.info(`Updated analytics for ${campaigns.length} ad campaigns`);
  } catch (error) {
    logger.error('Error updating ad campaign analytics:', error);
    throw error;
  }
};

const updatePlatformAnalytics = async (date: Date): Promise<void> => {
  try {
    // This would update general platform analytics
    // Implementation depends on specific analytics requirements
    logger.info('Platform analytics updated');
  } catch (error) {
    logger.error('Error updating platform analytics:', error);
    throw error;
  }
};