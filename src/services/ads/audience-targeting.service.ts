import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

let prisma: PrismaClient;

export interface TargetingConfig {
  demographics?: {
    ageRange?: [number, number];
    gender?: 'male' | 'female' | 'all';
    interests?: string[];
    education?: string[];
    income?: string[];
  };
  location?: {
    countries?: string[];
    states?: string[];
    cities?: string[];
    radius?: number;
    coordinates?: [number, number];
  };
  behavior?: {
    deviceTypes?: string[];
    platforms?: string[];
    timeOfDay?: string[];
    dayOfWeek?: string[];
    purchaseHistory?: string[];
    searchHistory?: string[];
    engagementLevel?: 'low' | 'medium' | 'high';
  };
  custom?: {
    keywords?: string[];
    categories?: string[];
    excludeKeywords?: string[];
    excludeCategories?: string[];
  };
}

export interface AudienceEstimation {
  totalReach: number;
  dailyReach: number;
  competitionLevel: 'low' | 'medium' | 'high';
  suggestedBid: {
    min: number;
    recommended: number;
    max: number;
  };
  demographics: {
    ageDistribution: { [key: string]: number };
    genderDistribution: { male: number; female: number; other: number };
    locationDistribution: { [key: string]: number };
  };
  confidence: number; // 0-1 scale
}

export interface TargetingOptimization {
  currentPerformance: {
    ctr: number;
    cpc: number;
    conversions: number;
    roas: number;
  };
  suggestions: TargetingSuggestion[];
  potentialImpact: {
    reachIncrease: number;
    costReduction: number;
    performanceImprovement: number;
  };
}

export interface TargetingSuggestion {
  type: 'expand' | 'narrow' | 'exclude' | 'include';
  category: 'demographics' | 'location' | 'behavior' | 'custom';
  field: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  expectedImpact: {
    reachChange: number;
    costChange: number;
    performanceChange: number;
  };
  confidence: number;
}

export interface UserProfile {
  userId?: string;
  demographics?: {
    age?: number;
    gender?: string;
    interests?: string[];
    education?: string;
    income?: string;
  };
  location?: {
    country: string;
    state: string;
    city: string;
    coordinates?: [number, number];
  };
  behavior?: {
    deviceType: string;
    platform: string;
    purchaseHistory?: string[];
    searchHistory?: string[];
    engagementLevel?: 'low' | 'medium' | 'high';
    timeOfDay?: string;
    dayOfWeek?: string;
  };
}

export class AudienceTargetingService {
  constructor(prismaClient?: PrismaClient) {
    prisma = prismaClient || new PrismaClient();
  }
  /**
   * Estimate audience reach for targeting configuration
   */
  async estimateAudience(targetingConfig: TargetingConfig): Promise<AudienceEstimation> {
    try {
      logger.info('Estimating audience for targeting config:', targetingConfig);

      // Get base user count from database
      const baseUserCount = await this.getBaseUserCount();
      
      // Apply demographic filters
      let estimatedReach = baseUserCount;
      const demographicMultiplier = this.calculateDemographicMultiplier(targetingConfig.demographics);
      estimatedReach *= demographicMultiplier;

      // Apply location filters
      const locationMultiplier = this.calculateLocationMultiplier(targetingConfig.location);
      estimatedReach *= locationMultiplier;

      // Apply behavior filters
      const behaviorMultiplier = this.calculateBehaviorMultiplier(targetingConfig.behavior);
      estimatedReach *= behaviorMultiplier;

      // Apply custom filters
      const customMultiplier = this.calculateCustomMultiplier(targetingConfig.custom);
      estimatedReach *= customMultiplier;

      // Calculate daily reach (assuming 20% daily active users)
      const dailyReach = Math.round(estimatedReach * 0.2);

      // Determine competition level
      const competitionLevel = await this.calculateCompetitionLevel(targetingConfig);

      // Calculate suggested bid based on competition and targeting specificity
      const suggestedBid = this.calculateSuggestedBid(targetingConfig, competitionLevel);

      // Generate demographic distributions
      const demographics = this.generateDemographicDistributions(targetingConfig);

      // Calculate confidence based on data availability and targeting specificity
      const confidence = this.calculateConfidence(targetingConfig, estimatedReach);

      const estimation: AudienceEstimation = {
        totalReach: Math.round(estimatedReach),
        dailyReach,
        competitionLevel,
        suggestedBid,
        demographics,
        confidence,
      };

      logger.info('Audience estimation completed:', estimation);
      return estimation;
    } catch (error) {
      logger.error('Error estimating audience:', error);
      throw new Error('Failed to estimate audience reach');
    }
  }

