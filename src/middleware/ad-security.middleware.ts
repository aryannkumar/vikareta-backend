import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AdFraudDetectionService } from '../services/ads/ad-fraud-detection.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const fraudDetectionService = new AdFraudDetectionService(prisma);

// Content validation rules
const PROHIBITED_WORDS = [
  'scam', 'fraud', 'fake', 'illegal', 'adult', 'gambling', 'casino',
  'lottery', 'get rich quick', 'miracle cure', 'guaranteed', 'free money'
];

const SUSPICIOUS_PATTERNS = [
  /\b(click here|act now|limited time|urgent|hurry)\b/gi,
  /\b(100% guaranteed|risk free|no questions asked)\b/gi,
  /\b(make money fast|work from home|easy money)\b/gi,
];

interface ContentValidationData {
  title?: string;
  description?: string;
  html?: string;
  imageUrls?: string[];
  targetUrl?: string;
}

interface ContentValidationResult {
  isValid: boolean;
  violations: string[];
  riskScore: number;
}

/**
 * Validate ad content against platform policies
 */
async function validateAdContent(content: ContentValidationData): Promise<ContentValidationResult> {
  const violations: string[] = [];
  let riskScore = 0;

  // Check for prohibited words
  const textContent = [content.title, content.description, content.html].join(' ').toLowerCase();

  for (const word of PROHIBITED_WORDS) {
    if (textContent.includes(word.toLowerCase())) {
      violations.push(`Contains prohibited word: ${word}`);
      riskScore += 20;
    }
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(textContent)) {
      violations.push(`Contains suspicious pattern: ${pattern.source}`);
      riskScore += 15;
    }
  }

  // Check URL safety
  if (content.targetUrl) {
    const urlValidation = await validateUrl(content.targetUrl);
    if (!urlValidation.isValid) {
      violations.push(...urlValidation.violations);
      riskScore += urlValidation.riskScore;
    }
  }

  // Check content length and quality
  if (content.title && content.title.length > 100) {
    violations.push('Title too long (max 100 characters)');
    riskScore += 5;
  }

  if (content.description && content.description.length > 500) {
    violations.push('Description too long (max 500 characters)');
    riskScore += 5;
  }

  // Check for excessive capitalization
  if (content.title && content.title === content.title.toUpperCase() && content.title.length > 10) {
    violations.push('Excessive use of capital letters');
    riskScore += 10;
  }

  // Check for excessive punctuation
  const punctuationCount = (textContent.match(/[!?]{2,}/g) || []).length;
  if (punctuationCount > 3) {
    violations.push('Excessive use of punctuation');
    riskScore += 10;
  }

  return {
    isValid: violations.length === 0 && riskScore < 50,
    violations,
    riskScore: Math.min(riskScore, 100),
  };
}

/**
 * Validate URL safety
 */
async function validateUrl(url: string): Promise<ContentValidationResult> {
  const violations: string[] = [];
  let riskScore = 0;

  try {
    const urlObj = new URL(url);

    // Check for suspicious domains
    const suspiciousDomains = [
      'bit.ly', 'tinyurl.com', 'short.link', 't.co',
      'suspicious-domain.com', 'malware-site.net'
    ];

    if (suspiciousDomains.some(domain => urlObj.hostname.includes(domain))) {
      violations.push('URL contains suspicious domain');
      riskScore += 30;
    }

    // Check for non-HTTPS URLs
    if (urlObj.protocol !== 'https:') {
      violations.push('URL must use HTTPS protocol');
      riskScore += 15;
    }

    // Check for excessive redirects (would need actual HTTP check)
    // For now, just check URL structure
    if (url.includes('redirect') || url.includes('r.php') || url.includes('go.php')) {
      violations.push('URL appears to be a redirect');
      riskScore += 20;
    }

  } catch (error) {
    violations.push('Invalid URL format');
    riskScore += 50;
  }

  return {
    isValid: violations.length === 0 && riskScore < 30,
    violations,
    riskScore: Math.min(riskScore, 100),
  };
}

export interface AdSecurityRequest extends Request {
  adSecurity?: {
    fraudAnalysis?: any;
    contentValidation?: any;
    rateLimit?: any;
    budgetValidation?: any;
    targetingValidation?: any;
    riskScore: number;
    isBlocked: boolean;
    violations: string[];
  };
}

/**
 * Middleware for ad fraud detection
 */
