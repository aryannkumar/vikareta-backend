import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface TargetingConfig {
  demographics?: {
    ageRange?: [number, number];
    gender?: 'male' | 'female' | 'all';
    interests?: string[];
  };
  location?: {
    countries?: string[];
    cities?: string[];
    states?: string[];
    coordinates?: [number, number];
    radius?: number;
  };
  behavior?: {
    deviceTypes?: string[];
    platforms?: string[];
    purchaseHistory?: string[];
    engagementLevel?: string;
  };
}

export interface UserProfile {
  userId?: string;
  age?: number;
  gender?: 'male' | 'female';
  interests?: string[];
  location?: {
    country?: string;
    city?: string;
    state?: string;
    coordinates?: [number, number];
  };
  deviceType?: string;
  platform?: string;
  purchaseHistory?: string[];
  demographics?: any;
  behavior?: {
    engagementLevel?: string;
    deviceType?: string;
    platform?: string;
    deviceTypes?: string[];
    platforms?: string[];
  };
}

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  criteria: {
    demographics: {
      ageRange: [number, number];
      gender: 'male' | 'female' | 'all';
      interests: string[];
    };
    location: {
      countries: string[];
      cities: string[];
      radius?: number;
    };
    behavior: {
      deviceTypes: string[];
      platforms: string[];
      purchaseHistory?: string[];
    };
  };
  size: number;
  engagement: number;
}

export interface TargetingOptimization {
  campaignId: string;
  currentAudience: AudienceSegment;
  currentPerformance: {
    ctr: number;
    cpc: number;
    conversions: number;
    roas: number;
  };
  suggestions: Array<{
    type: 'expand' | 'narrow' | 'include' | 'exclude';
    description: string;
    expectedImpact: string;
    confidence: number;
    reason: string;
  }>;
  recommendedSegments: AudienceSegment[];
  potentialImpact: {
    reachIncrease: number;
    costReduction: number;
    performanceImprovement: number;
  };
}

export interface AudienceInsights {
  segment: AudienceSegment;
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversionRate: number;
    averageCpc: number;
  };
  demographics: {
    ageDistribution: Record<string, number>;
    genderDistribution: Record<string, number>;
    locationDistribution: Record<string, number>;
  };
  interests: Array<{
    category: string;
    affinity: number;
    reach: number;
  }>;
}

export interface CustomAudienceOptions {
  name: string;
  description: string;
  demographics: {
    ageRange: [number, number];
    gender: 'male' | 'female' | 'all';
    interests: string[];
  };
  location: {
    countries: string[];
    cities: string[];
  };
  behavior: {
    deviceTypes: string[];
    platforms: string[];
  };
}

export class AudienceTargetingService {
  private prisma: PrismaClient;

  constructor(prismaInstance?: PrismaClient) {
    this.prisma = prismaInstance || new PrismaClient();
  }

  /**
   * Estimate audience size for targeting configuration
   */
  async estimateAudience(config: TargetingConfig): Promise<{
    estimatedSize: number;
    totalReach: number;
    dailyReach: number;
    confidence: number;
    competitionLevel: 'low' | 'medium' | 'high';
    suggestedBid: {
      min: number;
      recommended: number;
      max: number;
    };
    demographics: {
      locationDistribution?: any;
    };
    breakdown: {
      demographics: number;
      location: number;
      behavior: number;
    };
  }> {
    try {
      // Mock implementation - in real scenario would query user database
      let baseSize = 1000000; // Base audience size
      let confidence = 0.8;

      // Apply demographic filters
      if (config.demographics?.ageRange) {
        const [min, max] = config.demographics.ageRange;
        const ageSpan = max - min;
        baseSize *= (ageSpan / 80); // Assume 80 year lifespan
      }

      if (config.demographics?.gender && config.demographics.gender !== 'all') {
        baseSize *= 0.5; // Roughly half for specific gender
      }

      if (config.demographics?.interests?.length) {
        baseSize *= Math.max(0.1, 1 - (config.demographics.interests.length * 0.1));
      }

      // Apply location filters
      if (config.location?.countries?.length) {
        baseSize *= Math.max(0.05, 1 - (config.location.countries.length * 0.2));
      }

      if (config.location?.cities?.length) {
        baseSize *= Math.max(0.01, 1 - (config.location.cities.length * 0.3));
      }

      // Apply behavior filters
      if (config.behavior?.deviceTypes?.length) {
        baseSize *= Math.max(0.3, 1 - (config.behavior.deviceTypes.length * 0.1));
      }

      const estimatedSize = Math.floor(baseSize);
      const totalReach = estimatedSize;
      const dailyReach = Math.floor(estimatedSize * 0.1); // 10% daily reach

      // Determine competition level based on targeting specificity
      let competitionLevel: 'low' | 'medium' | 'high' = 'medium';
      const specificityScore = (config.demographics?.interests?.length || 0) + 
                              (config.location?.cities?.length || 0) + 
                              (config.behavior?.deviceTypes?.length || 0);
      
      if (specificityScore <= 2) competitionLevel = 'high';
      else if (specificityScore <= 5) competitionLevel = 'medium';
      else competitionLevel = 'low';

      // Calculate suggested bid based on competition
      const baseBid = competitionLevel === 'high' ? 3.0 : competitionLevel === 'medium' ? 2.0 : 1.0;

      return {
        estimatedSize,
        totalReach,
        dailyReach,
        confidence,
        competitionLevel,
        suggestedBid: {
          min: baseBid * 0.7,
          recommended: baseBid,
          max: baseBid * 1.5
        },
        demographics: {
          locationDistribution: config.location ? { cities: config.location.cities } : undefined
        },
        breakdown: {
          demographics: Math.floor(estimatedSize * 0.4),
          location: Math.floor(estimatedSize * 0.3),
          behavior: Math.floor(estimatedSize * 0.3)
        }
      };
    } catch (error) {
      logger.error('Failed to estimate audience:', error);
      throw error;
    }
  }

