import { PrismaClient } from '@prisma/client';
import type { Advertisement, AdCampaign, AdPlacement } from '@prisma/client';
import { logger } from '../../utils/logger';
import { AdBudgetManagerService } from './ad-budget-manager.service';
import { AdSenseService, AdSenseAdRequest, createAdSenseService } from './adsense.service';
import { AdstraService, AdstraAdRequest, createAdstraService } from './adstra.service';

const prisma = new PrismaClient();

export interface UserContext {
  userId?: string;
  ipAddress: string;
  userAgent: string;
  platform: 'web' | 'mobile' | 'dashboard';
  location?: {
    country: string;
    state: string;
    city: string;
    coordinates?: [number, number];
  };
  demographics?: {
    age?: number;
    gender?: string;
    interests?: string[];
  };
  behavior?: {
    recentCategories?: string[];
    purchaseHistory?: string[];
    searchHistory?: string[];
  };
}

export interface SelectedAd {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  adType: string;
  adFormat: string;
  content: any;
  callToAction: string;
  destinationUrl: string;
  priority: number;
  priorityScore: number;
  source: 'portal' | 'business' | 'adsense' | 'adstra';
  cost: number;
  biddingStrategy: string;
}

export interface ExternalAd {
  id: string;
  title: string;
  description: string;
  content: any;
  destinationUrl: string;
  source: 'adsense' | 'adstra';
  revenue: number;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: Date | null;
  nextAttemptTime: Date | null;
}

export interface RevenueShare {
  networkName: string;
  platformShare: number; // Percentage (0-1)
  networkShare: number; // Percentage (0-1)
  totalRevenue: number;
  platformRevenue: number;
  networkRevenue: number;
}

export interface AdSelectionOptions {
  maxAds?: number;
  excludeCampaigns?: string[];
  requireApproval?: boolean;
  minBudget?: number;
}

// Priority scoring constants
export enum AdPriority {
  PORTAL_ADS = 1000,      // Highest priority
  BUSINESS_ADS = 100,     // Based on bid + relevance
  ADSENSE = 10,           // External network fallback
  ADSTRA = 1              // Final fallback
}

export class AdSelectionEngine {
  private budgetManager: AdBudgetManagerService;
  private adSenseService: AdSenseService | null = null;
  private adstraService: AdstraService | null = null;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  // Circuit breaker configuration
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 60000; // 1 minute
  private readonly HALF_OPEN_MAX_CALLS = 3;

  // Revenue sharing configuration (can be moved to database/config)
  private readonly REVENUE_SHARES = {
    adsense: { platform: 0.32, network: 0.68 }, // Google AdSense standard split
    adstra: { platform: 0.40, network: 0.60 }   // Custom Adstra split
  };

  constructor(budgetManager?: AdBudgetManagerService) {
    this.budgetManager = budgetManager || new AdBudgetManagerService();
    this.initializeExternalServices();
    this.initializeCircuitBreakers();
  }

  private initializeExternalServices(): void {
    try {
      this.adSenseService = createAdSenseService();
      logger.info('AdSense service initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize AdSense service:', error);
    }

    try {
      this.adstraService = createAdstraService();
      logger.info('Adstra service initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize Adstra service:', error);
    }
  }

  private initializeCircuitBreakers(): void {
    this.circuitBreakers.set('adsense', {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    });

    this.circuitBreakers.set('adstra', {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    });
  }

