import { PrismaClient } from '@prisma/client';
import type { AdCampaign, Advertisement, AdApproval } from '@prisma/client';
import { WalletService } from '../wallet.service';
import { logger } from '../../utils/logger';

export interface CreateCampaignRequest {
  businessId: string;
  name: string;
  description?: string;
  campaignType: 'product' | 'service' | 'brand';
  budget: number;
  dailyBudget?: number;
  bidAmount: number;
  biddingStrategy: 'cpc' | 'cpm' | 'cpa';
  startDate: Date;
  endDate?: Date;
  targetingConfig: {
    demographics?: {
      ageRange?: number[];
      gender?: string;
      interests?: string[];
    };
    location?: {
      countries?: string[];
      states?: string[];
      cities?: string[];
    };
    behavior?: {
      platforms?: string[];
      deviceTypes?: string[];
    };
  };
  ads?: CreateAdRequest[];
}

export interface CreateAdRequest {
  campaignId?: string;
  title: string;
  description: string;
  adType: 'banner' | 'native' | 'video' | 'carousel';
  adFormat: 'image' | 'video' | 'html';
  content: {
    images?: string[];
    videos?: string[];
    html?: string;
  };
  callToAction: string;
  destinationUrl: string;
  priority?: number;
}

export interface CampaignAnalytics {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpc: number;
  roas: number;
}

export class AdService {
  private prisma: PrismaClient;
  private walletService: WalletService;

  constructor(walletService?: WalletService) {
    this.prisma = new PrismaClient();
    this.walletService = walletService || new WalletService();
  }