  /**
   * Generate targeting optimization suggestions based on campaign performance
   */
  async generateTargetingOptimizations(campaignId: string): Promise<TargetingOptimization> {
    try {
      logger.info('Generating targeting optimizations for campaign:', campaignId);

      // Get campaign with performance data
      const campaign = await this.getCampaignWithPerformance(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Calculate current performance metrics
      const currentPerformance = this.calculateCurrentPerformance(campaign);

      // Generate optimization suggestions
      const suggestions = await this.generateOptimizationSuggestions(campaign, currentPerformance);

      // Calculate potential impact
      const potentialImpact = this.calculatePotentialImpact(suggestions);

      const optimization: TargetingOptimization = {
        currentPerformance,
        suggestions,
        potentialImpact,
      };

      logger.info('Targeting optimization generated:', {
        campaignId,
        suggestionsCount: suggestions.length,
        potentialImpact,
      });

      return optimization;
    } catch (error) {
      logger.error('Error generating targeting optimizations:', error);
      if (error instanceof Error && error.message === 'Campaign not found') {
        throw error;
      }
      throw new Error('Failed to generate targeting optimizations');
    }
  }

  /**
   * Check if user matches targeting criteria
   */
  matchesTargeting(targetingConfig: TargetingConfig, userProfile: UserProfile): boolean {
    try {
      // Demographics matching
      if (!this.matchesDemographics(targetingConfig.demographics, userProfile.demographics)) {
        return false;
      }

      // Location matching
      if (!this.matchesLocation(targetingConfig.location, userProfile.location)) {
        return false;
      }

      // Behavior matching
      if (!this.matchesBehavior(targetingConfig.behavior, userProfile.behavior)) {
        return false;
      }

      // Custom matching
      if (!this.matchesCustom(targetingConfig.custom, userProfile)) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error matching targeting:', error);
      return false; // Default to not matching on error
    }
  }

  /**
   * Calculate targeting relevance score for user
   */
  calculateRelevanceScore(targetingConfig: TargetingConfig, userProfile: UserProfile): number {
    try {
      let score = 0;
      let maxScore = 0;

      // Demographics relevance (max 30 points)
      const demographicsScore = this.calculateDemographicsRelevance(
        targetingConfig.demographics,
        userProfile.demographics
      );
      score += demographicsScore;
      maxScore += 30;

      // Location relevance (max 25 points)
      const locationScore = this.calculateLocationRelevance(
        targetingConfig.location,
        userProfile.location
      );
      score += locationScore;
      maxScore += 25;

      // Behavior relevance (max 25 points)
      const behaviorScore = this.calculateBehaviorRelevance(
        targetingConfig.behavior,
        userProfile.behavior
      );
      score += behaviorScore;
      maxScore += 25;

      // Custom relevance (max 20 points)
      const customScore = this.calculateCustomRelevance(
        targetingConfig.custom,
        userProfile
      );
      score += customScore;
      maxScore += 20;

      // Return normalized score (0-100)
      return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    } catch (error) {
      logger.error('Error calculating relevance score:', error);
      return 0;
    }
  }

  /**
   * Get available targeting options with counts
   */
  async getTargetingOptions(): Promise<{
    demographics: {
      interests: { name: string; count: number }[];
      education: { name: string; count: number }[];
      income: { name: string; count: number }[];
    };
    location: {
      countries: { name: string; count: number }[];
      states: { name: string; count: number }[];
      cities: { name: string; count: number }[];
    };
    behavior: {
      deviceTypes: { name: string; count: number }[];
      platforms: { name: string; count: number }[];
      categories: { name: string; count: number }[];
    };
  }> {
    try {
      // This would typically query user data to get actual counts
      // For now, return mock data with realistic options
      return {
        demographics: {
          interests: [
            { name: 'Technology', count: 15000 },
            { name: 'Fashion', count: 12000 },
            { name: 'Food & Dining', count: 18000 },
            { name: 'Travel', count: 8000 },
            { name: 'Sports', count: 10000 },
            { name: 'Health & Fitness', count: 9000 },
            { name: 'Entertainment', count: 14000 },
            { name: 'Business', count: 7000 },
            { name: 'Education', count: 6000 },
            { name: 'Home & Garden', count: 5000 },
          ],
          education: [
            { name: 'High School', count: 25000 },
            { name: 'Bachelor\'s Degree', count: 35000 },
            { name: 'Master\'s Degree', count: 15000 },
            { name: 'PhD', count: 3000 },
            { name: 'Professional Certification', count: 8000 },
          ],
          income: [
            { name: '< ₹3 Lakh', count: 20000 },
            { name: '₹3-6 Lakh', count: 25000 },
            { name: '₹6-12 Lakh', count: 20000 },
            { name: '₹12-25 Lakh', count: 10000 },
            { name: '> ₹25 Lakh', count: 5000 },
          ],
        },
        location: {
          countries: [
            { name: 'India', count: 75000 },
            { name: 'United States', count: 5000 },
            { name: 'United Kingdom', count: 2000 },
            { name: 'Canada', count: 1500 },
            { name: 'Australia', count: 1000 },
          ],
          states: [
            { name: 'Maharashtra', count: 15000 },
            { name: 'Karnataka', count: 12000 },
            { name: 'Delhi', count: 10000 },
            { name: 'Tamil Nadu', count: 8000 },
            { name: 'Gujarat', count: 7000 },
            { name: 'Uttar Pradesh', count: 6000 },
            { name: 'West Bengal', count: 5000 },
            { name: 'Rajasthan', count: 4000 },
          ],
          cities: [
            { name: 'Mumbai', count: 8000 },
            { name: 'Bangalore', count: 7000 },
            { name: 'Delhi', count: 6500 },
            { name: 'Hyderabad', count: 5000 },
            { name: 'Chennai', count: 4500 },
            { name: 'Pune', count: 4000 },
            { name: 'Kolkata', count: 3500 },
            { name: 'Ahmedabad', count: 3000 },
          ],
        },
        behavior: {
          deviceTypes: [
            { name: 'Mobile', count: 60000 },
            { name: 'Desktop', count: 25000 },
            { name: 'Tablet', count: 10000 },
          ],
          platforms: [
            { name: 'Web', count: 45000 },
            { name: 'Mobile App', count: 35000 },
            { name: 'Dashboard', count: 15000 },
          ],
          categories: [
            { name: 'Electronics', count: 20000 },
            { name: 'Clothing', count: 18000 },
            { name: 'Home & Kitchen', count: 15000 },
            { name: 'Books', count: 12000 },
            { name: 'Sports', count: 10000 },
            { name: 'Beauty', count: 8000 },
            { name: 'Automotive', count: 6000 },
            { name: 'Health', count: 5000 },
          ],
        },
      };
    } catch (error) {
      logger.error('Error getting targeting options:', error);
      throw new Error('Failed to get targeting options');
    }
  }

  // Private helper methods

  private async getBaseUserCount(): Promise<number> {
    try {
      // Get total active users from database
      const userCount = await prisma.user.count();
      
      // Return a minimum base count for estimation purposes
      return Math.max(userCount, 50000);
    } catch (error) {
      logger.error('Error getting base user count:', error);
      return 50000; // Default fallback
    }
  }

  private calculateDemographicMultiplier(demographics?: TargetingConfig['demographics']): number {
    if (!demographics) return 1.0;

    let multiplier = 1.0;

    // Age range filtering
    if (demographics.ageRange) {
      const [minAge, maxAge] = demographics.ageRange;
      const ageSpan = maxAge - minAge;
      // Broader age ranges have higher reach
      multiplier *= Math.min(ageSpan / 50, 1.0); // Max 50 year span = 100% reach
    }

    // Gender filtering
    if (demographics.gender && demographics.gender !== 'all') {
      multiplier *= 0.5; // Roughly 50% for each gender
    }

    // Interest filtering
    if (demographics.interests && demographics.interests.length > 0) {
      // Each interest reduces reach, but multiple interests can overlap
      const interestMultiplier = Math.max(0.1, 1 - (demographics.interests.length * 0.15));
      multiplier *= interestMultiplier;
    }

    // Education filtering
    if (demographics.education && demographics.education.length > 0) {
      multiplier *= Math.max(0.2, 1 - (demographics.education.length * 0.1));
    }

    // Income filtering
    if (demographics.income && demographics.income.length > 0) {
      multiplier *= Math.max(0.2, 1 - (demographics.income.length * 0.1));
    }

    return Math.max(multiplier, 0.01); // Minimum 1% reach
  }

  private calculateLocationMultiplier(location?: TargetingConfig['location']): number {
    if (!location) return 1.0;

    let multiplier = 1.0;

    // Country filtering
    if (location.countries && location.countries.length > 0) {
      // Assume India has 80% of users, other countries have smaller percentages
      const indiaIncluded = location.countries.includes('India');
      if (indiaIncluded) {
        multiplier *= 0.8 + (location.countries.length - 1) * 0.05;
      } else {
        multiplier *= location.countries.length * 0.05;
      }
    }

    // State filtering (within country)
    if (location.states && location.states.length > 0) {
      multiplier *= Math.min(location.states.length * 0.1, 1.0);
    }

    // City filtering (within state)
    if (location.cities && location.cities.length > 0) {
      multiplier *= Math.min(location.cities.length * 0.05, 0.5);
    }

    // Radius filtering
    if (location.radius && location.coordinates) {
      // Smaller radius = smaller reach
      const radiusMultiplier = Math.min(location.radius / 100, 1.0);
      multiplier *= radiusMultiplier;
    }

    return Math.max(multiplier, 0.01);
  }

  private calculateBehaviorMultiplier(behavior?: TargetingConfig['behavior']): number {
    if (!behavior) return 1.0;

    let multiplier = 1.0;

    // Device type filtering
    if (behavior.deviceTypes && behavior.deviceTypes.length > 0) {
      // Mobile: 60%, Desktop: 30%, Tablet: 10%
      const deviceMultipliers = {
        'Mobile': 0.6,
        'Desktop': 0.3,
        'Tablet': 0.1,
      };
      
      let deviceMultiplier = 0;
      behavior.deviceTypes.forEach(device => {
        deviceMultiplier += deviceMultipliers[device as keyof typeof deviceMultipliers] || 0.1;
      });
      multiplier *= Math.min(deviceMultiplier, 1.0);
    }

    // Platform filtering
    if (behavior.platforms && behavior.platforms.length > 0) {
      multiplier *= Math.min(behavior.platforms.length * 0.4, 1.0);
    }

    // Time of day filtering
    if (behavior.timeOfDay && behavior.timeOfDay.length > 0) {
      multiplier *= Math.min(behavior.timeOfDay.length / 24, 1.0);
    }

    // Day of week filtering
    if (behavior.dayOfWeek && behavior.dayOfWeek.length > 0) {
      multiplier *= Math.min(behavior.dayOfWeek.length / 7, 1.0);
    }

    // Purchase/search history filtering
    if (behavior.purchaseHistory && behavior.purchaseHistory.length > 0) {
      multiplier *= Math.max(0.1, 1 - (behavior.purchaseHistory.length * 0.1));
    }

    return Math.max(multiplier, 0.01);
  }

  private calculateCustomMultiplier(custom?: TargetingConfig['custom']): number {
    if (!custom) return 1.0;

    let multiplier = 1.0;

    // Keywords filtering
    if (custom.keywords && custom.keywords.length > 0) {
      multiplier *= Math.max(0.1, 1 - (custom.keywords.length * 0.05));
    }

    // Categories filtering
    if (custom.categories && custom.categories.length > 0) {
      multiplier *= Math.max(0.2, 1 - (custom.categories.length * 0.1));
    }

    // Exclusions reduce the multiplier effect
    if (custom.excludeKeywords && custom.excludeKeywords.length > 0) {
      multiplier *= Math.max(0.8, 1 - (custom.excludeKeywords.length * 0.02));
    }

    if (custom.excludeCategories && custom.excludeCategories.length > 0) {
      multiplier *= Math.max(0.8, 1 - (custom.excludeCategories.length * 0.05));
    }

    return Math.max(multiplier, 0.01);
  }

  private async calculateCompetitionLevel(_targetingConfig: TargetingConfig): Promise<'low' | 'medium' | 'high'> {
    try {
      // Count active campaigns with similar targeting
      const similarCampaigns = await prisma.adCampaign.count({
        where: {
          status: 'active',
          // This is a simplified check - in reality, you'd compare targeting configs more thoroughly
        },
      });

      if (similarCampaigns < 10) return 'low';
      if (similarCampaigns < 50) return 'medium';
      return 'high';
    } catch (error) {
      logger.error('Error calculating competition level:', error);
      return 'medium';
    }
  }

  private calculateSuggestedBid(
    targetingConfig: TargetingConfig,
    competitionLevel: 'low' | 'medium' | 'high'
  ): AudienceEstimation['suggestedBid'] {
    // Base bid amounts based on competition
    const baseBids = {
      low: { min: 0.50, recommended: 1.00, max: 2.00 },
      medium: { min: 1.00, recommended: 2.50, max: 5.00 },
      high: { min: 2.00, recommended: 5.00, max: 10.00 },
    };

    let bid = baseBids[competitionLevel];

    // Adjust based on targeting specificity
    const specificity = this.calculateTargetingSpecificity(targetingConfig);
    const specificityMultiplier = 1 + (specificity * 0.5); // More specific = higher bid

    return {
      min: Math.round(bid.min * specificityMultiplier * 100) / 100,
      recommended: Math.round(bid.recommended * specificityMultiplier * 100) / 100,
      max: Math.round(bid.max * specificityMultiplier * 100) / 100,
    };
  }

  private calculateTargetingSpecificity(targetingConfig: TargetingConfig): number {
    let specificity = 0;
    let maxSpecificity = 0;

    // Demographics specificity
    if (targetingConfig.demographics) {
      if (targetingConfig.demographics.ageRange) specificity += 1;
      if (targetingConfig.demographics.gender && targetingConfig.demographics.gender !== 'all') specificity += 1;
      if (targetingConfig.demographics.interests) specificity += targetingConfig.demographics.interests.length * 0.5;
      maxSpecificity += 5;
    }

    // Location specificity
    if (targetingConfig.location) {
      if (targetingConfig.location.countries) specificity += Math.min(targetingConfig.location.countries.length * 0.5, 2);
      if (targetingConfig.location.states) specificity += Math.min(targetingConfig.location.states.length * 0.3, 2);
      if (targetingConfig.location.cities) specificity += Math.min(targetingConfig.location.cities.length * 0.2, 2);
      maxSpecificity += 6;
    }

    // Behavior specificity
    if (targetingConfig.behavior) {
      if (targetingConfig.behavior.deviceTypes) specificity += targetingConfig.behavior.deviceTypes.length * 0.3;
      if (targetingConfig.behavior.platforms) specificity += targetingConfig.behavior.platforms.length * 0.3;
      maxSpecificity += 4;
    }

    return maxSpecificity > 0 ? Math.min(specificity / maxSpecificity, 1) : 0;
  }

  private generateDemographicDistributions(targetingConfig: TargetingConfig): AudienceEstimation['demographics'] {
    // Generate realistic demographic distributions based on targeting
    // This would typically use real data from your user base
    
    const ageDistribution: { [key: string]: number } = {};
    if (targetingConfig.demographics?.ageRange) {
      const [minAge, maxAge] = targetingConfig.demographics.ageRange;
      const ageGroups = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
      ageGroups.forEach(group => {
        const [groupMin, groupMax] = group.split('-').map(age => age === '65+' ? 65 : parseInt(age));
        const overlap = Math.max(0, Math.min(maxAge, groupMax || 100) - Math.max(minAge, groupMin || 0));
        ageDistribution[group] = overlap > 0 ? Math.random() * 30 + 10 : 0;
      });
    } else {
      ageDistribution['18-24'] = 25;
      ageDistribution['25-34'] = 35;
      ageDistribution['35-44'] = 20;
      ageDistribution['45-54'] = 12;
      ageDistribution['55-64'] = 6;
      ageDistribution['65+'] = 2;
    }

    const genderDistribution = targetingConfig.demographics?.gender === 'male' 
      ? { male: 100, female: 0, other: 0 }
      : targetingConfig.demographics?.gender === 'female'
      ? { male: 0, female: 100, other: 0 }
      : { male: 52, female: 46, other: 2 };

    const locationDistribution: { [key: string]: number } = {};
    if (targetingConfig.location?.cities) {
      targetingConfig.location.cities.forEach(city => {
        locationDistribution[city] = Math.random() * 20 + 5;
      });
    } else {
      locationDistribution['Mumbai'] = 15;
      locationDistribution['Bangalore'] = 12;
      locationDistribution['Delhi'] = 10;
      locationDistribution['Other'] = 63;
    }

    return {
      ageDistribution,
      genderDistribution,
      locationDistribution,
    };
  }

  private calculateConfidence(targetingConfig: TargetingConfig, estimatedReach: number): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for larger reach
    if (estimatedReach > 10000) confidence += 0.2;
    else if (estimatedReach > 1000) confidence += 0.1;

    // Higher confidence for less specific targeting
    const specificity = this.calculateTargetingSpecificity(targetingConfig);
    confidence += (1 - specificity) * 0.3;

    return Math.min(Math.max(confidence, 0.1), 0.95);
  }