export const adFraudDetectionMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const userAgent = req.get('User-Agent') || '';
    const sessionId = req.session?.id || req.get('X-Session-ID') || '';
    const userId = (req as any).user?.id;
    const advertisementId = req.params.advertisementId || req.body.advertisementId;

    let fraudAnalysis = null;

    // Rate limiting check - simplified for now
    // TODO: Implement proper rate limiting

    // Analyze based on request type
    if (req.path.includes('/click')) {
      const clickData = {
        advertisementId,
        ipAddress,
        userAgent,
        userId,
        timestamp: new Date(),
        referrer: req.get('Referer') || '',
      };

      fraudAnalysis = await fraudDetectionService.detectClickFraud(clickData);
    } else if (req.path.includes('/impression')) {
      const impressionData = {
        advertisementId,
        ipAddress,
        userAgent,
        userId,
        timestamp: new Date(),
        pageUrl: req.get('Referer') || '',
      };

      fraudAnalysis = await fraudDetectionService.detectImpressionFraud(impressionData);
    }

    // Block if fraud is detected
    if (fraudAnalysis && fraudAnalysis.isFraudulent) {
      logger.warn('Blocking fraudulent ad request:', {
        ipAddress,
        userAgent,
        advertisementId,
        reasons: fraudAnalysis.reasons,
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

    // Implement content validation
    const contentValidation = await validateAdContent({
      title: req.body.title,
      description: req.body.description,
      html: req.body.html,
      imageUrls: req.body.imageUrls || [],
      targetUrl: req.body.targetUrl,
    });

    if (!contentValidation.isValid) {
      logger.warn('Blocking ad content due to policy violations:', {
        violations: contentValidation.violations,
        content: {
          title: req.body.title,
          description: req.body.description,
        },
      });

      return res.status(400).json({
        error: 'Ad content violates platform policies',
        code: 'CONTENT_VIOLATION',
        violations: contentValidation.violations,
      });
    }

    // Attach content validation to request
    if (req.adSecurity) {
      req.adSecurity.contentValidation = contentValidation;
    } else {
      req.adSecurity = {
        contentValidation,
        riskScore: contentValidation.riskScore,
        isBlocked: false,
        violations: contentValidation.violations,
      };
    }

    next();
  } catch (error) {
    logger.error('Error in ad content validation middleware:', error);
    next();
  }
};

/**
 * Rate limiting middleware for ad requests
 */
export const adRateLimitMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const userId = (req as any).user?.id;
    const key = userId || ipAddress;

    // Check rate limits (simplified implementation)
    const rateLimitResult = await checkRateLimit(key, req.path);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded:', {
        key,
        path: req.path,
        limit: rateLimitResult.limit,
        current: rateLimitResult.current,
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // Add rate limit info to request
    if (req.adSecurity) {
      req.adSecurity.rateLimit = rateLimitResult;
    } else {
      req.adSecurity = {
        rateLimit: rateLimitResult,
        riskScore: 0,
        isBlocked: false,
        violations: [],
      };
    }

    next();
  } catch (error) {
    logger.error('Error in ad rate limit middleware:', error);
    next();
  }
};

/**
 * Budget validation middleware
 */
export const adBudgetValidationMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    // Only validate budget on campaign creation/update and ad serving
    if (!req.body.campaignId && !req.params.campaignId) {
      return next();
    }

    const campaignId = req.body.campaignId || req.params.campaignId;
    const budgetValidation = await validateCampaignBudget(campaignId);

    if (!budgetValidation.isValid) {
      logger.warn('Budget validation failed:', {
        campaignId,
        violations: budgetValidation.violations,
      });

      return res.status(400).json({
        error: 'Campaign budget validation failed',
        code: 'BUDGET_VALIDATION_FAILED',
        violations: budgetValidation.violations,
      });
    }

    // Add budget validation to request
    if (req.adSecurity) {
      req.adSecurity.budgetValidation = budgetValidation;
    } else {
      req.adSecurity = {
        budgetValidation,
        riskScore: 0,
        isBlocked: false,
        violations: [],
      };
    }

    next();
  } catch (error) {
    logger.error('Error in ad budget validation middleware:', error);
    next();
  }
};

/**
 * Ad targeting validation middleware
 */
export const adTargetingValidationMiddleware = async (
  req: AdSecurityRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    // Only validate targeting on ad serving requests
    if (!req.body.targeting && !req.query.targeting) {
      return next();
    }

    const targeting = req.body.targeting || req.query.targeting;
    const targetingValidation = await validateAdTargeting(targeting);

    if (!targetingValidation.isValid) {
      logger.warn('Targeting validation failed:', {
        targeting,
        violations: targetingValidation.violations,
      });

      return res.status(400).json({
        error: 'Ad targeting validation failed',
        code: 'TARGETING_VALIDATION_FAILED',
        violations: targetingValidation.violations,
      });
    }

    next();
  } catch (error) {
    logger.error('Error in ad targeting validation middleware:', error);
    next();
  }
};

/**
 * Helper functions
 */
interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  retryAfter?: number;
}

