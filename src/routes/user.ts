import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
import { AuthService } from '@/services/auth.service';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

const router = Router();

/**
 * GET /api/users/profile
 * Get current user profile with complete information
 */
router.get('/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.userId;
    
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
    const [orderCount, totalSpent, reviewCount] = await Promise.all([
      // Count orders
      prisma.order.count({
        where: { buyerId: userId }
      }),
      // Sum total spent (mock for now)
      Promise.resolve(0),
      // Count reviews (mock for now)
      Promise.resolve(0)
    ]);

    const profileData = {
      ...user,
      stats: {
        totalOrders: orderCount,
        totalSpent: totalSpent,
        reviewsGiven: reviewCount,
        averageRating: 4.5 // Mock rating
      }
    };

    return res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: profileData,
    });
  } catch (error: any) {
    logger.error('Get user profile failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to retrieve user profile',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

/**
 * PUT /api/users/profile
 * Update user profile
 */
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

    const userId = req.authUser!.userId;

    // Validate and normalize website URL if provided
    let normalizedWebsite = website;
    if (website) {
      if (!/^https?:\/\/.+/.test(website)) {
        // Try to be helpful: prepend https:// and validate again
        const tried = `https://${website}`;
        if (/^https?:\/\/.+/.test(tried)) {
          normalizedWebsite = tried;
          logger.info('Normalized website by prepending https://', { userId, original: website, normalized: normalizedWebsite });
        } else {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_WEBSITE',
              message: 'Please provide a valid website URL',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] || 'unknown',
            },
          });
        }
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

    logger.info('Profile updated successfully:', { userId });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error: any) {
    logger.error('Update profile failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update profile',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

/**
 * GET /api/users/settings
 * Get user settings/preferences
 */
router.get('/settings', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.userId;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        isVerified: true,
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

    // Return user settings/preferences
    const settings = {
      notifications: {
        email: true,
        push: true,
        sms: false,
      },
      privacy: {
        profileVisible: true,
        contactInfoVisible: false,
      },
      preferences: {
        language: 'en',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      },
    };

    return res.json({
      success: true,
      message: 'User settings retrieved successfully',
      data: { settings, user },
    });
  } catch (error: any) {
    logger.error('Get user settings failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'SETTINGS_FETCH_FAILED',
        message: 'Failed to retrieve user settings',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

/**
 * POST /api/users/avatar
 * Upload user avatar
 */
router.post('/avatar', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Avatar data is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const userId = req.authUser!.userId;

    // Update user avatar
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        avatar,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        avatar: true,
      },
    });

    logger.info('Avatar updated successfully:', { userId });

    return res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: { avatarUrl: updatedUser.avatar },
    });
  } catch (error: any) {
    logger.error('Avatar upload failed:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'AVATAR_UPLOAD_FAILED',
        message: 'Failed to update avatar',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}));

/**
 * POST /api/users/change-password
 * Change user password
 */
router.put('/change-password', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Current password and new password are required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    await AuthService.changePassword(req.authUser!.userId, currentPassword, newPassword);

    return res.json({
      success: true,
      message: 'Password changed successfully',
      data: null,
    });
  } catch (error: any) {
    logger.error('Change password failed:', error);
    
    if (error.message === 'Invalid current password') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    throw error;
  }
}));

export { router as userRoutes };