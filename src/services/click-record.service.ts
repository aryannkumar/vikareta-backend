import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class ClickRecordService extends BaseService {
  async recordClick(data: {
    advertisementId: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    cost?: number;
  }) {
    const clickRecord = await this.prisma.clickRecord.create({
      data: {
        advertisementId: data.advertisementId,
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        referrer: data.referrer,
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

    // Update advertisement click count
    await this.prisma.advertisement.update({
      where: { id: data.advertisementId },
      data: {
        clicks: {
          increment: 1,
        },
      },
    });

    // Update campaign click count
    if (clickRecord.advertisement.campaignId) {
      await this.prisma.adCampaign.update({
        where: { id: clickRecord.advertisement.campaignId },
        data: {
          clicks: {
            increment: 1,
          },
        },
      });
    }

    logger.info(`Click recorded for advertisement: ${data.advertisementId}`);
    return clickRecord;
  }

  async getClicksByAdvertisement(advertisementId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const where: any = { advertisementId };

    if (filters?.startDate || filters?.endDate) {
      where.clickedAt = {};
      if (filters.startDate) where.clickedAt.gte = filters.startDate;
      if (filters.endDate) where.clickedAt.lte = filters.endDate;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    return this.prisma.clickRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { clickedAt: 'desc' },
    });
  }

  async getClicksByCampaign(campaignId: string, filters?: {
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
      where.clickedAt = {};
      if (filters.startDate) where.clickedAt.gte = filters.startDate;
      if (filters.endDate) where.clickedAt.lte = filters.endDate;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    return this.prisma.clickRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { clickedAt: 'desc' },
    });
  }

  async getClicksByUser(userId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    advertisementId?: string;
  }) {
    const where: any = { userId };

    if (filters?.startDate || filters?.endDate) {
      where.clickedAt = {};
      if (filters.startDate) where.clickedAt.gte = filters.startDate;
      if (filters.endDate) where.clickedAt.lte = filters.endDate;
    }

    if (filters?.advertisementId) {
      where.advertisementId = filters.advertisementId;
    }

    return this.prisma.clickRecord.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { clickedAt: 'desc' },
    });
  }

  async getClickStats(advertisementId: string, startDate?: Date, endDate?: Date) {
    const where: any = { advertisementId };

    if (startDate || endDate) {
      where.clickedAt = {};
      if (startDate) where.clickedAt.gte = startDate;
      if (endDate) where.clickedAt.lte = endDate;
    }

    const [totalClicks, uniqueUsers, totalCost] = await Promise.all([
      this.prisma.clickRecord.count({ where }),
      this.prisma.clickRecord.findMany({
        where,
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.clickRecord.aggregate({
        where,
        _sum: { cost: true },
      }),
    ]);

    return {
      totalClicks,
      uniqueUsers: uniqueUsers.filter(click => click.userId !== null).length,
      totalCost: totalCost._sum.cost || 0,
      averageCostPerClick: totalClicks > 0 ? Number(totalCost._sum.cost || 0) / totalClicks : 0,
    };
  }

  async getTopClickedAds(limit: number = 10, startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate || endDate) {
      where.clickedAt = {};
      if (startDate) where.clickedAt.gte = startDate;
      if (endDate) where.clickedAt.lte = endDate;
    }

    const result = await this.prisma.clickRecord.groupBy({
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
          clickCount: item._count.id,
          totalCost: item._sum.cost || 0,
        };
      })
    );

    return adsWithDetails;
  }

  async getClickTrends(advertisementId: string, groupBy: 'hour' | 'day' | 'week' | 'month' = 'day', startDate?: Date, endDate?: Date) {
    const where: any = { advertisementId };

    if (startDate || endDate) {
      where.clickedAt = {};
      if (startDate) where.clickedAt.gte = startDate;
      if (endDate) where.clickedAt.lte = endDate;
    }

    // This would require raw SQL for date grouping
    // For now, we'll return individual records and group them in memory
    const clicks = await this.prisma.clickRecord.findMany({
      where,
      select: {
        clickedAt: true,
        cost: true,
      },
      orderBy: { clickedAt: 'asc' },
    });

    // Group by the specified time period
    const groupedClicks = clicks.reduce((acc, click) => {
      const date = new Date(click.clickedAt);
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
          clicks: 0,
          cost: 0,
        };
      }

      acc[key].clicks += 1;
      acc[key].cost += Number(click.cost || 0);

      return acc;
    }, {} as Record<string, { date: string; clicks: number; cost: number }>);

    return Object.values(groupedClicks);
  }

  async deleteOldRecords(olderThanDays: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.clickRecord.deleteMany({
      where: {
        clickedAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Deleted ${result.count} old click records older than ${olderThanDays} days`);
    return result;
  }
}

export const clickRecordService = new ClickRecordService();