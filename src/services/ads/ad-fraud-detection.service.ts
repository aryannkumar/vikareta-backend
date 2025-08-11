import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

interface AdFraudAlert {
  id: string;
  campaignId: string;
  advertisementId: string;
  fraudType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface FraudDetectionResult {
  isFraudulent: boolean;
  confidence: number;
  reasons: string[];
  riskScore: number;
}

export class AdFraudDetectionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Detect click fraud for a click event
   */
  async detectClickFraud(clickData: {
    advertisementId: string;
    ipAddress: string;
    userAgent: string;
    userId?: string;
  }): Promise<FraudDetectionResult> {
    try {
      const reasons: string[] = [];
      let riskScore = 0;

      // Check for rapid clicking from same IP
      const recentClicks = await this.getRecentClicksByIP(clickData.ipAddress, clickData.advertisementId, 1);
      if (recentClicks > 10) {
        reasons.push('Excessive clicks from same IP address');
        riskScore += 30;
      }

      // Check for suspicious user agent
      if (this.detectSuspiciousUserAgent(clickData.userAgent)) {
        reasons.push('Suspicious user agent detected');
        riskScore += 20;
      }

      // Check for geographic anomalies
      const geoAnomaly = await this.detectGeographicAnomaly(clickData.ipAddress, clickData.userId);
      if (geoAnomaly) {
        reasons.push('Geographic anomaly detected');
        riskScore += 25;
      }

      const isFraudulent = riskScore >= 50;
      const confidence = Math.min(riskScore / 100, 1);

      if (isFraudulent) {
        await this.createAdFraudAlert({
          campaignId: '', // Will be populated from advertisement
          advertisementId: clickData.advertisementId,
          fraudType: 'click_fraud',
          severity: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : 'medium',
          description: reasons.join(', '),
          ipAddress: clickData.ipAddress,
          userAgent: clickData.userAgent,
          metadata: { riskScore, reasons },
        });
      }

      return {
        isFraudulent,
        confidence,
        reasons,
        riskScore,
      };
    } catch (error) {
      logger.error('Error detecting click fraud:', error);
      return {
        isFraudulent: false,
        confidence: 0,
        reasons: ['Error during fraud detection'],
        riskScore: 0,
      };
    }
  }

  /**
   * Detect impression fraud for an impression event
   */
  async detectImpressionFraud(impressionData: {
    advertisementId: string;
    ipAddress: string;
    userAgent: string;
    userId?: string;
  }): Promise<FraudDetectionResult> {
    try {
      const reasons: string[] = [];
      let riskScore = 0;

      // Check for rapid impressions from same IP
      const recentImpressions = await this.getRecentImpressionsByIP(impressionData.ipAddress, impressionData.advertisementId, 1);
      if (recentImpressions > 50) {
        reasons.push('Excessive impressions from same IP address');
        riskScore += 25;
      }

      // Check for suspicious user agent
      if (this.detectSuspiciousUserAgent(impressionData.userAgent)) {
        reasons.push('Suspicious user agent detected');
        riskScore += 15;
      }

      const isFraudulent = riskScore >= 40;
      const confidence = Math.min(riskScore / 100, 1);

      return {
        isFraudulent,
        confidence,
        reasons,
        riskScore,
      };
    } catch (error) {
      logger.error('Error detecting impression fraud:', error);
      return {
        isFraudulent: false,
        confidence: 0,
        reasons: ['Error during fraud detection'],
        riskScore: 0,
      };
    }
  }

  /**
   * Get recent clicks by IP address
   */
  private async getRecentClicksByIP(ipAddress: string, advertisementId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.prisma.clickRecord.count({
      where: {
        ipAddress,
        advertisementId,
        clickedAt: { gte: since },
      },
    });
  }

  /**
   * Get recent impressions by IP address
   */
  private async getRecentImpressionsByIP(ipAddress: string, advertisementId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.prisma.impressionRecord.count({
      where: {
        ipAddress,
        advertisementId,
        viewedAt: { gte: since },
      },
    });
  }

  /**
   * Detect suspicious user agent
   */
  private detectSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Detect geographic anomalies
   */
  private async detectGeographicAnomaly(_ipAddress: string, userId?: string): Promise<boolean> {
    // This would typically use a GeoIP service
    // For now, we'll implement basic checks
    if (!userId) {
      return false;
    }

    // TODO: Implement actual geographic anomaly detection
    // This would involve:
    // 1. Getting user's typical location from historical data
    // 2. Getting current location from IP address
    // 3. Comparing distances and flagging unusual patterns
    
    return false;
  }

  /**
   * Create ad fraud alert
   */
  private async createAdFraudAlert(alert: Omit<AdFraudAlert, 'id' | 'createdAt'>): Promise<AdFraudAlert> {
    try {
      const fraudAlert: AdFraudAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...alert,
        createdAt: new Date(),
      };

      // In a real implementation, this would be stored in a database
      logger.warn('Ad fraud alert created:', fraudAlert);

      // Notify security team
      await this.notifySecurityTeam(fraudAlert);

      return fraudAlert;
    } catch (error) {
      logger.error('Error creating ad fraud alert:', error);
      throw error;
    }
  }

  /**
   * Notify security team about fraud alert
   */
  private async notifySecurityTeam(alert: AdFraudAlert): Promise<void> {
    try {
      logger.warn('Security team notification for ad fraud:', {
        alertId: alert.id,
        fraudType: alert.fraudType,
        severity: alert.severity,
        campaignId: alert.campaignId,
        advertisementId: alert.advertisementId,
      });

      // TODO: Implement actual notification system
      // This could involve:
      // 1. Sending email alerts
      // 2. Slack/Teams notifications
      // 3. Creating tickets in issue tracking system
      // 4. Triggering automated responses
    } catch (error) {
      logger.error('Error notifying security team:', error);
      // Don't throw error as this is not critical for fraud detection
    }
  }

  /**
   * Get fraud statistics for a campaign
   */
  async getCampaignFraudStats(campaignId: string, days: number = 7): Promise<{
    totalClicks: number;
    fraudulentClicks: number;
    totalImpressions: number;
    fraudulentImpressions: number;
    fraudRate: number;
  }> {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get campaign advertisements
      const campaign = await this.prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          advertisements: {
            include: {
              clickRecords: {
                where: { clickedAt: { gte: since } },
              },
              impressionRecords: {
                where: { viewedAt: { gte: since } },
              },
            },
          },
        },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      let totalClicks = 0;
      let totalImpressions = 0;
      let fraudulentClicks = 0;
      let fraudulentImpressions = 0;

      for (const ad of campaign.advertisements) {
        totalClicks += ad.clickRecords.length;
        totalImpressions += ad.impressionRecords.length;

        // For demo purposes, assume 5% fraud rate
        fraudulentClicks += Math.floor(ad.clickRecords.length * 0.05);
        fraudulentImpressions += Math.floor(ad.impressionRecords.length * 0.02);
      }

      const fraudRate = totalClicks > 0 ? (fraudulentClicks / totalClicks) * 100 : 0;

      return {
        totalClicks,
        fraudulentClicks,
        totalImpressions,
        fraudulentImpressions,
        fraudRate,
      };
    } catch (error) {
      logger.error('Error getting campaign fraud stats:', error);
      return {
        totalClicks: 0,
        fraudulentClicks: 0,
        totalImpressions: 0,
        fraudulentImpressions: 0,
        fraudRate: 0,
      };
    }
  }
}

export default AdFraudDetectionService;