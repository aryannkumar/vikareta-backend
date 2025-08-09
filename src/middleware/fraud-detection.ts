import { Request, Response, NextFunction } from 'express';
import { fraudDetectionService } from '@/services/fraud-detection.service';
import { logger } from '@/utils/logger';

// Extend Request interface to include fraud detection data
declare global {
  namespace Express {
    interface Request {
      fraudCheck?: {
        riskScore: number;
        allowed: boolean;
        alerts: any[];
      };
      userActivity?: {
        userAgent?: string;
        ipAddress?: string;
        requestPattern?: any;
        behaviorMetrics?: any;
      };
    }
  }
}

/**
 * Middleware to detect and prevent bot activity
 */
export const botDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return next(); // Skip if no user
    }

    const ipAddress = req.ip || '127.0.0.1';
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    const activityData = {
      userAgent,
      ipAddress,
      requestPattern: {
        requestsPerMinute: await getRequestsPerMinute(ipAddress),
        averageTimeBetweenRequests: await getAverageTimeBetweenRequests(ipAddress),
      },
      behaviorMetrics: req.body.behaviorMetrics || {},
    };

    const isBot = await fraudDetectionService.detectBotActivity(userId, activityData);

    if (isBot) {
      logger.warn('Bot activity detected, blocking request:', {
        userId,
        ip: ipAddress,
        userAgent,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'BOT_DETECTED',
          message: 'Automated activity detected. Please try again later.',
          timestamp: new Date().toISOString(),
        },
      });
    }

    req.userActivity = activityData;
    next();
  } catch (error) {
    logger.error('Error in bot detection middleware:', error);
    next(); // Continue on error to avoid blocking legitimate users
  }
};

/**
 * Middleware to monitor transactions for fraud
 */
export const transactionMonitoring = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return next(); // Skip if no user
    }

    // Extract transaction data from request
    const transactionData = {
      userId,
      amount: req.body.amount || 0,
      type: req.body.type || req.path.split('/').pop() || 'unknown',
      metadata: {
        path: req.path,
        method: req.method,
        ip: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent') || 'Unknown',
        body: req.body,
      },
    };

    // Only monitor if there's a significant amount involved
    if (transactionData.amount > 0) {
      const fraudCheck = await fraudDetectionService.monitorTransaction(transactionData);

      if (!fraudCheck.allowed) {
        logger.warn('Transaction blocked due to fraud risk:', {
          userId,
          amount: transactionData.amount,
          riskScore: fraudCheck.riskScore,
          alertCount: fraudCheck.alerts.length,
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'TRANSACTION_BLOCKED',
            message: 'Transaction blocked for security reasons. Please contact support.',
            riskScore: fraudCheck.riskScore,
            timestamp: new Date().toISOString(),
          },
        });
      }

      req.fraudCheck = fraudCheck;
    }

    next();
  } catch (error) {
    logger.error('Error in transaction monitoring middleware:', error);
    next(); // Continue on error to avoid blocking legitimate transactions
  }
};

/**
 * Middleware to check user risk score
 */
export const riskAssessment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return next(); // Skip if no user
    }

    const riskScore = await fraudDetectionService.calculateRiskScore(userId);

    // Block high-risk users from sensitive operations
    const sensitiveOperations = ['/api/payments', '/api/wallet', '/api/orders'];
    const isSensitiveOperation = sensitiveOperations.some(op => req.path.startsWith(op));

    if (isSensitiveOperation && riskScore.score >= 85) {
      logger.warn('High-risk user blocked from sensitive operation:', {
        userId,
        riskScore: riskScore.score,
        path: req.path,
        factors: riskScore.factors.map(f => f.type),
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'HIGH_RISK_USER',
          message: 'Account verification required. Please complete KYC verification.',
          riskScore: riskScore.score,
          requiredActions: [
            'Complete KYC verification',
            'Verify email and phone number',
            'Upload government ID documents',
          ],
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Add risk score to request for logging
    req.fraudCheck = {
      riskScore: riskScore.score,
      allowed: true,
      alerts: [],
    };

    next();
  } catch (error) {
    logger.error('Error in risk assessment middleware:', error);
    next(); // Continue on error
  }
};

/**
 * Middleware to log suspicious activity
 */
export const suspiciousActivityLogger = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send;

  res.send = function(data) {
    // Log suspicious patterns
    const userId = (req as any).user?.id;
    const statusCode = res.statusCode;
    const riskScore = req.fraudCheck?.riskScore || 0;

    // Log failed authentication attempts
    if (req.path.includes('/auth/') && statusCode === 401) {
      logger.warn('Failed authentication attempt:', {
        userId,
        ip: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent') || 'Unknown',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }

    // Log high-risk user activities
    if (riskScore > 70) {
      logger.warn('High-risk user activity:', {
        userId,
        riskScore,
        path: req.path,
        method: req.method,
        statusCode,
        ip: req.ip || '127.0.0.1',
        timestamp: new Date().toISOString(),
      });
    }

    // Log multiple failed requests
    if (statusCode >= 400 && statusCode < 500) {
      incrementFailedRequests(req.ip || '127.0.0.1');
    }

    return originalSend.call(this, data);
  };

  next();
};

// Helper functions
const requestCounts = new Map<string, { count: number; lastReset: number }>();

async function getRequestsPerMinute(ip: string): Promise<number> {
  const now = Date.now();
  const key = `requests:${ip}`;
  const data = requestCounts.get(key) || { count: 0, lastReset: now };

  // Reset counter every minute
  if (now - data.lastReset > 60000) {
    data.count = 0;
    data.lastReset = now;
  }

  data.count++;
  requestCounts.set(key, data);

  return data.count;
}

async function getAverageTimeBetweenRequests(ip: string): Promise<number> {
  // Simplified implementation - in production, use Redis or database
  const key = `timing:${ip}`;
  const now = Date.now();
  
  // Mock implementation
  return Math.random() * 1000 + 100; // Random between 100-1100ms
}

const failedRequestCounts = new Map<string, number>();

function incrementFailedRequests(ip: string): void {
  const current = failedRequestCounts.get(ip) || 0;
  failedRequestCounts.set(ip, current + 1);

  // Alert if too many failed requests
  if (current > 10) {
    logger.warn('Multiple failed requests from IP:', {
      ip,
      failedCount: current,
      timestamp: new Date().toISOString(),
    });
  }
}

export const fraudDetectionMiddleware = {
  botDetection,
  transactionMonitoring,
  riskAssessment,
  suspiciousActivityLogger,
};