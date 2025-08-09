import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { Client } from '@elastic/elasticsearch';
import { config } from '@/config/environment';

const prisma = new PrismaClient();

// Initialize Elasticsearch client for ad analytics
const elasticsearch = new Client({
  node: config.elasticsearch?.url || 'http://localhost:9200',
  ...(config.elasticsearch?.auth && {
    auth: {
      username: config.elasticsearch.auth.username,
      password: config.elasticsearch.auth.password,
    }
  }),
});

export interface ImpressionEvent {
  advertisementId: string;
  placementId: string;
  userId?: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  platform: 'web' | 'mobile' | 'dashboard';
  location?: {
    country?: string;
    state?: string;
    city?: string;
    coordinates?: [number, number];
  };
  viewDuration?: number;
  isViewable?: boolean;
  cost: number;
  timestamp?: Date;
}

export interface ClickEvent {
  advertisementId: string;
  impressionId?: string;
  userId?: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  referrerUrl?: string;
  destinationUrl: string;
  cost: number;
  conversionValue?: number;
  timestamp?: Date;
}

export interface ConversionEvent {
  advertisementId: string;
  clickId?: string;
  userId?: string;
  sessionId: string;
  conversionType: 'purchase' | 'signup' | 'lead' | 'custom';
  conversionValue: number;
  orderId?: string;
  productId?: string;
  timestamp?: Date;
  attributionWindow?: number; // Attribution window in hours (default: 24)
}

export interface AttributionResult {
  conversions: Array<{
    advertisementId: string;
    campaignId: string;
    attributionWeight: number;
    attributedValue: number;
    touchpointPosition: 'first' | 'middle' | 'last';
    timeSinceClick: number; // in hours
  }>;
  totalAttributedValue: number;
  attributionModel: 'last_click' | 'first_click' | 'linear' | 'time_decay';
}

export interface CampaignReport {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  ctr: number; // click-through rate
  cpc: number; // cost per click
  cpm: number; // cost per mille
  roas: number; // return on ad spend
  topPerformingAds: Array<{
    advertisementId: string;
    title: string;
    impressions: number;
    clicks: number;
    ctr: number;
    spend: number;
  }>;
  audienceInsights: {
    topLocations: Array<{ location: string; impressions: number; clicks: number }>;
    topPlatforms: Array<{ platform: string; impressions: number; clicks: number }>;
    hourlyDistribution: Array<{ hour: number; impressions: number; clicks: number }>;
  };
}

export interface RealTimeMetrics {
  campaignId: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  lastUpdated: Date;
}

export interface FraudDetectionResult {
  isValid: boolean;
  riskScore: number; // 0-100, higher is more risky
  reasons: string[];
  action: 'allow' | 'flag' | 'block';
}

export class AdAnalyticsService {
  private static readonly AD_ANALYTICS_INDEX = 'vikareta_ad_analytics';
  private static readonly FRAUD_THRESHOLD = 70;
  private static readonly MAX_CLICKS_PER_IP_PER_HOUR = 10;
  private static readonly MAX_IMPRESSIONS_PER_IP_PER_MINUTE = 60;

