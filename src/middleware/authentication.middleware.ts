import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { redisClient } from '@/config/redis';
import { config } from '@/config/environment';
import { securityConfig, SecurityAudit, CSRFUtils, RateLimitUtils } from '@/config/security';
import { ssoService } from '@/services/sso.service';
import { monitorSecurityEvent, monitorUserBehavior } from '@/services/security-monitoring.service';
import { logger } from '@/utils/logger';

// Extend Request interface to include user and security data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        phone?: string;
        role?: string;
        userType: string;
        isVerified: boolean;
        verificationTier: string;
        permissions?: string[];
        ssoSessionId?: string;
      };
      securityContext?: {
        csrfToken?: string;
        rateLimitRemaining?: number;
        ssoToken?: string;
        domain?: string;
      };
    }
  }
}

// Enhanced JWT payload interface
interface EnhancedJWTPayload {
  userId: string;
  email?: string;
  phone?: string;
  role?: string;
  userType: string;
  aud?: string;
  permissions?: string[];
  ssoSessionId?: string;
  iat: number;
  exp: number;
  iss?: string;
}

// Security middleware classes
export class AuthenticationMiddleware {
  /**
   * Enhanced JWT authentication with SSO support
   */
  static authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req);
      const domain = this.getRequestDomain(req);

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
        return;
      }

      // Verify JWT token with enhanced validation
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: securityConfig.jwt.audience[0], // Use first audience for verification
      }) as unknown as EnhancedJWTPayload;

      // Enhanced audience validation for multi-domain SSO
      if (!this.validateAudience(decoded.aud, domain)) {
        SecurityAudit.logSecurityEvent('AUDIENCE_MISMATCH', {
          userId: decoded.userId,
          tokenAudience: decoded.aud,
          requestDomain: domain,
        });
        // Monitor audience mismatch as suspicious activity
        await monitorSecurityEvent('AUDIENCE_MISMATCH', req.ip || 'unknown', {
          userId: decoded.userId,
          tokenAudience: decoded.aud,
          requestDomain: domain,
        });
        res.status(401).json({ success: false, error: 'Token audience mismatch' });
        return;
      }

      // Check if token is blacklisted
      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        SecurityAudit.logSecurityEvent('BLACKLISTED_TOKEN', {
          userId: decoded.userId,
          token: token.substring(0, 10) + '...',
        });
        res.status(401).json({
          success: false,
          error: 'Token has been revoked'
        });
        return;
      }

      // SSO session validation if present
      if (decoded.ssoSessionId) {
        const ssoUser = await ssoService.validateSSOToken(decoded.ssoSessionId, domain);
        if (!ssoUser) {
          res.status(401).json({
            success: false,
            error: 'SSO session expired or invalid'
          });
          return;
        }
      }

      // Get user from cache or database with enhanced caching
      let user = await this.getUserFromCache(decoded.userId);
      if (!user) {
        user = await this.getUserFromDatabase(decoded.userId);
        if (user) {
          await this.cacheUser(user);
        }
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Account has been deactivated'
        });
        return;
      }

      // Domain access validation for SSO
      if (!ssoService.hasDomainAccess(user.userType, domain)) {
        res.status(403).json({
          success: false,
          error: 'Access denied: Insufficient permissions for this domain'
        });
        return;
      }

      // Attach user and security context to request
      req.user = {
        ...user,
        permissions: decoded.permissions || [],
        ssoSessionId: decoded.ssoSessionId,
      };

      req.securityContext = {
        domain,
        ssoToken: decoded.ssoSessionId,
      };

      // Log successful authentication
      SecurityAudit.logSecurityEvent('AUTH_SUCCESS', {
        userId: user.id,
        userType: user.userType,
        domain,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Monitor successful authentication for user behavior analysis
      await monitorUserBehavior(
        user.id,
        'authentication',
        req.ip || 'unknown',
        req.get('User-Agent') || 'unknown',
        { domain, userType: user.userType }
      );

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        // Monitor JWT token errors
        await monitorSecurityEvent('AUTH_FAILURE', req.ip || 'unknown', {
          reason: 'invalid_token',
          userAgent: req.get('User-Agent'),
        });
        res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      } else if (error instanceof jwt.TokenExpiredError) {
        // Monitor token expiry
        await monitorSecurityEvent('AUTH_FAILURE', req.ip || 'unknown', {
          reason: 'token_expired',
          userAgent: req.get('User-Agent'),
        });
        res.status(401).json({
          success: false,
          error: 'Token has expired'
        });
      } else {
        logger.error('Authentication error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  };

  /**
   * CSRF protection middleware
   */
  static csrfProtection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const sessionToken = req.cookies?.['XSRF-TOKEN'];
    const requestToken = req.headers['x-xsrf-token'] as string ||
                        req.headers['x-csrf-token'] as string ||
                        req.body?._csrf;

    if (!sessionToken || !requestToken) {
      SecurityAudit.logSecurityEvent('CSRF_MISSING_TOKEN', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'CSRF token missing'
      });
      return;
    }

    if (!CSRFUtils.validateToken(sessionToken, requestToken)) {
      SecurityAudit.logSecurityEvent('CSRF_INVALID_TOKEN', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      // Monitor CSRF violations
      await monitorSecurityEvent('CSRF_INVALID_TOKEN', req.ip || 'unknown', {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
      });
      res.status(403).json({
        success: false,
        error: 'CSRF token invalid'
      });
      return;
    }

    next();
  };

  /**
   * Generate and set CSRF token
   */
  static generateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
    const token = CSRFUtils.generateToken();

    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Allow JavaScript access
      secure: true, // Always secure for cross-domain
      sameSite: 'none', // Allow cross-domain requests
      maxAge: securityConfig.csrf.maxAge,
      domain: securityConfig.session.domain,
    });

    req.securityContext = {
      ...req.securityContext,
      csrfToken: token,
    };

    next();
  };

  /**
   * Rate limiting middleware with Redis backend
   */
  static rateLimit = (options: {
    windowMs?: number;
    max?: number;
    keyGenerator?: (req: Request) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  } = {}) => {
    const {
      windowMs = securityConfig.rateLimit.windowMs,
      max = securityConfig.rateLimit.maxRequests.api,
      keyGenerator = (req) => `${req.ip}:${req.path}`,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = RateLimitUtils.getKey(keyGenerator(req), req.path);
        const ttl = RateLimitUtils.getTTL(windowMs);

        // Get current request count
        const current = await redisClient.incr(key);

        // Set expiry on first request
        if (current === 1) {
          await redisClient.expire(key, ttl);
        }

        const remaining = Math.max(0, max - current);

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': max.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': (Date.now() + windowMs).toString(),
        });

        req.securityContext = {
          ...req.securityContext,
          rateLimitRemaining: remaining,
        };

        // Check if limit exceeded
        if (current > max) {
          SecurityAudit.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            key,
            current,
            max,
            ip: req.ip,
            path: req.path,
          });

          // Monitor rate limit violations
          await monitorSecurityEvent('RATE_LIMIT_EXCEEDED', req.ip || 'unknown', {
            path: req.path,
            limit: max,
            current,
            userAgent: req.get('User-Agent'),
          });

          res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later',
            retryAfter: windowMs / 1000,
          });
          return;
        }

        next();
      } catch (error) {
        logger.error('Rate limiting error:', error);
        // Allow request to continue if rate limiting fails
        next();
      }
    };
  };

  /**
   * Security headers middleware
   */
  static securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');

    // Set security headers
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': securityConfig.headers.referrerPolicy,
      'Permissions-Policy': Object.entries(securityConfig.headers.permissionsPolicy)
        .map(([key, value]) => `${key}=(${value.join(' ')})`)
        .join(', '),
    });

    // Content Security Policy
    if (config.env === 'production') {
      const csp = Object.entries(securityConfig.headers.csp)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            return `${key} ${value.join(' ')}`;
          }
          return `${key} ${value}`;
        })
        .join('; ');

      res.set('Content-Security-Policy', csp);
    }

    // HSTS for HTTPS
    if (config.env === 'production' && req.secure) {
      res.set('Strict-Transport-Security',
        `max-age=${securityConfig.headers.hsts.maxAge}; includeSubDomains; preload`);
    }

    next();
  };

  /**
   * SSO authentication middleware
   */
  static ssoAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        res.status(400).json({
          success: false,
          error: 'SSO token required'
        });
        return;
      }

      const domain = this.getRequestDomain(req);
      const result = await ssoService.handleSSOLogin(token, domain);

      if (!result) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired SSO token'
        });
        return;
      }

      // Set domain-specific access token
      const accessToken = jwt.sign(
        {
          userId: result.user.id,
          email: result.user.email,
          userType: result.user.userType,
          aud: ssoService.getAudienceFromDomain ? ssoService.getAudienceFromDomain(domain) : 'web',
          permissions: result.user.permissions,
        },
        config.jwt.secret,
        {
          expiresIn: securityConfig.jwt.accessTokenExpiry,
          issuer: config.jwt.issuer,
        } as any
      );

      // Set access token as HTTP-only cookie
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
        domain: securityConfig.session.domain,
      });

      // Redirect to appropriate page
      res.redirect(result.redirectUrl);
    } catch (error) {
      logger.error('SSO authentication error:', error);
      res.status(500).json({
        success: false,
        error: 'SSO authentication failed'
      });
    }
  };

  // Helper methods
  public static extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    const cookieToken = req.cookies?.accessToken;
    if (cookieToken) {
      return cookieToken;
    }

    // Check query parameter (not recommended for production)
    const queryToken = req.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  public static getRequestDomain(req: Request): string {
    const host = req.hostname || req.headers.host || '';
    return host.replace(/^www\./, ''); // Remove www prefix
  }

  public static validateAudience(tokenAudience: string | undefined, requestDomain: string): boolean {
    if (!tokenAudience) return true; // Allow if no audience specified

    const domainToAudience: Record<string, string> = {
      'vikareta.com': 'web',
      'dashboard.vikareta.com': 'dashboard',
      'admin.vikareta.com': 'admin',
    };

    const expectedAudience = domainToAudience[requestDomain];
    return tokenAudience === expectedAudience;
  }

  public static async getUserFromCache(userId: string): Promise<any> {
    try {
      const cachedUser = await redisClient.get(`user:${userId}`);
      return cachedUser ? JSON.parse(cachedUser) : null;
    } catch (error) {
      logger.warn('Redis error getting user from cache:', error);
      return null;
    }
  }

  public static async getUserFromDatabase(userId: string): Promise<any> {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          userType: true,
          isVerified: true,
          verificationTier: true,
          isActive: true,
          firstName: true,
          lastName: true,
          businessName: true,
        },
      });

      if (dbUser) {
        return {
          id: dbUser.id,
          email: dbUser.email ?? undefined,
          phone: dbUser.phone ?? undefined,
          role: dbUser.role ?? undefined,
          userType: dbUser.userType,
          isVerified: dbUser.isVerified,
          verificationTier: dbUser.verificationTier,
          isActive: dbUser.isActive,
          firstName: dbUser.firstName ?? undefined,
          lastName: dbUser.lastName ?? undefined,
          businessName: dbUser.businessName ?? undefined,
        };
      }

      return null;
    } catch (error) {
      logger.error('Database error getting user:', error);
      return null;
    }
  }

  public static async cacheUser(user: any): Promise<void> {
    try {
      await redisClient.setex(`user:${user.id}`, 900, JSON.stringify(user)); // 15 minutes
    } catch (error) {
      logger.warn('Redis error caching user:', error);
    }
  }
}