  /**
   * Generate targeting optimization suggestions
   */
  async generateTargetingOptimizations(campaignId: string): Promise<TargetingOptimization> {
    try {
      const campaign = await this.prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          advertisements: {
            include: {
              impressionRecords: true,
              clickRecords: true
            }
          }
        }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Mock current audience
      const currentAudience: AudienceSegment = {
        id: 'current_audience',
        name: 'Current Campaign Audience',
        description: 'Current targeting configuration',
        criteria: {
          demographics: {
            ageRange: [25, 45],
            gender: 'all',
            interests: ['technology', 'business']
          },
          location: {
            countries: ['IN'],
            cities: ['Mumbai', 'Delhi', 'Bangalore']
          },
          behavior: {
            deviceTypes: ['mobile', 'desktop'],
            platforms: ['web', 'mobile_app'],
            purchaseHistory: []
          }
        },
        size: 50000,
        engagement: 75
      };

      // Mock current performance based on campaign data
      const totalImpressions = (campaign.advertisements || []).reduce((sum: number, ad: any) => sum + (ad.impressionRecords?.length || 0), 0);
      const totalClicks = (campaign.advertisements || []).reduce((sum: number, ad: any) => sum + (ad.clickRecords?.length || 0), 0);
      
      const currentPerformance = {
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) : 0.02, // Default 2% CTR
        cpc: totalClicks > 0 ? Number(campaign.spentAmount) / totalClicks : 5.0, // Default ₹5 CPC
        conversions: Math.floor(totalClicks * 0.02), // 2% conversion rate
        roas: Number(campaign.spentAmount) > 0 ? (totalClicks * 0.02 * 100) / Number(campaign.spentAmount) : 2.0
      };

      const suggestions = [
        {
          type: 'expand' as const,
          description: 'Expand age range to 18-55 to reach more users',
          expectedImpact: 'Increase reach by 30%',
          confidence: 0.8,
          reason: 'Low click-through rate detected'
        },
        {
          type: 'narrow' as const,
          description: 'Focus on high-engagement interests',
          expectedImpact: 'Improve CTR by 15%',
          confidence: 0.9,
          reason: 'High cost per click detected'
        },
        {
          type: 'include' as const,
          description: 'Include tablet users',
          expectedImpact: 'Increase impressions by 20%',
          confidence: 0.7,
          reason: 'Low conversion rate detected'
        }
      ];

