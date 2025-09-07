import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class AdApprovalService extends BaseService {
  async create(data: {
    campaignId?: string;
    advertisementId?: string;
    status?: string;
    reviewedBy?: string;
    reviewNotes?: string;
    rejectionReason?: string;
  }) {
    const approval = await this.prisma.adApproval.create({
      data: {
        campaignId: data.campaignId,
        advertisementId: data.advertisementId,
        status: data.status || 'pending',
        reviewedBy: data.reviewedBy,
        reviewNotes: data.reviewNotes,
        rejectionReason: data.rejectionReason,
        reviewedAt: data.reviewedBy ? new Date() : null,
      },
      include: {
        campaign: true,
        advertisement: true,
        reviewer: true,
      },
    });

    logger.info(`Ad approval created: ${approval.id} for ${data.campaignId ? 'campaign' : 'advertisement'}: ${data.campaignId || data.advertisementId}`);
    return approval;
  }

  async findById(id: string) {
    return this.prisma.adApproval.findUnique({
      where: { id },
      include: {
        campaign: true,
        advertisement: true,
        reviewer: true,
      },
    });
  }

  async findByCampaign(campaignId: string) {
    return this.prisma.adApproval.findMany({
      where: { campaignId },
      include: {
        advertisement: true,
        reviewer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByAdvertisement(advertisementId: string) {
    return this.prisma.adApproval.findMany({
      where: { advertisementId },
      include: {
        campaign: true,
        reviewer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: {
    status?: string;
    reviewedBy?: string;
    reviewNotes?: string;
    rejectionReason?: string;
  }) {
    const approval = await this.prisma.adApproval.update({
      where: { id },
      data: {
        status: data.status,
        reviewedBy: data.reviewedBy,
        reviewNotes: data.reviewNotes,
        rejectionReason: data.rejectionReason,
        reviewedAt: data.reviewedBy ? new Date() : undefined,
      },
      include: {
        campaign: true,
        advertisement: true,
        reviewer: true,
      },
    });

    logger.info(`Ad approval updated: ${id} status: ${data.status}`);
    return approval;
  }

  async findPendingApprovals() {
    return this.prisma.adApproval.findMany({
      where: { status: 'pending' },
      include: {
        campaign: true,
        advertisement: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, reviewerId: string, reviewNotes?: string) {
    return this.update(id, {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewNotes,
    });
  }

  async reject(id: string, reviewerId: string, rejectionReason: string, reviewNotes?: string) {
    return this.update(id, {
      status: 'rejected',
      reviewedBy: reviewerId,
      rejectionReason,
      reviewNotes,
    });
  }

  async needsRevision(id: string, reviewerId: string, reviewNotes: string) {
    return this.update(id, {
      status: 'needs_revision',
      reviewedBy: reviewerId,
      reviewNotes,
    });
  }
}

export const adApprovalService = new AdApprovalService();