async function checkRateLimit(key: string, path: string): Promise<RateLimitResult> {
  // Simplified rate limiting - in production, use Redis or similar
  const limits = {
    '/api/ads/click': { limit: 100, window: 60 }, // 100 clicks per minute
    '/api/ads/impression': { limit: 1000, window: 60 }, // 1000 impressions per minute
    '/api/ads/create': { limit: 10, window: 3600 }, // 10 ad creations per hour
  };

  const pathLimit = limits[path as keyof typeof limits] || { limit: 50, window: 60 };

  // Mock implementation - in production, implement proper rate limiting
  return {
    allowed: true,
    limit: pathLimit.limit,
    current: 1,
  };
}

// Define the expected campaign type for budget validation
interface CampaignBudgetData {
  id: string;
  status: string;
  isActive: boolean;
  budget: any; // Decimal type
  spentAmount: any; // Decimal type
  dailyBudget: any; // Decimal type or null
}

async function validateCampaignBudget(campaignId: string): Promise<ContentValidationResult> {
  try {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        status: true,
        isActive: true,
        budget: true,
        spentAmount: true,
        dailyBudget: true,
      },
    }) as CampaignBudgetData | null;

    if (!campaign) {
      return {
        isValid: false,
        violations: ['Campaign not found'],
        riskScore: 100,
      };
    }

    const violations: string[] = [];
    let riskScore = 0;

    // Check if campaign is active
    if (!campaign.isActive || campaign.status !== 'active') {
      violations.push('Campaign is not active');
      riskScore += 50;
    }

    // Check budget availability
    const spent = Number(campaign.spentAmount || 0);
    const budget = Number(campaign.budget);
    const remainingBudget = budget - spent;

    if (remainingBudget <= 0) {
      violations.push('Campaign budget exhausted');
      riskScore += 100;
    } else if (remainingBudget < budget * 0.1) {
      violations.push('Campaign budget nearly exhausted');
      riskScore += 30;
    }

    // Check daily budget if applicable
    if (campaign.dailyBudget) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // In a real implementation, you'd track daily spend
      const dailySpent = 0; // Mock value
      const dailyBudget = Number(campaign.dailyBudget);

      if (dailySpent >= dailyBudget) {
        violations.push('Daily budget exhausted');
        riskScore += 50;
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      riskScore: Math.min(riskScore, 100),
    };
  } catch (error) {
    return {
      isValid: false,
      violations: ['Budget validation error'],
      riskScore: 100,
    };
  }
}

async function validateAdTargeting(targeting: any): Promise<ContentValidationResult> {
  const violations: string[] = [];
  let riskScore = 0;

  try {
    // Validate age targeting
    if (targeting.ageMin && (targeting.ageMin < 13 || targeting.ageMin > 100)) {
      violations.push('Invalid minimum age targeting');
      riskScore += 20;
    }

    if (targeting.ageMax && (targeting.ageMax < 13 || targeting.ageMax > 100)) {
      violations.push('Invalid maximum age targeting');
      riskScore += 20;
    }

    // Validate location targeting
    if (targeting.locations && targeting.locations.length > 100) {
      violations.push('Too many location targets (max 100)');
      riskScore += 10;
    }

    // Validate interest targeting
    if (targeting.interests && targeting.interests.length > 50) {
      violations.push('Too many interest targets (max 50)');
      riskScore += 10;
    }

    // Check for discriminatory targeting
    const discriminatoryKeywords = ['race', 'religion', 'sexual orientation', 'disability'];
    const targetingText = JSON.stringify(targeting).toLowerCase();

    for (const keyword of discriminatoryKeywords) {
      if (targetingText.includes(keyword)) {
        violations.push(`Potentially discriminatory targeting: ${keyword}`);
        riskScore += 50;
      }
    }

    return {
      isValid: violations.length === 0 && riskScore < 50,
      violations,
      riskScore: Math.min(riskScore, 100),
    };
  } catch (error) {
    return {
      isValid: false,
      violations: ['Targeting validation error'],
      riskScore: 100,
    };
  }
}

/**
 * Combined ad security middleware
 */
export const adSecurityMiddleware = [
  adRateLimitMiddleware,
  adFraudDetectionMiddleware,
  adContentValidationMiddleware,
  adBudgetValidationMiddleware,
  adTargetingValidationMiddleware,
];

/**
 * Lightweight security middleware for high-frequency requests
 */
export const lightweightAdSecurityMiddleware = [
  adRateLimitMiddleware,
  adFraudDetectionMiddleware,
];

/**
 * Content-focused security middleware for ad creation/updates
 */
export const contentSecurityMiddleware = [
  adContentValidationMiddleware,
  adBudgetValidationMiddleware,
  adTargetingValidationMiddleware,
];