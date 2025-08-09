import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger';

export interface AdSenseAdRequest {
  placementId: string;
  adUnitId: string;
  dimensions: {
    width: number;
    height: number;
  };
  userContext?: {
    userId?: string;
    sessionId: string;
    ipAddress: string;
    userAgent: string;
    location?: {
      country: string;
      state: string;
      city: string;
    };
  };
}

export interface AdSenseAd {
  id: string;
  adUnitId: string;
  content: {
    html: string;
    clickUrl: string;
    impressionUrl: string;
  };
  dimensions: {
    width: number;
    height: number;
  };
  revenue: {
    estimatedEarnings: number;
    currency: string;
  };
  metadata: {
    advertiserId: string;
    campaignId: string;
    creativeId: string;
  };
}

export interface AdSenseRevenueData {
  adId: string;
  revenue: number;
  currency: string;
  timestamp: Date;
  impressions: number;
  clicks: number;
}

export interface AdSenseConfig {
  publisherId: string;
  apiKey: string;
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

export class AdSenseService {
  private client: AxiosInstance;
  private config: AdSenseConfig;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date = new Date();

  constructor(config: AdSenseConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vikareta-AdSense-Integration/1.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('AdSense API Request', {
          url: config.url,
          method: config.method,
          headers: config.headers
        });
        return config;
      },
      (error) => {
        logger.error('AdSense API Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.isHealthy = true;
        this.lastHealthCheck = new Date();
        logger.debug('AdSense API Response', {
          status: response.status,
          data: response.data
        });
        return response;
      },
      (error: AxiosError) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleApiError(error: AxiosError): void {
    if (error.response?.status && error.response.status >= 500) {
      this.isHealthy = false;
    }

    logger.error('AdSense API Error', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
  }

  async requestAd(request: AdSenseAdRequest): Promise<AdSenseAd | null> {
    try {
      if (!this.isHealthy) {
        logger.warn('AdSense service is unhealthy, skipping ad request');
        return null;
      }

      const response = await this.client.post('/ads/request', {
        publisher_id: this.config.publisherId,
        ad_unit_id: request.adUnitId,
        placement_id: request.placementId,
        dimensions: request.dimensions,
        user_context: request.userContext
      });

      if (!response.data || !response.data.ad) {
        logger.info('No AdSense ad available for request', { request });
        return null;
      }

      const adData = response.data.ad;
      return {
        id: adData.id,
        adUnitId: request.adUnitId,
        content: {
          html: adData.content.html,
          clickUrl: adData.content.click_url,
          impressionUrl: adData.content.impression_url
        },
        dimensions: adData.dimensions,
        revenue: {
          estimatedEarnings: adData.revenue.estimated_earnings,
          currency: adData.revenue.currency
        },
        metadata: {
          advertiserId: adData.metadata.advertiser_id,
          campaignId: adData.metadata.campaign_id,
          creativeId: adData.metadata.creative_id
        }
      };

    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          logger.info('No AdSense ad available', { request });
          return null;
        }
        
        if (error.response?.status === 429) {
          logger.warn('AdSense rate limit exceeded', { request });
          return null;
        }
      }

      logger.error('Failed to request AdSense ad', {
        error: error instanceof Error ? error.message : error,
        request
      });
      
      return null;
    }
  }

  async trackRevenue(revenueData: AdSenseRevenueData): Promise<void> {
    try {
      await this.client.post('/revenue/track', {
        ad_id: revenueData.adId,
        revenue: revenueData.revenue,
        currency: revenueData.currency,
        timestamp: revenueData.timestamp.toISOString(),
        impressions: revenueData.impressions,
        clicks: revenueData.clicks
      });

      logger.info('AdSense revenue tracked successfully', { revenueData });

    } catch (error) {
      logger.error('Failed to track AdSense revenue', {
        error: error instanceof Error ? error.message : error,
        revenueData
      });
      
      // Don't throw error for revenue tracking failures
      // as it shouldn't break the main ad serving flow
    }
  }

  async syncPerformanceData(): Promise<void> {
    try {
      const response = await this.client.get('/performance/sync', {
        params: {
          publisher_id: this.config.publisherId,
          date_range: 'last_24_hours'
        }
      });

      const performanceData = response.data;
      logger.info('AdSense performance data synced', {
        totalRevenue: performanceData.total_revenue,
        totalImpressions: performanceData.total_impressions,
        totalClicks: performanceData.total_clicks
      });

      // Here you would typically store this data in your analytics system
      // For now, we'll just log it

    } catch (error) {
      logger.error('Failed to sync AdSense performance data', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      this.isHealthy = response.status === 200;
      this.lastHealthCheck = new Date();
      
      logger.debug('AdSense health check completed', {
        healthy: this.isHealthy,
        timestamp: this.lastHealthCheck
      });
      
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      
      logger.error('AdSense health check failed', {
        error: error instanceof Error ? error.message : error
      });
      
      return false;
    }
  }

  isServiceHealthy(): boolean {
    // Consider service unhealthy if last health check was more than 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.isHealthy && this.lastHealthCheck > fiveMinutesAgo;
  }

  getServiceStatus(): {
    healthy: boolean;
    lastHealthCheck: Date;
    config: Omit<AdSenseConfig, 'apiKey'>;
  } {
    return {
      healthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      config: {
        publisherId: this.config.publisherId,
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts
      }
    };
  }
}

// Factory function to create AdSense service instance
export function createAdSenseService(): AdSenseService {
  const config: AdSenseConfig = {
    publisherId: process.env.ADSENSE_PUBLISHER_ID || '',
    apiKey: process.env.ADSENSE_API_KEY || '',
    baseUrl: process.env.ADSENSE_API_URL || 'https://www.googleapis.com/adsense/v2',
    timeout: parseInt(process.env.ADSENSE_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.ADSENSE_RETRY_ATTEMPTS || '3')
  };

  if (!config.publisherId || !config.apiKey) {
    throw new Error('AdSense configuration is incomplete. Please set ADSENSE_PUBLISHER_ID and ADSENSE_API_KEY environment variables.');
  }

  return new AdSenseService(config);
}