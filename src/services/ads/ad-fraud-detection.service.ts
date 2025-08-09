import { logger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';

// Ad fraud detection interfaces
export interface AdFraudAlert {
  id: string;
  advertisementId?: string;
  campaignId?: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  ipAddress: string;
  alertType: AdFraudAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: any;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: Date;
  resolvedAt?: Date;
}

export type AdFraudAlertType = 
  | 'click_fraud'
  | 'impression_fraud'
  | 'bot_traffic'
  | 'ip_spoofing'
  | 'click_farm'
  | 'invalid_traffic'
  | 'suspicious_pattern'
  | 'budget_manipulation'
  | 'fake_engagement';

export interface ClickFraudAnalysis {
  isValid: boolean;
  riskScore: number;
  reasons: string[];
  shouldBlock: boolean;
  shouldRefund: boolean;
}

export interface ImpressionFraudAnalysis {
  isValid: boolean;
  riskScore: number;
  reasons: string[];
  shouldBlock: boolean;
}

export interface TrafficPattern {
  ipAddress: string;
  sessionId: string;
  clickCount: number;
  impressionCount: number;
  timeWindow: string;
  isAnomalous: boolean;
  riskFactors: string[];
}

class AdFraudDetectionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  private readonly FRAUD_THRESHOLDS = {
    MAX_CLICKS_PER_IP_PER_HOUR: 10,
    MAX_CLICKS_PER_SESSION_PER_HOUR: 5,
    MAX_IMPRESSIONS_PER_IP_PER_HOUR: 100,
    MIN_TIME_BETWEEN_CLICKS: 2000, // milliseconds
    MAX_CTR_THRESHOLD: 0.15, // 15% CTR is suspicious
    MIN_VIEW_DURATION: 1000, // milliseconds for valid impression
  };

  private readonly BOT_PATTERNS = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /java/i,
    /headless/i, /phantom/i, /selenium/i,
  ];

  private readonly SUSPICIOUS_USER_AGENTS = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1',
  ];

  /**
   * Analyze click for fraud detection
   */
  async analyzeClick(clickData: {
    advertisementId: string;
    userId?: string;
    sessionId: string;
    ipAddress: string;
    userAgent: string;
    referrerUrl?: string;
    timestamp: Date;
  }): Promise<ClickFraudAnalysis> {
    try {
      const { advertisementId, userId, sessionId, ipAddress, userAgent, referrerUrl, timestamp } = clickData;
      let riskScore = 0;
      const reasons: string[] = [];

      // 1. Check for bot traffic
      const isBotTraffic = this.detectBotTraffic(userAgent);
      if (isBotTraffic) {
        riskScore += 40;
        reasons.push('Bot user agent detected');
      }

      // 2. Check click frequency from same IP
      const ipClickCount = await this.getRecentClicksByIP(ipAddress, advertisementId, 1); // 1 hour
      if (ipClickCount >= this.FRAUD_THRESHOLDS.MAX_CLICKS_PER_IP_PER_HOUR) {
        riskScore += 35;
        reasons.push(`Too many clicks from IP: ${ipClickCount} in last hour`);
      }

      // 3. Check click frequency from same session
      const sessionClickCount = await this.getRecentClicksBySession(sessionId, advertisementId, 1);
      if (sessionClickCount >= this.FRAUD_THRESHOLDS.MAX_CLICKS_PER_SESSION_PER_HOUR) {
        riskScore += 30;
        reasons.push(`Too many clicks from session: ${sessionClickCount} in last hour`);
      }

      // 4. Check time between clicks from same source
      const lastClick = await this.getLastClickFromSource(ipAddress, sessionId, advertisementId);
      if (lastClick) {
        const timeDiff = timestamp.getTime() - lastClick.createdAt.getTime();
        if (timeDiff < this.FRAUD_THRESHOLDS.MIN_TIME_BETWEEN_CLICKS) {
          riskScore += 25;
          reasons.push(`Clicks too frequent: ${timeDiff}ms between clicks`);
        }
      }

      // 5. Check for suspicious referrer patterns
      if (referrerUrl) {
        const suspiciousReferrer = this.detectSuspiciousReferrer(referrerUrl);
        if (suspiciousReferrer) {
          riskScore += 20;
          reasons.push('Suspicious referrer URL detected');
        }
      }

      // 6. Check for click without impression (direct click fraud)
      const hasRecentImpression = await this.hasRecentImpression(advertisementId, sessionId, ipAddress, 5); // 5 minutes
      if (!hasRecentImpression) {
        riskScore += 30;
        reasons.push('Click without recent impression');
      }

      // 7. Check for geographic anomalies
      const geoAnomaly = await this.detectGeographicAnomaly(ipAddress, userId);
      if (geoAnomaly) {
        riskScore += 15;
        reasons.push('Geographic location anomaly detected');
      }

      // 8. Check campaign CTR anomaly
      const ctrAnomaly = await this.detectCTRAnomalyForCampaign(advertisementId);
      if (ctrAnomaly) {
        riskScore += 20;
        reasons.push('Campaign CTR anomaly detected');
      }

      const isValid = riskScore < 50;
      const shouldBlock = riskScore >= 70;
      const shouldRefund = riskScore >= 80;

      // Create fraud alert if high risk
      if (riskScore >= 60) {
        await this.createAdFraudAlert({
          advertisementId,
          userId: userId || undefined,
          sessionId: sessionId || undefined,
          ipAddress,
          alertType: 'click_fraud',
          severity: riskScore >= 80 ? 'critical' : riskScore >= 70 ? 'high' : 'medium',
          description: `Suspicious click detected (risk score: ${riskScore})`,
          metadata: { clickData, riskScore, reasons },
          status: 'active',
        });
      }

      return {
        isValid,
        riskScore,
        reasons,
        shouldBlock,
        shouldRefund,
      };
    } catch (error) {
      logger.error('Error analyzing click for fraud:', error);
      // In case of error, allow the click but log the issue
      return {
        isValid: true,
        riskScore: 0,
        reasons: ['Analysis error - defaulting to valid'],
        shouldBlock: false,
        shouldRefund: false,
      };
    }
  }

  /**
   * Analyze impression for fraud detection
   */
  async analyzeImpression(impressionData: {
    advertisementId: string;
    userId?: string;
    sessionId: string;
    ipAddress: string;
    userAgent: string;
    viewDuration?: number;
    isViewable: boolean;
    timestamp: Date;
  }): Promise<ImpressionFraudAnalysis> {
    try {
      const { advertisementId, userId, sessionId, ipAddress, userAgent, viewDuration, isViewable, timestamp } = impressionData;
      let riskScore = 0;
      const reasons: string[] = [];

      // 1. Check for bot traffic
      const isBotTraffic = this.detectBotTraffic(userAgent);
      if (isBotTraffic) {
        riskScore += 35;
        reasons.push('Bot user agent detected');
      }

      // 2. Check impression frequency from same IP
      const ipImpressionCount = await this.getRecentImpressionsByIP(ipAddress, advertisementId, 1);
      if (ipImpressionCount >= this.FRAUD_THRESHOLDS.MAX_IMPRESSIONS_PER_IP_PER_HOUR) {
        riskScore += 30;
        reasons.push(`Too many impressions from IP: ${ipImpressionCount} in last hour`);
      }

      // 3. Check view duration
      if (viewDuration !== undefined && viewDuration < this.FRAUD_THRESHOLDS.MIN_VIEW_DURATION) {
        riskScore += 25;
        reasons.push(`Very short view duration: ${viewDuration}ms`);
      }

      // 4. Check viewability
      if (!isViewable) {
        riskScore += 20;
        reasons.push('Impression not viewable');
      }

      // 5. Check for rapid-fire impressions from same source
      const lastImpression = await this.getLastImpressionFromSource(ipAddress, sessionId, advertisementId);
      if (lastImpression) {
        const timeDiff = timestamp.getTime() - lastImpression.createdAt.getTime();
        if (timeDiff < 1000) { // Less than 1 second
          riskScore += 20;
          reasons.push(`Impressions too frequent: ${timeDiff}ms between impressions`);
        }
      }

      // 6. Check for suspicious session patterns
      const sessionPattern = await this.analyzeSessionPattern(sessionId, 1);
      if (sessionPattern.isAnomalous) {
        riskScore += 15;
        reasons.push('Anomalous session pattern detected');
      }

      const isValid = riskScore < 40;
      const shouldBlock = riskScore >= 60;

      // Create fraud alert if high risk
      if (riskScore >= 50) {
        await this.createAdFraudAlert({
          advertisementId,
          userId: userId || undefined,
          sessionId: sessionId || undefined,
          ipAddress,
          alertType: 'impression_fraud',
          severity: riskScore >= 70 ? 'critical' : riskScore >= 60 ? 'high' : 'medium',
          description: `Suspicious impression detected (risk score: ${riskScore})`,
          metadata: { impressionData, riskScore, reasons },
          status: 'active',
        });
      }

      return {
        isValid,
        riskScore,
        reasons,
        shouldBlock,
      };
    } catch (error) {
      logger.error('Error analyzing impression for fraud:', error);
      return {
        isValid: true,
        riskScore: 0,
        reasons: ['Analysis error - defaulting to valid'],
        shouldBlock: false,
      };
    }
  }

  /**
   * Detect bot traffic based on user agent
   */
  private detectBotTraffic(userAgent: string): boolean {
    if (!userAgent) return true; // No user agent is suspicious

    // Check against known bot patterns
    const isBotPattern = this.BOT_PATTERNS.some(pattern => pattern.test(userAgent));
    
    // Check against suspicious user agents
    const isSuspiciousAgent = this.SUSPICIOUS_USER_AGENTS.some(agent => 
      userAgent.includes(agent)
    );

    // Check for headless browser indicators
    const isHeadless = /headless|phantom|selenium/i.test(userAgent);

    return isBotPattern || isSuspiciousAgent || isHeadless;
  }

  /**
   * Get recent clicks by IP address
   */
  private async getRecentClicksByIP(ipAddress: string, advertisementId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.prisma.adClick.count({
      where: {
        ipAddress,
        advertisementId,
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Get recent clicks by session
   */
  private async getRecentClicksBySession(sessionId: string, advertisementId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.prisma.adClick.count({
      where: {
        sessionId,
        advertisementId,
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Get recent impressions by IP address
   */
  private async getRecentImpressionsByIP(ipAddress: string, advertisementId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.prisma.adImpression.count({
      where: {
        ipAddress,
        advertisementId,
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Get last click from source
   */
  private async getLastClickFromSource(ipAddress: string, sessionId: string, advertisementId: string) {
    return await this.prisma.adClick.findFirst({
      where: {
        OR: [
          { ipAddress, advertisementId },
          { sessionId, advertisementId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get last impression from source
   */
  private async getLastImpressionFromSource(ipAddress: string, sessionId: string, advertisementId: string) {
    return await this.prisma.adImpression.findFirst({
      where: {
        OR: [
          { ipAddress, advertisementId },
          { sessionId, advertisementId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Check if there's a recent impression before click
   */
  private async hasRecentImpression(advertisementId: string, sessionId: string, ipAddress: string, minutes: number): Promise<boolean> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    
    const impression = await this.prisma.adImpression.findFirst({
      where: {
        advertisementId,
        OR: [
          { sessionId },
          { ipAddress },
        ],
        createdAt: { gte: since },
      },
    });

    return !!impression;
  }

  /**
   * Detect suspicious referrer URLs
   */
  private detectSuspiciousReferrer(referrerUrl: string): boolean {
    const suspiciousPatterns = [
      /click\.php/i,
      /redirect\.php/i,
      /traffic/i,
      /exchange/i,
      /ptc/i, // Paid-to-click
      /autosurf/i,
      /bot/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(referrerUrl));
  }

  /**
   * Detect geographic anomalies
   */
  private async detectGeographicAnomaly(_ipAddress: string, userId?: string): Promise<boolean> {
    // This would typically use a GeoIP service
    // For now, we'll implement basic checks
    
    if (!userId) return false;

    try {
      // Check if user has been active from very different locations recently
      const recentClicks = await this.prisma.adClick.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
      });

      // If user has clicks from more than 5 different IPs in 24 hours, it's suspicious
      return recentClicks && recentClicks.length > 5;
    } catch (error) {
      logger.error('Error detecting geographic anomaly:', error);
      return false;
    }
  }

  /**
   * Detect CTR anomaly for campaign
   */
  private async detectCTRAnomalyForCampaign(advertisementId: string): Promise<boolean> {
    try {
      const ad = await this.prisma.advertisement.findUnique({
        where: { id: advertisementId },
        select: { campaignId: true },
      });

      if (!ad) return false;

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [impressions, clicks] = await Promise.all([
        this.prisma.adImpression.count({
          where: {
            advertisement: { campaignId: ad.campaignId },
            createdAt: { gte: since },
          },
        }),
        this.prisma.adClick.count({
          where: {
            advertisement: { campaignId: ad.campaignId },
            createdAt: { gte: since },
          },
        }),
      ]);

      if (impressions === 0) return false;

      const ctr = clicks / impressions;
      return ctr > this.FRAUD_THRESHOLDS.MAX_CTR_THRESHOLD;
    } catch (error) {
      logger.error('Error detecting CTR anomaly:', error);
      return false;
    }
  }

  /**
   * Analyze session pattern for anomalies
   */
  private async analyzeSessionPattern(sessionId: string, hours: number): Promise<TrafficPattern> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [impressions, clicks] = await Promise.all([
      this.prisma.adImpression.findMany({
        where: {
          sessionId,
          createdAt: { gte: since },
        },
        select: { ipAddress: true, createdAt: true },
      }),
      this.prisma.adClick.findMany({
        where: {
          sessionId,
          createdAt: { gte: since },
        },
        select: { ipAddress: true, createdAt: true },
      }),
    ]);

    const riskFactors: string[] = [];
    let isAnomalous = false;

    // Check for too many actions
    if (impressions.length > 50 || clicks.length > 10) {
      riskFactors.push('High activity volume');
      isAnomalous = true;
    }

    // Check for consistent timing patterns (bot-like behavior)
    if (clicks.length > 3) {
      const intervals = [];
      for (let i = 1; i < clicks.length; i++) {
        const currentClick = clicks[i];
        const previousClick = clicks[i - 1];
        if (currentClick?.createdAt && previousClick?.createdAt) {
          const interval = currentClick.createdAt.getTime() - previousClick.createdAt.getTime();
          intervals.push(interval);
        }
      }

      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      
      // If variance is very low, it suggests bot-like consistent timing
      if (variance < 1000000 && intervals.length > 3 && clicks.length > 1) { // 1 second variance threshold
        riskFactors.push('Consistent timing pattern');
        isAnomalous = true;
      }
    }

    return {
      ipAddress: impressions[0]?.ipAddress || clicks[0]?.ipAddress || '',
      sessionId,
      clickCount: clicks.length,
      impressionCount: impressions.length,
      timeWindow: `${hours}h`,
      isAnomalous,
      riskFactors,
    };
  }

  /**
   * Create ad fraud alert
   */
  private async createAdFraudAlert(alert: Omit<AdFraudAlert, 'id' | 'createdAt'>): Promise<AdFraudAlert> {
    try {
      const fraudAlert: AdFraudAlert = {
        ...alert,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };

      // Log the alert
      logger.warn('Ad fraud alert created:', {
        alertId: fraudAlert.id,
        type: fraudAlert.alertType,
        severity: fraudAlert.severity,
        description: fraudAlert.description,
        advertisementId: fraudAlert.advertisementId,
        ipAddress: fraudAlert.ipAddress,
      });

      // In a real implementation, store in database
      // await prisma.adFraudAlert.create({ data: fraudAlert });

      // Notify security team for high severity alerts
      if (fraudAlert.severity === 'critical' || fraudAlert.severity === 'high') {
        await this.notifySecurityTeam(fraudAlert);
      }

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
        severity: alert.severity,
        type: alert.alertType,
        advertisementId: alert.advertisementId,
        description: alert.description,
      });

      // In a real implementation:
      // - Send email/SMS to security team
      // - Create incident in monitoring system
      // - Auto-pause campaign if critical
      // - Update fraud detection rules
    } catch (error) {
      logger.error('Error notifying security team:', error);
    }
  }

  /**
   * Block fraudulent traffic and protect budget
   */
  async blockFraudulentTraffic(data: {
    ipAddress?: string;
    sessionId?: string;
    userId?: string;
    reason: string;
    duration?: number; // hours
  }): Promise<void> {
    try {
      const { ipAddress, sessionId, userId, reason, duration = 24 } = data;

      logger.warn('Blocking fraudulent traffic:', {
        ipAddress,
        sessionId,
        userId,
        reason,
        duration,
      });

      // In a real implementation:
      // - Add to blacklist/blocklist
      // - Update firewall rules
      // - Pause affected campaigns
      // - Refund fraudulent charges
      
      // For now, just log the action
      const blockData = {
        ipAddress,
        sessionId,
        userId,
        reason,
        blockedAt: new Date(),
        expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      };

      logger.info('Traffic block applied:', blockData);
    } catch (error) {
      logger.error('Error blocking fraudulent traffic:', error);
      throw error;
    }
  }

  /**
   * Refund fraudulent charges
   */
  async refundFraudulentCharges(campaignId: string, amount: number, reason: string): Promise<void> {
    try {
      logger.info('Processing fraudulent charge refund:', {
        campaignId,
        amount,
        reason,
      });

      // In a real implementation:
      // - Credit back to campaign budget
      // - Update analytics to exclude fraudulent data
      // - Create audit log entry
      // - Notify advertiser

      // For now, just log the refund
      const refundData = {
        campaignId,
        amount,
        reason,
        refundedAt: new Date(),
      };

      logger.info('Fraudulent charge refunded:', refundData);
    } catch (error) {
      logger.error('Error refunding fraudulent charges:', error);
      throw error;
    }
  }

  /**
   * Get fraud statistics for a campaign
   */
  async getCampaignFraudStats(_campaignId: string, _days: number = 7): Promise<{
    totalClicks: number;
    fraudulentClicks: number;
    totalImpressions: number;
    fraudulentImpressions: number;
    fraudRate: number;
    refundedAmount: number;
    blockedIPs: number;
  }> {
    try {
      // This would query actual fraud detection results
      // For now, return mock data
      return {
        totalClicks: 0,
        fraudulentClicks: 0,
        totalImpressions: 0,
        fraudulentImpressions: 0,
        fraudRate: 0,
        refundedAmount: 0,
        blockedIPs: 0,
      };
    } catch (error) {
      logger.error('Error getting campaign fraud stats:', error);
      throw error;
    }
  }
}

export const adFraudDetectionService = new AdFraudDetectionService();
export { AdFraudDetectionService };