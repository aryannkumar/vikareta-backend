import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface JwtPayload {
  userId: string;
  email: string;
  userType: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        userId: string;
        email: string;
        userType: string;
        verificationTier: string;
      };
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
        },
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Authentication configuration error',
        },
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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
      userId: user.id,
      email: user.email || '',
      userType: user.userType || 'user',
      verificationTier: user.verificationTier || 'basic',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token',
        },
      });
    }

    logger.error('Authentication error:', error);
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