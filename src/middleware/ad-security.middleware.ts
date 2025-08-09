import { Request, Response, NextFunction } from 'express';
import { adFraudDetectionService } from '@/services/ads/ad-fraud-detection.service';
import { adContentSecurityService } from '@/services/ads/ad-content-security.service';
import { logger } from '@/utils/logger';

export interface AdSecurityRequest extends Request {
  adSecurity?: {
    fraudAnalysis?: any;
    contentValidation?: any;
    riskScore: number;
    isBlocked: boolean;
    violations: string[];
  };
}

/**
 * Middleware for ad fraud detection on clicks and impressions
 */
export const adFraudDetectionMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const { advertisementId, userId, sessionId, userAgent } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Rate limiting check
    const rateLimitConfig = { windowMs: 60000, maxRequests: 100 }; // 100 requests per minute
    const rateLimitResult = adContentSecurityService.checkRateLimit(
      `${ipAddress}:${sessionId}`, 
      rateLimitConfig
    );

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
      });
    }

    // Analyze for fraud based on request type
    let fraudAnalysis;
    if (req.path.includes('/click')) {
      const referrerUrl = req.get('Referer');
      const clickData: any = {
        advertisementId,
        userId,
        sessionId,
        ipAddress,
        userAgent: userAgent || req.get('User-Agent') || '',
        timestamp: new Date(),
      };
      if (referrerUrl) {
        clickData.referrerUrl = referrerUrl;
      }
      fraudAnalysis = await adFraudDetectionService.analyzeClick(clickData);
    } else if (req.path.includes('/impression')) {
      fraudAnalysis = await adFraudDetectionService.analyzeImpression({
        advertisementId,
        userId,
        sessionId,
        ipAddress,
        userAgent: userAgent || req.get('User-Agent') || '',
        viewDuration: req.body.viewDuration,
        isViewable: req.body.isViewable !== false,
        timestamp: new Date(),
      });
    }

    // Block if fraud is detected
    if (fraudAnalysis && fraudAnalysis.shouldBlock) {
      logger.warn('Blocking fraudulent ad request:', {
        ipAddress,
        sessionId,
        advertisementId,
        riskScore: fraudAnalysis.riskScore,
        reasons: fraudAnalysis.reasons,
      });

      // Block the traffic
      await adFraudDetectionService.blockFraudulentTraffic({
        ipAddress,
        sessionId,
        userId,
        reason: `Fraud detected: ${fraudAnalysis.reasons.join(', ')}`,
      });

      return res.status(403).json({
        error: 'Request blocked due to suspicious activity',
        code: 'FRAUD_DETECTED',
      });
    }

    // Attach fraud analysis to request for logging
    req.adSecurity = {
      fraudAnalysis,
      riskScore: fraudAnalysis?.riskScore || 0,
      isBlocked: false,
      violations: fraudAnalysis?.reasons || [],
    };

    next();
  } catch (error) {
    logger.error('Error in ad fraud detection middleware:', error);
    // Continue processing on error to avoid breaking legitimate requests
    next();
  }
};

/**
 * Middleware for ad content validation
 */
export const adContentValidationMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    // Only validate content on ad creation/update requests
    if (!req.body.title && !req.body.description && !req.body.html) {
      return next();
    }

    const contentValidation = await adContentSecurityService.validateAdContent({
      title: req.body.title || '',
      description: req.body.description || '',
      html: req.body.html,
      images: req.body.images,
      videos: req.body.videos,
      destinationUrl: req.body.destinationUrl || '',
      callToAction: req.body.callToAction || '',
    }, {
      enableXSSProtection: true,
      enableContentFiltering: true,
      enableURLValidation: true,
      enableImageValidation: true,
      strictMode: false,
    });

    // Block if content is invalid
    if (!contentValidation.isValid) {
      logger.warn('Blocking ad due to content violations:', {
        violations: contentValidation.violations,
        riskScore: contentValidation.riskScore,
      });

      return res.status(400).json({
        error: 'Ad content violates platform policies',
        code: 'CONTENT_VIOLATION',
        violations: contentValidation.violations.map(v => ({
          type: v.type,
          severity: v.severity,
          description: v.description,
          suggestedFix: v.suggestedFix,
        })),
      });
    }

    // Replace content with sanitized version
    if (contentValidation.sanitizedContent) {
      req.body = { ...req.body, ...contentValidation.sanitizedContent };
    }

    // Attach content validation to request
    req.adSecurity = {
      ...req.adSecurity,
      contentValidation,
      riskScore: Math.max(req.adSecurity?.riskScore || 0, contentValidation.riskScore),
      isBlocked: req.adSecurity?.isBlocked || false,
      violations: [...(req.adSecurity?.violations || []), ...contentValidation.violations.map(v => v.description)],
    };

    next();
  } catch (error) {
    logger.error('Error in ad content validation middleware:', error);
    return res.status(500).json({
      error: 'Content validation failed',
      code: 'VALIDATION_ERROR',
    });
  }
};

/**
 * Combined security middleware for comprehensive ad security
 */
export const adSecurityMiddleware = [
  adFraudDetectionMiddleware,
  adContentValidationMiddleware,
];

/**
 * Middleware to log security events
 */
export const adSecurityLoggingMiddleware = (
  req: AdSecurityRequest,
  _res: Response,
  next: NextFunction
) => {
  if (req.adSecurity && (req.adSecurity.riskScore > 30 || req.adSecurity.violations.length > 0)) {
    logger.info('Ad security event:', {
      path: req.path,
      method: req.method,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      riskScore: req.adSecurity.riskScore,
      violations: req.adSecurity.violations,
      isBlocked: req.adSecurity.isBlocked,
    });
  }
  next();
};