  /**
   * Create a new advertising campaign
   */
  async createCampaign(request: CreateCampaignRequest): Promise<AdCampaign & {
    ads: Advertisement[];
    approvals: AdApproval[];
  }> {
    try {
      const businessId = request.businessId;
      
      // Validate budget availability
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: businessId },
      });

      if (!wallet || Number(wallet.availableBalance) < request.budget) {
        throw new Error('Insufficient wallet balance for campaign budget');
      }

      // Create campaign
      const campaign = await this.prisma.adCampaign.create({
        data: {
          businessId,
          name: request.name,
          description: request.description,
          campaignType: request.campaignType,
          budget: request.budget,
          dailyBudget: request.dailyBudget,
          bidAmount: request.bidAmount,
          biddingStrategy: request.biddingStrategy,
          startDate: request.startDate,
          endDate: request.endDate,
          targetingConfig: request.targetingConfig,
          status: 'draft',
        },
      });

      // Create ads if provided
      const ads: Advertisement[] = [];
      if (request.ads && request.ads.length > 0) {
        for (const adData of request.ads) {
          const ad = await this.prisma.advertisement.create({
            data: {
              campaignId: campaign.id,
              title: adData.title,
              description: adData.description,
              adType: adData.adType,
              adFormat: adData.adFormat,
              content: adData.content,
              callToAction: adData.callToAction,
              destinationUrl: adData.destinationUrl,
              priority: adData.priority || 1,
              status: 'active',
            },
          });
          ads.push(ad);
        }
      }

      // Create approval record
      const approval = await this.prisma.adApproval.create({
        data: {
          campaignId: campaign.id,
          status: 'pending',
        },
      });

      // Lock budget amount in wallet
      await this.walletService.lockAmount({
        userId: businessId,
        amount: request.budget,
        lockReason: 'ad_campaign',
        referenceId: campaign.id
      });

      logger.info(`Campaign created: ${campaign.id} for business: ${businessId}`);
      
      return {
        ...campaign,
        ads,
        approvals: [approval],
      };
    } catch (error) {
      logger.error('Failed to create campaign:', error);
      throw error;
    }
  }

  /**
   * Create an advertisement for a campaign
   */
  async createAdvertisement(request: CreateAdRequest): Promise<Advertisement> {
    try {
      // Verify campaign exists and belongs to user
      const campaign = await this.prisma.adCampaign.findUnique({
        where: { id: request.campaignId },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Create advertisement
      const advertisement = await this.prisma.advertisement.create({
        data: {
          campaignId: request.campaignId!,
          title: request.title,
          description: request.description,
          adType: request.adType,
          adFormat: request.adFormat,
          content: request.content,
          callToAction: request.callToAction,
          destinationUrl: request.destinationUrl,
          priority: request.priority || 1,
          status: 'active',
        },
      });

      logger.info(`Advertisement created: ${advertisement.id} for campaign: ${request.campaignId}`);
      return advertisement;
    } catch (error) {
      logger.error('Failed to create advertisement:', error);
      throw error;
    }
  }

  /**
   * Get campaigns for a business
   */
  async getCampaigns(businessId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
    page?: number;
    campaignType?: string;
  }): Promise<{
    campaigns: AdCampaign[];
    total: number;
    page?: number;
    totalPages?: number;
  }> {
    try {
      const where: any = { businessId };
      if (options?.status) {
        where.status = options.status;
      }
      if (options?.campaignType) {
        where.campaignType = options.campaignType;
      }

      const limit = options?.limit || 50;
      const page = options?.page || 1;
      const offset = options?.offset || (page - 1) * limit;

      const [campaigns, total] = await Promise.all([
        this.prisma.adCampaign.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            advertisements: true,
            analytics: true,
            approvals: true,
          },
        }),
        this.prisma.adCampaign.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return { 
        campaigns, 
        total,
        page: options?.page,
        totalPages: options?.page ? totalPages : undefined,
      };
    } catch (error) {
      logger.error('Failed to get campaigns:', error);
      throw error;
    }
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string, businessId?: string): Promise<(AdCampaign & {
    business: {
      id: string;
      businessName: string | null;
      email: string | null;
    };
    ads: Advertisement[];
    approvals: AdApproval[];
  }) | null> {
    try {
      const where: any = { id: campaignId };
      if (businessId) {
        where.businessId = businessId;
      }

      return await this.prisma.adCampaign.findUnique({
        where,
        include: {
          business: {
            select: {
              id: true,
              businessName: true,
              email: true,
            },
          },
          advertisements: true,
          analytics: true,
          approvals: true,
        },
      }) as any;
    } catch (error) {
      logger.error('Failed to get campaign:', error);
      throw error;
    }
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId: string, updates: Partial<CreateCampaignRequest>, businessId?: string): Promise<AdCampaign> {
    if (!businessId && updates.businessId) {
      businessId = updates.businessId;
    }
    try {
      // Verify campaign ownership
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: campaignId, businessId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      // Handle budget changes
      if (updates.budget && updates.budget !== Number(campaign.budget)) {
        const budgetDifference = updates.budget - Number(campaign.budget);
        
        if (budgetDifference > 0) {
          // Increasing budget - check wallet balance
          const wallet = await this.prisma.wallet.findUnique({
            where: { userId: businessId },
          });

          if (!wallet || Number(wallet.availableBalance) < budgetDifference) {
            throw new Error('Insufficient wallet balance for budget increase');
          }

          // Lock additional amount
          await this.walletService.lockAmount({
            userId: businessId!,
            amount: budgetDifference,
            lockReason: 'ad_campaign',
            referenceId: campaignId
          });
        } else {
          // Decreasing budget - release locked amount
          // TODO: Implement proper lock release by finding the lock ID first
          // await this.walletService.releaseLock(lockId, 'Budget decreased');
        }
      }

      // Update campaign
      const updateData: any = {
        updatedAt: new Date(),
      };
      
      // Only include fields that exist in the Prisma schema
      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.campaignType) updateData.campaignType = updates.campaignType;
      if (updates.budget) updateData.budget = updates.budget;
      if (updates.dailyBudget) updateData.dailyBudget = updates.dailyBudget;
      if (updates.bidAmount) updateData.bidAmount = updates.bidAmount;
      if (updates.biddingStrategy) updateData.biddingStrategy = updates.biddingStrategy;
      if (updates.startDate) updateData.startDate = updates.startDate;
      if (updates.endDate) updateData.endDate = updates.endDate;
      if (updates.targetingConfig) updateData.targetingConfig = updates.targetingConfig;

      const updatedCampaign = await this.prisma.adCampaign.update({
        where: { id: campaignId },
        data: updateData,
        include: {
          advertisements: true,
          analytics: true,
          approvals: true,
        },
      });

      logger.info(`Campaign updated: ${campaignId}`);
      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to update campaign:', error);
      throw error;
    }
  }

  /**
   * Delete campaign
   */
  async deleteCampaign(campaignId: string, businessId?: string): Promise<void> {
    try {
      // Verify campaign ownership
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: campaignId, businessId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      // Release locked budget
      const remainingBudget = Number(campaign.budget) - Number(campaign.spentAmount);
      if (remainingBudget > 0) {
        // TODO: Implement proper lock release by finding the lock ID first
        // await this.walletService.releaseLock(lockId, 'Campaign paused');
      }

      // Delete campaign (cascades to ads, analytics, etc.)
      await this.prisma.adCampaign.delete({
        where: { id: campaignId },
      });

      logger.info(`Campaign deleted: ${campaignId}`);
    } catch (error) {
      logger.error('Failed to delete campaign:', error);
      throw error;
    }
  }

  /**
   * Submit campaign for approval
   */
  async submitForApproval(campaignId: string, businessId?: string): Promise<AdApproval> {
    try {
      // Verify campaign ownership
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: campaignId, businessId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      if (campaign.status !== 'draft') {
        throw new Error('Only draft campaigns can be submitted for approval');
      }

      // Create approval request
      const approval = await this.prisma.adApproval.create({
        data: {
          campaignId,
          status: 'pending',
        },
      });

      // Update campaign status
      await this.prisma.adCampaign.update({
        where: { id: campaignId },
        data: { status: 'pending_approval' },
      });

      logger.info(`Campaign submitted for approval: ${campaignId}`);
      return approval;
    } catch (error) {
      logger.error('Failed to submit campaign for approval:', error);
      throw error;
    }
  }

  /**
   * Get campaign analytics
   */
  async getCampaignAnalytics(campaignId: string, dateRange?: {
    start: Date;
    end: Date;
  }): Promise<CampaignAnalytics> {
    try {
      const where: any = { campaignId };
      if (dateRange) {
        where.date = {
          gte: dateRange.start,
          lte: dateRange.end,
        };
      }

      const analytics = await this.prisma.adAnalytics.findMany({
        where,
        orderBy: { date: 'desc' },
      });

      // Aggregate analytics data
      const aggregated = analytics.reduce(
        (acc, curr) => ({
          impressions: acc.impressions + curr.impressions,
          clicks: acc.clicks + curr.clicks,
          conversions: acc.conversions + curr.conversions,
          spend: acc.spend + Number(curr.spend),
          revenue: acc.revenue + Number(curr.revenue),
        }),
        { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 }
      );

      const ctr = aggregated.impressions > 0 ? (aggregated.clicks / aggregated.impressions) * 100 : 0;
      const cpc = aggregated.clicks > 0 ? aggregated.spend / aggregated.clicks : 0;
      const roas = aggregated.spend > 0 ? aggregated.revenue / aggregated.spend : 0;

      return {
        campaignId,
        ...aggregated,
        ctr,
        cpc,
        roas,
      };
    } catch (error) {
      logger.error('Failed to get campaign analytics:', error);
      throw error;
    }
  }

  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId: string, businessId?: string): Promise<AdCampaign> {
    try {
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: campaignId, businessId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      const updatedCampaign = await this.prisma.adCampaign.update({
        where: { id: campaignId },
        data: { status: 'paused' },
      });

      logger.info(`Campaign paused: ${campaignId}`);
      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to pause campaign:', error);
      throw error;
    }
  }

  /**
   * Resume campaign
   */
  async resumeCampaign(campaignId: string, businessId?: string): Promise<AdCampaign> {
    try {
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: campaignId, businessId },
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      const updatedCampaign = await this.prisma.adCampaign.update({
        where: { id: campaignId },
        data: { status: 'active' },
      });

      logger.info(`Campaign resumed: ${campaignId}`);
      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to resume campaign:', error);
      throw error;
    }
  }

  /**
   * Get advertisements for a campaign
   */
  async getAdvertisements(campaignId: string, businessId?: string): Promise<Advertisement[]> {
    try {
      // Verify campaign access if businessId provided
      if (businessId) {
        const campaign = await this.prisma.adCampaign.findFirst({
          where: { id: campaignId, businessId },
        });

        if (!campaign) {
          throw new Error('Campaign not found or access denied');
        }
      }

      return await this.prisma.advertisement.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Failed to get advertisements:', error);
      throw error;
    }
  }

  /**
   * Update advertisement
   */
  async updateAdvertisement(adId: string, businessId: string, updates: Partial<CreateAdRequest>): Promise<Advertisement> {
    try {
      // Verify ad ownership through campaign
      const ad = await this.prisma.advertisement.findUnique({
        where: { id: adId },
        include: {
          campaign: {
            select: { businessId: true },
          },
        },
      });

      if (!ad || ad.campaign.businessId !== businessId) {
        throw new Error('Advertisement not found or access denied');
      }

      const updatedAd = await this.prisma.advertisement.update({
        where: { id: adId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      logger.info(`Advertisement updated: ${adId}`);
      return updatedAd;
    } catch (error) {
      logger.error('Failed to update advertisement:', error);
      throw error;
    }
  }

  /**
   * Delete advertisement
   */
  async deleteAdvertisement(adId: string, businessId: string): Promise<void> {
    try {
      // Verify ad ownership through campaign
      const ad = await this.prisma.advertisement.findUnique({
        where: { id: adId },
        include: {
          campaign: {
            select: { businessId: true },
          },
        },
      });

      if (!ad || ad.campaign.businessId !== businessId) {
        throw new Error('Advertisement not found or access denied');
      }

      await this.prisma.advertisement.delete({
        where: { id: adId },
      });

      logger.info(`Advertisement deleted: ${adId}`);
    } catch (error) {
      logger.error('Failed to delete advertisement:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const adService = new AdService();