// Export enhanced middleware functions
export const authenticateToken = AuthenticationMiddleware.authenticateToken;
export const csrfProtection = AuthenticationMiddleware.csrfProtection;
export const generateCSRFToken = AuthenticationMiddleware.generateCSRFToken;
export const rateLimit = AuthenticationMiddleware.rateLimit;
export const securityHeaders = AuthenticationMiddleware.securityHeaders;
export const ssoAuth = AuthenticationMiddleware.ssoAuth;

// Enhanced role-based authorization
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      SecurityAudit.logSecurityEvent('INSUFFICIENT_ROLE', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
      });
      res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
};

export const requireUserType = (...userTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!userTypes.includes(req.user.userType)) {
      SecurityAudit.logSecurityEvent('INSUFFICIENT_USER_TYPE', {
        userId: req.user.id,
        userType: req.user.userType,
        requiredTypes: userTypes,
      });
      res.status(403).json({
        success: false,
        error: `Access denied. Required user types: ${userTypes.join(', ')}`
      });
      return;
    }

    next();
  };
};

export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some(permission =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      SecurityAudit.logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions: permissions,
      });
      res.status(403).json({
        success: false,
        error: `Access denied. Required permissions: ${permissions.join(', ')}`
      });
      return;
    }

    next();
  };
};

