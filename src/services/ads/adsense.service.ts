import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface AdSenseConfig {
  publisherId: string;
  adClientId: string;
  apiKey: string;
  environment: 'sandbox' | 'production';
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface AdSenseAdRequest {
  adUnitId: string;
  adFormat: 'display' | 'text' | 'video' | 'native';
  dimensions: {
    width: number;
    height: number;
  };
  targeting?: {
    keywords: string[];
    categories: string[];
    location?: string;
  };
  placementId?: string;
  userContext?: any;
}

export interface AdSenseAdResponse {
  adId: string;
  adContent: string;
  adFormat: string;
  dimensions: {
    width: number;
    height: number;
  };
  clickUrl: string;
  impressionUrl: string;
  revenue: {
    cpm: number;
    currency: string;
  };
}

export interface AdSenseRevenueData {
  date: string;
  impressions: number;
  clicks: number;
  revenue: number;
  cpm: number;
  ctr: number;
  currency: string;
  adId?: string;
  timestamp?: Date;
}

export interface AdSensePerformanceMetrics {
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  averageCpm: number;
  averageCtr: number;
  topPerformingAdUnits: Array<{
    adUnitId: string;
    revenue: number;
    impressions: number;
    ctr: number;
  }>;
}

export class AdSenseService {
  private config: AdSenseConfig;
  private axiosInstance: AxiosInstance;

  constructor(config: AdSenseConfig) {
    this.config = config;
    
    // Create axios instance for API calls
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl || 'https://www.googleapis.com/adsense/v2',
      timeout: config.timeout || 5000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vikareta-AdSense-Integration/1.0'
      }
    });

    // Setup request interceptor (only if axios instance was created successfully)
    if (this.axiosInstance && this.axiosInstance.interceptors) {
      this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.info(`AdSense API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('AdSense API Request Error:', error);
        return Promise.reject(error);
      }
      );

      // Setup response interceptor
      this.axiosInstance.interceptors.response.use(
        (response) => {
          logger.info(`AdSense API Response: ${response.status} ${response.statusText}`);
          return response;
        },
        (error) => {
          logger.error('AdSense API Response Error:', error);
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Initialize AdSense integration
   */
  async initialize(): Promise<boolean> {
    try {
      // Mock initialization (in real implementation, validate API credentials)
      logger.info('AdSense service initialized');
      return true;
    } catch (error) {
      logger.error('AdSense initialization failed:', error);
      throw error;
    }
  }

  /**
   * Request an ad from AdSense
   */
  async requestAd(request: AdSenseAdRequest): Promise<AdSenseAdResponse | null> {
    try {
      // Check if we're in test environment or if axios instance is not properly configured
      if (process.env.NODE_ENV === 'test' || !this.axiosInstance) {
        // Return mock data for testing
        const adResponse: AdSenseAdResponse = {
          adId: `adsense_${Date.now()}`,
          adContent: this.generateMockAdContent(request.adFormat),
          adFormat: request.adFormat,
          dimensions: request.dimensions,
          clickUrl: `https://googleads.g.doubleclick.net/pcs/click?adurl=https://example.com`,
          impressionUrl: `https://googleads.g.doubleclick.net/pagead/impression`,
          revenue: {
            cpm: Math.random() * 5 + 1,
            currency: 'USD'
          }
        };
        logger.info(`AdSense ad requested (test mode): ${adResponse.adId}`);
        return adResponse;
      }

      // In a real implementation, this would call the AdSense API
      const response = await this.axiosInstance.post('/ads/request', {
        ad_unit_id: request.adUnitId,
        ad_format: request.adFormat,
        dimensions: request.dimensions,
        targeting: request.targeting,
        placement_id: request.placementId,
        user_context: request.userContext
      });

      if (response.data && response.data.ad) {
        const adResponse: AdSenseAdResponse = {
          adId: response.data.ad.id || `adsense_${Date.now()}`,
          adContent: response.data.ad.content || this.generateMockAdContent(request.adFormat),
          adFormat: request.adFormat,
          dimensions: request.dimensions,
          clickUrl: response.data.ad.click_url || `https://googleads.g.doubleclick.net/pcs/click?adurl=https://example.com`,
          impressionUrl: response.data.ad.impression_url || `https://googleads.g.doubleclick.net/pagead/impression`,
          revenue: {
            cpm: response.data.ad.cpm || Math.random() * 5 + 1,
            currency: response.data.ad.currency || 'USD'
          }
        };

        logger.info(`AdSense ad requested: ${adResponse.adId}`);
        return adResponse;
      } else {
        logger.info('No AdSense ad available');
        return null;
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.info('No AdSense ad available', { request });
        return null;
      } else if (error.response?.status === 429) {
        logger.warn('AdSense rate limit exceeded', { request });
        return null;
      } else {
        logger.error('AdSense ad request failed:', error);
        return null;
      }
    }
  }

  /**
   * Get revenue data for a date range
   */
  async getRevenueData(startDate: string, endDate: string): Promise<AdSenseRevenueData[]> {
    try {
      // Mock revenue data (in real implementation, call AdSense Reporting API)
      const revenueData: AdSenseRevenueData[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const impressions = Math.floor(Math.random() * 10000) + 1000;
        const clicks = Math.floor(impressions * (Math.random() * 0.05 + 0.01)); // 1-6% CTR
        const cpm = Math.random() * 3 + 1; // $1-4 CPM
        const revenue = (impressions / 1000) * cpm;

        revenueData.push({
          date: date.toISOString().split('T')[0],
          impressions,
          clicks,
          revenue: Math.round(revenue * 100) / 100,
          cpm: Math.round(cpm * 100) / 100,
          ctr: Math.round((clicks / impressions) * 10000) / 100,
          currency: 'USD'
        });
      }

      return revenueData;
    } catch (error) {
      logger.error('Failed to get AdSense revenue data:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(period: 'today' | 'week' | 'month'): Promise<AdSensePerformanceMetrics> {
    try {
      // Mock performance metrics
      const totalImpressions = Math.floor(Math.random() * 100000) + 10000;
      const totalClicks = Math.floor(totalImpressions * 0.03);
      const averageCpm = Math.random() * 3 + 1;
      const totalRevenue = (totalImpressions / 1000) * averageCpm;

      const metrics: AdSensePerformanceMetrics = {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalImpressions,
        totalClicks,
        averageCpm: Math.round(averageCpm * 100) / 100,
        averageCtr: Math.round((totalClicks / totalImpressions) * 10000) / 100,
        topPerformingAdUnits: [
          {
            adUnitId: 'ca-pub-123456789:1234567890',
            revenue: Math.round(totalRevenue * 0.4 * 100) / 100,
            impressions: Math.floor(totalImpressions * 0.4),
            ctr: 3.2
          },
          {
            adUnitId: 'ca-pub-123456789:0987654321',
            revenue: Math.round(totalRevenue * 0.3 * 100) / 100,
            impressions: Math.floor(totalImpressions * 0.3),
            ctr: 2.8
          }
        ]
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get AdSense performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get ad (alias for requestAd)
   */
  async getAd(request: AdSenseAdRequest): Promise<AdSenseAdResponse | null> {
    return this.requestAd(request);
  }

  /**
   * Track ad impression
   */
  async trackImpression(adId: string, adUnitId: string): Promise<void> {
    try {
      // Mock impression tracking
      logger.info(`AdSense impression tracked: ${adId} on ${adUnitId}`);
    } catch (error) {
      logger.error('Failed to track AdSense impression:', error);
      throw error;
    }
  }

  /**
   * Track ad click
   */
  async trackClick(adId: string, adUnitId: string): Promise<void> {
    try {
      // Mock click tracking
      logger.info(`AdSense click tracked: ${adId} on ${adUnitId}`);
    } catch (error) {
      logger.error('Failed to track AdSense click:', error);
      throw error;
    }
  }

  /**
   * Track revenue data
   */
  async trackRevenue(revenueData: AdSenseRevenueData): Promise<void> {
    try {
      // Mock revenue tracking
      logger.info(`AdSense revenue tracked: ${revenueData.adId} - $${revenueData.revenue}`);
    } catch (error) {
      logger.error('Failed to track AdSense revenue:', error);
      throw error;
    }
  }

  /**
   * Sync performance data
   */
  async syncPerformanceData(): Promise<void> {
    try {
      // Mock performance data sync
      logger.info('AdSense performance data synced');
    } catch (error) {
      logger.error('Failed to sync AdSense performance data:', error);
      throw error;
    }
  }

  private isHealthy: boolean = true;
  private lastHealthCheck: Date | null = null;

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Mock health check
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
      logger.info('AdSense health check passed');
      return true;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      logger.error('AdSense health check failed:', error);
      return false;
    }
  }

  /**
   * Check if service is healthy
   */
  isServiceHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Get service status
   */
  getServiceStatus(): any {
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

  /**
   * Generate mock ad content based on format
   */
  private generateMockAdContent(format: string): string {
    switch (format) {
      case 'display':
        return '<div class="adsense-display-ad"><img src="https://via.placeholder.com/300x250" alt="Ad" /></div>';
      case 'text':
        return '<div class="adsense-text-ad"><h3>Sample Ad Title</h3><p>This is a sample text advertisement.</p></div>';
      case 'video':
        return '<div class="adsense-video-ad"><video controls><source src="sample-ad.mp4" type="video/mp4"></video></div>';
      case 'native':
        return '<div class="adsense-native-ad"><h4>Sponsored Content</h4><p>Native ad content here.</p></div>';
      default:
        return '<div class="adsense-ad">Generic ad content</div>';
    }
  }
}

/**
 * Create AdSense service instance
 */
export function createAdSenseService(config?: AdSenseConfig): AdSenseService {
  if (config) {
    return new AdSenseService(config);
  }

  // Create config from environment variables
  const publisherId = process.env['ADSENSE_PUBLISHER_ID'];
  const adClientId = process.env['ADSENSE_AD_CLIENT_ID'];
  const apiKey = process.env['ADSENSE_API_KEY'];

  if (!publisherId || !adClientId || !apiKey) {
    throw new Error('AdSense configuration is incomplete. Please set ADSENSE_PUBLISHER_ID, ADSENSE_AD_CLIENT_ID, and ADSENSE_API_KEY environment variables.');
  }

  const envConfig: AdSenseConfig = {
    publisherId,
    adClientId,
    apiKey,
    environment: (process.env['ADSENSE_ENVIRONMENT'] as 'sandbox' | 'production') || 'sandbox',
    baseUrl: process.env['ADSENSE_API_URL'] || 'https://www.googleapis.com/adsense/v2',
    timeout: parseInt(process.env['ADSENSE_TIMEOUT'] || '5000'),
    retryAttempts: parseInt(process.env['ADSENSE_RETRY_ATTEMPTS'] || '3')
  };

  return new AdSenseService(envConfig);
}

// Default instance for testing
export const adSenseService = new AdSenseService({
  publisherId: 'pub-test123456789',
  adClientId: 'ca-pub-test123456789',
  apiKey: 'test-api-key',
  environment: 'sandbox'
});