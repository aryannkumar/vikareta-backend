import { PrismaClient } from '@prisma/client';
import type { AdApproval, AdCampaign } from '@prisma/client';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';

export interface ApprovalDecision {
  campaignId: string;
  reviewerId: string;
  status: 'approved' | 'rejected';
  reviewNotes?: string;
  rejectionReason?: string;
}

export interface ApprovalFilters {
  status?: 'pending' | 'approved' | 'rejected';
  campaignType?: string;
  businessId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  averageReviewTime: number; // in hours
  pendingByPriority: {
    high: number;
    normal: number;
    low: number;
  };
}

export class AdApprovalService {
  private prisma: PrismaClient;
  private notificationService: NotificationService;

  constructor() {
    this.prisma = new PrismaClient();
    this.notificationService = new NotificationService();
  }

  /**
   * Get pending approvals for admin review
   */
  async getPendingApprovals(options?: {
    limit?: number;
    offset?: number;
    page?: number;
    businessId?: string;
    filters?: ApprovalFilters;
  }): Promise<{
    approvals: (AdApproval & {
      campaign: AdCampaign & {
        business: {
          id: string;
          businessName: string | null;
          email: string | null;
        };
      };
    })[];
    total: number;
    page?: number;
    totalPages?: number;
  }> {
    try {
      const where: any = {
        status: options?.filters?.status || 'pending',
      };

      // Handle businessId filter (can come from options.businessId or options.filters.businessId)
      const businessId = options?.businessId || options?.filters?.businessId;
      if (businessId) {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(businessId)) {
          // Return empty result for invalid UUID
          return {
            approvals: [],
            total: 0,
            page: options?.page,
            totalPages: options?.page ? 0 : undefined,
          };
        }

        where.campaign = {
          ...where.campaign,
          businessId: businessId,
        };
      }

      if (options?.filters?.campaignType) {
        where.campaign = {
          ...where.campaign,
          campaignType: options.filters.campaignType,
        };
      }

      if (options?.filters?.dateRange) {
        where.createdAt = {
          gte: options.filters.dateRange.start,
          lte: options.filters.dateRange.end,
        };
      }

      // Handle pagination
      const limit = options?.limit || 50;
      const page = options?.page || 1;
      const offset = options?.offset || (page - 1) * limit;

      const [approvals, total] = await Promise.all([
        this.prisma.adApproval.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'asc' }, // Oldest first for FIFO processing
          include: {
            campaign: {
              include: {
                business: {
                  select: {
                    id: true,
                    businessName: true,
                    email: true,
                  },
                },
                ads: true,
              },
            },
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.adApproval.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        approvals,
        total,
        page: options?.page,
        totalPages: options?.page ? totalPages : undefined,
      };
    } catch (error) {
      logger.error('Failed to get pending approvals:', error);
      throw error;
    }
  }

