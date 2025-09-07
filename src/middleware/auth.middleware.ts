import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Extend Request interface to include user
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
      };
    }
  }
}

// JWT payload interface
interface JWTPayload {
  userId: string;
  email?: string;
  phone?: string;
  role?: string;
  userType: string;
  aud?: string;
  iat: number;
  exp: number;
}

// Custom error classes
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as JWTPayload;

    // Audience guard (best-effort): map host to expected audience
    try {
      const host = req.hostname || '';
      let expectedAud: string | null = null;
      if (host.includes('dashboard')) expectedAud = 'dashboard';
      else if (host.includes('admin')) expectedAud = 'admin';
      else if (host.includes('api') || host.includes('vikareta')) expectedAud = null; // accept any for primary API/web
      if (expectedAud && decoded.aud && decoded.aud !== expectedAud) {
        res.status(401).json({ success: false, error: 'Token audience mismatch' });
        return; 
      }
    } catch (audErr) {
      logger.warn('Audience validation warning:', audErr);
    }
    
    // Check if token is blacklisted
    try {
      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        res.status(401).json({
          success: false,
          error: 'Token has been revoked'
        });
        return;
      }
    } catch (redisError) {
      logger.warn('Redis error checking blacklist:', redisError);
    }

    // Get user from cache or database
    let user;
    try {
      const cachedUser = await redisClient.get(`user:${decoded.userId}`);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      }
    } catch (redisError) {
      logger.warn('Redis error getting user:', redisError);
    }
    
      if (!user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          userType: true,
          isVerified: true,
          verificationTier: true,
          isActive: true,
        },
      });

      if (dbUser) {
        // Normalize nulls to undefined to satisfy request user typing
        user = {
          id: dbUser.id,
          email: dbUser.email ?? undefined,
          phone: dbUser.phone ?? undefined,
          role: dbUser.role ?? undefined,
          userType: dbUser.userType,
          isVerified: dbUser.isVerified,
          verificationTier: dbUser.verificationTier,
          isActive: dbUser.isActive,
        } as any;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Cache user for 15 minutes
      try {
        await redisClient.setex(`user:${decoded.userId}`, 900, JSON.stringify(user));
      } catch (redisError) {
        logger.warn('Redis error caching user:', redisError);
      }
    }

      if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Account has been deactivated'
      });
      return;
    }

  // Attach user to request (cast to any to satisfy typing normalization)
  req.user = user as any;

    // Log authentication event
    logger.info(`User authenticated: ${user.id}`, {
      userId: user.id,
      userType: user.userType,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    } else if (error instanceof jwt.TokenExpiredError) {
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

// Optional authentication middleware (doesn't throw error if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as JWTPayload;
      // Optional audience check (non-fatal here)
      try {
        const host = req.hostname || '';
        let expectedAud: string | null = null;
        if (host.includes('dashboard')) expectedAud = 'dashboard';
        else if (host.includes('admin')) expectedAud = 'admin';
        if (expectedAud && decoded.aud && decoded.aud !== expectedAud) {
          // Skip attaching user if audience mismatch
          return next();
        }
      } catch (e) {
        logger.warn('Optional audience check failed', e);
      }
      
      // Check if token is blacklisted
      try {
        const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
        if (!isBlacklisted) {
          // Get user from cache or database
          let user;
          try {
            const cachedUser = await redisClient.get(`user:${decoded.userId}`);
            if (cachedUser) {
              user = JSON.parse(cachedUser);
            }
          } catch (redisError) {
            logger.warn('Redis error getting user:', redisError);
          }
          
          if (!user) {
            user = await prisma.user.findUnique({
              where: { id: decoded.userId },
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                userType: true,
                isVerified: true,
                verificationTier: true,
                isActive: true,
              },
            });

            if (user && user.isActive) {
              try {
                await redisClient.setex(`user:${decoded.userId}`, 900, JSON.stringify(user));
              } catch (redisError) {
                logger.warn('Redis error caching user:', redisError);
              }
              req.user = user as any;
            }
          } else if (user.isActive) {
            req.user = user as any;
          }
        }
      } catch (redisError) {
        logger.warn('Redis error in optional auth:', redisError);
      }
    }
    
    next();
  } catch (error) {
    // Ignore authentication errors in optional middleware
    next();
  }
};

// Role-based authorization middleware
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
      res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
};

// User type authorization middleware
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
      res.status(403).json({
        success: false,
        error: `Access denied. Required user types: ${userTypes.join(', ')}`
      });
      return;
    }

    next();
  };
};

// Verification tier authorization middleware
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
      res.status(403).json({
        success: false,
        error: `Access denied. Required verification tiers: ${tiers.join(', ')}`
      });
      return;
    }

    next();
  };
};

// Verified user middleware
export const requireVerifiedUser = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (!req.user.isVerified) {
    res.status(403).json({
      success: false,
      error: 'Account verification required'
    });
    return;
  }

  next();
};

// Admin middleware
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }

  next();
};

// Super admin middleware
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (req.user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Super admin access required'
    });
    return;
  }

  next();
};

// Extract token from request
const extractToken = (req: Request): string | null => {
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
};

// Token blacklist helper
export const blacklistToken = async (token: string): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redisClient.setex(`blacklist:${token}`, ttl, 'true');
      }
    }
  } catch (blacklistError) {
    logger.error('Failed to blacklist token:', blacklistError);
    throw blacklistError; // Re-throw to maintain error handling
  }
};

// Alias exports for backward compatibility
export const authMiddleware = authenticateToken;
export const optionalAuthMiddleware = optionalAuth;

// Dashboard access middleware - requires business user with active subscription
export const requireDashboardAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // First authenticate the user
    await authenticateToken(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Check if user is a business (seller)
    if (req.user.userType !== 'seller' && req.user.userType !== 'both') {
      res.status(403).json({
        success: false,
        error: 'Access denied: Only business users can access the dashboard'
      });
      return;
    }

    // Check if user is verified
    if (!req.user.isVerified) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Email verification required'
      });
      return;
    }

    // Check if user has an active subscription
    try {
      const { prisma } = await import('@/config/database');
      const currentSubscription = await prisma.subscription.findFirst({
        where: {
          userId: req.user.id,
          status: 'active',
          endDate: {
            gte: new Date()
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!currentSubscription) {
        res.status(403).json({
          success: false,
          error: 'Access denied: Active subscription required to access dashboard'
        });
        return;
      }

      // Attach subscription info to request for dashboard use
      (req as any).subscription = currentSubscription;
    } catch (error) {
      logger.error('Error checking subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Dashboard access middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};