  /**
   * Select the best ad for a given placement and user context
   */
  async selectAd(
    placement: AdPlacement,
    userContext: UserContext,
    options: AdSelectionOptions = {}
  ): Promise<SelectedAd | null> {
    try {
      const maxAds = options.maxAds || 1;

      // Step 1: Try to get portal ads (highest priority)
      const portalAds = await this.getPortalAds(placement, userContext, options);
      if (portalAds.length > 0) {
        const selectedAd = this.selectBestAd(portalAds, userContext);
        if (selectedAd) return selectedAd;
      }

      // Step 2: Try to get business ads
      const businessAds = await this.getBusinessAds(placement, userContext, options);
      if (businessAds.length > 0) {
        const selectedAd = this.selectBestAd(businessAds, userContext);
        if (selectedAd) return selectedAd;
      }

      // Step 3: Fallback to AdSense
      const adsenseAd = await this.fallbackToAdSense(placement, userContext);
      if (adsenseAd) {
        return adsenseAd;
      }

      // Step 4: Final fallback to Adstra
      const adstraAd = await this.fallbackToAdstra(placement, userContext);
      if (adstraAd) {
        return adstraAd;
      }

      logger.info('No ads available for placement:', {
        placementId: placement.id,
        location: placement.location,
      });

      return null;
    } catch (error) {
      logger.error('Error selecting ad:', error);
      // Try external networks as fallback even on error
      try {
        const fallbackAd = await this.fallbackToAdSense(placement, userContext);
        if (fallbackAd) return fallbackAd;

        return await this.fallbackToAdstra(placement, userContext);
      } catch (fallbackError) {
        logger.error('All ad selection methods failed:', fallbackError);
        return null;
      }
    }
  }

  /**
   * Select multiple ads for a placement
   */
  async selectAds(
    placement: AdPlacement,
    userContext: UserContext,
    options: AdSelectionOptions = {}
  ): Promise<SelectedAd[]> {
    try {
      const maxAds = options.maxAds || 1;
      const selectedAds: SelectedAd[] = [];

      // Get all available ads with priority scoring
      const allAds = await this.getAllAvailableAds(placement, userContext, options);

      // Sort by priority score (highest first)
      allAds.sort((a, b) => b.priorityScore - a.priorityScore);

      // Select top ads up to maxAds limit
      for (let i = 0; i < Math.min(maxAds, allAds.length); i++) {
        const ad = allAds[i];

        // Check budget availability for business ads
        if (ad.source === 'business' || ad.source === 'portal') {
          const budgetAvailable = await this.checkBudgetAvailability(ad.campaignId);
          if (!budgetAvailable) {
            continue;
          }
        }

        selectedAds.push(ad);
      }

      // Fill remaining slots with external ads if needed
      const remainingSlots = maxAds - selectedAds.length;
      if (remainingSlots > 0) {
        const externalAds = await this.getExternalAds(placement, userContext, remainingSlots);
        selectedAds.push(...externalAds);
      }

      return selectedAds;
    } catch (error) {
      logger.error('Error selecting multiple ads:', error);
      return [];
    }
  }

  /**
   * Calculate priority score for an ad based on various factors
   */
  getPriorityScore(ad: Advertisement & { campaign: AdCampaign }, userContext: UserContext): number {
    try {
      let baseScore = 0;

      // Base priority from ad type
      if ((ad as any).campaign.campaignType === 'portal') {
        baseScore = AdPriority.PORTAL_ADS;
      } else {
        baseScore = AdPriority.BUSINESS_ADS;
      }

      // Add bid amount factor (normalized to 0-100 range)
      const bidFactor = Math.min((ad as any).campaign.bidAmount.toNumber() * 10, 100);
      baseScore += bidFactor;

      // Add ad priority factor
      baseScore += ad.priority * 10;

      // Add targeting relevance score
      const relevanceScore = this.calculateRelevanceScore(ad.campaign, userContext);
      baseScore += relevanceScore;

      // Add campaign performance factor (if available)
      const performanceFactor = this.calculatePerformanceFactor(ad.campaign);
      baseScore += performanceFactor;

      // Add recency factor (newer campaigns get slight boost)
      const recencyFactor = this.calculateRecencyFactor((ad as any).campaign.createdAt);
      baseScore += recencyFactor;

      return Math.round(baseScore);
    } catch (error) {
      logger.error('Error calculating priority score:', error);
      return 0;
    }
  }

  /**
   * Check if campaign has sufficient budget for ad serving
   */
  async checkBudgetAvailability(campaignId: string): Promise<boolean> {
    try {
      const budgetStatus = await this.budgetManager.checkBudgetStatus(campaignId);

      // Check if campaign has remaining budget
      if (budgetStatus.remainingBudget <= 0) {
        return false;
      }

      // Check daily budget if set
      if (budgetStatus.dailyRemaining <= 0) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking budget availability:', error);
      return false;
    }
  }

