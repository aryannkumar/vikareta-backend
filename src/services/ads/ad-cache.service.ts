/**
 * Advertisement Caching Service
 * Specialized caching layer for advertisement system with Redis
 */

import { cacheService } from '../cache.service';
import { logger } from '../../utils/logger';
import { PrismaClient } from '@prisma/client';

interface AdCacheStats {
    adSelectionHits: number;
    adSelectionMisses: number;
    budgetCacheHits: number;
    budgetCacheMisses: number;
    campaignCacheHits: number;
    campaignCacheMisses: number;
    externalAdCacheHits: number;
    externalAdCacheMisses: number;
}

interface UserContext {
    userId?: string;
    platform: 'web' | 'mobile' | 'dashboard';
    location?: {
        country: string;
        state: string;
        city: string;
    };
    demographics?: {
        age?: number;
        gender?: string;
        interests?: string[];
    };
    behavior?: {
        recentCategories?: string[];
        interests?: string[];
    };
}

interface AdSelectionResult {
    adId: string;
    campaignId: string;
    priority: number;
    bidAmount: number;
    content: any;
    targetingMatch: number;
    cached: boolean;
    timestamp: number;
}

interface BudgetStatus {
    totalBudget: number;
    spentAmount: number;
    remainingBudget: number;
    dailySpent: number;
    dailyRemaining: number;
    isExhausted: boolean;
    lastUpdated: number;
}

class AdCacheService {
    private prisma: PrismaClient;
    private statsInterval?: NodeJS.Timeout | null;
    private stats: AdCacheStats = {
        adSelectionHits: 0,
        adSelectionMisses: 0,
        budgetCacheHits: 0,
        budgetCacheMisses: 0,
        campaignCacheHits: 0,
        campaignCacheMisses: 0,
        externalAdCacheHits: 0,
        externalAdCacheMisses: 0
    };

    constructor() {
        this.prisma = new PrismaClient();
        if (process.env['NODE_ENV'] !== 'test') {
            this.startStatsReporting();
        }
    }

    /**
     * Cache frequently served ads with intelligent key generation
     */
    async cacheAdForServing(
        placementId: string,
        userContext: UserContext,
        adResult: AdSelectionResult,
        ttl: number = 300
    ): Promise<void> {
        try {
            const cacheKey = this.generateAdServingKey(placementId, userContext);
            await cacheService.set('adSelection', cacheKey, {
                ...adResult,
                cached: true,
                timestamp: Date.now()
            }, ttl);

            logger.debug(`Cached ad selection for placement ${placementId}`);
        } catch (error) {
            logger.error('Failed to cache ad for serving:', error);
        }
    }

    /**
     * Get cached ad for serving
     */
    async getCachedAdForServing(
        placementId: string,
        userContext: UserContext
    ): Promise<AdSelectionResult | null> {
        try {
            const cacheKey = this.generateAdServingKey(placementId, userContext);
            const cached = await cacheService.get<AdSelectionResult>('adSelection', cacheKey);

            if (cached) {
                this.stats.adSelectionHits++;
                
                // Check if cached ad is still valid (budget not exhausted)
                const budgetStatus = await this.getCachedBudgetStatus(cached.campaignId);
                if (budgetStatus && budgetStatus.isExhausted) {
                    // Remove invalid cache entry
                    await cacheService.delete('adSelection', cacheKey);
                    this.stats.adSelectionMisses++;
                    return null;
                }

                return cached;
            } else {
                this.stats.adSelectionMisses++;
                return null;
            }
        } catch (error) {
            logger.error('Failed to get cached ad for serving:', error);
            this.stats.adSelectionMisses++;
            return null;
        }
    }

