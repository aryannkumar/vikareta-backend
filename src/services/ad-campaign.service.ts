import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class AdCampaignService extends BaseService {
  async create(data: {
    businessId: string;
    name: string;
    description?: string;
    campaignType: string;
    budget: number;
    dailyBudget?: number;
    startDate: Date;
    endDate?: Date;
    targetAudience?: any;
    targetingConfig?: any;
    bidStrategy?: string;
    bidAmount?: number;
    maxBid?: number;
  }) {
    const campaign = await this.prisma.adCampaign.create({
      data: {
        businessId: data.businessId,
        name: data.name,
        description: data.description,
        campaignType: data.campaignType,
        budget: data.budget,
        dailyBudget: data.dailyBudget,
        startDate: data.startDate,
        endDate: data.endDate,
        targetAudience: data.targetAudience,
        targetingConfig: data.targetingConfig,
        bidStrategy: data.bidStrategy || 'cpc',
        bidAmount: data.bidAmount,
        maxBid: data.maxBid,
      },
    });

    logger.info(`Ad campaign created: ${campaign.id} for business: ${data.businessId}`);
    return campaign;
  }

  async getById(id: string) {
    return this.prisma.adCampaign.findUnique({
      where: { id },
      include: {
        business: true,
        advertisements: true,
        approvals: true,
        analytics: true,
      },
    });
  }

  async getByBusiness(businessId: string, filters?: { status?: string; campaignType?: string }) {
    const where: any = { businessId };
    if (filters?.status) where.status = filters.status;
    if (filters?.campaignType) where.campaignType = filters.campaignType;

    return this.prisma.adCampaign.findMany({
      where,
      include: {
        advertisements: true,
        analytics: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    status: string;
    budget: number;
    dailyBudget: number;
    endDate: Date;
    targetAudience: any;
    targetingConfig: any;
    bidStrategy: string;
    bidAmount: number;
    maxBid: number;
  }>) {
    return this.prisma.adCampaign.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.adCampaign.update({
      where: { id },
      data: { status },
    });
  }

  async updateMetrics(id: string, metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spentAmount?: number;
  }) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new Error('Campaign not found');

    const updateData: any = {};
    if (metrics.impressions !== undefined) updateData.impressions = metrics.impressions;
    if (metrics.clicks !== undefined) updateData.clicks = metrics.clicks;
    if (metrics.conversions !== undefined) updateData.conversions = metrics.conversions;
    if (metrics.spentAmount !== undefined) updateData.spentAmount = metrics.spentAmount;

    // Recalculate derived metrics
    const impressions = (metrics.impressions !== undefined ? metrics.impressions : campaign.impressions) || 0;
    const clicks = (metrics.clicks !== undefined ? metrics.clicks : campaign.clicks) || 0;
    const spent = (metrics.spentAmount !== undefined ? metrics.spentAmount : Number(campaign.spentAmount)) || 0;

    updateData.ctr = impressions > 0 ? clicks / impressions : 0;
    updateData.cpc = clicks > 0 ? spent / clicks : 0;
    updateData.cpm = impressions > 0 ? (spent / impressions) * 1000 : 0;

    return this.prisma.adCampaign.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    return this.prisma.adCampaign.delete({ where: { id } });
  }

  async getActiveCampaigns() {
    return this.prisma.adCampaign.findMany({
      where: {
        status: 'active',
        startDate: { lte: new Date() },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } }
        ]
      },
      include: {
        advertisements: {
          where: { status: 'active' }
        }
      }
    });
  }
}

export const adCampaignService = new AdCampaignService();