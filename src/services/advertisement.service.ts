import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { kafkaProducer } from './kafka-producer.service';
import { logger } from '@/utils/logger';
import { CacheService } from '@/config/redis';
import { adImpressionsCounter, adClicksCounter, adDedupeSkipCounter } from '@/observability/metrics';

export class AdvertisementService {
  async listCampaigns(userId: string, page: number, limit: number, status?: string) {
    const where: any = { businessId: userId };
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.adCampaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.adCampaign.count({ where }),
    ]);
    return { items, total };
  }

  async createCampaign(userId: string, data: any) {
    return prisma.adCampaign.create({
      data: {
        businessId: userId,
        name: data.name,
        description: data.description || null,
        campaignType: data.campaignType || 'display',
        budget: new Prisma.Decimal(data.budget || 0),
        dailyBudget: data.dailyBudget ? new Prisma.Decimal(data.dailyBudget) : null,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        targetAudience: data.targetAudience || undefined,
        targetingConfig: data.targetingConfig || undefined,
  bidStrategy: data.bidStrategy || 'cpc',
        bidAmount: data.bidAmount ? new Prisma.Decimal(data.bidAmount) : null,
        maxBid: data.maxBid ? new Prisma.Decimal(data.maxBid) : null,
        status: 'draft',
      },
    });
  }

  async getCampaign(userId: string, id: string) {
    return prisma.adCampaign.findFirst({ where: { id, businessId: userId } });
  }

  async updateCampaign(userId: string, id: string, data: any) {
    const existing = await this.getCampaign(userId, id);
    if (!existing) throw new Error('Campaign not found');
    if (existing.status === 'completed' || existing.status === 'cancelled') throw new Error('Cannot modify completed/cancelled campaign');
    return prisma.adCampaign.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.dailyBudget !== undefined ? { dailyBudget: data.dailyBudget ? new Prisma.Decimal(data.dailyBudget) : null } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.targetAudience !== undefined ? { targetAudience: data.targetAudience } : {}),
        ...(data.targetingConfig !== undefined ? { targetingConfig: data.targetingConfig } : {}),
        ...(data.bidAmount !== undefined ? { bidAmount: data.bidAmount ? new Prisma.Decimal(data.bidAmount) : null } : {}),
        ...(data.maxBid !== undefined ? { maxBid: data.maxBid ? new Prisma.Decimal(data.maxBid) : null } : {}),
      },
    });
  }

  async cancelCampaign(userId: string, id: string) {
    const existing = await this.getCampaign(userId, id);
    if (!existing) throw new Error('Campaign not found');
    return prisma.adCampaign.update({ where: { id }, data: { status: 'cancelled', isActive: false } });
  }

  async createAd(userId: string, campaignId: string, data: any) {
    const campaign = await this.getCampaign(userId, campaignId);
    if (!campaign) throw new Error('Campaign not found');
    return prisma.advertisement.create({
      data: {
        campaignId,
        title: data.title,
        description: data.description || null,
        adType: data.adType || 'banner',
        adFormat: data.adFormat || null,
        content: data.content || undefined,
        targetUrl: data.targetUrl || null,
        callToAction: data.callToAction || null,
        priority: data.priority ?? 0,
      },
    });
  }

  async listAds(userId: string, campaignId: string) {
    const campaign = await this.getCampaign(userId, campaignId);
    if (!campaign) throw new Error('Campaign not found');
    return prisma.advertisement.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' } });
  }

  async createPlacement(data: any) {
    return prisma.adPlacement.create({
      data: {
        name: data.name,
        description: data.description || null,
        placementType: data.placementType || 'inline',
        dimensions: data.dimensions || undefined,
        location: data.location || 'global',
        priority: data.priority ?? 0,
      },
    });
  }

  async listPlacements(activeOnly?: boolean) {
    const where: any = {};
    if (activeOnly) where.isActive = true;
    return prisma.adPlacement.findMany({ where, orderBy: { priority: 'desc' } });
  }

  async assignAdToPlacement(advertisementId: string, placementId: string, data: any) {
    return prisma.adPlacementAssignment.create({
      data: {
        advertisementId,
        placementId,
        priority: data.priority ?? 0,
        weight: data.weight ?? 1,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
  }

  async listAssignments(placementId: string) {
    return prisma.adPlacementAssignment.findMany({
      where: { placementId, isActive: true },
      orderBy: [{ priority: 'desc' }, { weight: 'desc' }],
      include: { advertisement: true },
    });
  }

  async createApproval(data: any) {
    if (!data.campaignId && !data.advertisementId) throw new Error('Provide campaignId or advertisementId');
    return prisma.adApproval.create({
      data: {
        campaignId: data.campaignId || null,
        advertisementId: data.advertisementId || null,
        status: data.status || 'pending',
        reviewNotes: data.reviewNotes || null,
        rejectionReason: data.rejectionReason || null,
        reviewedBy: data.reviewedBy || null,
        reviewedAt: data.status && data.status !== 'pending' ? new Date() : null,
      },
    });
  }

  async updateApproval(id: string, data: any) {
    return prisma.adApproval.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.reviewNotes !== undefined ? { reviewNotes: data.reviewNotes } : {}),
        ...(data.rejectionReason !== undefined ? { rejectionReason: data.rejectionReason } : {}),
        ...(data.reviewedBy ? { reviewedBy: data.reviewedBy } : {}),
        reviewedAt: data.status && data.status !== 'pending' ? new Date() : undefined,
      },
    });
  }

  async recordImpression(adId: string, context?: { ip?: string; ua?: string; userId?: string; referrer?: string }) {
    try {
      const fingerprint = this.buildEventFingerprint('impression', adId, context);
      const deduped = await this.isDuplicate(fingerprint);
      if (deduped) {
        adDedupeSkipCounter.inc({ eventType: 'impression' });
        // Return current ad state without increment
        return prisma.advertisement.findUnique({ where: { id: adId } });
      }
      const ad = await prisma.$transaction(async (tx) => {
        const updated = await tx.advertisement.update({ where: { id: adId }, data: { impressions: { increment: 1 } } });
        // Persist detailed impression record (fire-and-forget semantics within txn)
        await tx.impressionRecord.create({ data: { advertisementId: adId, userId: context?.userId || null, ipAddress: context?.ip, userAgent: context?.ua, cost: null } }).catch(() => null);
        return updated;
      });
      adImpressionsCounter.inc({ adId: ad.id, campaignId: ad.campaignId });
      void kafkaProducer.adImpression({ adId: ad.id, campaignId: ad.campaignId });
      return ad;
    } catch (err: any) {
      logger.error('recordImpression failed', err?.message || err);
      throw err;
    }
  }

  async recordClick(adId: string, context?: { ip?: string; ua?: string; userId?: string; referrer?: string }) {
    try {
      const fingerprint = this.buildEventFingerprint('click', adId, context);
      const deduped = await this.isDuplicate(fingerprint);
      if (deduped) {
        adDedupeSkipCounter.inc({ eventType: 'click' });
        return prisma.advertisement.findUnique({ where: { id: adId } });
      }
      const ad = await prisma.$transaction(async (tx) => {
        const updated = await tx.advertisement.update({ where: { id: adId }, data: { clicks: { increment: 1 } } });
        await tx.clickRecord.create({ data: { advertisementId: adId, userId: context?.userId || null, ipAddress: context?.ip, userAgent: context?.ua, referrer: context?.referrer, cost: null } }).catch(() => null);
        return updated;
      });
      adClicksCounter.inc({ adId: ad.id, campaignId: ad.campaignId });
      void kafkaProducer.adClick({ adId: ad.id, campaignId: ad.campaignId });
      return ad;
    } catch (err: any) {
      logger.error('recordClick failed', err?.message || err);
      throw err;
    }
  }

  private buildEventFingerprint(type: 'impression' | 'click', adId: string, context?: { ip?: string; ua?: string }) {
    const nowBucket = Math.floor(Date.now() / 10000); // 10s bucket
    const ip = (context?.ip || '').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 64);
    const ua = (context?.ua || '').toLowerCase().split(' ').slice(0, 6).join('_').slice(0, 120);
    const base = `${type}:${adId}:${ip}:${ua}:${nowBucket}`;
    // Simple hash (FNV-1a like) to keep key compact
    let hash = 2166136261;
    for (let i = 0; i < base.length; i++) {
      hash ^= base.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    const h = (hash >>> 0).toString(16);
    return `ad_evt:${h}`;
  }

  private async isDuplicate(key: string) {
    // If key exists, skip. Else set with short TTL (e.g., 10s bucket + cushion)
    const exists = await CacheService.exists(key);
    if (exists) return true;
    await CacheService.set(key, '1', 15); // 15s TTL
    return false;
  }

  async campaignDailyAnalytics(userId: string, campaignId: string, days = 30) {
    const campaign = await this.getCampaign(userId, campaignId);
    if (!campaign) return [];
    const limit = Math.min(days, 90);
    const since = new Date(Date.now() - limit * 24 * 60 * 60 * 1000);
    return prisma.adAnalytics.findMany({ where: { campaignId, date: { gte: since } }, orderBy: { date: 'asc' } });
  }

  async topAds(userId: string, metric: string, limit = 10) {
    const allowed = ['ctr', 'clicks', 'impressions', 'cpc'];
    const metricField = allowed.includes(metric) ? metric : 'ctr';
    const take = Math.min(limit, 50);
    return prisma.advertisement.findMany({
      where: { campaign: { businessId: userId }, isActive: true },
      orderBy: [{ [metricField]: 'desc' as any }, { createdAt: 'desc' }],
      take,
    });
  }
}

export const advertisementService = new AdvertisementService();