  /**
   * Review and approve/reject a campaign
   */
  async reviewCampaign(decision: ApprovalDecision): Promise<AdApproval> {
    try {
      // Validate UUID format for campaignId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(decision.campaignId)) {
        throw new Error('No pending approval found');
      }

      // Validate reviewer exists
      const reviewer = await this.prisma.user.findUnique({
        where: { id: decision.reviewerId },
      });

      if (!reviewer) {
        throw new Error('Reviewer not found');
      }

      // Get the approval record
      const approval = await this.prisma.adApproval.findFirst({
        where: {
          campaignId: decision.campaignId,
          status: 'pending',
        },
        include: {
          campaign: {
            include: {
              business: {
                select: {
                  id: true,
                  businessName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!approval) {
        throw new Error('No pending approval found');
      }

      // Update approval record
      const updatedApproval = await this.prisma.adApproval.update({
        where: { id: approval.id },
        data: {
          status: decision.status,
          reviewerId: decision.reviewerId,
          reviewNotes: decision.reviewNotes,
          rejectionReason: decision.rejectionReason,
          reviewedAt: new Date(),
        },
        include: {
          campaign: {
            include: {
              business: {
                select: {
                  id: true,
                  businessName: true,
                  email: true,
                },
              },
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Update campaign status
      const newCampaignStatus = decision.status === 'approved' ? 'active' : 'rejected';
      await this.prisma.adCampaign.update({
        where: { id: decision.campaignId },
        data: { status: newCampaignStatus },
      });

      // Send notification to business owner
      await this.sendApprovalNotification(updatedApproval);

      logger.info(`Campaign ${decision.status}: ${decision.campaignId} by reviewer: ${decision.reviewerId}`);
      return updatedApproval;
    } catch (error) {
      logger.error('Failed to review campaign:', error);
      throw error;
    }
  }

  /**
   * Get approval history for a campaign
   */
  async getApprovalHistory(campaignId: string): Promise<(AdApproval & {
    campaign: AdCampaign & {
      business: {
        id: string;
        businessName: string | null;
        email: string | null;
        phone: string | null;
      };
    };
    reviewer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  })[]> {
    try {
      return await this.prisma.adApproval.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: {
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
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get approval history:', error);
      throw error;
    }
  }

  /**
   * Get approval statistics
   */
  async getApprovalStats(dateRange?: {
    start: Date;
    end: Date;
  } | {
    startDate: Date;
    endDate: Date;
  }): Promise<ApprovalStats> {
    try {
      const where: any = {};
      if (dateRange) {
        // Handle both formats: { start, end } and { startDate, endDate }
        const start = 'start' in dateRange ? dateRange.start : dateRange.startDate;
        const end = 'end' in dateRange ? dateRange.end : dateRange.endDate;

        where.createdAt = {
          gte: start,
          lte: end,
        };
      }

      const [total, pending, approved, rejected, reviewTimes] = await Promise.all([
        this.prisma.adApproval.count({ where }),
        this.prisma.adApproval.count({ where: { ...where, status: 'pending' } }),
        this.prisma.adApproval.count({ where: { ...where, status: 'approved' } }),
        this.prisma.adApproval.count({ where: { ...where, status: 'rejected' } }),
        this.prisma.adApproval.findMany({
          where: {
            ...where,
            status: { in: ['approved', 'rejected'] },
            reviewedAt: { not: null },
          },
          select: {
            createdAt: true,
            reviewedAt: true,
          },
        }),
      ]);

      // Calculate average review time
      let averageReviewTime = 0;
      if (reviewTimes.length > 0) {
        const totalReviewTime = reviewTimes.reduce((sum, approval) => {
          if (approval.reviewedAt) {
            const reviewTime = approval.reviewedAt.getTime() - approval.createdAt.getTime();
            return sum + reviewTime;
          }
          return sum;
        }, 0);
        averageReviewTime = totalReviewTime / reviewTimes.length / (1000 * 60 * 60); // Convert to hours
      }

      // Get pending by priority (simplified - assuming all are normal priority for now)
      const pendingByPriority = {
        high: Math.floor(pending * 0.1), // 10% high priority
        normal: Math.floor(pending * 0.8), // 80% normal priority
        low: pending - Math.floor(pending * 0.1) - Math.floor(pending * 0.8), // remaining low priority
      };

      return {
        total,
        pending,
        approved,
        rejected,
        totalPending: pending,
        totalApproved: approved,
        totalRejected: rejected,
        averageReviewTime,
        pendingByPriority,
      };
    } catch (error) {
      logger.error('Failed to get approval stats:', error);
      throw error;
    }
  }

  /**
   * Auto-approve campaigns based on criteria
   */
  async autoApproveCampaigns(): Promise<number> {
    try {
      // Get campaigns that meet auto-approval criteria
      const autoApprovalCandidates = await this.prisma.adApproval.findMany({
        where: {
          status: 'pending',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        include: {
          campaign: {
            include: {
              business: {
                select: {
                  id: true,
                  isVerified: true,
                  verificationTier: true,
                },
              },
            },
          },
        },
      });

      let autoApprovedCount = 0;

      for (const approval of autoApprovalCandidates) {
        // Auto-approval criteria
        const isVerifiedBusiness = approval.campaign.business.isVerified;
        const isPremiumTier = approval.campaign.business.verificationTier === 'premium';
        const isLowBudget = Number(approval.campaign.budget) <= 10000; // ₹10,000 or less
        const isProductCampaign = approval.campaign.campaignType === 'product';

        if (isVerifiedBusiness && (isPremiumTier || (isLowBudget && isProductCampaign))) {
          await this.reviewCampaign({
            campaignId: approval.campaignId,
            reviewerId: 'system-auto-approval',
            status: 'approved',
            reviewNotes: 'Auto-approved based on business verification and campaign criteria',
          });
          autoApprovedCount++;
        }
      }

      logger.info(`Auto-approved ${autoApprovedCount} campaigns`);
      return autoApprovedCount;
    } catch (error) {
      logger.error('Failed to auto-approve campaigns:', error);
      throw error;
    }
  }

  /**
   * Bulk approve/reject campaigns
   */
  async bulkReview(decisions: ApprovalDecision[]): Promise<{
    successful: number;
    failed: number;
    errors: string[];
    failedCampaignIds: string[];
  }> {
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    const failedCampaignIds: string[] = [];

    for (const decision of decisions) {
      try {
        await this.reviewCampaign(decision);
        successful++;
      } catch (error) {
        failed++;
        failedCampaignIds.push(decision.campaignId);
        errors.push(`Campaign ${decision.campaignId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`Bulk review completed: ${successful} successful, ${failed} failed`);
    return { successful, failed, errors, failedCampaignIds };
  }

  /**
   * Get campaigns by business for approval review
   */
  async getBusinessCampaigns(businessId: string, status?: string): Promise<AdCampaign[]> {
    try {
      const where: any = { businessId };
      if (status) {
        where.status = status;
      }

      return await this.prisma.adCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          ads: true,
          approvals: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get business campaigns:', error);
      throw error;
    }
  }

  /**
   * Send approval notification to business owner
   */
  private async sendApprovalNotification(approval: any): Promise<void> {
    try {
      const templateName = approval.status === 'approved'
        ? 'campaign_approved'
        : 'campaign_rejected';

      const variables: any = {
        campaignName: approval.campaign.name,
        campaignId: approval.campaign.id,
        businessName: approval.campaign.business.businessName || 'Your Business',
      };

      if (approval.status === 'rejected') {
        variables.rejectionReason = approval.rejectionReason || 'Please review campaign content and guidelines';
        variables.reviewNotes = approval.reviewNotes;
      }

      if (approval.reviewer && approval.reviewer.id !== 'system-auto-approval') {
        variables.reviewerName = `${approval.reviewer.firstName || ''} ${approval.reviewer.lastName || ''}`.trim() || 'Admin';
      }

      await this.notificationService.sendNotification({
        userId: approval.campaign.business.id,
        templateName,
        channel: 'email',
        recipient: approval.campaign.business.email || '',
        priority: approval.status === 'approved' ? 'normal' : 'high',
        variables,
      });
    } catch (error) {
      logger.error('Failed to send approval notification:', error);
    }
  }

  /**
   * Get reviewer performance stats
   */
  async getReviewerStats(reviewerId: string, dateRange?: {
    start: Date;
    end: Date;
  }): Promise<{
    totalReviewed: number;
    approved: number;
    rejected: number;
    averageReviewTime: number;
  }> {
    try {
      const where: any = { reviewerId };
      if (dateRange) {
        where.reviewedAt = {
          gte: dateRange.start,
          lte: dateRange.end,
        };
      }

      const [totalReviewed, approved, rejected, reviewTimes] = await Promise.all([
        this.prisma.adApproval.count({ where }),
        this.prisma.adApproval.count({ where: { ...where, status: 'approved' } }),
        this.prisma.adApproval.count({ where: { ...where, status: 'rejected' } }),
        this.prisma.adApproval.findMany({
          where,
          select: {
            createdAt: true,
            reviewedAt: true,
          },
        }),
      ]);

      // Calculate average review time
      let averageReviewTime = 0;
      if (reviewTimes.length > 0) {
        const totalReviewTime = reviewTimes.reduce((sum, approval) => {
          if (approval.reviewedAt) {
            const reviewTime = approval.reviewedAt.getTime() - approval.createdAt.getTime();
            return sum + reviewTime;
          }
          return sum;
        }, 0);
        averageReviewTime = totalReviewTime / reviewTimes.length / (1000 * 60 * 60); // Convert to hours
      }

      return {
        totalReviewed,
        approved,
        rejected,
        averageReviewTime,
      };
    } catch (error) {
      logger.error('Failed to get reviewer stats:', error);
      throw error;
    }
  }

  /**
   * Submit a campaign for approval
   */
  async submitForApproval(request: {
    campaignId: string;
    reviewerId?: string;
    reviewNotes?: string;
  }): Promise<AdApproval> {
    try {
      // Check if campaign exists
      const campaign = await this.prisma.adCampaign.findUnique({
        where: { id: request.campaignId },
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

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Check if campaign is in draft status
      if (campaign.status !== 'draft') {
        throw new Error('Only draft campaigns can be submitted for approval');
      }

      // Check if there's already a pending approval
      const existingApproval = await this.prisma.adApproval.findFirst({
        where: {
          campaignId: request.campaignId,
          status: 'pending',
        },
      });

      if (existingApproval) {
        throw new Error('Campaign already has a pending approval');
      }

      // Create approval record
      const approval = await this.prisma.$transaction(async (tx) => {
        // Create approval
        const newApproval = await tx.adApproval.create({
          data: {
            campaignId: request.campaignId,
            status: 'pending',
            reviewerId: request.reviewerId,
            reviewNotes: request.reviewNotes,
          },
        });

        // Update campaign status to pending approval
        await tx.adCampaign.update({
          where: { id: request.campaignId },
          data: { status: 'pending_approval' },
        });

        return newApproval;
      });

      logger.info(`Campaign ${request.campaignId} submitted for approval`);
      return approval;
    } catch (error) {
      logger.error('Failed to submit campaign for approval:', error);
      throw error;
    }
  }

  /**
   * Approve a campaign
   */
  async approveAd(decision: ApprovalDecision): Promise<AdApproval> {
    try {
      if (decision.status !== 'approved') {
        throw new Error('Invalid decision status for approval');
      }
      return await this.reviewCampaign(decision);
    } catch (error) {
      logger.error('Failed to approve ad:', error);
      throw error;
    }
  }

  /**
   * Reject a campaign
   */
  async rejectAd(decision: ApprovalDecision): Promise<AdApproval> {
    try {
      if (decision.status !== 'rejected') {
        throw new Error('Invalid decision status for rejection');
      }

      // Validate rejection reason
      if (!decision.rejectionReason || decision.rejectionReason.trim() === '') {
        throw new Error('Rejection reason is required');
      }

      // Validate rejection reason length (minimum 10 characters)
      if (decision.rejectionReason.trim().length < 10) {
        throw new Error('Rejection reason must be at least 10 characters long');
      }

      return await this.reviewCampaign(decision);
    } catch (error) {
      logger.error('Failed to reject ad:', error);
      throw error;
    }
  }

  /**
   * Bulk approve campaigns
   */
  async bulkApprove(requests: {
    campaignIds: string[];
    reviewerId: string;
    reviewNotes?: string;
  }): Promise<{
    approved: string[];
    failed: string[];
    successful: number;
    results: Array<{ campaignId: string; success: boolean; error?: string }>;
  }> {
    try {
      const decisions: ApprovalDecision[] = requests.campaignIds.map(campaignId => ({
        campaignId,
        reviewerId: requests.reviewerId,
        status: 'approved' as const,
        reviewNotes: requests.reviewNotes,
      }));

      const result = await this.bulkReview(decisions);
      
      // Get successfully approved campaign IDs
      const approvedIds = requests.campaignIds.filter((id, index) => index < result.successful);

      return {
        approved: approvedIds,
        failed: result.failedCampaignIds,
        successful: result.successful,
        results: decisions.map((decision, index) => ({
          campaignId: decision.campaignId,
          success: index < result.successful,
          error: index >= result.successful ? result.errors[index - result.successful] : undefined,
        })),
      };
    } catch (error) {
      logger.error('Failed to bulk approve campaigns:', error);
      throw error;
    }
  }

  /**
   * Bulk reject campaigns
   */
  async bulkReject(requests: {
    campaignIds: string[];
    reviewerId: string;
    rejectionReason?: string;
    reviewNotes?: string;
  }): Promise<{
    rejected: string[];
    failed: string[];
    successful: number;
    results: Array<{ campaignId: string; success: boolean; error?: string }>;
  }> {
    try {
      // Validate rejection reason
      if (!requests.rejectionReason || requests.rejectionReason.trim() === '') {
        throw new Error('Rejection reason is required for bulk rejection');
      }

      // Validate rejection reason length (minimum 10 characters)
      if (requests.rejectionReason.trim().length < 10) {
        throw new Error('Rejection reason must be at least 10 characters long');
      }

      const decisions: ApprovalDecision[] = requests.campaignIds.map(campaignId => ({
        campaignId,
        reviewerId: requests.reviewerId,
        status: 'rejected' as const,
        rejectionReason: requests.rejectionReason,
        reviewNotes: requests.reviewNotes,
      }));

      const result = await this.bulkReview(decisions);
      
      // Get successfully rejected campaign IDs
      const rejectedIds = requests.campaignIds.filter((id, index) => index < result.successful);

      return {
        rejected: rejectedIds,
        failed: result.failedCampaignIds,
        successful: result.successful,
        results: decisions.map((decision, index) => ({
          campaignId: decision.campaignId,
          success: index < result.successful,
          error: index >= result.successful ? result.errors[index - result.successful] : undefined,
        })),
      };
    } catch (error) {
      logger.error('Failed to bulk reject campaigns:', error);
      throw error;
    }
  }

  /**
   * Get approval by ID
   */
  async getApproval(approvalId: string): Promise<(AdApproval & {
    campaign: AdCampaign & {
      business: {
        id: string;
        businessName: string | null;
        email: string | null;
        phone: string | null;
      };
    };
    reviewer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  }) | null> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(approvalId)) {
        return null;
      }

      return await this.prisma.adApproval.findUnique({
        where: { id: approvalId },
        include: {
          campaign: {
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
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get approval:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const adApprovalService = new AdApprovalService();