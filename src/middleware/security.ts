import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import crypto from 'crypto';

// Enhanced rate limiting configurations
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(options.windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`, {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(options.windowMs / 1000),
          timestamp: new Date().toISOString(),
        },
      });
    },
  });
};

// Different rate limiters for different endpoints
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 1000, // Increased from 100 to 1000
  message: 'Too many requests from this IP, please try again later.',
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 20, // Increased from 5 to 20
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

export const paymentLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 1000 : 50, // Increased from 10 to 50
  message: 'Too many payment attempts, please try again later.',
  skipSuccessfulRequests: true,
});

export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 10000 : 300, // Increased from 60 to 300
  message: 'API rate limit exceeded, please slow down your requests.',
});

// Slow down middleware for progressive delays
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs without delay
  delayMs: () => 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  validate: { delayMs: false }, // Disable warning
});

// Enhanced helmet configuration with all security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // unsafe-eval needed for some libraries
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.cashfree.com", "https://sandbox.cashfree.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

// Additional security headers middleware to ensure all required headers are present
export const additionalSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Ensure X-Frame-Options is set
  if (!res.getHeader('X-Frame-Options')) {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  
  // Ensure X-XSS-Protection is set
  if (!res.getHeader('X-XSS-Protection')) {
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }
  
  // Ensure Strict-Transport-Security is set in production
  if (config.env === 'production' && !res.getHeader('Strict-Transport-Security')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Ensure Content-Security-Policy is set
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://api.cashfree.com https://sandbox.cashfree.com; frame-src 'none'; object-src 'none'");
  }
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// Request ID middleware for tracking
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  // Use existing request ID if provided, otherwise generate new one
  const existingId = req.headers['x-request-id'] as string;
  const id = existingId || crypto.randomUUID();
  
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
};

// Security logging middleware
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log security-relevant request details
  const securityInfo = {
    requestId: req.headers['x-request-id'],
    ip: req.ip,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    timestamp: new Date().toISOString(),
    userId: (req as any).user?.id,
  };

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
    /vbscript:/i,  // VBScript injection
  ];

  const requestData = JSON.stringify({
    query: req.query,
    body: req.body,
    params: req.params,
  });

  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || pattern.test(requestData)
  );

  if (isSuspicious) {
    logger.warn('Suspicious request detected', {
      ...securityInfo,
      suspicious: true,
      requestData: requestData.substring(0, 1000), // Limit log size
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      logger.warn('Request failed', {
        ...securityInfo,
        statusCode: res.statusCode,
        duration,
      });
    }
  });

  next();
};

// Enhanced input sanitization middleware with XSS protection
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    
    return str
      // Remove script tags and their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove javascript: and vbscript: protocols
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:text\/html/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=/gi, '')
      // Remove potentially dangerous HTML tags
      .replace(/<(iframe|object|embed|form|input|textarea|select|button|link|meta|base)[^>]*>/gi, '')
      // Remove HTML comments that might contain malicious code
      .replace(/<!--[\s\S]*?-->/g, '')
      // Encode HTML entities
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      // Remove null bytes and other control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// CORS configuration with enhanced security
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (config.cors.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'X-CSRF-Token',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200, // Return 200 for OPTIONS requests instead of 204
};

// Extend global type for DDoS store
declare global {
  var ddosStore: Map<string, { count: number; resetTime: number }> | undefined;
}

// DDoS protection middleware
export const ddosProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip DDoS protection in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const ip = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 200; // Maximum requests per minute per IP

  // Simple in-memory store (in production, use Redis)
  if (!global.ddosStore) {
    global.ddosStore = new Map();
  }

  const store = global.ddosStore;
  const key = `ddos:${ip}`;
  const record = store.get(key) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }

  store.set(key, record);

  if (record.count > maxRequests) {
    logger.error(`DDoS protection triggered for IP: ${ip}`, {
      ip,
      requestCount: record.count,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'DDOS_PROTECTION',
        message: 'Too many requests detected. Please try again later.',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  next();
};

// IP whitelist/blacklist middleware
export const ipFilter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  
  // Blacklisted IPs (in production, store in database/Redis)
  const blacklistedIPs = new Set<string>([
    // Add known malicious IPs here
  ]);

  // Whitelisted IPs for admin endpoints
  const whitelistedIPs = new Set<string>([
    '127.0.0.1',
    '::1',
    // Add admin IPs here
  ]);

  if (blacklistedIPs.has(ip)) {
    logger.error(`Blocked request from blacklisted IP: ${ip}`, {
      ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'IP_BLOCKED',
        message: 'Access denied.',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // For admin endpoints, check whitelist (disabled in development)
  if (req.path.startsWith('/api/admin') && !whitelistedIPs.has(ip) && process.env.NODE_ENV === 'production') {
    logger.warn(`Admin access attempted from non-whitelisted IP: ${ip}`, {
      ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_ACCESS_DENIED',
        message: 'Admin access restricted to authorized IPs.',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  next();
};

// CSRF Protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF protection for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF protection in test and development environment
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return next();
  }

  // Check for CSRF token in headers or body
  const token = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
  const sessionToken = (req.session as any)?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    // Validate Origin and Referer headers as fallback
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const host = req.headers.host;

    const isValidOrigin = origin && origin.includes(host || '');
    const isValidReferer = referer && referer.includes(host || '');

    if (!isValidOrigin && !isValidReferer) {
      logger.warn('CSRF protection triggered', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        origin,
        referer,
        userAgent: req.get('User-Agent'),
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'CSRF token validation failed',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  next();
};

// Generate CSRF token endpoint
export const generateCSRFToken = (req: Request, res: Response) => {
  const token = crypto.randomBytes(32).toString('hex');
  
  // Store token in session
  if (req.session) {
    (req.session as any).csrfToken = token;
  }

  res.json({
    success: true,
    data: { csrfToken: token },
  });
};

// Session regeneration middleware for preventing session fixation
export const regenerateSession = (req: Request, res: Response, next: NextFunction) => {
  if (req.session && typeof req.session.regenerate === 'function') {
    const oldSessionData = { ...req.session };
    
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration failed:', err);
        return next(err);
      }
      
      // Restore important session data
      Object.assign(req.session!, oldSessionData);
      next();
    });
  } else {
    next();
  }
};

// Export all security middleware
export const securityMiddleware = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  apiLimiter,
  speedLimiter,
  securityHeaders,
  additionalSecurityHeaders,
  requestId,
  securityLogger,
  sanitizeInput,
  corsOptions,
  ddosProtection,
  ipFilter,
  csrfProtection,
  generateCSRFToken,
  regenerateSession,
};