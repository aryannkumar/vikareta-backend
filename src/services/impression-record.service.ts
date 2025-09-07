import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class ImpressionRecordService extends BaseService {
  async recordImpression(data: {
    advertisementId: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    cost?: number;
  }) {
    const impressionRecord = await this.prisma.impressionRecord.create({
      data: {
        advertisementId: data.advertisementId,
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        cost: data.cost,
      },
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
    });

    // Update advertisement impression count
    await this.prisma.advertisement.update({
      where: { id: data.advertisementId },
      data: {
        impressions: {
          increment: 1,
        },
      },
    });

    // Update campaign impression count
    if (impressionRecord.advertisement.campaignId) {
      await this.prisma.adCampaign.update({
        where: { id: impressionRecord.advertisement.campaignId },
        data: {
          impressions: {
            increment: 1,
          },
        },
      });
    }

    logger.info(`Impression recorded for advertisement: ${data.advertisementId}`);
    return impressionRecord;
  }

  async getImpressionsByAdvertisement(advertisementId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const where: any = { advertisementId };

    if (filters?.startDate || filters?.endDate) {
      where.viewedAt = {};
      if (filters.startDate) where.viewedAt.gte = filters.startDate;
      if (filters.endDate) where.viewedAt.lte = filters.endDate;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    return this.prisma.impressionRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { viewedAt: 'desc' },
    });
  }

  async getImpressionsByCampaign(campaignId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const where: any = {
      advertisement: {
        campaignId,
      },
    };

    if (filters?.startDate || filters?.endDate) {
      where.viewedAt = {};
      if (filters.startDate) where.viewedAt.gte = filters.startDate;
      if (filters.endDate) where.viewedAt.lte = filters.endDate;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    return this.prisma.impressionRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { viewedAt: 'desc' },
    });
  }

  async getImpressionsByUser(userId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    advertisementId?: string;
  }) {
    const where: any = { userId };

    if (filters?.startDate || filters?.endDate) {
      where.viewedAt = {};
      if (filters.startDate) where.viewedAt.gte = filters.startDate;
      if (filters.endDate) where.viewedAt.lte = filters.endDate;
    }

    if (filters?.advertisementId) {
      where.advertisementId = filters.advertisementId;
    }

    return this.prisma.impressionRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { viewedAt: 'desc' },
    });
  }

  async getImpressionStats(advertisementId: string, startDate?: Date, endDate?: Date) {
    const where: any = { advertisementId };

    if (startDate || endDate) {
      where.viewedAt = {};
      if (startDate) where.viewedAt.gte = startDate;
      if (endDate) where.viewedAt.lte = endDate;
    }

    const [totalImpressions, uniqueUsers, totalCost] = await Promise.all([
      this.prisma.impressionRecord.count({ where }),
      this.prisma.impressionRecord.findMany({
        where,
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.impressionRecord.aggregate({
        where,
        _sum: { cost: true },
      }),
    ]);

    return {
      totalImpressions,
      uniqueUsers: uniqueUsers.filter(impression => impression.userId !== null).length,
      totalCost: totalCost._sum.cost || 0,
      averageCostPerImpression: totalImpressions > 0 ? Number(totalCost._sum.cost || 0) / totalImpressions : 0,
    };
  }

  async getTopViewedAds(limit: number = 10, startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate || endDate) {
      where.viewedAt = {};
      if (startDate) where.viewedAt.gte = startDate;
      if (endDate) where.viewedAt.lte = endDate;
    }

    const result = await this.prisma.impressionRecord.groupBy({
      by: ['advertisementId'],
      where,
      _count: {
        id: true,
      },
      _sum: {
        cost: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // Get advertisement details for each result
    const adsWithDetails = await Promise.all(
      result.map(async (item) => {
        const ad = await this.prisma.advertisement.findUnique({
          where: { id: item.advertisementId },
          include: {
            campaign: true,
          },
        });

        return {
          advertisement: ad,
          impressionCount: item._count.id,
          totalCost: item._sum.cost || 0,
        };
      })
    );

    return adsWithDetails;
  }

  async getImpressionTrends(advertisementId: string, groupBy: 'hour' | 'day' | 'week' | 'month' = 'day', startDate?: Date, endDate?: Date) {
    const where: any = { advertisementId };

    if (startDate || endDate) {
      where.viewedAt = {};
      if (startDate) where.viewedAt.gte = startDate;
      if (endDate) where.viewedAt.lte = endDate;
    }

    // This would require raw SQL for date grouping
    // For now, we'll return individual records and group them in memory
    const impressions = await this.prisma.impressionRecord.findMany({
      where,
      select: {
        viewedAt: true,
        cost: true,
      },
      orderBy: { viewedAt: 'asc' },
    });

    // Group by the specified time period
    const groupedImpressions = impressions.reduce((acc, impression) => {
      const date = new Date(impression.viewedAt);
      let key: string;

      switch (groupBy) {
        case 'hour': {
          key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
          break;
        }
        case 'day': {
          key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
          break;
        }
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`;
          break;
        }
        case 'month': {
          key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          break;
        }
      }

      if (!acc[key]) {
        acc[key] = {
          date: key,
          impressions: 0,
          cost: 0,
        };
      }

      acc[key].impressions += 1;
      acc[key].cost += Number(impression.cost || 0);

      return acc;
    }, {} as Record<string, { date: string; impressions: number; cost: number }>);

    return Object.values(groupedImpressions);
  }

  async deleteOldRecords(olderThanDays: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.impressionRecord.deleteMany({
      where: {
        viewedAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Deleted ${result.count} old impression records older than ${olderThanDays} days`);
    return result;
  }
}

export const impressionRecordService = new ImpressionRecordService();