  /**
   * Get portal ads (highest priority)
   */
  private async getPortalAds(
    placement: AdPlacement,
    userContext: UserContext,
    options: AdSelectionOptions
  ): Promise<(Advertisement & { campaign: AdCampaign; priorityScore: number })[]> {
    try {
      const ads = await prisma.advertisement.findMany({
        where: {
          status: 'active',
          campaign: {
            status: 'active',
            campaignType: 'portal',
            startDate: { lte: new Date() },
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } },
            ],
            ...(options.excludeCampaigns && {
              id: { notIn: options.excludeCampaigns },
            }),
          },
        },
        include: {
          campaign: {
            include: {
              approvals: {
                where: { status: 'approved' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      // Filter ads that require approval
      const approvedAds = options.requireApproval !== false
        ? ads.filter(ad => (ad as any).campaign.approvals.length > 0)
        : ads;

      // Calculate priority scores
      return approvedAds.map(ad => ({
        ...ad,
        priorityScore: this.getPriorityScore(ad, userContext),
      }));
    } catch (error) {
      logger.error('Error getting portal ads:', error);
      return [];
    }
  }

  /**
   * Get business ads with targeting and budget filtering
   */
  private async getBusinessAds(
    placement: AdPlacement,
    userContext: UserContext,
    options: AdSelectionOptions
  ): Promise<(Advertisement & { campaign: AdCampaign; priorityScore: number })[]> {
    try {
      const ads = await prisma.advertisement.findMany({
        where: {
          status: 'active',
          campaign: {
            status: 'active',
            campaignType: { in: ['product', 'service', 'brand'] },
            startDate: { lte: new Date() },
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } },
            ],
            // Only include campaigns with remaining budget (handled in application logic)
            ...(options.excludeCampaigns && {
              id: { notIn: options.excludeCampaigns },
            }),
            ...(options.minBudget && {
              budget: { gte: options.minBudget },
            }),
          },
        },
        include: {
          campaign: {
            include: {
              approvals: {
                where: { status: 'approved' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { campaign: { bidAmount: 'desc' } },
          { createdAt: 'desc' },
        ],
      });

      // Filter ads that require approval
      const approvedAds = options.requireApproval !== false
        ? ads.filter(ad => (ad as any).campaign.approvals.length > 0)
        : ads;

      // Apply targeting filters
      const targetedAds = approvedAds.filter(ad =>
        this.matchesTargeting(ad.campaign, userContext)
      );

      // Calculate priority scores
      return targetedAds.map(ad => ({
        ...ad,
        priorityScore: this.getPriorityScore(ad, userContext),
      }));
    } catch (error) {
      logger.error('Error getting business ads:', error);
      return [];
    }
  }

  /**
   * Get all available ads for selection
   */
  private async getAllAvailableAds(
    placement: AdPlacement,
    userContext: UserContext,
    options: AdSelectionOptions
  ): Promise<SelectedAd[]> {
    const allAds: SelectedAd[] = [];

    // Get portal ads
    const portalAds = await this.getPortalAds(placement, userContext, options);
    allAds.push(...portalAds.map(ad => this.convertToSelectedAd(ad, 'portal')));

    // Get business ads
    const businessAds = await this.getBusinessAds(placement, userContext, options);
    allAds.push(...businessAds.map(ad => this.convertToSelectedAd(ad, 'business')));

    return allAds;
  }

  /**
   * Select the best ad from a list based on priority score
   */
  private selectBestAd(
    ads: (Advertisement & { campaign: AdCampaign; priorityScore: number })[],
    userContext: UserContext
  ): SelectedAd | null {
    if (!ads || ads.length === 0) {
      return null;
    }

    // Sort by priority score (highest first)
    ads.sort((a, b) => b.priorityScore - a.priorityScore);

    const bestAd = ads[0];
    const source = bestAd.campaign.campaignType === 'portal' ? 'portal' : 'business';

    return this.convertToSelectedAd(bestAd, source);
  }

  /**
   * Convert Advertisement to SelectedAd format
   */
  private convertToSelectedAd(
    ad: Advertisement & { campaign: AdCampaign; priorityScore: number },
    source: 'portal' | 'business'
  ): SelectedAd {
    return {
      id: ad.id,
      campaignId: ad.campaignId,
      title: ad.title,
      description: ad.description || '',
      adType: ad.adType,
      adFormat: ad.adFormat || 'banner',
      content: ad.content || '',
      callToAction: ad.callToAction || '',
      destinationUrl: ad.destinationUrl || '',
      priority: ad.priority,
      priorityScore: ad.priorityScore,
      source,
      cost: (ad as any).campaign.bidAmount.toNumber(),
      biddingStrategy: (ad as any).campaign.biddingStrategy,
    };
  }

  /**
   * Fallback to AdSense integration with circuit breaker
   */
  private async fallbackToAdSense(
    placement: AdPlacement,
    userContext: UserContext
  ): Promise<SelectedAd | null> {
    const networkName = 'adsense';

    // Check circuit breaker state
    if (!this.canCallExternalNetwork(networkName)) {
      logger.info('AdSense circuit breaker is open, skipping request');
      return null;
    }

    try {
      logger.info('Attempting AdSense fallback for placement:', placement.id);

      let adsenseAd = null;

      // Try real AdSense service if available
      if (this.adSenseService) {
        const adRequest: AdSenseAdRequest = {
          placementId: placement.id,
          adUnitId: `placement-${placement.location}`,
          dimensions: placement.dimensions as { width: number; height: number; },
          userContext: {
            userId: userContext.userId || undefined,
            ipAddress: userContext.ipAddress,
            userAgent: userContext.userAgent,
            location: userContext.location ? {
              country: userContext.location.country,
              state: userContext.location.state,
              city: userContext.location.city
            } : undefined
          },
          adFormat: 'text'
        };

        adsenseAd = await this.adSenseService.requestAd(adRequest);
      } else {
        // Fallback to mock for testing/development
        adsenseAd = await this.mockAdSenseRequest(placement, userContext);
      }

      if (adsenseAd) {
        // Record successful call
        this.recordExternalNetworkSuccess(networkName);

        const revenue = typeof adsenseAd.revenue === 'number'
          ? adsenseAd.revenue
          : adsenseAd.revenue?.estimatedEarnings || 0.05;
        const revenueShare = this.calculateRevenueShare(networkName, revenue);

        return {
          id: adsenseAd.id,
          campaignId: 'adsense-campaign',
          title: 'AdSense Advertisement',
          description: 'Relevant ad from Google AdSense network',
          adType: 'banner',
          adFormat: 'html',
          content: adsenseAd.content || { html: '<div>AdSense Ad</div>' },
          callToAction: 'Learn More',
          destinationUrl: adsenseAd.content?.clickUrl || 'https://example.com/adsense-ad',
          priority: 1,
          priorityScore: AdPriority.ADSENSE,
          source: 'adsense',
          cost: revenueShare.platformRevenue,
          biddingStrategy: 'cpm',
        };
      }

      // Record successful call even if no ad returned
      this.recordExternalNetworkSuccess(networkName);
      return null;

    } catch (error) {
      // Record failure for circuit breaker
      this.recordExternalNetworkFailure(networkName);
      logger.error('AdSense fallback failed:', error);
      return null;
    }
  }

  /**
   * Fallback to Adstra integration with circuit breaker
   */
  private async fallbackToAdstra(
    placement: AdPlacement,
    userContext: UserContext
  ): Promise<SelectedAd | null> {
    const networkName = 'adstra';

    // Check circuit breaker state
    if (!this.canCallExternalNetwork(networkName)) {
      logger.info('Adstra circuit breaker is open, skipping request');
      return null;
    }

    try {
      logger.info('Attempting Adstra fallback for placement:', placement.id);

      let adstraAd = null;

      // Try real Adstra service if available
      if (this.adstraService) {
        const adRequest: AdstraAdRequest = {
          placementId: placement.id,
          adFormat: 'banner',
          dimensions: placement.dimensions as { width: number; height: number },
          targeting: {
            keywords: [],
            categories: [],
            demographics: userContext.demographics ? {
              age: userContext.demographics.age?.toString() || '',
              gender: userContext.demographics.gender || ''
            } : undefined,
            location: userContext.location ? {
              country: userContext.location.country,
              city: userContext.location.city
            } : undefined
          }
        };

        adstraAd = await this.adstraService.requestAd(adRequest);
      } else {
        // Fallback to mock for testing/development
        adstraAd = await this.mockAdstraRequest(placement, userContext);
      }

      if (adstraAd) {
        // Record successful call
        this.recordExternalNetworkSuccess(networkName);

        const revenue = typeof adstraAd.revenue === 'number'
          ? adstraAd.revenue
          : adstraAd.revenue?.estimatedEarnings || 0.03;
        const revenueShare = this.calculateRevenueShare(networkName, revenue);

        return {
          id: adstraAd.id,
          campaignId: 'adstra-campaign',
          title: 'Adstra Advertisement',
          description: 'Quality ad from Adstra network',
          adType: 'banner',
          adFormat: 'html',
          content: adstraAd.content || { html: '<div>Adstra Ad</div>' },
          callToAction: 'Click Here',
          destinationUrl: adstraAd.content?.clickUrl || 'https://example.com/adstra-ad',
          priority: 1,
          priorityScore: AdPriority.ADSTRA,
          source: 'adstra',
          cost: revenueShare.platformRevenue,
          biddingStrategy: 'cpc',
        };
      }

      // Record successful call even if no ad returned
      this.recordExternalNetworkSuccess(networkName);
      return null;

    } catch (error) {
      // Record failure for circuit breaker
      this.recordExternalNetworkFailure(networkName);
      logger.error('Adstra fallback failed:', error);
      return null;
    }
  }

  /**
   * Get external ads to fill remaining slots
   */
  private async getExternalAds(
    placement: AdPlacement,
    userContext: UserContext,
    count: number
  ): Promise<SelectedAd[]> {
    const externalAds: SelectedAd[] = [];

    for (let i = 0; i < count; i++) {
      // Try AdSense first
      const adsenseAd = await this.fallbackToAdSense(placement, userContext);
      if (adsenseAd) {
        externalAds.push(adsenseAd);
        continue;
      }

      // Then try Adstra
      const adstraAd = await this.fallbackToAdstra(placement, userContext);
      if (adstraAd) {
        externalAds.push(adstraAd);
      }
    }

    return externalAds;
  }

  /**
   * Check if campaign targeting matches user context
   */
  private matchesTargeting(campaign: AdCampaign, userContext: UserContext): boolean {
    try {
      const targeting = campaign.targetingConfig as any;

      // Demographics targeting
      if (targeting.demographics && userContext.demographics) {
        if (targeting.demographics.ageRange && userContext.demographics.age) {
          const [minAge, maxAge] = targeting.demographics.ageRange;
          if (userContext.demographics.age < minAge || userContext.demographics.age > maxAge) {
            return false;
          }
        }

        if (targeting.demographics.gender && userContext.demographics.gender) {
          if (targeting.demographics.gender !== 'all' &&
            targeting.demographics.gender !== userContext.demographics.gender) {
            return false;
          }
        }

        if (targeting.demographics.interests && userContext.demographics.interests) {
          const hasMatchingInterest = targeting.demographics.interests.some((interest: string) =>
            userContext.demographics!.interests!.includes(interest)
          );
          if (!hasMatchingInterest) {
            return false;
          }
        }
      }

      // Location targeting
      if (targeting.location && userContext.location) {
        if (targeting.location.countries &&
          !targeting.location.countries.includes(userContext.location.country)) {
          return false;
        }

        if (targeting.location.states &&
          !targeting.location.states.includes(userContext.location.state)) {
          return false;
        }

        if (targeting.location.cities &&
          !targeting.location.cities.includes(userContext.location.city)) {
          return false;
        }
      }

      // Behavior targeting
      if (targeting.behavior) {
        if (targeting.behavior.platforms &&
          !targeting.behavior.platforms.includes(userContext.platform)) {
          return false;
        }

        // Add more behavior targeting logic as needed
      }

      return true;
    } catch (error) {
      logger.error('Error matching targeting:', error);
      return true; // Default to showing ad if targeting check fails
    }
  }

  /**
   * Calculate relevance score based on targeting match
   */
  private calculateRelevanceScore(campaign: AdCampaign, userContext: UserContext): number {
    let score = 0;

    try {
      const targeting = campaign.targetingConfig as any;

      // Demographics relevance
      if (targeting.demographics && userContext.demographics) {
        if (targeting.demographics.interests && userContext.demographics.interests) {
          const matchingInterests = targeting.demographics.interests.filter((interest: string) =>
            userContext.demographics!.interests!.includes(interest)
          );
          score += matchingInterests.length * 5;
        }

        if (targeting.demographics.gender && userContext.demographics.gender &&
          targeting.demographics.gender === userContext.demographics.gender) {
          score += 10;
        }
      }

      // Location relevance
      if (targeting.location && userContext.location) {
        if (targeting.location.cities &&
          targeting.location.cities.includes(userContext.location.city)) {
          score += 15;
        } else if (targeting.location.states &&
          targeting.location.states.includes(userContext.location.state)) {
          score += 10;
        } else if (targeting.location.countries &&
          targeting.location.countries.includes(userContext.location.country)) {
          score += 5;
        }
      }

      // Platform relevance
      if (targeting.behavior?.platforms &&
        targeting.behavior.platforms.includes(userContext.platform)) {
        score += 10;
      }

      return Math.min(score, 50); // Cap at 50 points
    } catch (error) {
      logger.error('Error calculating relevance score:', error);
      return 0;
    }
  }

  /**
   * Calculate performance factor based on campaign history
   */
  private calculatePerformanceFactor(campaign: AdCampaign): number {
    try {
      // This would typically use historical performance data
      // For now, return a base score that could be enhanced with analytics

      // Newer campaigns get a slight boost
      const daysSinceCreation = Math.floor(
        (Date.now() - campaign.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCreation < 7) {
        return 5; // New campaign boost
      } else if (daysSinceCreation < 30) {
        return 3; // Recent campaign boost
      }

      return 0;
    } catch (error) {
      logger.error('Error calculating performance factor:', error);
      return 0;
    }
  }

  /**
   * Calculate recency factor
   */
  private calculateRecencyFactor(createdAt: Date): number {
    try {
      const hoursAgo = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursAgo < 24) {
        return 5; // Very recent
      } else if (hoursAgo < 168) { // 1 week
        return 3; // Recent
      } else if (hoursAgo < 720) { // 1 month
        return 1; // Somewhat recent
      }

      return 0;
    } catch (error) {
      logger.error('Error calculating recency factor:', error);
      return 0;
    }
  }

  /**
   * Circuit breaker: Check if external network can be called
   */
  private canCallExternalNetwork(networkName: string): boolean {
    const breaker = this.circuitBreakers.get(networkName);
    if (!breaker) return true;

    const now = new Date();

    // If circuit is closed, allow calls
    if (!breaker.isOpen) {
      return true;
    }

    // If circuit is open, check if recovery timeout has passed
    if (breaker.nextAttemptTime && now >= breaker.nextAttemptTime) {
      // Move to half-open state
      breaker.isOpen = false;
      breaker.nextAttemptTime = null;
      logger.info(`Circuit breaker for ${networkName} moved to half-open state`);
      return true;
    }

    return false;
  }

  /**
   * Record successful external network call
   */
  private recordExternalNetworkSuccess(networkName: string): void {
    const breaker = this.circuitBreakers.get(networkName);
    if (!breaker) return;

    // Reset failure count on success
    breaker.failureCount = 0;
    breaker.isOpen = false;
    breaker.lastFailureTime = null;
    breaker.nextAttemptTime = null;

    logger.debug(`External network ${networkName} call succeeded, circuit breaker reset`);
  }

  /**
   * Record failed external network call
   */
  private recordExternalNetworkFailure(networkName: string): void {
    const breaker = this.circuitBreakers.get(networkName);
    if (!breaker) return;

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    // Open circuit if failure threshold is reached
    if (breaker.failureCount >= this.FAILURE_THRESHOLD) {
      breaker.isOpen = true;
      breaker.nextAttemptTime = new Date(Date.now() + this.RECOVERY_TIMEOUT);

      logger.warn(`Circuit breaker for ${networkName} opened after ${breaker.failureCount} failures. Next attempt at: ${breaker.nextAttemptTime}`);
    } else {
      logger.debug(`External network ${networkName} failure recorded (${breaker.failureCount}/${this.FAILURE_THRESHOLD})`);
    }
  }

  /**
   * Calculate revenue sharing for external networks
   */
  private calculateRevenueShare(networkName: string, totalRevenue: number): RevenueShare {
    const shares = this.REVENUE_SHARES[networkName as keyof typeof this.REVENUE_SHARES];

    if (!shares) {
      // Default sharing if network not configured
      const defaultShares = { platform: 0.30, network: 0.70 };
      return {
        networkName,
        platformShare: defaultShares.platform,
        networkShare: defaultShares.network,
        totalRevenue,
        platformRevenue: totalRevenue * defaultShares.platform,
        networkRevenue: totalRevenue * defaultShares.network,
      };
    }

    return {
      networkName,
      platformShare: shares.platform,
      networkShare: shares.network,
      totalRevenue,
      platformRevenue: totalRevenue * shares.platform,
      networkRevenue: totalRevenue * shares.network,
    };
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Reset circuit breaker for a specific network (admin function)
   */
  resetCircuitBreaker(networkName: string): boolean {
    const breaker = this.circuitBreakers.get(networkName);
    if (!breaker) return false;

    breaker.isOpen = false;
    breaker.failureCount = 0;
    breaker.lastFailureTime = null;
    breaker.nextAttemptTime = null;

    logger.info(`Circuit breaker for ${networkName} manually reset`);
    return true;
  }

  /**
   * Mock AdSense request for testing/development
   */
  private async mockAdSenseRequest(
    placement: AdPlacement,
    userContext: UserContext
  ): Promise<any | null> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate 70% success rate
    if (Math.random() < 0.3) {
      return null;
    }

    return {
      id: `adsense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      adUnitId: `placement-${placement.location}`,
      content: {
        html: `<div style="width:${(placement.dimensions as any)?.width || 300}px;height:${(placement.dimensions as any)?.height || 250}px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;border:1px solid #ddd;">AdSense Ad</div>`,
        clickUrl: 'https://example.com/adsense-click',
        impressionUrl: 'https://example.com/adsense-impression'
      },
      dimensions: placement.dimensions as { width: number; height: number } || { width: 300, height: 250 },
      revenue: {
        estimatedEarnings: 0.05 + Math.random() * 0.10, // $0.05-$0.15
        currency: 'USD'
      },
      metadata: {
        advertiserId: 'adsense-advertiser-123',
        campaignId: 'adsense-campaign-456',
        creativeId: 'adsense-creative-789'
      }
    };
  }

  /**
   * Mock Adstra request for testing/development
   */
  private async mockAdstraRequest(
    placement: AdPlacement,
    userContext: UserContext
  ): Promise<any | null> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Simulate 60% success rate
    if (Math.random() < 0.4) {
      return null;
    }

    return {
      id: `adstra-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: {
        html: `<div style="width:${(placement.dimensions as any)?.width || 300}px;height:${(placement.dimensions as any)?.height || 250}px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;border:1px solid #3b82f6;">Adstra Ad</div>`,
        clickUrl: 'https://example.com/adstra-click',
        impressionUrl: 'https://example.com/adstra-impression'
      },
      dimensions: placement.dimensions as { width: number; height: number } || { width: 300, height: 250 },
      revenue: {
        estimatedEarnings: 0.03 + Math.random() * 0.08, // $0.03-$0.11
        currency: 'USD'
      },
      metadata: {
        advertiserId: 'adstra-advertiser-abc',
        campaignId: 'adstra-campaign-def',
        creativeId: 'adstra-creative-ghi'
      }
    };
  }

  /**
   * Get external network revenue sharing configuration
   */
  getRevenueShareConfig(): Record<string, { platform: number; network: number }> {
    return { ...this.REVENUE_SHARES };
  }

  /**
   * Update revenue sharing configuration (admin function)
   */
  updateRevenueShareConfig(
    networkName: string,
    platformShare: number,
    networkShare: number
  ): boolean {
    if (platformShare + networkShare !== 1.0) {
      logger.error('Revenue shares must sum to 1.0', { platformShare, networkShare });
      return false;
    }

    if (platformShare < 0 || platformShare > 1 || networkShare < 0 || networkShare > 1) {
      logger.error('Revenue shares must be between 0 and 1', { platformShare, networkShare });
      return false;
    }

    (this.REVENUE_SHARES as any)[networkName] = { platform: platformShare, network: networkShare };
    logger.info(`Revenue sharing updated for ${networkName}`, { platformShare, networkShare });
    return true;
  }

  /**
   * Get comprehensive fallback statistics
   */
  async getFallbackStatistics(): Promise<{
    circuitBreakers: Map<string, CircuitBreakerState>;
    revenueShares: Record<string, { platform: number; network: number }>;
    serviceHealth: {
      adsense: boolean;
      adstra: boolean;
    };
  }> {
    const serviceHealth = {
      adsense: this.adSenseService?.isServiceHealthy() || false,
      adstra: this.adstraService?.isServiceHealthy() || false,
    };

    return {
      circuitBreakers: this.getCircuitBreakerStatus(),
      revenueShares: this.getRevenueShareConfig(),
      serviceHealth,
    };
  }

  /**
   * Test external network connectivity (admin function)
   */
  async testExternalNetworkConnectivity(): Promise<{
    adsense: { healthy: boolean; responseTime?: number; error?: string };
    adstra: { healthy: boolean; responseTime?: number; error?: string };
  }> {
    const results = {
      adsense: { healthy: false, responseTime: undefined as number | undefined, error: undefined as string | undefined },
      adstra: { healthy: false, responseTime: undefined as number | undefined, error: undefined as string | undefined },
    };

    // Test AdSense
    if (this.adSenseService) {
      const startTime = Date.now();
      try {
        const healthy = await this.adSenseService.healthCheck();
        results.adsense.healthy = healthy;
        results.adsense.responseTime = Date.now() - startTime;
      } catch (error) {
        results.adsense.error = error instanceof Error ? error.message : 'Unknown error';
        results.adsense.responseTime = Date.now() - startTime;
      }
    } else {
      results.adsense.error = 'AdSense service not initialized';
    }

    // Test Adstra
    if (this.adstraService) {
      const startTime = Date.now();
      try {
        const healthy = await this.adstraService.healthCheck();
        results.adstra.healthy = healthy;
        results.adstra.responseTime = Date.now() - startTime;
      } catch (error) {
        results.adstra.error = error instanceof Error ? error.message : 'Unknown error';
        results.adstra.responseTime = Date.now() - startTime;
      }
    } else {
      results.adstra.error = 'Adstra service not initialized';
    }

    return results;
  }

  /**
   * Force external network fallback for testing
   */
  async forceExternalFallback(
    placement: AdPlacement,
    userContext: UserContext,
    networkPreference?: 'adsense' | 'adstra'
  ): Promise<SelectedAd | null> {
    if (networkPreference === 'adsense') {
      return await this.fallbackToAdSense(placement, userContext);
    } else if (networkPreference === 'adstra') {
      return await this.fallbackToAdstra(placement, userContext);
    }

    // Try both in order
    const adsenseAd = await this.fallbackToAdSense(placement, userContext);
    if (adsenseAd) return adsenseAd;

    return await this.fallbackToAdstra(placement, userContext);
  }

  /**
   * Get external network statistics for monitoring
   */
  async getExternalNetworkStats(): Promise<{
    adsense: {
      available: boolean;
      failureCount: number;
      isCircuitOpen: boolean;
      lastFailureTime: Date | null;
    };
    adstra: {
      available: boolean;
      failureCount: number;
      isCircuitOpen: boolean;
      lastFailureTime: Date | null;
    };
  }> {
    const adsenseBreaker = this.circuitBreakers.get('adsense');
    const adstraBreaker = this.circuitBreakers.get('adstra');

    return {
      adsense: {
        available: this.adSenseService?.isServiceHealthy() || false,
        failureCount: adsenseBreaker?.failureCount || 0,
        isCircuitOpen: adsenseBreaker?.isOpen || false,
        lastFailureTime: adsenseBreaker?.lastFailureTime || null,
      },
      adstra: {
        available: this.adstraService?.isServiceHealthy() || false,
        failureCount: adstraBreaker?.failureCount || 0,
        isCircuitOpen: adstraBreaker?.isOpen || false,
        lastFailureTime: adstraBreaker?.lastFailureTime || null,
      },
    };
  }
}

export const adSelectionEngine = new AdSelectionEngine();