/**
 * SSO Authentication Middleware
 * Updated to work with HttpOnly cookies instead of Authorization headers
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

interface JwtPayload {
  id: string;
  email: string;
  role: string;
  userType: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        userId: string; // For backward compatibility
        email: string;
        userType: string;
        role: string;
        verificationTier: string;
      };
    }
  }
}

/**
 * SSO Authentication Middleware
 * Reads access token from HttpOnly cookie
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try cookie-based authentication first (SSO)
    let token = req.cookies.access_token;
    let isSSO = true;

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        isSSO = false;
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
        },
      });
    }

    if (!JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Authentication configuration error',
        },
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Handle both old and new token formats
    const userId = decoded.id || (decoded as any).userId;
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    req.authUser = {
      id: user.id,
      userId: user.id, // For backward compatibility
      email: user.email || '',
      userType: user.userType || 'user',
      role: user.userType || 'user',
      verificationTier: user.verificationTier || 'basic',
    };

    logger.debug(`SSO: User authenticated via ${isSSO ? 'cookie' : 'header'}:`, { 
      userId: user.id, 
      email: user.email 
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Access token expired',
          },
        });
      }
      
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token',
        },
      });
    }

    logger.error('SSO: Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
      },
    });
  }
};

export const requireVerificationTier = (requiredTier: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const tierLevels = {
      basic: 1,
      standard: 2,
      premium: 3,
    };

    const userLevel = tierLevels[req.authUser.verificationTier as keyof typeof tierLevels] || 0;
    const requiredLevel = tierLevels[requiredTier as keyof typeof tierLevels] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_VERIFICATION',
          message: `${requiredTier} verification tier required`,
        },
      });
    }

    next();
  };
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  if (req.authUser.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Admin access required',
      },
    });
  }

  next();
};