    /**
     * Cache budget status with very short TTL for real-time accuracy
     */
    async cacheBudgetStatus(campaignId: string, budgetStatus: BudgetStatus): Promise<void> {
        try {
            await cacheService.set('adBudgetStatus', campaignId, {
                ...budgetStatus,
                lastUpdated: Date.now()
            }, 60); // 1 minute TTL for budget accuracy

            logger.debug(`Cached budget status for campaign ${campaignId}`);
        } catch (error) {
            logger.error('Failed to cache budget status:', error);
        }
    }

    /**
     * Get cached budget status
     */
    async getCachedBudgetStatus(campaignId: string): Promise<BudgetStatus | null> {
        try {
            const cached = await cacheService.get<BudgetStatus>('adBudgetStatus', campaignId);

            if (cached) {
                this.stats.budgetCacheHits++;
                return cached;
            } else {
                this.stats.budgetCacheMisses++;
                return null;
            }
        } catch (error) {
            logger.error('Failed to get cached budget status:', error);
            this.stats.budgetCacheMisses++;
            return null;
        }
    }

    /**
     * Cache campaign data with targeting information
     */
    async cacheCampaignWithTargeting(campaignId: string, campaignData: any): Promise<void> {
        try {
            await cacheService.set('adCampaign', campaignId, campaignData, 900); // 15 minutes

            // Cache targeting data separately for faster access
            if (campaignData.targetingConfig) {
                await cacheService.set('adTargeting', campaignId, campaignData.targetingConfig, 1800); // 30 minutes
            }

            logger.debug(`Cached campaign data for ${campaignId}`);
        } catch (error) {
            logger.error('Failed to cache campaign data:', error);
        }
    }

    /**
     * Get cached campaign data
     */
    async getCachedCampaign(campaignId: string): Promise<any> {
        try {
            const cached = await cacheService.get('adCampaign', campaignId);

            if (cached) {
                this.stats.campaignCacheHits++;
                return cached;
            } else {
                this.stats.campaignCacheMisses++;
                return null;
            }
        } catch (error) {
            logger.error('Failed to get cached campaign:', error);
            this.stats.campaignCacheMisses++;
            return null;
        }
    }

    /**
     * Cache external ad network responses
     */
    async cacheExternalAdResponse(
        networkName: string,
        placementId: string,
        userContext: UserContext,
        adResponse: any,
        ttl: number = 1800
    ): Promise<void> {
        try {
            const cacheKey = this.generateExternalAdKey(networkName, placementId, userContext);
            await cacheService.set('externalAd', cacheKey, {
                ...adResponse,
                networkName,
                cached: true,
                timestamp: Date.now()
            }, ttl);

            logger.debug(`Cached external ad response from ${networkName}`);
        } catch (error) {
            logger.error('Failed to cache external ad response:', error);
        }
    }

    /**
     * Get cached external ad response
     */
    async getCachedExternalAd(
        networkName: string,
        placementId: string,
        userContext: UserContext
    ): Promise<any> {
        try {
            const cacheKey = this.generateExternalAdKey(networkName, placementId, userContext);
            const cached = await cacheService.get('externalAd', cacheKey);

            if (cached) {
                this.stats.externalAdCacheHits++;
                return cached;
            } else {
                this.stats.externalAdCacheMisses++;
                return null;
            }
        } catch (error) {
            logger.error('Failed to get cached external ad:', error);
            this.stats.externalAdCacheMisses++;
            return null;
        }
    }

    /**
     * Preload high-priority ads for better performance
     */
    async preloadHighPriorityAds(): Promise<void> {
        try {
            logger.info('Starting high-priority ad preloading...');

            // Get active campaigns with high priority
            const highPriorityCampaigns = await this.prisma.adCampaign.findMany({
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
                        where: { 
                            status: 'active',
                            priority: { gte: 7 } // High priority ads
                        }
                    }
                },
                orderBy: {
                    budget: 'desc'
                },
                take: 20 // Top 20 campaigns by budget
            });

            // Get active placements
            const placements = await this.prisma.adPlacement.findMany({
                where: { isActive: true }
            });

