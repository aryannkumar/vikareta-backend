import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// GET /api/account/profile - Get user account profile
router.get('/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get user with additional profile information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        phone: true,
        gstin: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        location: true,
        avatar: true,
        bio: true,
        website: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Get user statistics
    const [orderCount, productCount, serviceCount] = await Promise.all([
      // Count orders
      prisma.order.count({
        where: { buyerId: userId }
      }),
      // Count products
      prisma.product.count({
        where: { sellerId: userId }
      }),
      // Count services
      prisma.service.count({
        where: { providerId: userId }
      })
    ]);

    const profileData = {
      ...user,
      stats: {
        totalOrders: orderCount,
        totalProducts: productCount,
        totalServices: serviceCount,
        joinedDate: user.createdAt,
        lastActive: user.updatedAt
      }
    };

    return res.json({
      success: true,
      message: 'Account profile retrieved successfully',
      data: profileData,
    });
  } catch (error: any) {
    logger.error('Get account profile failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to retrieve account profile',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

// PUT /api/account/profile - Update user account profile
router.put('/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { 
      firstName, 
      lastName, 
      businessName, 
      gstin, 
      phone, 
      location,
      bio,
      website,
      avatar
    } = req.body;

    const userId = (req as any).user.id;

    // Validate and normalize website URL if provided
    let normalizedWebsite = website;
    if (website) {
      normalizedWebsite = normalizedWebsite.trim();
      
      if (normalizedWebsite && !normalizedWebsite.startsWith('http')) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        businessName,
        gstin,
        phone,
        location,
        bio,
        website: normalizedWebsite,
        avatar,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        phone: true,
        gstin: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        location: true,
        avatar: true,
        bio: true,
        website: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('Account profile updated successfully:', { userId });

    return res.json({
      success: true,
      message: 'Account profile updated successfully',
      data: updatedUser,
    });
  } catch (error: any) {
    logger.error('Update account profile failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update account profile',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

// GET /api/account/activity-log - Get user activity log
router.get('/activity-log', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get recent activities (mock data for now, you can implement based on your needs)
    const activities = [
      {
        id: '1',
        type: 'login',
        description: 'Logged in to account',
        timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      },
      {
        id: '2',
        type: 'profile_update',
        description: 'Updated profile information',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      },
      {
        id: '3',
        type: 'product_created',
        description: 'Created a new product',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      }
    ];

    // In a real implementation, you would query from an activity log table
    // const activities = await prisma.activityLog.findMany({
    //   where: { userId },
    //   orderBy: { createdAt: 'desc' },
    //   take: limit,
    //   skip: offset
    // });

    return res.json({
      success: true,
      message: 'Activity log retrieved successfully',
      data: activities.slice(offset, offset + limit),
      pagination: {
        total: activities.length,
        limit,
        offset,
        hasMore: offset + limit < activities.length
      }
    });
  } catch (error: any) {
    logger.error('Get activity log failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'ACTIVITY_LOG_FETCH_FAILED',
        message: 'Failed to retrieve activity log',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

// GET /api/account/security - Get account security information
router.get('/security', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const securityInfo = {
      twoFactorEnabled: user.twoFactorEnabled || false,
      lastPasswordChange: user.updatedAt,
      accountCreated: user.createdAt,
      recentLogins: [
        {
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          location: 'Unknown'
        }
      ]
    };

    return res.json({
      success: true,
      message: 'Security information retrieved successfully',
      data: securityInfo,
    });
  } catch (error: any) {
    logger.error('Get security info failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'SECURITY_INFO_FETCH_FAILED',
        message: 'Failed to retrieve security information',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

export default router;