  /**
   * Initialize ad analytics indices
   */
  static async initializeAdAnalyticsIndices(): Promise<void> {
    try {
      const indexExists = await elasticsearch.indices.exists({
        index: this.AD_ANALYTICS_INDEX,
      });

      if (!indexExists) {
        await elasticsearch.indices.create({
          index: this.AD_ANALYTICS_INDEX,
          mappings: {
            properties: {
              eventType: { type: 'keyword' },
              advertisementId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              placementId: { type: 'keyword' },
              userId: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              ipAddress: { type: 'ip' },
              userAgent: { type: 'text' },
              platform: { type: 'keyword' },
              location: {
                properties: {
                  country: { type: 'keyword' },
                  state: { type: 'keyword' },
                  city: { type: 'keyword' },
                  coordinates: { type: 'geo_point' },
                }
              },
              cost: { type: 'float' },
              conversionValue: { type: 'float' },
              viewDuration: { type: 'integer' },
              isViewable: { type: 'boolean' },
              timestamp: { type: 'date' },
              fraudScore: { type: 'float' },
              isValid: { type: 'boolean' },
            },
          },
          settings: {
            'index.number_of_shards': 2,
            'index.number_of_replicas': 1,
          },
        });
        logger.info('Ad analytics index created successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize ad analytics indices:', error);
      throw error;
    }
  }

  /**
   * Track impression with fraud detection
   */
  static async trackImpression(impressionData: ImpressionEvent): Promise<{ success: boolean; fraudResult?: FraudDetectionResult }> {
    try {
      const timestamp = impressionData.timestamp || new Date();

      // Perform fraud detection
      const fraudResult = await this.detectImpressionFraud(impressionData);

      if (fraudResult.action === 'block') {
        logger.warn(`Blocked fraudulent impression: ${JSON.stringify(fraudResult)}`);
        return { success: false, fraudResult };
      }

      // Get campaign ID from advertisement
      const advertisement = await prisma.advertisement.findUnique({
        where: { id: impressionData.advertisementId },
        include: { campaign: true },
      });

      if (!advertisement) {
        throw new Error(`Advertisement not found: ${impressionData.advertisementId}`);
      }

      // Check if campaign is active and has budget
      if (advertisement.campaign.status !== 'active') {
        logger.warn(`Impression blocked - campaign not active: ${advertisement.campaign.id}`);
        return { success: false };
      }

      // Create impression record in database
      const impression = await prisma.adImpression.create({
        data: {
          advertisementId: impressionData.advertisementId,
          placementId: impressionData.placementId,
          userId: impressionData.userId || null,
          sessionId: impressionData.sessionId,
          ipAddress: impressionData.ipAddress,
          userAgent: impressionData.userAgent,
          platform: impressionData.platform,
          location: impressionData.location || {},
          viewDuration: impressionData.viewDuration || null,
          isViewable: impressionData.isViewable ?? true,
          cost: impressionData.cost,
          createdAt: timestamp,
        },
      });

      // Track in Elasticsearch for analytics
      await elasticsearch.index({
        index: this.AD_ANALYTICS_INDEX,
        document: {
          eventType: 'impression',
          advertisementId: impressionData.advertisementId,
          campaignId: advertisement.campaignId,
          placementId: impressionData.placementId,
          userId: impressionData.userId,
          sessionId: impressionData.sessionId,
          ipAddress: impressionData.ipAddress,
          userAgent: impressionData.userAgent,
          platform: impressionData.platform,
          location: impressionData.location,
          cost: impressionData.cost,
          viewDuration: impressionData.viewDuration,
          isViewable: impressionData.isViewable ?? true,
          timestamp: timestamp.toISOString(),
          fraudScore: fraudResult.riskScore,
          isValid: fraudResult.isValid,
        },
      });

      // Deduct cost from campaign budget (if CPM bidding)
      if (advertisement.campaign.biddingStrategy === 'cpm') {
        await this.deductCampaignCost(advertisement.campaignId, impressionData.cost);
      }

      logger.debug(`Impression tracked: ${impression.id}`);
      return { success: true, fraudResult };
    } catch (error) {
      logger.error('Failed to track impression:', error);
      throw error;
    }
  }

  /**
   * Track click with fraud detection
   */
  static async trackClick(clickData: ClickEvent): Promise<{ success: boolean; fraudResult?: FraudDetectionResult }> {
    try {
      const timestamp = clickData.timestamp || new Date();

      // Perform fraud detection
      const fraudResult = await this.detectClickFraud(clickData);

      if (fraudResult.action === 'block') {
        logger.warn(`Blocked fraudulent click: ${JSON.stringify(fraudResult)}`);
        return { success: false, fraudResult };
      }

      // Get campaign ID from advertisement
      const advertisement = await prisma.advertisement.findUnique({
        where: { id: clickData.advertisementId },
        include: { campaign: true },
      });

      if (!advertisement) {
        throw new Error(`Advertisement not found: ${clickData.advertisementId}`);
      }

      // Check if campaign is active and has budget
      if (advertisement.campaign.status !== 'active') {
        logger.warn(`Click blocked - campaign not active: ${advertisement.campaign.id}`);
        return { success: false };
      }

      // Create click record in database
      const click = await prisma.adClick.create({
        data: {
          advertisementId: clickData.advertisementId,
          impressionId: clickData.impressionId || null,
          userId: clickData.userId || null,
          sessionId: clickData.sessionId,
          ipAddress: clickData.ipAddress,
          userAgent: clickData.userAgent,
          referrerUrl: clickData.referrerUrl || null,
          destinationUrl: clickData.destinationUrl,
          cost: clickData.cost,
          conversionValue: clickData.conversionValue || null,
          createdAt: timestamp,
        },
      });

      // Track in Elasticsearch for analytics
      await elasticsearch.index({
        index: this.AD_ANALYTICS_INDEX,
        document: {
          eventType: 'click',
          advertisementId: clickData.advertisementId,
          campaignId: advertisement.campaignId,
          userId: clickData.userId,
          sessionId: clickData.sessionId,
          ipAddress: clickData.ipAddress,
          userAgent: clickData.userAgent,
          cost: clickData.cost,
          conversionValue: clickData.conversionValue,
          timestamp: timestamp.toISOString(),
          fraudScore: fraudResult.riskScore,
          isValid: fraudResult.isValid,
        },
      });

      // Deduct cost from campaign budget (if CPC bidding)
      if (advertisement.campaign.biddingStrategy === 'cpc') {
        await this.deductCampaignCost(advertisement.campaignId, clickData.cost);
      }

      logger.debug(`Click tracked: ${click.id}`);
      return { success: true, fraudResult };
    } catch (error) {
      logger.error('Failed to track click:', error);
      throw error;
    }
  }

  /**
   * Track conversion with multi-touch attribution
   */
  static async trackConversion(conversionData: ConversionEvent): Promise<AttributionResult> {
    try {
      const timestamp = conversionData.timestamp || new Date();
      const attributionWindow = conversionData.attributionWindow || 24; // 24 hours default

      // Get campaign ID from advertisement
      const advertisement = await prisma.advertisement.findUnique({
        where: { id: conversionData.advertisementId },
        include: { campaign: true },
      });

      if (!advertisement) {
        throw new Error(`Advertisement not found: ${conversionData.advertisementId}`);
      }

      // Perform multi-touch attribution analysis
      const attributionResult = await this.performMultiTouchAttribution(
        conversionData,
        timestamp,
        attributionWindow
      );

      // Track conversion in Elasticsearch with attribution data
      await elasticsearch.index({
        index: this.AD_ANALYTICS_INDEX,
        document: {
          eventType: 'conversion',
          advertisementId: conversionData.advertisementId,
          campaignId: advertisement.campaignId,
          userId: conversionData.userId,
          sessionId: conversionData.sessionId,
          conversionType: conversionData.conversionType,
          conversionValue: conversionData.conversionValue,
          orderId: conversionData.orderId,
          productId: conversionData.productId,
          timestamp: timestamp.toISOString(),
          attributionResult: attributionResult,
          attributionWindow: attributionWindow,
        },
      });

      // Update attributed conversions for each touchpoint
      for (const attribution of attributionResult.conversions) {
        await this.updateAttributedConversion(
          attribution.campaignId,
          attribution.attributedValue,
          timestamp
        );
      }

      logger.debug(`Conversion tracked with attribution: ${conversionData.conversionType} - ${conversionData.conversionValue}`);
      return attributionResult;
    } catch (error) {
      logger.error('Failed to track conversion:', error);
      throw error;
    }
  }

  /**
   * Perform multi-touch attribution analysis
   */
  private static async performMultiTouchAttribution(
    conversionData: ConversionEvent,
    conversionTime: Date,
    attributionWindow: number
  ): Promise<AttributionResult> {
    try {
      const windowStart = new Date(conversionTime.getTime() - (attributionWindow * 60 * 60 * 1000));

      // Find all clicks from the user/session within attribution window
      const clicksQuery: any = {
        bool: {
          must: [
            { term: { eventType: 'click' } },
            {
              range: {
                timestamp: {
                  gte: windowStart.toISOString(),
                  lte: conversionTime.toISOString(),
                },
              },
            },
          ],
        },
      };

      // Add user or session filter
      if (conversionData.userId) {
        clicksQuery.bool.must.push({ term: { userId: conversionData.userId } });
      } else if (conversionData.sessionId) {
        clicksQuery.bool.must.push({ term: { sessionId: conversionData.sessionId } });
      }

      const clicksResponse = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: clicksQuery,
        sort: [{ timestamp: { order: 'asc' } }],
        size: 100,
      });

      const clicks = clicksResponse.hits.hits.map((hit: any) => hit._source);

      if (clicks.length === 0) {
        // No clicks found, attribute to direct conversion
        return {
          conversions: [{
            advertisementId: conversionData.advertisementId,
            campaignId: '',
            attributionWeight: 1.0,
            attributedValue: conversionData.conversionValue,
            touchpointPosition: 'last',
            timeSinceClick: 0,
          }],
          totalAttributedValue: conversionData.conversionValue,
          attributionModel: 'last_click',
        };
      }

      // Apply linear attribution model (equal weight to all touchpoints)
      const attributionWeight = 1.0 / clicks.length;
      const attributedValue = conversionData.conversionValue * attributionWeight;

      const conversions = clicks.map((click: any, index: number) => {
        const clickTime = new Date(click.timestamp);
        const timeSinceClick = (conversionTime.getTime() - clickTime.getTime()) / (1000 * 60 * 60); // hours

        let touchpointPosition: 'first' | 'middle' | 'last';
        if (clicks.length === 1) {
          touchpointPosition = 'last';
        } else if (index === 0) {
          touchpointPosition = 'first';
        } else if (index === clicks.length - 1) {
          touchpointPosition = 'last';
        } else {
          touchpointPosition = 'middle';
        }

        return {
          advertisementId: click.advertisementId,
          campaignId: click.campaignId,
          attributionWeight,
          attributedValue,
          touchpointPosition,
          timeSinceClick,
        };
      });

      return {
        conversions,
        totalAttributedValue: conversionData.conversionValue,
        attributionModel: 'linear',
      };
    } catch (error) {
      logger.error('Failed to perform multi-touch attribution:', error);
      // Fallback to last-click attribution
      return {
        conversions: [{
          advertisementId: conversionData.advertisementId,
          campaignId: '',
          attributionWeight: 1.0,
          attributedValue: conversionData.conversionValue,
          touchpointPosition: 'last',
          timeSinceClick: 0,
        }],
        totalAttributedValue: conversionData.conversionValue,
        attributionModel: 'last_click',
      };
    }
  }

  /**
   * Update attributed conversion for a campaign
   */
  private static async updateAttributedConversion(
    campaignId: string,
    attributedValue: number,
    conversionTime: Date
  ): Promise<void> {
    try {
      // Track attributed conversion in Elasticsearch
      await elasticsearch.index({
        index: this.AD_ANALYTICS_INDEX,
        document: {
          eventType: 'attributed_conversion',
          campaignId,
          attributedValue,
          timestamp: conversionTime.toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to update attributed conversion:', error);
    }
  }

  /**
   * Calculate ROI and ROAS for a campaign
   */
  static async calculateCampaignROI(
    campaignId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    roi: number;
    roas: number;
    totalSpend: number;
    totalRevenue: number;
    attributedRevenue: number;
    conversionCount: number;
    attributedConversionCount: number;
  }> {
    try {
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { campaignId } },
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          total_spend: {
            filter: {
              bool: {
                should: [
                  { term: { eventType: 'impression' } },
                  { term: { eventType: 'click' } },
                ],
              },
            },
            aggs: {
              spend: { sum: { field: 'cost' } },
            },
          },
          direct_conversions: {
            filter: { term: { eventType: 'conversion' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              revenue: { sum: { field: 'conversionValue' } },
            },
          },
          attributed_conversions: {
            filter: { term: { eventType: 'attributed_conversion' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              revenue: { sum: { field: 'attributedValue' } },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;

      const totalSpend = aggs.total_spend.spend.value || 0;
      const totalRevenue = aggs.direct_conversions.revenue.value || 0;
      const attributedRevenue = aggs.attributed_conversions.revenue.value || 0;
      const conversionCount = aggs.direct_conversions.count.value || 0;
      const attributedConversionCount = aggs.attributed_conversions.count.value || 0;

      // Use attributed revenue if available, otherwise use direct revenue
      const effectiveRevenue = attributedRevenue > 0 ? attributedRevenue : totalRevenue;

      const roi = totalSpend > 0 ? ((effectiveRevenue - totalSpend) / totalSpend) * 100 : 0;
      const roas = totalSpend > 0 ? effectiveRevenue / totalSpend : 0;

      return {
        roi,
        roas,
        totalSpend,
        totalRevenue,
        attributedRevenue,
        conversionCount,
        attributedConversionCount,
      };
    } catch (error) {
      logger.error('Failed to calculate campaign ROI:', error);
      throw error;
    }
  }

  /**
   * Generate campaign report
   */
  static async generateCampaignReport(
    campaignId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CampaignReport> {
    try {
      // Get campaign data from Elasticsearch
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { campaignId } },
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          impressions: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              total_cost: { sum: { field: 'cost' } },
            },
          },
          clicks: {
            filter: { term: { eventType: 'click' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              total_cost: { sum: { field: 'cost' } },
            },
          },
          conversions: {
            filter: { term: { eventType: 'conversion' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              total_value: { sum: { field: 'conversionValue' } },
            },
          },
          top_ads: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              ads: {
                terms: { field: 'advertisementId', size: 10 },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                  spend: { sum: { field: 'cost' } },
                },
              },
            },
          },
          top_locations: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              locations: {
                terms: { field: 'location.country', size: 10 },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                },
              },
            },
          },
          top_platforms: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              platforms: {
                terms: { field: 'platform', size: 10 },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                },
              },
            },
          },
          hourly_distribution: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              hours: {
                date_histogram: {
                  field: 'timestamp',
                  calendar_interval: 'hour',
                  format: 'HH',
                },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                },
              },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;

      const impressions = aggs.impressions.count.value || 0;
      const clicks = aggs.clicks.count.value || 0;
      const conversions = aggs.conversions.count.value || 0;
      const spend = (aggs.impressions.total_cost.value || 0) + (aggs.clicks.total_cost.value || 0);
      const revenue = aggs.conversions.total_value.value || 0;

      // Calculate metrics
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      // Get advertisement details for top performing ads
      const topAdIds = aggs.top_ads.ads.buckets.map((bucket: any) => bucket.key);
      const advertisements = await prisma.advertisement.findMany({
        where: { id: { in: topAdIds } },
        select: { id: true, title: true },
      });

      const topPerformingAds = aggs.top_ads.ads.buckets.map((bucket: any) => {
        const ad = advertisements.find(a => a.id === bucket.key);
        const adImpressions = bucket.impressions.value;
        const adClicks = bucket.clicks.count.value || 0;
        const adCtr = adImpressions > 0 ? (adClicks / adImpressions) * 100 : 0;

        return {
          advertisementId: bucket.key,
          title: ad?.title || 'Unknown',
          impressions: adImpressions,
          clicks: adClicks,
          ctr: adCtr,
          spend: bucket.spend.value || 0,
        };
      });

      const audienceInsights = {
        topLocations: aggs.top_locations.locations.buckets.map((bucket: any) => ({
          location: bucket.key,
          impressions: bucket.impressions.value,
          clicks: bucket.clicks.count.value || 0,
        })),
        topPlatforms: aggs.top_platforms.platforms.buckets.map((bucket: any) => ({
          platform: bucket.key,
          impressions: bucket.impressions.value,
          clicks: bucket.clicks.count.value || 0,
        })),
        hourlyDistribution: aggs.hourly_distribution.hours.buckets.map((bucket: any) => ({
          hour: parseInt(bucket.key_as_string),
          impressions: bucket.impressions.value,
          clicks: bucket.clicks.count.value || 0,
        })),
      };

      return {
        campaignId,
        impressions,
        clicks,
        conversions,
        spend,
        revenue,
        ctr,
        cpc,
        cpm,
        roas,
        topPerformingAds,
        audienceInsights,
      };
    } catch (error) {
      logger.error('Failed to generate campaign report:', error);
      throw error;
    }
  }

  /**
   * Get real-time metrics for a campaign
   */
  static async getRealTimeMetrics(campaignId: string): Promise<RealTimeMetrics> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { campaignId } },
              {
                range: {
                  timestamp: {
                    gte: oneHourAgo.toISOString(),
                    lte: now.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          impressions: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              cost: { sum: { field: 'cost' } },
            },
          },
          clicks: {
            filter: { term: { eventType: 'click' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              cost: { sum: { field: 'cost' } },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;
      const impressions = aggs.impressions.count.value || 0;
      const clicks = aggs.clicks.count.value || 0;
      const spend = (aggs.impressions.cost.value || 0) + (aggs.clicks.cost.value || 0);

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      return {
        campaignId,
        impressions,
        clicks,
        spend,
        ctr,
        cpc,
        lastUpdated: now,
      };
    } catch (error) {
      logger.error('Failed to get real-time metrics:', error);
      throw error;
    }
  }

  /**
   * Get platform-wide advertisement analytics
   */
  static async getPlatformAnalytics(options: {
    startDate: Date;
    endDate: Date;
    granularity: string;
    platform?: string;
    businessId?: string;
  }): Promise<any> {
    try {
      const { startDate, endDate, granularity, platform, businessId } = options;

      const mustFilters: any[] = [
        {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lte: endDate.toISOString(),
            },
          },
        },
      ];

      if (platform && platform !== 'all') {
        mustFilters.push({ term: { platform } });
      }

      if (businessId) {
        // Get campaigns for the business
        const campaigns = await prisma.adCampaign.findMany({
          where: { businessId },
          select: { id: true },
        });
        const campaignIds = campaigns.map(c => c.id);
        
        if (campaignIds.length > 0) {
          mustFilters.push({ terms: { campaignId: campaignIds } });
        } else {
          // No campaigns for this business
          return {
            timeSeries: [],
            totals: {
              impressions: 0,
              clicks: 0,
              conversions: 0,
              spend: 0,
              revenue: 0,
              ctr: 0,
              cpc: 0,
              cpm: 0,
              roas: 0,
            },
            topCampaigns: [],
            topBusinesses: [],
            platformBreakdown: [],
          };
        }
      }

      let response: any;
      try {
        response = await elasticsearch.search({
          index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: mustFilters,
          },
        },
        aggs: {
          time_series: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: granularity as any,
              time_zone: 'UTC',
            },
            aggs: {
              impressions: {
                filter: { term: { eventType: 'impression' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              clicks: {
                filter: { term: { eventType: 'click' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              conversions: {
                filter: { term: { eventType: 'conversion' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
          totals: {
            global: {},
            aggs: {
              total_impressions: {
                filter: {
                  bool: {
                    must: [
                      { term: { eventType: 'impression' } },
                      ...mustFilters,
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_clicks: {
                filter: {
                  bool: {
                    must: [
                      { term: { eventType: 'click' } },
                      ...mustFilters,
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_conversions: {
                filter: {
                  bool: {
                    must: [
                      { term: { eventType: 'conversion' } },
                      ...mustFilters,
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
          top_campaigns: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              campaigns: {
                terms: { field: 'campaignId', size: 10 },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                  spend: { sum: { field: 'cost' } },
                },
              },
            },
          },
          platform_breakdown: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              platforms: {
                terms: { field: 'platform', size: 10 },
                aggs: {
                  impressions: { value_count: { field: 'timestamp' } },
                  clicks: {
                    filter: { term: { eventType: 'click' } },
                    aggs: {
                      count: { value_count: { field: 'timestamp' } },
                    },
                  },
                  spend: { sum: { field: 'cost' } },
                },
              },
            },
          },
        },
        size: 0,
        });
      } catch (elasticsearchError) {
        logger.warn('Elasticsearch query failed, falling back to database queries:', elasticsearchError);
        return await this.getPlatformAnalyticsFromDatabase(options);
      }

      const aggs = response.aggregations as any;

      // Check if aggregations exist
      if (!aggs || !aggs.time_series) {
        logger.warn('Elasticsearch returned no aggregations, falling back to database queries');
        return await this.getPlatformAnalyticsFromDatabase(options);
      }

      // Process time series data
      const timeSeries = aggs.time_series.buckets.map((bucket: any) => ({
        timestamp: bucket.key_as_string,
        impressions: bucket.impressions.count.value,
        clicks: bucket.clicks.count.value,
        conversions: bucket.conversions.count.value,
        spend: (bucket.impressions.cost.value || 0) + (bucket.clicks.cost.value || 0),
        revenue: bucket.conversions.value.value || 0,
      }));

      // Calculate totals
      const totalImpressions = aggs.totals.total_impressions.count.value || 0;
      const totalClicks = aggs.totals.total_clicks.count.value || 0;
      const totalConversions = aggs.totals.total_conversions.count.value || 0;
      const totalSpend = (aggs.totals.total_impressions.cost.value || 0) + (aggs.totals.total_clicks.cost.value || 0);
      const totalRevenue = aggs.totals.total_conversions.value.value || 0;

      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      // Get campaign details for top campaigns
      const topCampaignIds = aggs.top_campaigns.campaigns.buckets.map((bucket: any) => bucket.key);
      const campaignDetails = await prisma.adCampaign.findMany({
        where: { id: { in: topCampaignIds } },
        select: { id: true, name: true, businessId: true, business: { select: { businessName: true } } },
      });

      const topCampaigns = aggs.top_campaigns.campaigns.buckets.map((bucket: any) => {
        const campaign = campaignDetails.find(c => c.id === bucket.key);
        const campaignImpressions = bucket.impressions.value;
        const campaignClicks = bucket.clicks.count.value || 0;
        const campaignSpend = bucket.spend.value || 0;
        const campaignCtr = campaignImpressions > 0 ? (campaignClicks / campaignImpressions) * 100 : 0;

        return {
          campaignId: bucket.key,
          campaignName: campaign?.name || 'Unknown',
          businessName: campaign?.business?.businessName || 'Unknown',
          impressions: campaignImpressions,
          clicks: campaignClicks,
          spend: campaignSpend,
          ctr: campaignCtr,
        };
      });

      const platformBreakdown = aggs.platform_breakdown.platforms.buckets.map((bucket: any) => {
        const platformImpressions = bucket.impressions.value;
        const platformClicks = bucket.clicks.count.value || 0;
        const platformSpend = bucket.spend.value || 0;
        const platformCtr = platformImpressions > 0 ? (platformClicks / platformImpressions) * 100 : 0;

        return {
          platform: bucket.key,
          impressions: platformImpressions,
          clicks: platformClicks,
          spend: platformSpend,
          ctr: platformCtr,
        };
      });

      return {
        timeSeries,
        totals: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          spend: totalSpend,
          revenue: totalRevenue,
          ctr,
          cpc,
          cpm,
          roas,
        },
        topCampaigns,
        platformBreakdown,
      };
    } catch (error) {
      logger.error('Failed to get platform analytics:', error);
      throw error;
    }
  }

  /**
   * Get revenue analytics and external network performance
   */
  static async getRevenueAnalytics(options: {
    startDate: Date;
    endDate: Date;
    granularity: string;
  }): Promise<any> {
    try {
      const { startDate, endDate, granularity } = options;

      // Get business ad revenue
      const businessRevenueResponse = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
              {
                bool: {
                  should: [
                    { term: { eventType: 'impression' } },
                    { term: { eventType: 'click' } },
                  ],
                },
              },
            ],
          },
        },
        aggs: {
          time_series: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: granularity as any,
              time_zone: 'UTC',
            },
            aggs: {
              revenue: { sum: { field: 'cost' } },
            },
          },
          total_revenue: { sum: { field: 'cost' } },
          campaign_revenue: {
            terms: { field: 'campaignId', size: 20 },
            aggs: {
              revenue: { sum: { field: 'cost' } },
            },
          },
        },
        size: 0,
      });

      const businessAggs = businessRevenueResponse.aggregations as any;

      // Get external network data (mock data for now - would integrate with actual APIs)
      const externalNetworks = await prisma.externalAdNetwork.findMany({
        where: { isActive: true },
        select: { id: true, name: true, displayName: true, revenueShare: true },
      });

      // Mock external network revenue data
      const externalNetworkRevenue = externalNetworks.map(network => ({
        networkId: network.id,
        networkName: network.displayName,
        revenue: Math.random() * 10000, // Mock data
        impressions: Math.floor(Math.random() * 100000),
        clicks: Math.floor(Math.random() * 5000),
        platformShare: network.revenueShare.toNumber(),
      }));

      const timeSeries = businessAggs.time_series.buckets.map((bucket: any) => ({
        timestamp: bucket.key_as_string,
        businessRevenue: bucket.revenue.value || 0,
        externalRevenue: Math.random() * 1000, // Mock external revenue
        totalRevenue: (bucket.revenue.value || 0) + Math.random() * 1000,
      }));

      // Get campaign details for revenue breakdown
      const topCampaignIds = businessAggs.campaign_revenue.buckets.map((bucket: any) => bucket.key);
      const campaignDetails = await prisma.adCampaign.findMany({
        where: { id: { in: topCampaignIds } },
        select: { id: true, name: true, business: { select: { businessName: true } } },
      });

      const campaignRevenue = businessAggs.campaign_revenue.buckets.map((bucket: any) => {
        const campaign = campaignDetails.find(c => c.id === bucket.key);
        return {
          campaignId: bucket.key,
          campaignName: campaign?.name || 'Unknown',
          businessName: campaign?.business?.businessName || 'Unknown',
          revenue: bucket.revenue.value || 0,
        };
      });

      return {
        timeSeries,
        totals: {
          businessRevenue: businessAggs.total_revenue.value || 0,
          externalRevenue: externalNetworkRevenue.reduce((sum, network) => sum + network.revenue, 0),
          totalRevenue: (businessAggs.total_revenue.value || 0) + externalNetworkRevenue.reduce((sum, network) => sum + network.revenue, 0),
        },
        campaignRevenue,
        externalNetworkRevenue,
      };
    } catch (error) {
      logger.error('Failed to get revenue analytics:', error);
      throw error;
    }
  }

  /**
   * Get external network performance monitoring
   */
  static async getExternalNetworkPerformance(options: {
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    try {
      const { startDate, endDate } = options;

      // Get external network configurations
      const networks = await prisma.externalAdNetwork.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
      });

      // Mock performance data for external networks
      const networkPerformance = networks.map(network => {
        const uptime = 95 + Math.random() * 5; // 95-100% uptime
        const avgResponseTime = 50 + Math.random() * 100; // 50-150ms
        const errorRate = Math.random() * 2; // 0-2% error rate
        const fillRate = 80 + Math.random() * 20; // 80-100% fill rate

        return {
          networkId: network.id,
          networkName: network.displayName,
          priority: network.priority,
          isActive: network.isActive,
          revenueShare: network.revenueShare.toNumber(),
          performance: {
            uptime: parseFloat(uptime.toFixed(2)),
            avgResponseTime: parseFloat(avgResponseTime.toFixed(0)),
            errorRate: parseFloat(errorRate.toFixed(2)),
            fillRate: parseFloat(fillRate.toFixed(2)),
          },
          metrics: {
            requests: Math.floor(Math.random() * 10000),
            fills: Math.floor(Math.random() * 8000),
            revenue: Math.random() * 5000,
            impressions: Math.floor(Math.random() * 50000),
            clicks: Math.floor(Math.random() * 2500),
          },
          healthStatus: uptime > 98 && errorRate < 1 ? 'healthy' : uptime > 95 ? 'warning' : 'critical',
        };
      });

      // Calculate overall external network health
      const overallHealth = {
        totalNetworks: networks.length,
        activeNetworks: networks.filter(n => n.isActive).length,
        healthyNetworks: networkPerformance.filter(n => n.healthStatus === 'healthy').length,
        warningNetworks: networkPerformance.filter(n => n.healthStatus === 'warning').length,
        criticalNetworks: networkPerformance.filter(n => n.healthStatus === 'critical').length,
        avgUptime: networkPerformance.reduce((sum, n) => sum + n.performance.uptime, 0) / networkPerformance.length,
        avgResponseTime: networkPerformance.reduce((sum, n) => sum + n.performance.avgResponseTime, 0) / networkPerformance.length,
        totalRevenue: networkPerformance.reduce((sum, n) => sum + n.metrics.revenue, 0),
      };

      return {
        networkPerformance,
        overallHealth,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get external network performance:', error);
      throw error;
    }
  }

  /**
   * Get system health metrics for ad serving performance
   */
  static async getSystemHealthMetrics(): Promise<any> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent ad serving metrics
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          range: {
            timestamp: {
              gte: oneHourAgo.toISOString(),
              lte: now.toISOString(),
            },
          },
        },
        aggs: {
          total_requests: { value_count: { field: 'timestamp' } },
          impressions: {
            filter: { term: { eventType: 'impression' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              valid_impressions: {
                filter: { term: { isValid: true } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
            },
          },
          clicks: {
            filter: { term: { eventType: 'click' } },
            aggs: {
              count: { value_count: { field: 'timestamp' } },
              valid_clicks: {
                filter: { term: { isValid: true } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
            },
          },
          fraud_score_stats: {
            filter: {
              bool: {
                should: [
                  { term: { eventType: 'impression' } },
                  { term: { eventType: 'click' } },
                ],
              },
            },
            aggs: {
              avg_fraud_score: { avg: { field: 'fraudScore' } },
              high_risk_events: {
                filter: { range: { fraudScore: { gte: this.FRAUD_THRESHOLD } } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;

      // Get database health metrics
      const activeCampaigns = await prisma.adCampaign.count({
        where: { status: 'active' },
      });

      const pendingApprovals = await prisma.adApproval.count({
        where: { status: 'pending' },
      });

      const totalBusinesses = await prisma.user.count({
        where: { businessName: { not: null } },
      });

      // Calculate system health metrics
      const totalRequests = aggs.total_requests.value || 0;
      const totalImpressions = aggs.impressions.count.value || 0;
      const validImpressions = aggs.impressions.valid_impressions.count.value || 0;
      const totalClicks = aggs.clicks.count.value || 0;
      const validClicks = aggs.clicks.valid_clicks.count.value || 0;
      const avgFraudScore = aggs.fraud_score_stats.avg_fraud_score.value || 0;
      const highRiskEvents = aggs.fraud_score_stats.high_risk_events.count.value || 0;

      const impressionValidityRate = totalImpressions > 0 ? (validImpressions / totalImpressions) * 100 : 100;
      const clickValidityRate = totalClicks > 0 ? (validClicks / totalClicks) * 100 : 100;
      const fraudRate = totalRequests > 0 ? (highRiskEvents / totalRequests) * 100 : 0;

      // Determine overall system health
      let systemStatus = 'healthy';
      if (impressionValidityRate < 95 || clickValidityRate < 95 || fraudRate > 5) {
        systemStatus = 'warning';
      }
      if (impressionValidityRate < 90 || clickValidityRate < 90 || fraudRate > 10) {
        systemStatus = 'critical';
      }

      return {
        systemStatus,
        metrics: {
          adServing: {
            totalRequests,
            totalImpressions,
            totalClicks,
            impressionValidityRate: parseFloat(impressionValidityRate.toFixed(2)),
            clickValidityRate: parseFloat(clickValidityRate.toFixed(2)),
          },
          fraudDetection: {
            avgFraudScore: parseFloat(avgFraudScore.toFixed(2)),
            highRiskEvents,
            fraudRate: parseFloat(fraudRate.toFixed(2)),
          },
          database: {
            activeCampaigns,
            pendingApprovals,
            totalBusinesses,
          },
        },
        alerts: [
          ...(impressionValidityRate < 95 ? ['Low impression validity rate detected'] : []),
          ...(clickValidityRate < 95 ? ['Low click validity rate detected'] : []),
          ...(fraudRate > 5 ? ['High fraud rate detected'] : []),
          ...(pendingApprovals > 50 ? ['High number of pending approvals'] : []),
        ],
        lastUpdated: now,
      };
    } catch (error) {
      logger.error('Failed to get system health metrics:', error);
      throw error;
    }
  }

  /**
   * Get top performing campaigns and businesses
   */
  static async getTopPerformers(options: {
    startDate: Date;
    endDate: Date;
    limit: number;
  }): Promise<any> {
    try {
      const { startDate, endDate, limit } = options;

      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
              { term: { eventType: 'impression' } },
            ],
          },
        },
        aggs: {
          top_campaigns: {
            terms: { field: 'campaignId', size: limit },
            aggs: {
              impressions: { value_count: { field: 'timestamp' } },
              clicks: {
                filter: { term: { eventType: 'click' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
              spend: { sum: { field: 'cost' } },
              conversions: {
                filter: { term: { eventType: 'conversion' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;

      // Get campaign and business details
      const campaignIds = aggs.top_campaigns.buckets.map((bucket: any) => bucket.key);
      const campaigns = await prisma.adCampaign.findMany({
        where: { id: { in: campaignIds } },
        include: {
          business: {
            select: { id: true, businessName: true, email: true },
          },
        },
      });

      const topCampaigns = aggs.top_campaigns.buckets.map((bucket: any) => {
        const campaign = campaigns.find(c => c.id === bucket.key);
        const impressions = bucket.impressions.value;
        const clicks = bucket.clicks.count.value || 0;
        const spend = bucket.spend.value || 0;
        const conversions = bucket.conversions.count.value || 0;
        const revenue = bucket.conversions.value.value || 0;

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const roas = spend > 0 ? revenue / spend : 0;

        return {
          campaignId: bucket.key,
          campaignName: campaign?.name || 'Unknown',
          businessId: campaign?.businessId,
          businessName: campaign?.business?.businessName || 'Unknown',
          businessEmail: campaign?.business?.email,
          metrics: {
            impressions,
            clicks,
            conversions,
            spend,
            revenue,
            ctr: parseFloat(ctr.toFixed(2)),
            cpc: parseFloat(cpc.toFixed(2)),
            roas: parseFloat(roas.toFixed(2)),
          },
        };
      });

      // Aggregate by business
      const businessPerformance = new Map();
      topCampaigns.forEach((campaign: any) => {
        const businessId = campaign.businessId;
        if (!businessPerformance.has(businessId)) {
          businessPerformance.set(businessId, {
            businessId,
            businessName: campaign.businessName,
            businessEmail: campaign.businessEmail,
            campaignCount: 0,
            metrics: {
              impressions: 0,
              clicks: 0,
              conversions: 0,
              spend: 0,
              revenue: 0,
            },
          });
        }

        const business = businessPerformance.get(businessId);
        business.campaignCount++;
        business.metrics.impressions += campaign.metrics.impressions;
        business.metrics.clicks += campaign.metrics.clicks;
        business.metrics.conversions += campaign.metrics.conversions;
        business.metrics.spend += campaign.metrics.spend;
        business.metrics.revenue += campaign.metrics.revenue;
      });

      const topBusinesses = Array.from(businessPerformance.values())
        .map(business => ({
          ...business,
          metrics: {
            ...business.metrics,
            ctr: business.metrics.impressions > 0 ? (business.metrics.clicks / business.metrics.impressions) * 100 : 0,
            cpc: business.metrics.clicks > 0 ? business.metrics.spend / business.metrics.clicks : 0,
            roas: business.metrics.spend > 0 ? business.metrics.revenue / business.metrics.spend : 0,
          },
        }))
        .sort((a, b) => b.metrics.spend - a.metrics.spend)
        .slice(0, limit);

      return {
        topCampaigns,
        topBusinesses,
      };
    } catch (error) {
      logger.error('Failed to get top performers:', error);
      throw error;
    }
  }

  /**
   * Get fraud detection analytics and alerts
   */
  static async getFraudDetectionAnalytics(options: {
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    try {
      const { startDate, endDate } = options;

      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
              {
                bool: {
                  should: [
                    { term: { eventType: 'impression' } },
                    { term: { eventType: 'click' } },
                  ],
                },
              },
            ],
          },
        },
        aggs: {
          fraud_stats: {
            global: {},
            aggs: {
              total_events: { value_count: { field: 'timestamp' } },
              valid_events: {
                filter: { term: { isValid: true } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
              high_risk_events: {
                filter: { range: { fraudScore: { gte: this.FRAUD_THRESHOLD } } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
              fraud_score_distribution: {
                histogram: {
                  field: 'fraudScore',
                  interval: 10,
                  min_doc_count: 1,
                },
              },
              top_risky_ips: {
                filter: { range: { fraudScore: { gte: 50 } } },
                aggs: {
                  ips: {
                    terms: { field: 'ipAddress', size: 10 },
                    aggs: {
                      avg_fraud_score: { avg: { field: 'fraudScore' } },
                      event_count: { value_count: { field: 'timestamp' } },
                    },
                  },
                },
              },
            },
          },
          time_series: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: 'hour',
              time_zone: 'UTC',
            },
            aggs: {
              total_events: { value_count: { field: 'timestamp' } },
              fraud_events: {
                filter: { range: { fraudScore: { gte: this.FRAUD_THRESHOLD } } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                },
              },
              avg_fraud_score: { avg: { field: 'fraudScore' } },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;

      const totalEvents = aggs.fraud_stats.total_events.value || 0;
      const validEvents = aggs.fraud_stats.valid_events.count.value || 0;
      const highRiskEvents = aggs.fraud_stats.high_risk_events.count.value || 0;

      const fraudRate = totalEvents > 0 ? ((totalEvents - validEvents) / totalEvents) * 100 : 0;
      const highRiskRate = totalEvents > 0 ? (highRiskEvents / totalEvents) * 100 : 0;

      const timeSeries = aggs.time_series.buckets.map((bucket: any) => ({
        timestamp: bucket.key_as_string,
        totalEvents: bucket.total_events.value,
        fraudEvents: bucket.fraud_events.count.value || 0,
        avgFraudScore: bucket.avg_fraud_score.value || 0,
        fraudRate: bucket.total_events.value > 0 ? ((bucket.fraud_events.count.value || 0) / bucket.total_events.value) * 100 : 0,
      }));

      const fraudScoreDistribution = aggs.fraud_stats.fraud_score_distribution.buckets.map((bucket: any) => ({
        scoreRange: `${bucket.key}-${bucket.key + 10}`,
        count: bucket.doc_count,
      }));

      const topRiskyIPs = aggs.fraud_stats.top_risky_ips.ips.buckets.map((bucket: any) => ({
        ipAddress: bucket.key,
        avgFraudScore: parseFloat((bucket.avg_fraud_score.value || 0).toFixed(2)),
        eventCount: bucket.event_count.value,
      }));

      // Generate alerts based on fraud patterns
      const alerts = [];
      if (fraudRate > 10) {
        alerts.push({
          type: 'high_fraud_rate',
          severity: 'critical',
          message: `High fraud rate detected: ${fraudRate.toFixed(2)}%`,
          timestamp: new Date(),
        });
      }
      if (highRiskRate > 5) {
        alerts.push({
          type: 'high_risk_events',
          severity: 'warning',
          message: `High number of high-risk events: ${highRiskRate.toFixed(2)}%`,
          timestamp: new Date(),
        });
      }

      return {
        summary: {
          totalEvents,
          validEvents,
          fraudEvents: totalEvents - validEvents,
          highRiskEvents,
          fraudRate: parseFloat(fraudRate.toFixed(2)),
          highRiskRate: parseFloat(highRiskRate.toFixed(2)),
        },
        timeSeries,
        fraudScoreDistribution,
        topRiskyIPs,
        alerts,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get fraud detection analytics:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive admin dashboard data
   */
  static async getAdminDashboardData(): Promise<any> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get platform overview metrics
      const platformMetrics = await this.getPlatformAnalytics({
        startDate: last24Hours,
        endDate: now,
        granularity: 'hour',
      });

      // Get system health
      const systemHealth = await this.getSystemHealthMetrics();

      // Get revenue analytics
      const revenueAnalytics = await this.getRevenueAnalytics({
        startDate: last7Days,
        endDate: now,
        granularity: 'day',
      });

      // Get fraud detection summary
      const fraudAnalytics = await this.getFraudDetectionAnalytics({
        startDate: last24Hours,
        endDate: now,
      });

      // Get database statistics
      const dbStats = await Promise.all([
        prisma.adCampaign.count(),
        prisma.adCampaign.count({ where: { status: 'active' } }),
        prisma.adCampaign.count({ where: { status: 'pending_approval' } }),
        prisma.adApproval.count({ where: { status: 'pending' } }),
        prisma.user.count({ where: { businessName: { not: null } } }),
        prisma.advertisement.count(),
      ]);

      const [
        totalCampaigns,
        activeCampaigns,
        pendingCampaigns,
        pendingApprovals,
        totalBusinesses,
        totalAds,
      ] = dbStats;

      // Get top performers
      const topPerformers = await this.getTopPerformers({
        startDate: last7Days,
        endDate: now,
        limit: 5,
      });

      // Get external network status
      const externalNetworkPerformance = await this.getExternalNetworkPerformance({
        startDate: last24Hours,
        endDate: now,
      });

      return {
        overview: {
          totalCampaigns,
          activeCampaigns,
          pendingCampaigns,
          pendingApprovals,
          totalBusinesses,
          totalAds,
        },
        platformMetrics: {
          last24Hours: platformMetrics.totals,
          timeSeries: platformMetrics.timeSeries.slice(-24), // Last 24 hours
        },
        systemHealth,
        revenueAnalytics: {
          totals: revenueAnalytics.totals,
          timeSeries: revenueAnalytics.timeSeries.slice(-7), // Last 7 days
        },
        fraudAnalytics: {
          summary: fraudAnalytics.summary,
          alerts: fraudAnalytics.alerts,
        },
        topPerformers: {
          campaigns: topPerformers.topCampaigns.slice(0, 5),
          businesses: topPerformers.topBusinesses.slice(0, 5),
        },
        externalNetworks: {
          overallHealth: externalNetworkPerformance.overallHealth,
          networkStatus: externalNetworkPerformance.networkPerformance.map((network: any) => ({
            name: network.networkName,
            status: network.healthStatus,
            uptime: network.performance.uptime,
            revenue: network.metrics.revenue,
          })),
        },
        lastUpdated: now,
      };
    } catch (error) {
      logger.error('Failed to get admin dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get campaign analytics with date range and granularity
   */
  static async getCampaignAnalytics(
    campaignId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      granularity?: 'hour' | 'day' | 'week' | 'month';
    }
  ): Promise<any> {
    try {
      const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = options.endDate || new Date();
      const granularity = options.granularity || 'day';

      // Get aggregated analytics data
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { campaignId } },
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          time_series: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: granularity as any,
              time_zone: 'UTC',
            },
            aggs: {
              impressions: {
                filter: { term: { eventType: 'impression' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              clicks: {
                filter: { term: { eventType: 'click' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              conversions: {
                filter: { term: { eventType: 'conversion' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
          totals: {
            global: {},
            aggs: {
              total_impressions: {
                filter: {
                  bool: {
                    must: [
                      { term: { campaignId } },
                      { term: { eventType: 'impression' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_clicks: {
                filter: {
                  bool: {
                    must: [
                      { term: { campaignId } },
                      { term: { eventType: 'click' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_conversions: {
                filter: {
                  bool: {
                    must: [
                      { term: { campaignId } },
                      { term: { eventType: 'conversion' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;
      const timeSeries = aggs.time_series.buckets.map((bucket: any) => ({
        date: bucket.key_as_string,
        impressions: bucket.impressions.count.value || 0,
        clicks: bucket.clicks.count.value || 0,
        conversions: bucket.conversions.count.value || 0,
        spend: (bucket.impressions.cost.value || 0) + (bucket.clicks.cost.value || 0),
        revenue: bucket.conversions.value.value || 0,
      }));

      const totals = aggs.totals;
      const totalImpressions = totals.total_impressions.count.value || 0;
      const totalClicks = totals.total_clicks.count.value || 0;
      const totalConversions = totals.total_conversions.count.value || 0;
      const totalSpend = (totals.total_impressions.cost.value || 0) + (totals.total_clicks.cost.value || 0);
      const totalRevenue = totals.total_conversions.value.value || 0;

      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      return {
        campaignId,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        granularity,
        summary: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          spend: totalSpend,
          revenue: totalRevenue,
          ctr,
          cpc,
          cpm,
          roas,
        },
        timeSeries,
      };
    } catch (error) {
      logger.error('Failed to get campaign analytics:', error);
      throw error;
    }
  }



  /**
   * Get business analytics overview for all campaigns
   */
  static async getBusinessAnalyticsOverview(
    businessId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<any> {
    try {
      const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = options.endDate || new Date();

      // Get all campaigns for the business
      const campaigns = await prisma.adCampaign.findMany({
        where: {
          businessId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          name: true,
          status: true,
          budget: true,
          spentAmount: true,
        },
      });

      const campaignIds = campaigns.map(c => c.id);

      if (campaignIds.length === 0) {
        return {
          businessId,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          summary: {
            totalCampaigns: 0,
            activeCampaigns: 0,
            totalBudget: 0,
            totalSpent: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            ctr: 0,
            cpc: 0,
            roas: 0,
          },
          campaigns: [],
          topPerformingCampaigns: [],
        };
      }

      // Get aggregated analytics for all campaigns
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { terms: { campaignId: campaignIds } },
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          by_campaign: {
            terms: {
              field: 'campaignId',
              size: campaignIds.length,
            },
            aggs: {
              impressions: {
                filter: { term: { eventType: 'impression' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              clicks: {
                filter: { term: { eventType: 'click' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              conversions: {
                filter: { term: { eventType: 'conversion' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
          totals: {
            global: {},
            aggs: {
              total_impressions: {
                filter: {
                  bool: {
                    must: [
                      { terms: { campaignId: campaignIds } },
                      { term: { eventType: 'impression' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_clicks: {
                filter: {
                  bool: {
                    must: [
                      { terms: { campaignId: campaignIds } },
                      { term: { eventType: 'click' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              total_conversions: {
                filter: {
                  bool: {
                    must: [
                      { terms: { campaignId: campaignIds } },
                      { term: { eventType: 'conversion' } },
                      {
                        range: {
                          timestamp: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString(),
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
        },
        size: 0,
      });

      const aggs = response.aggregations as any;
      const campaignStats = new Map();

      // Process campaign-specific stats
      aggs.by_campaign.buckets.forEach((bucket: any) => {
        const campaignId = bucket.key;
        const impressions = bucket.impressions.count.value || 0;
        const clicks = bucket.clicks.count.value || 0;
        const conversions = bucket.conversions.count.value || 0;
        const spend = (bucket.impressions.cost.value || 0) + (bucket.clicks.cost.value || 0);
        const revenue = bucket.conversions.value.value || 0;

        campaignStats.set(campaignId, {
          impressions,
          clicks,
          conversions,
          spend,
          revenue,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          roas: spend > 0 ? revenue / spend : 0,
        });
      });

      // Calculate totals
      const totals = aggs.totals;
      const totalImpressions = totals.total_impressions.count.value || 0;
      const totalClicks = totals.total_clicks.count.value || 0;
      const totalConversions = totals.total_conversions.count.value || 0;
      const totalSpent = (totals.total_impressions.cost.value || 0) + (totals.total_clicks.cost.value || 0);
      const totalRevenue = totals.total_conversions.value.value || 0;

      const totalBudget = campaigns.reduce((sum, c) => sum + c.budget.toNumber(), 0);
      const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
      const roas = totalSpent > 0 ? totalRevenue / totalSpent : 0;

      // Prepare campaign details with performance data
      const campaignDetails = campaigns.map(campaign => {
        const stats = campaignStats.get(campaign.id) || {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          roas: 0,
        };

        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          budget: campaign.budget.toNumber(),
          spent: campaign.spentAmount.toNumber(),
          ...stats,
        };
      });

      // Get top performing campaigns (by ROAS)
      const topPerformingCampaigns = campaignDetails
        .filter(c => c.roas > 0)
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 5);

      return {
        businessId,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalCampaigns: campaigns.length,
          activeCampaigns,
          totalBudget,
          totalSpent,
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          ctr,
          cpc,
          roas,
        },
        campaigns: campaignDetails,
        topPerformingCampaigns,
      };
    } catch (error) {
      logger.error('Failed to get business analytics overview:', error);
      throw error;
    }
  }

  /**
   * Detect impression fraud
   */
  private static async detectImpressionFraud(impressionData: ImpressionEvent): Promise<FraudDetectionResult> {
    let riskScore = 0;
    const reasons: string[] = [];

    try {
      // Check impression frequency from same IP
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentImpressions = await elasticsearch.count({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { eventType: 'impression' } },
              { term: { ipAddress: impressionData.ipAddress } },
              {
                range: {
                  timestamp: {
                    gte: oneMinuteAgo.toISOString(),
                  },
                },
              },
            ],
          },
        },
      });

      if (recentImpressions.count > this.MAX_IMPRESSIONS_PER_IP_PER_MINUTE) {
        riskScore += 40;
        reasons.push('High impression frequency from IP');
      }

      // Check for suspicious user agent patterns
      const suspiciousUserAgents = ['bot', 'crawler', 'spider', 'scraper'];
      if (suspiciousUserAgents.some(pattern => 
        impressionData.userAgent.toLowerCase().includes(pattern)
      )) {
        riskScore += 30;
        reasons.push('Suspicious user agent');
      }

      // Check for very short view duration (if provided)
      if (impressionData.viewDuration !== undefined && impressionData.viewDuration < 100) {
        riskScore += 20;
        reasons.push('Very short view duration');
      }

      // Check for non-viewable impressions
      if (impressionData.isViewable === false) {
        riskScore += 25;
        reasons.push('Non-viewable impression');
      }

      // Determine action based on risk score
      let action: 'allow' | 'flag' | 'block';
      if (riskScore >= this.FRAUD_THRESHOLD) {
        action = 'block';
      } else if (riskScore >= 40) {
        action = 'flag';
      } else {
        action = 'allow';
      }

      return {
        isValid: action !== 'block',
        riskScore,
        reasons,
        action,
      };
    } catch (error) {
      logger.error('Error in fraud detection:', error);
      // Default to allowing with low risk if fraud detection fails
      return {
        isValid: true,
        riskScore: 10,
        reasons: ['Fraud detection error'],
        action: 'allow',
      };
    }
  }

  /**
   * Detect click fraud
   */
  private static async detectClickFraud(clickData: ClickEvent): Promise<FraudDetectionResult> {
    let riskScore = 0;
    const reasons: string[] = [];

    try {
      // Check click frequency from same IP
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentClicks = await elasticsearch.count({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { eventType: 'click' } },
              { term: { ipAddress: clickData.ipAddress } },
              {
                range: {
                  timestamp: {
                    gte: oneHourAgo.toISOString(),
                  },
                },
              },
            ],
          },
        },
      });

      if (recentClicks.count > this.MAX_CLICKS_PER_IP_PER_HOUR) {
        riskScore += 50;
        reasons.push('High click frequency from IP');
      }

      // Check for suspicious user agent patterns
      const suspiciousUserAgents = ['bot', 'crawler', 'spider', 'scraper'];
      if (suspiciousUserAgents.some(pattern => 
        clickData.userAgent.toLowerCase().includes(pattern)
      )) {
        riskScore += 40;
        reasons.push('Suspicious user agent');
      }

      // Check for missing referrer (could indicate direct bot access)
      if (!clickData.referrerUrl) {
        riskScore += 15;
        reasons.push('Missing referrer URL');
      }

      // Check for rapid clicks from same session
      if (clickData.sessionId) {
        const sessionClicks = await elasticsearch.count({
          index: this.AD_ANALYTICS_INDEX,
          query: {
            bool: {
              must: [
                { term: { eventType: 'click' } },
                { term: { sessionId: clickData.sessionId } },
                {
                  range: {
                    timestamp: {
                      gte: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Last 5 minutes
                    },
                  },
                },
              ],
            },
          },
        });

        if (sessionClicks.count > 5) {
          riskScore += 35;
          reasons.push('Rapid clicks from same session');
        }
      }

      // Determine action based on risk score
      let action: 'allow' | 'flag' | 'block';
      if (riskScore >= this.FRAUD_THRESHOLD) {
        action = 'block';
      } else if (riskScore >= 40) {
        action = 'flag';
      } else {
        action = 'allow';
      }

      return {
        isValid: action !== 'block',
        riskScore,
        reasons,
        action,
      };
    } catch (error) {
      logger.error('Error in click fraud detection:', error);
      // Default to allowing with low risk if fraud detection fails
      return {
        isValid: true,
        riskScore: 10,
        reasons: ['Fraud detection error'],
        action: 'allow',
      };
    }
  }

  /**
   * Aggregate daily analytics
   */
  static async aggregateDailyAnalytics(date?: Date): Promise<void> {
    try {
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all campaigns that had activity on this date
      const response = await elasticsearch.search({
        index: this.AD_ANALYTICS_INDEX,
        query: {
          range: {
            timestamp: {
              gte: startOfDay.toISOString(),
              lte: endOfDay.toISOString(),
            },
          },
        },
        aggs: {
          campaigns: {
            terms: { field: 'campaignId', size: 1000 },
            aggs: {
              impressions: {
                filter: { term: { eventType: 'impression' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              clicks: {
                filter: { term: { eventType: 'click' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  cost: { sum: { field: 'cost' } },
                },
              },
              conversions: {
                filter: { term: { eventType: 'conversion' } },
                aggs: {
                  count: { value_count: { field: 'timestamp' } },
                  value: { sum: { field: 'conversionValue' } },
                },
              },
            },
          },
        },
        size: 0,
      });

      const campaigns = (response.aggregations as any).campaigns.buckets;

      // Process each campaign's daily analytics
      for (const campaign of campaigns) {
        const campaignId = campaign.key;
        const impressions = campaign.impressions.count.value || 0;
        const clicks = campaign.clicks.count.value || 0;
        const conversions = campaign.conversions.count.value || 0;
        const spend = (campaign.impressions.cost.value || 0) + (campaign.clicks.cost.value || 0);
        const revenue = campaign.conversions.value.value || 0;

        // Calculate metrics
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const roas = spend > 0 ? revenue / spend : 0;

        // Upsert daily analytics record
        await prisma.adAnalytics.upsert({
          where: {
            campaignId_date: {
              campaignId,
              date: startOfDay,
            },
          },
          update: {
            impressions,
            clicks,
            conversions,
            spend,
            revenue,
            ctr,
            cpc,
            cpm,
            roas,
            updatedAt: new Date(),
          },
          create: {
            campaignId,
            date: startOfDay,
            impressions,
            clicks,
            conversions,
            spend,
            revenue,
            ctr,
            cpc,
            cpm,
            roas,
          },
        });
      }

      logger.info(`Daily analytics aggregated for ${targetDate.toISOString().split('T')[0]}`);
    } catch (error) {
      logger.error('Failed to aggregate daily analytics:', error);
      throw error;
    }
  }

  /**
   * Deduct cost from campaign budget
   */
  private static async deductCampaignCost(campaignId: string, cost: number): Promise<void> {
    try {
      // Update campaign spent amount
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: {
          spentAmount: {
            increment: cost,
          },
        },
      });

      // Check if budget is exhausted and pause campaign if needed
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
      });

      if (campaign && campaign.spentAmount >= campaign.budget) {
        await prisma.adCampaign.update({
          where: { id: campaignId },
          data: { status: 'paused' },
        });

        logger.info(`Campaign ${campaignId} paused due to budget exhaustion`);
      }
    } catch (error) {
      logger.error('Failed to deduct campaign cost:', error);
      throw error;
    }
  }

  /**
   * Database fallback for platform analytics when Elasticsearch is not available
   */
  static async getPlatformAnalyticsFromDatabase(options: {
    startDate: Date;
    endDate: Date;
    granularity: string;
    platform?: string;
    businessId?: string;
  }): Promise<any> {
    try {
      const { startDate, endDate, platform, businessId } = options;

      // Build where clause for campaigns
      const campaignWhere: any = {};
      if (businessId) {
        campaignWhere.businessId = businessId;
      }

      // Get all campaigns that match the criteria
      const campaigns = await prisma.adCampaign.findMany({
        where: campaignWhere,
        include: {
          business: {
            select: {
              id: true,
              businessName: true,
              email: true,
            },
          },
          ads: {
            include: {
              impressions: {
                where: {
                  createdAt: {
                    gte: startDate,
                    lte: endDate,
                  },
                  ...(platform && platform !== 'all' && { platform }),
                },
              },
              clicks: {
                where: {
                  createdAt: {
                    gte: startDate,
                    lte: endDate,
                  },
                },
              },
            },
          },
        },
      });

      // Calculate totals from database data
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalSpend = 0;
      const platformBreakdown: any = {};

      campaigns.forEach(campaign => {
        campaign.ads.forEach(ad => {
          ad.impressions.forEach(impression => {
            totalImpressions++;
            totalSpend += Number(impression.cost);
            
            // Platform breakdown
            if (!platformBreakdown[impression.platform]) {
              platformBreakdown[impression.platform] = {
                platform: impression.platform,
                impressions: 0,
                spend: 0,
              };
            }
            platformBreakdown[impression.platform].impressions++;
            platformBreakdown[impression.platform].spend += Number(impression.cost);
          });

          ad.clicks.forEach(click => {
            totalClicks++;
            totalSpend += Number(click.cost);
          });
        });
      });

      // Calculate derived metrics
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

      // Generate simple time series (for now, just return empty array)
      const timeSeries: any[] = [];

      // Get top campaigns
      const topCampaigns = campaigns
        .map(campaign => {
          const campaignImpressions = campaign.ads.reduce((sum, ad) => sum + ad.impressions.length, 0);
          const campaignClicks = campaign.ads.reduce((sum, ad) => sum + ad.clicks.length, 0);
          const campaignSpend = campaign.ads.reduce((sum, ad) => 
            sum + ad.impressions.reduce((impSum, imp) => impSum + Number(imp.cost), 0) +
            ad.clicks.reduce((clickSum, click) => clickSum + Number(click.cost), 0), 0
          );

          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            businessId: campaign.businessId,
            businessName: campaign.business.businessName || 'Unknown Business',
            businessEmail: campaign.business.email,
            metrics: {
              impressions: campaignImpressions,
              clicks: campaignClicks,
              conversions: 0, // Not tracking conversions in this fallback
              spend: campaignSpend,
              revenue: 0, // Not tracking revenue in this fallback
              ctr: campaignImpressions > 0 ? (campaignClicks / campaignImpressions) * 100 : 0,
              cpc: campaignClicks > 0 ? campaignSpend / campaignClicks : 0,
              roas: 0, // Not tracking ROAS in this fallback
            },
          };
        })
        .sort((a, b) => b.metrics.impressions - a.metrics.impressions)
        .slice(0, 10);

      return {
        timeSeries,
        totals: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: 0,
          spend: totalSpend,
          revenue: 0,
          ctr,
          cpc,
          cpm,
          roas: 0,
        },
        topCampaigns,
        platformBreakdown: Object.values(platformBreakdown),
      };
    } catch (error) {
      logger.error('Failed to get platform analytics from database:', error);
      throw error;
    }
  }
}