import { PrismaClient } from '@prisma/client';
import type { AdApproval } from '@prisma/client';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notification.service';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export interface ApprovalRequest {
  campaignId: string;
  reviewerId?: string;
  reviewNotes?: string;
}

export interface ApprovalDecision {
  campaignId: string;
  reviewerId: string;
  status: 'approved' | 'rejected';
  reviewNotes?: string | undefined;
  rejectionReason?: string | undefined;
}

export interface ApprovalWithDetails extends AdApproval {
  campaign: {
    id: string;
    name: string;
    businessId: string;
    status: string;
    budget: any;
    createdAt: Date;
    business: {
      id: string;
      businessName: string | null;
      email: string | null;
      phone: string | null;
    };
  };
  reviewer?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

export interface ApprovalStats {
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
  /**
   * Submit a campaign for approval
   */
  async submitForApproval(request: ApprovalRequest): Promise<AdApproval> {
    try {
      // Check if campaign exists
      const campaign = await prisma.adCampaign.findUnique({
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
      const existingApproval = await prisma.adApproval.findFirst({
        where: {
          campaignId: request.campaignId,
          status: 'pending',
        },
      });

      if (existingApproval) {
        throw new Error('Campaign already has a pending approval');
      }

      // Create approval record
      const approval = await prisma.$transaction(async (tx) => {
        // Create approval
        const newApproval = await tx.adApproval.create({
          data: {
            campaignId: request.campaignId,
            reviewerId: request.reviewerId || null,
            status: 'pending',
            reviewNotes: request.reviewNotes || null,
          },
        });

        // Update campaign status to pending approval
        await tx.adCampaign.update({
          where: { id: request.campaignId },
          data: { status: 'pending_approval' },
        });

        return newApproval;
      });

      // Send notification to admins about pending approval
      await this.notifyAdminsOfPendingApproval(campaign);

      logger.info('Campaign submitted for approval:', {
        campaignId: request.campaignId,
        approvalId: approval.id,
        businessId: campaign.businessId,
      });

      return approval;
    } catch (error) {
      logger.error('Error submitting campaign for approval:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to submit for approval: ${error.message}`);
      }
      throw new Error('Failed to submit for approval');
    }
  }

  /**
   * Approve a campaign
   */
  async approveAd(decision: ApprovalDecision): Promise<AdApproval> {
    try {
      if (decision.status !== 'approved') {
        throw new Error('Use approveAd only for approvals');
      }

      return await this.processApprovalDecision(decision);
    } catch (error) {
      logger.error('Error approving campaign:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to approve campaign: ${error.message}`);
      }
      throw new Error('Failed to approve campaign');
    }
  }

  /**
   * Reject a campaign
   */
  async rejectAd(decision: ApprovalDecision): Promise<AdApproval> {
    try {
      if (decision.status !== 'rejected') {
        throw new Error('Use rejectAd only for rejections');
      }

      if (!decision.rejectionReason || decision.rejectionReason.trim().length === 0) {
        throw new Error('Rejection reason is required');
      }

      if (decision.rejectionReason.trim().length < 10) {
        throw new Error('Rejection reason must be at least 10 characters long');
      }

      return await this.processApprovalDecision(decision);
    } catch (error) {
      logger.error('Error rejecting campaign:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to reject campaign: ${error.message}`);
      }
      throw new Error('Failed to reject campaign');
    }
  }

  /**
   * Process approval decision (approve or reject)
   */
  private async processApprovalDecision(decision: ApprovalDecision): Promise<AdApproval> {
    // Get pending approval
    const pendingApproval = await prisma.adApproval.findFirst({
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
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!pendingApproval) {
      throw new Error('No pending approval found for this campaign');
    }

    // Validate reviewer exists
    const reviewer = await prisma.user.findUnique({
      where: { id: decision.reviewerId },
    });

    if (!reviewer) {
      throw new Error('Reviewer not found');
    }

    // Process the decision
    const updatedApproval = await prisma.$transaction(async (tx) => {
      // Update approval record
      const approval = await tx.adApproval.update({
        where: { id: pendingApproval.id },
        data: {
          status: decision.status,
          reviewerId: decision.reviewerId,
          reviewNotes: decision.reviewNotes || null,
          rejectionReason: decision.rejectionReason || null,
          reviewedAt: new Date(),
        },
      });

      // Update campaign status based on decision
      const newCampaignStatus = decision.status === 'approved' ? 'active' : 'rejected';
      await tx.adCampaign.update({
        where: { id: decision.campaignId },
        data: { status: newCampaignStatus },
      });

      return approval;
    });

    // Send notification to business owner
    await this.notifyBusinessOfDecision(pendingApproval.campaign, decision);

    logger.info('Campaign approval decision processed:', {
      campaignId: decision.campaignId,
      approvalId: updatedApproval.id,
      decision: decision.status,
      reviewerId: decision.reviewerId,
    });

    return updatedApproval;
  }

  /**
   * Get pending approvals for admin review
   */
  async getPendingApprovals(options: {
    page?: number;
    limit?: number;
    priority?: 'high' | 'normal' | 'low';
    businessId?: string;
  } = {}): Promise<{
    approvals: ApprovalWithDetails[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const skip = (page - 1) * limit;

      const where: any = {
        status: 'pending',
      };

      if (options.businessId) {
        where.campaign = {
          businessId: options.businessId,
        };
      }

      // Calculate priority based on campaign budget and creation time
      const orderBy: any = [
        { createdAt: 'asc' }, // Older requests first
      ];

      const [rawApprovals, total] = await Promise.all([
        prisma.adApproval.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.adApproval.count({ where }),
      ]);

      // Manually fetch campaign and reviewer data
      const approvals = await Promise.all(
        rawApprovals.map(async (approval) => {
          const [campaign, reviewer] = await Promise.all([
            prisma.adCampaign.findUnique({
              where: { id: approval.campaignId },
              select: {
                id: true,
                name: true,
                businessId: true,
                status: true,
                budget: true,
                createdAt: true,
                business: {
                  select: {
                    id: true,
                    businessName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            }),
            approval.reviewerId
              ? prisma.user.findUnique({
                  where: { id: approval.reviewerId },
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                })
              : null,
          ]);

          return {
            ...approval,
            campaign: campaign || {
              id: approval.campaignId,
              name: 'Unknown Campaign',
              businessId: '',
              status: 'unknown',
              budget: 0,
              createdAt: new Date(),
              business: {
                id: '',
                businessName: null,
                email: null,
                phone: null,
              },
            },
            reviewer,
          };
        })
      );

      return {
        approvals,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting pending approvals:', error);
      throw new Error('Failed to get pending approvals');
    }
  }

  /**
   * Get approval history for a campaign
   */
  async getApprovalHistory(campaignId: string): Promise<ApprovalWithDetails[]> {
    try {
      const approvals = await prisma.adApproval.findMany({
        where: { campaignId },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              businessId: true,
              status: true,
              budget: true,
              createdAt: true,
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
        orderBy: { createdAt: 'desc' },
      });

      return approvals;
    } catch (error) {
      logger.error('Error getting approval history:', error);
      throw new Error('Failed to get approval history');
    }
  }

  /**
   * Get approval statistics for admin dashboard
   */
  async getApprovalStats(dateRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<ApprovalStats> {
    try {
      const where: any = {};

      if (dateRange) {
        where.createdAt = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const [totalPending, totalApproved, totalRejected, approvals] = await Promise.all([
        prisma.adApproval.count({
          where: { ...where, status: 'pending' },
        }),
        prisma.adApproval.count({
          where: { ...where, status: 'approved' },
        }),
        prisma.adApproval.count({
          where: { ...where, status: 'rejected' },
        }),
        prisma.adApproval.findMany({
          where: {
            ...where,
            status: { in: ['approved', 'rejected'] },
            reviewedAt: { not: null },
          },
          select: {
            createdAt: true,
            reviewedAt: true,
            campaign: {
              select: {
                budget: true,
              },
            },
          },
        }),
      ]);

      // Calculate average review time
      let averageReviewTime = 0;
      if (approvals.length > 0) {
        const totalReviewTime = approvals.reduce((sum, approval) => {
          if (approval.reviewedAt) {
            const reviewTime = approval.reviewedAt.getTime() - approval.createdAt.getTime();
            return sum + reviewTime;
          }
          return sum;
        }, 0);
        averageReviewTime = totalReviewTime / approvals.length / (1000 * 60 * 60); // Convert to hours
      }

      // Calculate pending by priority (based on budget and age)
      const pendingApprovals = await prisma.adApproval.findMany({
        where: { ...where, status: 'pending' },
        include: {
          campaign: {
            select: {
              budget: true,
              createdAt: true,
            },
          },
        },
      });

      const pendingByPriority = pendingApprovals.reduce(
        (acc, approval) => {
          if (approval.campaign && approval.campaign.budget) {
            const priority = this.calculatePriority(
              approval.campaign.budget,
              approval.createdAt
            );
            acc[priority]++;
          } else {
            // Default to normal priority if campaign data is missing
            acc.normal++;
          }
          return acc;
        },
        { high: 0, normal: 0, low: 0 }
      );

      return {
        totalPending,
        totalApproved,
        totalRejected,
        averageReviewTime,
        pendingByPriority,
      };
    } catch (error) {
      logger.error('Error getting approval stats:', error);
      throw new Error('Failed to get approval statistics');
    }
  }

  /**
   * Bulk approve campaigns
   */
  async bulkApprove(requests: {
    campaignIds: string[];
    reviewerId: string;
    reviewNotes?: string;
  }): Promise<{ approved: number; failed: string[] }> {
    try {
      let approved = 0;
      const failed: string[] = [];

      for (const campaignId of requests.campaignIds) {
        try {
          await this.approveAd({
            campaignId,
            reviewerId: requests.reviewerId,
            status: 'approved',
            reviewNotes: requests.reviewNotes,
          });
          approved++;
        } catch (error) {
          logger.error(`Failed to approve campaign ${campaignId}:`, error);
          failed.push(campaignId);
        }
      }

      logger.info('Bulk approval completed:', {
        approved,
        failed: failed.length,
        reviewerId: requests.reviewerId,
      });

      return { approved, failed };
    } catch (error) {
      logger.error('Error in bulk approval:', error);
      throw new Error('Failed to process bulk approval');
    }
  }

  /**
   * Bulk reject campaigns
   */
  async bulkReject(requests: {
    campaignIds: string[];
    reviewerId: string;
    rejectionReason: string;
    reviewNotes?: string;
  }): Promise<{ rejected: number; failed: string[] }> {
    // Validate rejection reason first
    if (!requests.rejectionReason || requests.rejectionReason.trim().length === 0) {
      throw new Error('Rejection reason is required for bulk rejection');
    }

    if (requests.rejectionReason.trim().length < 10) {
      throw new Error('Rejection reason must be at least 10 characters long');
    }

    try {
      let rejected = 0;
      const failed: string[] = [];

      for (const campaignId of requests.campaignIds) {
        try {
          await this.rejectAd({
            campaignId,
            reviewerId: requests.reviewerId,
            status: 'rejected',
            rejectionReason: requests.rejectionReason,
            reviewNotes: requests.reviewNotes,
          });
          rejected++;
        } catch (error) {
          logger.error(`Failed to reject campaign ${campaignId}:`, error);
          failed.push(campaignId);
        }
      }

      logger.info('Bulk rejection completed:', {
        rejected,
        failed: failed.length,
        reviewerId: requests.reviewerId,
      });

      return { rejected, failed };
    } catch (error) {
      logger.error('Error in bulk rejection:', error);
      throw new Error('Failed to process bulk rejection');
    }
  }

  /**
   * Get approval by ID
   */
  async getApproval(approvalId: string): Promise<ApprovalWithDetails | null> {
    try {
      const approval = await prisma.adApproval.findUnique({
        where: { id: approvalId },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              businessId: true,
              status: true,
              budget: true,
              createdAt: true,
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

      return approval;
    } catch (error) {
      logger.error('Error getting approval:', error);
      throw new Error('Failed to get approval');
    }
  }

  /**
   * Calculate priority based on budget and age
   */
  private calculatePriority(budget: any, createdAt: Date): 'high' | 'normal' | 'low' {
    const budgetAmount = typeof budget === 'number' ? budget : budget.toNumber();
    const ageInHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    // High priority: High budget (>50k) or old requests (>48 hours)
    if (budgetAmount > 50000 || ageInHours > 48) {
      return 'high';
    }

    // Low priority: Low budget (<5k) and recent requests (<12 hours)
    if (budgetAmount < 5000 && ageInHours < 12) {
      return 'low';
    }

    return 'normal';
  }

  /**
   * Notify admins of pending approval
   */
  private async notifyAdminsOfPendingApproval(campaign: any): Promise<void> {
    try {
      // Get admin users (assuming they have a specific role or permission)
      // For now, we'll use a simple approach - you might want to implement proper role-based access
      const admins = await prisma.user.findMany({
        where: {
          // Add your admin identification logic here
          // For example: role: 'admin' or isAdmin: true
          email: {
            endsWith: '@vikareta.com', // Example: company email domain
          },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
        },
      });

      // Send notification to each admin
      for (const admin of admins) {
        if (admin.email) {
          await notificationService.sendNotification({
            userId: admin.id,
            templateName: 'ad_approval_pending',
            channel: 'email',
            recipient: admin.email,
            variables: {
              adminName: admin.firstName || 'Admin',
              campaignName: campaign.name,
              businessName: campaign.business.businessName || 'Unknown Business',
              budget: campaign.budget,
              campaignId: campaign.id,
              approvalUrl: `${process.env['ADMIN_BASE_URL']}/approvals/${campaign.id}`,
            },
            priority: 'normal',
          });
        }
      }

      logger.info('Admin notifications sent for pending approval:', {
        campaignId: campaign.id,
        adminCount: admins.length,
      });
    } catch (error) {
      logger.error('Error notifying admins of pending approval:', error);
      // Don't throw error as this is not critical for the approval process
    }
  }

  /**
   * Notify business of approval decision
   */
  private async notifyBusinessOfDecision(campaign: any, decision: ApprovalDecision): Promise<void> {
    try {
      const business = campaign.business;

      if (business.email) {
        const templateName = decision.status === 'approved'
          ? 'ad_campaign_approved'
          : 'ad_campaign_rejected';

        await notificationService.sendNotification({
          userId: business.id,
          templateName,
          channel: 'email',
          recipient: business.email,
          variables: {
            businessName: business.businessName || 'Business Owner',
            campaignName: campaign.name,
            reviewNotes: decision.reviewNotes || '',
            rejectionReason: decision.rejectionReason || '',
            campaignId: campaign.id,
            dashboardUrl: `${process.env['BUSINESS_DASHBOARD_URL']}/campaigns/${campaign.id}`,
          },
          priority: 'high',
        });
      }

      // Also send WhatsApp notification if phone is available
      if (business.phone) {
        const message = decision.status === 'approved'
          ? `✅ Your ad campaign "${campaign.name}" has been approved and is now active!`
          : `❌ Your ad campaign "${campaign.name}" has been rejected. Reason: ${decision.rejectionReason}`;

        await notificationService.sendNotification({
          userId: business.id,
          templateName: 'ad_decision_whatsapp',
          channel: 'whatsapp',
          recipient: business.phone,
          variables: {
            message,
            campaignName: campaign.name,
            status: decision.status,
          },
          priority: 'high',
        });
      }

      logger.info('Business notification sent for approval decision:', {
        campaignId: campaign.id,
        businessId: business.id,
        decision: decision.status,
      });
    } catch (error) {
      logger.error('Error notifying business of decision:', error);
      // Don't throw error as this is not critical for the approval process
    }
  }
}

export const adApprovalService = new AdApprovalService();