            // Common user contexts for preloading
            const commonContexts: any[] = [
            ];

            // Preload ads for each placement and context combination
            for (const campaign of highPriorityCampaigns) {
                for (const ad of campaign.advertisements) {
                    for (const placement of placements) {
                        for (const context of commonContexts) {
                            const adResult: AdSelectionResult = {
                                adId: ad.id,
                                campaignId: campaign.id,
                                priority: ad.priority,
                                bidAmount: parseFloat((campaign.bidAmount || 0).toString()),
                                content: ad.content,
                                targetingMatch: 0.8, // Default high match for preloaded ads
                                cached: true,
                                timestamp: Date.now()
                            };

                            await this.cacheAdForServing(placement.id, context, adResult, 600); // 10 minutes TTL
                        }
                    }
                }
            }

            logger.info(`Preloaded ads for ${highPriorityCampaigns.length} high-priority campaigns`);
        } catch (error) {
            logger.error('Failed to preload high-priority ads:', error);
        }
    }

    /**
     * Cache warming for advertisement system
     */
    async warmAdCache(): Promise<void> {
        try {
            logger.info('Starting comprehensive ad cache warming...');

            await Promise.all([
                this.preloadHighPriorityAds(),
                this.warmBudgetStatuses(),
                this.warmActiveCampaigns(),
                this.warmAdPlacements()
            ]);

            logger.info('Ad cache warming completed successfully');
        } catch (error) {
            logger.error('Ad cache warming failed:', error);
        }
    }

    /**
     * Warm budget statuses for active campaigns
     */
    private async warmBudgetStatuses(): Promise<void> {
        const activeCampaigns = await this.prisma.adCampaign.findMany({
            where: { status: 'active' },
            select: { id: true, budget: true, spentAmount: true }
        });

        for (const campaign of activeCampaigns) {
            const budgetStatus: BudgetStatus = {
                totalBudget: parseFloat(campaign.budget.toString()),
                spentAmount: parseFloat(campaign.spentAmount.toString()),
                remainingBudget: parseFloat(campaign.budget.toString()) - parseFloat(campaign.spentAmount.toString()),
                dailySpent: 0, // Would be calculated from daily analytics
                dailyRemaining: 0, // Would be calculated based on daily budget
                isExhausted: parseFloat(campaign.spentAmount.toString()) >= parseFloat(campaign.budget.toString()),
                lastUpdated: Date.now()
            };

            await this.cacheBudgetStatus(campaign.id, budgetStatus);
        }

        logger.info(`Warmed budget statuses for ${activeCampaigns.length} campaigns`);
    }

    /**
     * Warm active campaigns cache
     */
    private async warmActiveCampaigns(): Promise<void> {
        const campaigns = await this.prisma.adCampaign.findMany({
            where: { status: 'active' },
            include: {
                advertisements: { where: { status: 'active' } },
                business: { select: { id: true, businessName: true } }
            }
        });

        for (const campaign of campaigns) {
            await this.cacheCampaignWithTargeting(campaign.id, campaign);
        }

        logger.info(`Warmed ${campaigns.length} active campaigns`);
    }

    /**
     * Warm ad placements cache
     */
    private async warmAdPlacements(): Promise<void> {
        const placements = await this.prisma.adPlacement.findMany({
            where: { isActive: true }
        });

        for (const placement of placements) {
            await cacheService.set('adPlacement', placement.id, placement, 3600); // 1 hour
        }

        logger.info(`Warmed ${placements.length} ad placements`);
    }

    /**
     * Invalidate cache when budget is updated
     */
    async invalidateOnBudgetUpdate(campaignId: string): Promise<void> {
        try {
            await Promise.all([
                cacheService.delete('adBudgetStatus', campaignId),
                cacheService.delete('adCampaign', campaignId),
                cacheService.invalidatePattern(`ad_selection:*${campaignId}*`)
            ]);

            logger.debug(`Invalidated cache for campaign ${campaignId} due to budget update`);
        } catch (error) {
            logger.error('Failed to invalidate cache on budget update:', error);
        }
    }

    /**
     * Invalidate cache when campaign is updated
     */
    async invalidateOnCampaignUpdate(campaignId: string): Promise<void> {
        try {
            await Promise.all([
                cacheService.delete('adCampaign', campaignId),
                cacheService.delete('adTargeting', campaignId),
                cacheService.invalidatePattern(`ad_selection:*${campaignId}*`)
            ]);

            logger.debug(`Invalidated cache for campaign ${campaignId} due to campaign update`);
        } catch (error) {
            logger.error('Failed to invalidate cache on campaign update:', error);
        }
    }

    /**
     * Generate cache key for ad serving
     */
    private generateAdServingKey(placementId: string, userContext: UserContext): string {
        const contextData = {
            platform: userContext.platform,
            location: userContext.location?.country || 'unknown',
            demographics: {
                age: userContext.demographics?.age ? Math.floor(userContext.demographics.age / 10) * 10 : null, // Age groups
                gender: userContext.demographics?.gender || null
            },
            interests: userContext.behavior?.interests?.slice(0, 3) || [] // Top 3 interests
        };

        const contextHash = require('crypto')
            .createHash('md5')
            .update(JSON.stringify(contextData))
            .digest('hex');

        return `${placementId}:${contextHash}`;
    }

    /**
     * Generate cache key for external ads
     */
    private generateExternalAdKey(networkName: string, placementId: string, userContext: UserContext): string {
        const contextHash = require('crypto')
            .createHash('md5')
            .update(JSON.stringify({
                platform: userContext.platform,
                location: userContext.location?.country || 'unknown'
            }))
            .digest('hex');

        return `${networkName}:${placementId}:${contextHash}`;
    }

    /**
     * Start periodic stats reporting
     */
    private startStatsReporting(): void {
        this.statsInterval = setInterval(() => {
            const totalRequests = Object.values(this.stats).reduce((sum, val) => sum + val, 0);
            if (totalRequests > 0) {
                logger.info('Ad Cache Statistics:', {
                    ...this.stats,
                    adSelectionHitRate: ((this.stats.adSelectionHits / (this.stats.adSelectionHits + this.stats.adSelectionMisses)) * 100).toFixed(2) + '%',
                    budgetCacheHitRate: ((this.stats.budgetCacheHits / (this.stats.budgetCacheHits + this.stats.budgetCacheMisses)) * 100).toFixed(2) + '%',
                    campaignCacheHitRate: ((this.stats.campaignCacheHits / (this.stats.campaignCacheHits + this.stats.campaignCacheMisses)) * 100).toFixed(2) + '%',
                    externalAdCacheHitRate: ((this.stats.externalAdCacheHits / (this.stats.externalAdCacheHits + this.stats.externalAdCacheMisses)) * 100).toFixed(2) + '%'
                });
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Stop stats reporting (useful for testing)
     */
    stopStatsReporting(): void {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): AdCacheStats {
        return { ...this.stats };
    }

    /**
     * Clear all ad-related cache
     */
    async clearAdCache(): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidatePattern('ad_campaign:*'),
                cacheService.invalidatePattern('ad:*'),
                cacheService.invalidatePattern('ad_placement:*'),
                cacheService.invalidatePattern('ad_targeting:*'),
                cacheService.invalidatePattern('ad_analytics:*'),
                cacheService.invalidatePattern('ad_budget:*'),
                cacheService.invalidatePattern('ad_selection:*'),
                cacheService.invalidatePattern('external_ad:*'),
                cacheService.invalidatePattern('ad_performance:*')
            ]);

            logger.info('All ad cache cleared');
        } catch (error) {
            logger.error('Failed to clear ad cache:', error);
        }
    }
}

export const adCacheService = new AdCacheService();