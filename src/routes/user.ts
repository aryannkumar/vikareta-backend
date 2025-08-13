import { Router, Request, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.authUser!.userId);

    return res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: { user },
    });
  } catch (error: any) {
    logger.error('Get user profile failed:', error);
    
    if (error.message === 'User not found') {
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

    throw error;
  }
}));

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, businessName, gstin, phone } = req.body;

    const updatedUser = await ProfileService.updateProfile(req.authUser!.userId, {
      firstName,
      lastName,
      businessName,
      gstin,
      phone,
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser },
    });
  } catch (error: any) {
    logger.error('Update profile failed:', error);
    
    if (error.message.includes('Invalid GSTIN')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_GSTIN',
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    throw error;
  }
}));

/**
 * GET /api/users/settings
 * Get user settings/preferences
 */
router.get('/settings', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.authUser!.userId);

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
    
    if (error.message === 'User not found') {
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

    throw error;
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