// Enhanced token blacklist helper
export const blacklistToken = async (token: string): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as EnhancedJWTPayload;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redisClient.setex(`blacklist:${token}`, ttl, 'true');
        SecurityAudit.logSecurityEvent('TOKEN_BLACKLISTED', {
          userId: decoded.userId,
          tokenExpiry: decoded.exp,
        });
      }
    }
  } catch (blacklistError) {
    logger.error('Failed to blacklist token:', blacklistError);
    throw blacklistError;
  }
};

// Additional authorization middleware for backward compatibility
export const requireVerificationTier = (...tiers: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!tiers.includes(req.user.verificationTier)) {
      SecurityAudit.logSecurityEvent('INSUFFICIENT_VERIFICATION_TIER', {
        userId: req.user.id,
        verificationTier: req.user.verificationTier,
        requiredTiers: tiers,
      });
      res.status(403).json({
        success: false,
        error: `Access denied. Required verification tiers: ${tiers.join(', ')}`
      });
      return;
    }

    next();
  };
};

export const requireVerifiedUser = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (!req.user.isVerified) {
    SecurityAudit.logSecurityEvent('UNVERIFIED_USER_ACCESS_ATTEMPT', {
      userId: req.user.id,
      userType: req.user.userType,
    });
    res.status(403).json({
      success: false,
      error: 'Account verification required'
    });
    return;
  }

  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    SecurityAudit.logSecurityEvent('INSUFFICIENT_ADMIN_ROLE', {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: ['admin', 'super_admin'],
    });
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }

  next();
};

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (req.user.role !== 'super_admin') {
    SecurityAudit.logSecurityEvent('INSUFFICIENT_SUPER_ADMIN_ROLE', {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRole: 'super_admin',
    });
    res.status(403).json({
      success: false,
      error: 'Super admin access required'
    });
    return;
  }

  next();
};

// Optional authentication middleware (doesn't throw error if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = AuthenticationMiddleware.extractToken(req);

    if (token) {
      // Verify JWT token with enhanced validation
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: securityConfig.jwt.audience[0],
      }) as unknown as EnhancedJWTPayload;

      // Check if token is blacklisted
      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        return next(); // Skip attaching user if token is blacklisted
      }

      // Get user from cache or database
      let user = await AuthenticationMiddleware.getUserFromCache(decoded.userId);
      if (!user) {
        user = await AuthenticationMiddleware.getUserFromDatabase(decoded.userId);
        if (user) {
          await AuthenticationMiddleware.cacheUser(user);
        }
      }

      if (user && user.isActive) {
        req.user = {
          ...user,
          permissions: decoded.permissions || [],
          ssoSessionId: decoded.ssoSessionId,
        };
      }
    }

    next();
  } catch (error) {
    // Ignore authentication errors in optional middleware
    next();
  }
};

// Alias exports for backward compatibility
export const authMiddleware = authenticateToken;
export const optionalAuthMiddleware = optionalAuth;