      return {
        campaignId,
        currentAudience,
        currentPerformance,
        suggestions,
        recommendedSegments: [currentAudience],
        potentialImpact: {
          reachIncrease: 25,
          costReduction: 15,
          performanceImprovement: 20
        }
      };
    } catch (error) {
      logger.error('Failed to generate targeting optimizations:', error);
      throw error;
    }
  }

  /**
   * Check if user profile matches targeting configuration
   */
  matchesTargeting(config: TargetingConfig, profile: UserProfile): boolean {
    try {
      // Check demographics
      if (config.demographics) {
        if (config.demographics.ageRange && profile.age) {
          const [min, max] = config.demographics.ageRange;
          if (profile.age < min || profile.age > max) {
            return false;
          }
        }

        if (config.demographics.gender && config.demographics.gender !== 'all' && profile.gender) {
          if (config.demographics.gender !== profile.gender) {
            return false;
          }
        }

        if (config.demographics.interests && profile.interests) {
          const hasMatchingInterest = config.demographics.interests.some(interest =>
            profile.interests!.includes(interest)
          );
          if (!hasMatchingInterest) {
            return false;
          }
        }
      }

      // Check location
      if (config.location) {
        if (config.location.countries && profile.location?.country) {
          if (!config.location.countries.includes(profile.location.country)) {
            return false;
          }
        }

        if (config.location.cities && profile.location?.city) {
          if (!config.location.cities.includes(profile.location.city)) {
            return false;
          }
        }
      }

      // Check behavior
      if (config.behavior) {
        if (config.behavior.deviceTypes && profile.deviceType) {
          if (!config.behavior.deviceTypes.includes(profile.deviceType)) {
            return false;
          }
        }

        if (config.behavior.platforms && profile.platform) {
          if (!config.behavior.platforms.includes(profile.platform)) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      logger.error('Error matching targeting:', error);
      return false;
    }
  }

  /**
   * Calculate relevance score for user profile
   */
  calculateRelevanceScore(config: TargetingConfig, profile: UserProfile): number {
    try {
      let score = 0;
      let maxScore = 0;

      // Demographics scoring
      if (config.demographics) {
        maxScore += 40;

        if (config.demographics.ageRange && profile.age) {
          const [min, max] = config.demographics.ageRange;
          if (profile.age >= min && profile.age <= max) {
            score += 15;
          }
        }

        if (config.demographics.gender && profile.gender) {
          if (config.demographics.gender === 'all' || config.demographics.gender === profile.gender) {
            score += 10;
          }
        }

        if (config.demographics.interests && profile.interests) {
          const matchingInterests = config.demographics.interests.filter(interest =>
            profile.interests!.includes(interest)
          );
          score += (matchingInterests.length / config.demographics.interests.length) * 15;
        }
      }

      // Location scoring
      if (config.location) {
        maxScore += 30;

        if (config.location.countries && profile.location?.country) {
          if (config.location.countries.includes(profile.location.country)) {
            score += 20;
          }
        }

        if (config.location.cities && profile.location?.city) {
          if (config.location.cities.includes(profile.location.city)) {
            score += 10;
          }
        }
      }

      // Behavior scoring
      if (config.behavior) {
        maxScore += 30;

        if (config.behavior.deviceTypes && profile.deviceType) {
          if (config.behavior.deviceTypes.includes(profile.deviceType)) {
            score += 15;
          }
        }

        if (config.behavior.platforms && profile.platform) {
          if (config.behavior.platforms.includes(profile.platform)) {
            score += 15;
          }
        }
      }

      return maxScore > 0 ? (score / maxScore) * 100 : 0;
    } catch (error) {
      logger.error('Error calculating relevance score:', error);
      return 0;
    }
  }

  /**
   * Get available targeting options
   */
  async getTargetingOptions(): Promise<{
    demographics: {
      ageRanges: Array<{ label: string; range: [number, number] }>;
      genders: Array<{ label: string; value: string }>;
      interests: Array<{ label: string; value: string; count: number }>;
    };
    location: {
      countries: Array<{ label: string; value: string; count: number }>;
      cities: Array<{ label: string; value: string; country: string }>;
      states: Array<{ label: string; value: string; count: number }>;
    };
    behavior: {
      deviceTypes: Array<{ label: string; value: string; count: number }>;
      platforms: Array<{ label: string; value: string }>;
      categories: Array<{ label: string; value: string }>;
    };
  }> {
    try {
      return {
        demographics: {
          ageRanges: [
            { label: '18-24', range: [18, 24] },
            { label: '25-34', range: [25, 34] },
            { label: '35-44', range: [35, 44] },
            { label: '45-54', range: [45, 54] },
            { label: '55+', range: [55, 100] }
          ],
          genders: [
            { label: 'All', value: 'all' },
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' }
          ],
          interests: [
            { label: 'Technology', value: 'technology', count: 15000 },
            { label: 'Business', value: 'business', count: 12000 },
            { label: 'Sports', value: 'sports', count: 10000 },
            { label: 'Entertainment', value: 'entertainment', count: 8000 },
            { label: 'Fashion', value: 'fashion', count: 6000 }
          ]
        },
        location: {
          countries: [
            { label: 'India', value: 'IN', count: 50000 },
            { label: 'United States', value: 'US', count: 30000 },
            { label: 'United Kingdom', value: 'GB', count: 20000 }
          ],
          cities: [
            { label: 'Mumbai', value: 'mumbai', country: 'IN' },
            { label: 'Delhi', value: 'delhi', country: 'IN' },
            { label: 'Bangalore', value: 'bangalore', country: 'IN' },
            { label: 'New York', value: 'new_york', country: 'US' },
            { label: 'London', value: 'london', country: 'GB' }
          ],
          states: [
            { label: 'Maharashtra', value: 'maharashtra', count: 25000 },
            { label: 'Karnataka', value: 'karnataka', count: 20000 },
            { label: 'Delhi', value: 'delhi', count: 15000 }
          ]
        },
        behavior: {
          deviceTypes: [
            { label: 'Mobile', value: 'mobile', count: 40000 },
            { label: 'Desktop', value: 'desktop', count: 30000 },
            { label: 'Tablet', value: 'tablet', count: 10000 }
          ],
          platforms: [
            { label: 'Web', value: 'web' },
            { label: 'Mobile App', value: 'mobile_app' },
            { label: 'Social Media', value: 'social_media' }
          ],
          categories: [
            { label: 'E-commerce', value: 'ecommerce' },
            { label: 'Social', value: 'social' },
            { label: 'News', value: 'news' }
          ]
        }
      };
    } catch (error) {
      logger.error('Failed to get targeting options:', error);
      throw error;
    }
  }

  /**
   * Create a custom audience segment
   */
  async createAudienceSegment(options: CustomAudienceOptions): Promise<AudienceSegment> {
    try {
      // In a real implementation, this would create the segment in the database
      const segment: AudienceSegment = {
        id: `segment_${Date.now()}`,
        name: options.name,
        description: options.description,
        criteria: {
          demographics: options.demographics,
          location: options.location,
          behavior: options.behavior
        },
        size: Math.floor(Math.random() * 100000) + 10000, // Mock size
        engagement: Math.random() * 100
      };

      logger.info(`Created audience segment: ${segment.id}`);
      return segment;
    } catch (error) {
      logger.error('Failed to create audience segment:', error);
      throw error;
    }
  }

  /**
   * Get targeting optimization suggestions for a campaign
   */
  static async getTargetingOptimization(campaignId: string): Promise<TargetingOptimization> {
    try {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          advertisements: {
            include: {
              impressionRecords: true,
              clickRecords: true
            }
          }
        }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Mock current audience (in real implementation, extract from campaign targeting)
      const currentAudience: AudienceSegment = {
        id: 'current_audience',
        name: 'Current Campaign Audience',
        description: 'Current targeting configuration',
        criteria: {
          demographics: {
            ageRange: [25, 45],
            gender: 'all',
            interests: ['technology', 'business']
          },
          location: {
            countries: ['IN'],
            cities: ['Mumbai', 'Delhi', 'Bangalore']
          },
          behavior: {
            deviceTypes: ['mobile', 'desktop'],
            platforms: ['web', 'mobile_app'],
            purchaseHistory: []
          }
        },
        size: 50000,
        engagement: 65
      };

      // Generate optimization suggestions
      const suggestions = [
        {
          type: 'expand' as const,
          description: 'Include users aged 18-24 to increase reach',
          expectedImpact: 'Increase audience size by 30%',
          confidence: 0.75,
          reason: 'Low audience reach detected'
        },
        {
          type: 'narrow' as const,
          description: 'Focus on high-engagement cities',
          expectedImpact: 'Improve CTR by 15%',
          confidence: 0.85,
          reason: 'High cost per click detected'
        },
        {
          type: 'include' as const,
          description: 'Add "entrepreneurship" interest category',
          expectedImpact: 'Better audience relevance',
          confidence: 0.70,
          reason: 'Low conversion rate detected'
        }
      ];

      // Generate recommended segments
      const recommendedSegments: AudienceSegment[] = [
        {
          id: 'lookalike_segment',
          name: 'Lookalike Audience',
          description: 'Similar to your best customers',
          criteria: {
            demographics: {
              ageRange: [25, 50],
              gender: 'all',
              interests: ['technology', 'business', 'innovation']
            },
            location: {
              countries: ['IN'],
              cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai']
            },
            behavior: {
              deviceTypes: ['mobile', 'desktop'],
              platforms: ['web', 'mobile_app'],
              purchaseHistory: []
            }
          },
          size: 75000,
          engagement: 78
        }
      ];

      return {
        campaignId,
        currentAudience,
        currentPerformance: {
          ctr: 0.02,
          cpc: 5.0,
          conversions: 10,
          roas: 2.0
        },
        suggestions,
        recommendedSegments,
        potentialImpact: {
          reachIncrease: 25,
          costReduction: 15,
          performanceImprovement: 20
        }
      };
    } catch (error) {
      logger.error('Targeting optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed insights for an audience segment
   */
  static async getAudienceInsights(segmentId: string): Promise<AudienceInsights> {
    try {
      // Mock segment data (in real implementation, fetch from database)
      const segment: AudienceSegment = {
        id: segmentId,
        name: 'Business Professionals',
        description: 'Working professionals in business sector',
        criteria: {
          demographics: {
            ageRange: [25, 45],
            gender: 'all',
            interests: ['business', 'technology', 'finance']
          },
          location: {
            countries: ['IN'],
            cities: ['Mumbai', 'Delhi', 'Bangalore']
          },
          behavior: {
            deviceTypes: ['mobile', 'desktop'],
            platforms: ['web', 'mobile_app'],
            purchaseHistory: []
          }
        },
        size: 50000,
        engagement: 72
      };

      // Mock performance data
      const performance = {
        impressions: 100000,
        clicks: 2500,
        conversions: 50,
        ctr: 2.5,
        conversionRate: 2.0,
        averageCpc: 12.50
      };

      // Mock demographics data
      const demographics = {
        ageDistribution: {
          '18-24': 15,
          '25-34': 45,
          '35-44': 30,
          '45-54': 10
        },
        genderDistribution: {
          'male': 60,
          'female': 40
        },
        locationDistribution: {
          'Mumbai': 35,
          'Delhi': 30,
          'Bangalore': 25,
          'Others': 10
        }
      };

      // Mock interests data
      const interests = [
        { category: 'Business', affinity: 85, reach: 42000 },
        { category: 'Technology', affinity: 78, reach: 39000 },
        { category: 'Finance', affinity: 65, reach: 32500 }
      ];

      return {
        segment,
        performance,
        demographics,
        interests
      };
    } catch (error) {
      logger.error('Failed to get audience insights:', error);
      throw error;
    }
  }

  /**
   * Get available audience segments
   */
  static async getAvailableSegments(): Promise<AudienceSegment[]> {
    try {
      // Mock available segments
      const segments: AudienceSegment[] = [
        {
          id: 'business_professionals',
          name: 'Business Professionals',
          description: 'Working professionals in business sector',
          criteria: {
            demographics: {
              ageRange: [25, 45],
              gender: 'all',
              interests: ['business', 'technology']
            },
            location: {
              countries: ['IN'],
              cities: ['Mumbai', 'Delhi', 'Bangalore']
            },
            behavior: {
              deviceTypes: ['mobile', 'desktop'],
              platforms: ['web'],
              purchaseHistory: []
            }
          },
          size: 50000,
          engagement: 72
        },
        {
          id: 'tech_enthusiasts',
          name: 'Tech Enthusiasts',
          description: 'People interested in latest technology',
          criteria: {
            demographics: {
              ageRange: [18, 35],
              gender: 'all',
              interests: ['technology', 'gadgets', 'software']
            },
            location: {
              countries: ['IN'],
              cities: ['Bangalore', 'Hyderabad', 'Pune']
            },
            behavior: {
              deviceTypes: ['mobile'],
              platforms: ['mobile_app'],
              purchaseHistory: []
            }
          },
          size: 75000,
          engagement: 68
        }
      ];

      return segments;
    } catch (error) {
      logger.error('Failed to get available segments:', error);
      throw error;
    }
  }

  /**
   * Validate audience targeting configuration
   */
  static validateTargetingConfig(options: CustomAudienceOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!options.name || options.name.trim().length === 0) {
      errors.push('Audience name is required');
    }

    if (options.demographics.ageRange[0] >= options.demographics.ageRange[1]) {
      errors.push('Invalid age range');
    }

    if (options.location.countries.length === 0) {
      errors.push('At least one country must be selected');
    }

    if (options.behavior.deviceTypes.length === 0) {
      errors.push('At least one device type must be selected');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const audienceTargetingService = new AudienceTargetingService();