  private async getCampaignWithPerformance(campaignId: string): Promise<any> {
    // Get campaign with analytics data
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: {
        analytics: {
          orderBy: { date: 'desc' },
          take: 30, // Last 30 days
        },
        advertisements: {
          include: {
            impressionRecords: {
              where: {
                viewedAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                },
              },
            },
            clickRecords: {
              where: {
                clickedAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                },
              },
            },
          },
        },
      },
    });

    return campaign;
  }

  private calculateCurrentPerformance(campaign: any): TargetingOptimization['currentPerformance'] {
    if (!campaign || !campaign.analytics || campaign.analytics.length === 0) {
      return { ctr: 0, cpc: 0, conversions: 0, roas: 0 };
    }

    // Aggregate performance metrics from analytics
    const totalImpressions = campaign.analytics.reduce((sum: number, day: any) => sum + day.impressions, 0);
    const totalClicks = campaign.analytics.reduce((sum: number, day: any) => sum + day.clicks, 0);
    const totalConversions = campaign.analytics.reduce((sum: number, day: any) => sum + day.conversions, 0);
    const totalSpend = campaign.analytics.reduce((sum: number, day: any) => sum + day.spend.toNumber(), 0);
    const totalRevenue = campaign.analytics.reduce((sum: number, day: any) => sum + day.revenue.toNumber(), 0);

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    return {
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      conversions: totalConversions,
      roas: Math.round(roas * 100) / 100,
    };
  }

  private async generateOptimizationSuggestions(
    campaign: any,
    currentPerformance: TargetingOptimization['currentPerformance']
  ): Promise<TargetingSuggestion[]> {
    const suggestions: TargetingSuggestion[] = [];
    const targetingConfig = campaign.targetingConfig as TargetingConfig;

    // Analyze performance and generate suggestions
    if (currentPerformance.ctr < 1.0) {
      // Low CTR - suggest expanding or changing targeting
      suggestions.push({
        type: 'expand',
        category: 'demographics',
        field: 'interests',
        currentValue: targetingConfig.demographics?.interests || [],
        suggestedValue: [...(targetingConfig.demographics?.interests || []), 'Technology', 'Entertainment'],
        reason: 'Low click-through rate suggests targeting may be too narrow. Consider expanding interests.',
        expectedImpact: {
          reachChange: 25,
          costChange: -10,
          performanceChange: 15,
        },
        confidence: 0.7,
      });
    }

    if (currentPerformance.cpc > 5.0) {
      // High CPC - suggest narrowing targeting
      suggestions.push({
        type: 'narrow',
        category: 'location',
        field: 'cities',
        currentValue: targetingConfig.location?.cities || [],
        suggestedValue: ['Mumbai', 'Bangalore', 'Delhi'], // Top performing cities
        reason: 'High cost per click suggests high competition. Focus on top-performing locations.',
        expectedImpact: {
          reachChange: -20,
          costChange: -30,
          performanceChange: 20,
        },
        confidence: 0.8,
      });
    }

    if (currentPerformance.conversions < 10) {
      // Low conversions - suggest behavior targeting
      suggestions.push({
        type: 'include',
        category: 'behavior',
        field: 'engagementLevel',
        currentValue: undefined,
        suggestedValue: 'high',
        reason: 'Low conversion rate suggests targeting users with higher engagement levels.',
        expectedImpact: {
          reachChange: -15,
          costChange: 10,
          performanceChange: 40,
        },
        confidence: 0.6,
      });
    }

    return suggestions;
  }

  private calculatePotentialImpact(suggestions: TargetingSuggestion[]): TargetingOptimization['potentialImpact'] {
    const totalReachChange = suggestions.reduce((sum, s) => sum + s.expectedImpact.reachChange, 0);
    const totalCostChange = suggestions.reduce((sum, s) => sum + s.expectedImpact.costChange, 0);
    const totalPerformanceChange = suggestions.reduce((sum, s) => sum + s.expectedImpact.performanceChange, 0);

    return {
      reachIncrease: Math.round(totalReachChange / suggestions.length),
      costReduction: Math.round(Math.abs(totalCostChange) / suggestions.length),
      performanceImprovement: Math.round(totalPerformanceChange / suggestions.length),
    };
  }

  // Matching helper methods
  private matchesDemographics(
    targeting?: TargetingConfig['demographics'],
    userDemographics?: UserProfile['demographics']
  ): boolean {
    if (!targeting) return true;
    if (!userDemographics) return false;

    // Age range check
    if (targeting.ageRange && userDemographics.age) {
      const [minAge, maxAge] = targeting.ageRange;
      if (userDemographics.age < minAge || userDemographics.age > maxAge) {
        return false;
      }
    }

    // Gender check
    if (targeting.gender && targeting.gender !== 'all' && userDemographics.gender) {
      if (targeting.gender !== userDemographics.gender) {
        return false;
      }
    }

    // Interests check
    if (targeting.interests && userDemographics.interests) {
      const hasMatchingInterest = targeting.interests.some(interest =>
        userDemographics.interests!.includes(interest)
      );
      if (!hasMatchingInterest) {
        return false;
      }
    }

    return true;
  }

  private matchesLocation(
    targeting?: TargetingConfig['location'],
    userLocation?: UserProfile['location']
  ): boolean {
    if (!targeting) return true;
    if (!userLocation) return false;

    // Country check
    if (targeting.countries && !targeting.countries.includes(userLocation.country)) {
      return false;
    }

    // State check
    if (targeting.states && !targeting.states.includes(userLocation.state)) {
      return false;
    }

    // City check
    if (targeting.cities && !targeting.cities.includes(userLocation.city)) {
      return false;
    }

    // Radius check
    if (targeting.radius && targeting.coordinates && userLocation.coordinates) {
      const distance = this.calculateDistance(targeting.coordinates, userLocation.coordinates);
      if (distance > targeting.radius) {
        return false;
      }
    }

    return true;
  }

  private matchesBehavior(
    targeting?: TargetingConfig['behavior'],
    userBehavior?: UserProfile['behavior']
  ): boolean {
    if (!targeting) return true;
    if (!userBehavior) return false;

    // Device type check
    if (targeting.deviceTypes && !targeting.deviceTypes.includes(userBehavior.deviceType)) {
      return false;
    }

    // Platform check
    if (targeting.platforms && !targeting.platforms.includes(userBehavior.platform)) {
      return false;
    }

    // Time of day check
    if (targeting.timeOfDay && userBehavior.timeOfDay) {
      if (!targeting.timeOfDay.includes(userBehavior.timeOfDay)) {
        return false;
      }
    }

    // Day of week check
    if (targeting.dayOfWeek && userBehavior.dayOfWeek) {
      if (!targeting.dayOfWeek.includes(userBehavior.dayOfWeek)) {
        return false;
      }
    }

    return true;
  }

  private matchesCustom(
    targeting?: TargetingConfig['custom'],
    userProfile?: UserProfile
  ): boolean {
    if (!targeting || !userProfile) return true;

    // Keywords check (would check against user's search/browse history)
    if (targeting.keywords && userProfile.behavior?.searchHistory) {
      const hasMatchingKeyword = targeting.keywords.some(keyword =>
        userProfile.behavior!.searchHistory!.some(search =>
          search.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      if (!hasMatchingKeyword) {
        return false;
      }
    }

    // Exclude keywords check
    if (targeting.excludeKeywords && userProfile.behavior?.searchHistory) {
      const hasExcludedKeyword = targeting.excludeKeywords.some(keyword =>
        userProfile.behavior!.searchHistory!.some(search =>
          search.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      if (hasExcludedKeyword) {
        return false;
      }
    }

    return true;
  }

  // Relevance calculation helper methods
  private calculateDemographicsRelevance(
    targeting?: TargetingConfig['demographics'],
    userDemographics?: UserProfile['demographics']
  ): number {
    if (!targeting || !userDemographics) return 0;

    let score = 0;

    // Age relevance
    if (targeting.ageRange && userDemographics.age) {
      const [minAge, maxAge] = targeting.ageRange;
      if (userDemographics.age >= minAge && userDemographics.age <= maxAge) {
        score += 10;
      }
    }

    // Gender relevance
    if (targeting.gender && targeting.gender !== 'all' && userDemographics.gender) {
      if (targeting.gender === userDemographics.gender) {
        score += 10;
      }
    }

    // Interests relevance
    if (targeting.interests && userDemographics.interests) {
      const matchingInterests = targeting.interests.filter(interest =>
        userDemographics.interests!.includes(interest)
      );
      score += matchingInterests.length * 2;
    }

    return Math.min(score, 30);
  }

  private calculateLocationRelevance(
    targeting?: TargetingConfig['location'],
    userLocation?: UserProfile['location']
  ): number {
    if (!targeting || !userLocation) return 0;

    let score = 0;

    // City match (highest relevance)
    if (targeting.cities && targeting.cities.includes(userLocation.city)) {
      score += 15;
    }
    // State match (medium relevance)
    else if (targeting.states && targeting.states.includes(userLocation.state)) {
      score += 10;
    }
    // Country match (lowest relevance)
    else if (targeting.countries && targeting.countries.includes(userLocation.country)) {
      score += 5;
    }

    return Math.min(score, 25);
  }

  private calculateBehaviorRelevance(
    targeting?: TargetingConfig['behavior'],
    userBehavior?: UserProfile['behavior']
  ): number {
    if (!targeting || !userBehavior) return 0;

    let score = 0;

    // Device type relevance
    if (targeting.deviceTypes && targeting.deviceTypes.includes(userBehavior.deviceType)) {
      score += 8;
    }

    // Platform relevance
    if (targeting.platforms && targeting.platforms.includes(userBehavior.platform)) {
      score += 8;
    }

    // Engagement level relevance
    if (targeting.engagementLevel && userBehavior.engagementLevel) {
      if (targeting.engagementLevel === userBehavior.engagementLevel) {
        score += 9;
      }
    }

    return Math.min(score, 25);
  }

  private calculateCustomRelevance(
    targeting?: TargetingConfig['custom'],
    userProfile?: UserProfile
  ): number {
    if (!targeting || !userProfile) return 0;

    let score = 0;

    // Keywords relevance
    if (targeting.keywords && userProfile.behavior?.searchHistory) {
      const matchingKeywords = targeting.keywords.filter(keyword =>
        userProfile.behavior!.searchHistory!.some(search =>
          search.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      score += matchingKeywords.length * 3;
    }

    // Categories relevance
    if (targeting.categories && userProfile.behavior?.purchaseHistory) {
      const matchingCategories = targeting.categories.filter(category =>
        userProfile.behavior!.purchaseHistory!.includes(category)
      );
      score += matchingCategories.length * 4;
    }

    return Math.min(score, 20);
  }

  private calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const [lat1, lon1] = coord1;
    const [lat2, lon2] = coord2;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const audienceTargetingService = new AudienceTargetingService();