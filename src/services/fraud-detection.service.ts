import { logger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fraud detection interfaces
export interface FraudAlert {
  id: string;
  userId: string;
  alertType: FraudAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: any;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: Date;
  resolvedAt?: Date;
}

export type FraudAlertType = 
  | 'suspicious_login'
  | 'multiple_accounts'
  | 'unusual_transaction_pattern'
  | 'high_velocity_transactions'
  | 'suspicious_product_listing'
  | 'fake_reviews'
  | 'account_takeover'
  | 'payment_fraud'
  | 'identity_theft'
  | 'bot_activity';

export interface RiskScore {
  userId: string;
  score: number; // 0-100, higher is riskier
  factors: RiskFactor[];
  lastUpdated: Date;
}

export interface RiskFactor {
  type: string;
  weight: number;
  description: string;
  value: any;
}

export interface TransactionPattern {
  userId: string;
  transactionCount: number;
  totalAmount: number;
  averageAmount: number;
  timeWindow: string;
  isAnomalous: boolean;
}

class FraudDetectionService {
  private readonly RISK_THRESHOLDS = {
    LOW: 30,
    MEDIUM: 50,
    HIGH: 70,
    CRITICAL: 85,
  };

  private readonly VELOCITY_LIMITS = {
    TRANSACTIONS_PER_HOUR: 10,
    TRANSACTIONS_PER_DAY: 50,
    AMOUNT_PER_HOUR: 100000, // INR
    AMOUNT_PER_DAY: 500000, // INR
  };

  /**
   * Calculate risk score for a user
   */
  async calculateRiskScore(userId: string): Promise<RiskScore> {
    try {
      const factors: RiskFactor[] = [];
      let totalScore = 0;

      // Factor 1: Account age and verification status
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Account age factor
      const accountAge = Date.now() - user.createdAt.getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
      
      if (daysSinceCreation < 1) {
        factors.push({
          type: 'new_account',
          weight: 20,
          description: 'Account created less than 24 hours ago',
          value: daysSinceCreation,
        });
        totalScore += 20;
      } else if (daysSinceCreation < 7) {
        factors.push({
          type: 'recent_account',
          weight: 10,
          description: 'Account created less than 7 days ago',
          value: daysSinceCreation,
        });
        totalScore += 10;
      }

      // Verification status factor
      if (!user.isVerified) {
        factors.push({
          type: 'unverified_account',
          weight: 15,
          description: 'Account not verified',
          value: false,
        });
        totalScore += 15;
      }

      // KYC documents factor (simplified - would need to query documents table)
      const kycDocuments = 0; // Placeholder - would query user documents
      if (kycDocuments === 0) {
        factors.push({
          type: 'no_kyc_documents',
          weight: 25,
          description: 'No KYC documents uploaded',
          value: kycDocuments,
        });
        totalScore += 25;
      } else if (kycDocuments < 2) {
        factors.push({
          type: 'incomplete_kyc',
          weight: 10,
          description: 'Incomplete KYC documentation',
          value: kycDocuments,
        });
        totalScore += 10;
      }

      // Factor 2: Transaction patterns
      const transactionPattern = await this.analyzeTransactionPattern(userId);
      if (transactionPattern.isAnomalous) {
        factors.push({
          type: 'anomalous_transactions',
          weight: 30,
          description: 'Unusual transaction pattern detected',
          value: transactionPattern,
        });
        totalScore += 30;
      }

      // Factor 3: Login patterns
      const suspiciousLogins = await this.detectSuspiciousLogins(userId);
      if (suspiciousLogins.length > 0) {
        factors.push({
          type: 'suspicious_logins',
          weight: 20,
          description: `${suspiciousLogins.length} suspicious login attempts`,
          value: suspiciousLogins.length,
        });
        totalScore += 20;
      }

      // Factor 4: Multiple accounts detection
      const multipleAccounts = await this.detectMultipleAccounts(userId);
      if (multipleAccounts.length > 0) {
        factors.push({
          type: 'multiple_accounts',
          weight: 35,
          description: `Potential multiple accounts detected`,
          value: multipleAccounts.length,
        });
        totalScore += 35;
      }

      // Factor 5: Product listing patterns (for sellers)
      const suspiciousListings = await this.detectSuspiciousListings(userId);
      if (suspiciousListings > 0) {
        factors.push({
          type: 'suspicious_listings',
          weight: 25,
          description: `${suspiciousListings} suspicious product listings`,
          value: suspiciousListings,
        });
        totalScore += 25;
      }

      // Cap the score at 100
      const finalScore = Math.min(totalScore, 100);

      const riskScore: RiskScore = {
        userId,
        score: finalScore,
        factors,
        lastUpdated: new Date(),
      };

      // Store risk score in cache/database for future reference
      await this.storeRiskScore(riskScore);

      return riskScore;
    } catch (error) {
      logger.error('Error calculating risk score:', error);
      throw error;
    }
  }

  /**
   * Analyze transaction patterns for anomalies
   */
  async analyzeTransactionPattern(userId: string): Promise<TransactionPattern> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent transactions
      const dayTransactions = await prisma.walletTransaction.findMany({
        where: {
          wallet: { userId },
          createdAt: { gte: oneDayAgo },
          transactionType: { in: ['debit', 'credit'] },
        },
      });

      const hourTransactions = dayTransactions.filter(
        tx => tx.createdAt >= oneHourAgo
      );

      const dayCount = dayTransactions.length;
      const hourCount = hourTransactions.length;
      const dayAmount = dayTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const hourAmount = hourTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

      const isAnomalous = 
        hourCount > this.VELOCITY_LIMITS.TRANSACTIONS_PER_HOUR ||
        dayCount > this.VELOCITY_LIMITS.TRANSACTIONS_PER_DAY ||
        hourAmount > this.VELOCITY_LIMITS.AMOUNT_PER_HOUR ||
        dayAmount > this.VELOCITY_LIMITS.AMOUNT_PER_DAY;

      return {
        userId,
        transactionCount: dayCount,
        totalAmount: dayAmount,
        averageAmount: dayCount > 0 ? dayAmount / dayCount : 0,
        timeWindow: '24h',
        isAnomalous,
      };
    } catch (error) {
      logger.error('Error analyzing transaction pattern:', error);
      throw error;
    }
  }

  /**
   * Detect suspicious login patterns
   */
  async detectSuspiciousLogins(_userId: string): Promise<any[]> {
    try {
      // This would typically analyze login logs
      // For now, we'll return a mock implementation
      const suspiciousPatterns: any[] = [];

      // Check for rapid location changes
      // Check for unusual login times
      // Check for multiple failed attempts
      // Check for new device/browser patterns

      return suspiciousPatterns;
    } catch (error) {
      logger.error('Error detecting suspicious logins:', error);
      return [];
    }
  }

  /**
   * Detect multiple accounts from same user
   */
  async detectMultipleAccounts(userId: string): Promise<string[]> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) return [];

      const potentialDuplicates = [];

      // Check for same email domain patterns
      if (user.email) {
        const emailDomain = user.email.split('@')[1];
        if (emailDomain) {
          const similarEmails = await prisma.user.findMany({
            where: {
              id: { not: userId },
              email: { contains: emailDomain },
            },
            select: { id: true, email: true },
          });
          potentialDuplicates.push(...similarEmails.map(u => u.id));
        }
      }

      // Check for same phone number patterns
      if (user.phone) {
        const phoneBase = user.phone.replace(/\D/g, '').slice(-10); // Last 10 digits
        const similarPhones = await prisma.user.findMany({
          where: {
            id: { not: userId },
            phone: { contains: phoneBase },
          },
          select: { id: true },
        });
        potentialDuplicates.push(...similarPhones.map(u => u.id));
      }

      // Check for same business name
      if (user.businessName) {
        const similarBusinesses = await prisma.user.findMany({
          where: {
            id: { not: userId },
            businessName: { contains: user.businessName },
          },
          select: { id: true },
        });
        potentialDuplicates.push(...similarBusinesses.map(u => u.id));
      }

      return [...new Set(potentialDuplicates)]; // Remove duplicates
    } catch (error) {
      logger.error('Error detecting multiple accounts:', error);
      return [];
    }
  }

  /**
   * Detect suspicious product listings
   */
  async detectSuspiciousListings(userId: string): Promise<number> {
    try {
      const suspiciousCount = await prisma.product.count({
        where: {
          sellerId: userId,
          OR: [
            { price: { lt: 1 } }, // Extremely low prices
            { price: { gt: 1000000 } }, // Extremely high prices
            { title: { contains: 'fake' } },
            { title: { contains: 'replica' } },
            { description: { contains: 'guaranteed' } },
            { description: { contains: '100% original' } },
          ],
        },
      });

      return suspiciousCount;
    } catch (error) {
      logger.error('Error detecting suspicious listings:', error);
      return 0;
    }
  }

  /**
   * Create fraud alert
   */
  async createFraudAlert(alert: Omit<FraudAlert, 'id' | 'createdAt'>): Promise<FraudAlert> {
    try {
      const fraudAlert: FraudAlert = {
        ...alert,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };

      // Store alert in database (would need to create fraud_alerts table)
      logger.warn('Fraud alert created:', {
        alertId: fraudAlert.id,
        userId: fraudAlert.userId,
        type: fraudAlert.alertType,
        severity: fraudAlert.severity,
        description: fraudAlert.description,
      });

      // Send notifications to security team
      await this.notifySecurityTeam(fraudAlert);

      return fraudAlert;
    } catch (error) {
      logger.error('Error creating fraud alert:', error);
      throw error;
    }
  }

  /**
   * Monitor transaction for fraud
   */
  async monitorTransaction(transactionData: {
    userId: string;
    amount: number;
    type: string;
    metadata?: any;
  }): Promise<{ allowed: boolean; riskScore: number; alerts: FraudAlert[] }> {
    try {
      const { userId, amount, type, metadata } = transactionData;
      const alerts: FraudAlert[] = [];

      // Calculate current risk score
      const riskScore = await this.calculateRiskScore(userId);

      // Check velocity limits
      const transactionPattern = await this.analyzeTransactionPattern(userId);
      if (transactionPattern.isAnomalous) {
        const alert = await this.createFraudAlert({
          userId,
          alertType: 'high_velocity_transactions',
          severity: 'high',
          description: 'High velocity transaction pattern detected',
          metadata: { transactionPattern, currentTransaction: { amount, type } },
          status: 'active',
        });
        alerts.push(alert);
      }

      // Check for unusual amounts
      if (amount > 100000) { // Large transaction
        const alert = await this.createFraudAlert({
          userId,
          alertType: 'unusual_transaction_pattern',
          severity: 'medium',
          description: `Large transaction amount: ₹${amount}`,
          metadata: { amount, type, metadata },
          status: 'active',
        });
        alerts.push(alert);
      }

      // Determine if transaction should be allowed
      const allowed = riskScore.score < this.RISK_THRESHOLDS.CRITICAL && alerts.length === 0;

      if (!allowed) {
        logger.warn('Transaction blocked due to fraud risk:', {
          userId,
          amount,
          riskScore: riskScore.score,
          alertCount: alerts.length,
        });
      }

      return {
        allowed,
        riskScore: riskScore.score,
        alerts,
      };
    } catch (error) {
      logger.error('Error monitoring transaction:', error);
      // In case of error, allow transaction but log the issue
      return { allowed: true, riskScore: 0, alerts: [] };
    }
  }

  /**
   * Detect bot activity
   */
  async detectBotActivity(userId: string, activityData: {
    userAgent?: string;
    ipAddress?: string;
    requestPattern?: any;
    behaviorMetrics?: any;
  }): Promise<boolean> {
    try {
      const { userAgent, requestPattern, behaviorMetrics } = activityData;
      let botScore = 0;

      // Check user agent patterns
      if (userAgent) {
        const botPatterns = [
          /bot/i, /crawler/i, /spider/i, /scraper/i,
          /curl/i, /wget/i, /python/i, /java/i,
        ];
        
        if (botPatterns.some(pattern => pattern.test(userAgent))) {
          botScore += 30;
        }
      }

      // Check request patterns
      if (requestPattern) {
        // Too many requests in short time
        if (requestPattern.requestsPerMinute > 60) {
          botScore += 25;
        }
        
        // Consistent timing between requests
        if (requestPattern.averageTimeBetweenRequests < 100) { // ms
          botScore += 20;
        }
      }

      // Check behavior metrics
      if (behaviorMetrics) {
        // No mouse movements
        if (behaviorMetrics.mouseMovements === 0) {
          botScore += 15;
        }
        
        // No keyboard interactions
        if (behaviorMetrics.keyboardInteractions === 0) {
          botScore += 15;
        }
        
        // Extremely fast form filling
        if (behaviorMetrics.formFillTime < 1000) { // ms
          botScore += 20;
        }
      }

      const isBot = botScore >= 50;

      if (isBot) {
        await this.createFraudAlert({
          userId,
          alertType: 'bot_activity',
          severity: 'high',
          description: `Bot activity detected (score: ${botScore})`,
          metadata: { botScore, activityData },
          status: 'active',
        });
      }

      return isBot;
    } catch (error) {
      logger.error('Error detecting bot activity:', error);
      return false;
    }
  }

  /**
   * Store risk score
   */
  private async storeRiskScore(riskScore: RiskScore): Promise<void> {
    try {
      // In a real implementation, this would store in a dedicated table
      logger.info('Risk score calculated:', {
        userId: riskScore.userId,
        score: riskScore.score,
        factorCount: riskScore.factors.length,
      });
    } catch (error) {
      logger.error('Error storing risk score:', error);
    }
  }

  /**
   * Notify security team
   */
  private async notifySecurityTeam(alert: FraudAlert): Promise<void> {
    try {
      // In a real implementation, this would send notifications
      // via email, Slack, or other channels
      logger.warn('Security team notification:', {
        alertId: alert.id,
        severity: alert.severity,
        type: alert.alertType,
        userId: alert.userId,
      });

      // For critical alerts, send immediate notifications
      if (alert.severity === 'critical') {
        // Send SMS/email to security team
        // Create incident in monitoring system
        // Potentially auto-suspend account
      }
    } catch (error) {
      logger.error('Error notifying security team:', error);
    }
  }

  /**
   * Get fraud alerts for a user
   */
  async getFraudAlerts(_userId: string, _status?: string): Promise<FraudAlert[]> {
    try {
      // In a real implementation, this would query the fraud_alerts table
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Error getting fraud alerts:', error);
      return [];
    }
  }

  /**
   * Resolve fraud alert
   */
  async resolveFraudAlert(alertId: string, resolution: 'resolved' | 'false_positive'): Promise<void> {
    try {
      logger.info('Fraud alert resolved:', { alertId, resolution });
      // Update alert status in database
    } catch (error) {
      logger.error('Error resolving fraud alert:', error);
      throw error;
    }
  }
}

export const fraudDetectionService = new FraudDetectionService();