import { Router, Request, Response } from 'express';
import { couponService, CreateCouponRequest } from '../services/coupon.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication middleware to all coupon routes
router.use(authenticate);

/**
 * POST /api/coupons
 * Create a new coupon (Admin only)
 */
router.post('/', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // TODO: Add admin role check when role-based auth is implemented
    // For now, allowing all authenticated users to create coupons for testing

    const {
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      expiresAt,
      isActive,
    } = req.body as CreateCouponRequest;

    // Validate required fields
    if (!code || !discountType || discountValue === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Code, discount type, and discount value are required',
        },
      });
    }

    // Validate discount type
    if (!['percentage', 'fixed'].includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Discount type must be either "percentage" or "fixed"',
        },
      });
    }

    const coupon = await couponService.createCoupon({
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isActive,
    });

    return res.status(201).json({
      success: true,
      data: coupon,
      message: 'Coupon created successfully',
    });
  } catch (error) {
    logger.error('Error creating coupon:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      
      if (error.message.includes('cannot exceed') || 
          error.message.includes('must be greater')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create coupon',
      },
    });
  }
});

/**
 * GET /api/coupons
 * Get all active coupons
 */
router.get('/', async (req: Request, res: Response)=> {
  try {
    const coupons = await couponService.getActiveCoupons();

    return res.json({
      success: true,
      data: coupons,
    });
  } catch (error) {
    logger.error('Error getting coupons:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get coupons',
      },
    });
  }
});

/**
 * GET /api/coupons/:code
 * Get coupon by code
 */
router.get('/:code', async (req: Request, res: Response)=> {
  try {
    const { code } = req.params;
    const coupon = await couponService.getCouponByCode(code);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Coupon not found',
        },
      });
    }

    return res.json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    logger.error('Error getting coupon:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get coupon',
      },
    });
  }
});

/**
 * PUT /api/coupons/:id
 * Update coupon (Admin only)
 */
router.put('/:id', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // TODO: Add admin role check when role-based auth is implemented

    const { id } = req.params;
    const updates = req.body;

    // Convert expiresAt to Date if provided
    if (updates.expiresAt) {
      updates.expiresAt = new Date(updates.expiresAt);
    }

    const coupon = await couponService.updateCoupon(id, updates);

    return res.json({
      success: true,
      data: coupon,
      message: 'Coupon updated successfully',
    });
  } catch (error) {
    logger.error('Error updating coupon:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('cannot exceed') || 
          error.message.includes('must be greater')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update coupon',
      },
    });
  }
});

/**
 * DELETE /api/coupons/:id
 * Delete coupon (Admin only)
 */
router.delete('/:id', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // TODO: Add admin role check when role-based auth is implemented

    const { id } = req.params;
    await couponService.deleteCoupon(id);

    return res.json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting coupon:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete coupon',
      },
    });
  }
});

/**
 * POST /api/coupons/validate
 * Validate coupon for a specific order amount
 */
router.post('/validate', async (req: Request, res: Response)=> {
  try {
    const { code, orderAmount } = req.body;

    if (!code || orderAmount === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Coupon code and order amount are required',
        },
      });
    }

    if (orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Order amount must be greater than 0',
        },
      });
    }

    const discount = await couponService.applyCoupon({
      code,
      orderAmount,
    });

    return res.json({
      success: true,
      data: {
        valid: true,
        discount,
      },
    });
  } catch (error) {
    logger.error('Error validating coupon:', error);
    
    if (error instanceof Error) {
      return res.status(400).json({
        success: false,
        data: {
          valid: false,
          error: error.message,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to validate coupon',
      },
    });
  }
});

/**
 * GET /api/coupons/:id/stats
 * Get coupon usage statistics (Admin only)
 */
router.get('/:id/stats', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // TODO: Add admin role check when role-based auth is implemented

    const { id } = req.params;
    const stats = await couponService.getCouponStats(id);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting coupon stats:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get coupon stats',
      },
    });
  }
});

/**
 * POST /api/coupons/validate-multiple
 * Validate multiple coupons for stacking (future enhancement)
 */
router.post('/validate-multiple', async (req: Request, res: Response)=> {
  try {
    const { codes, orderAmount } = req.body;

    if (!codes || !Array.isArray(codes) || orderAmount === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Coupon codes array and order amount are required',
        },
      });
    }

    if (orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Order amount must be greater than 0',
        },
      });
    }

    const discounts = await couponService.validateMultipleCoupons(codes, orderAmount);

    return res.json({
      success: true,
      data: {
        discounts,
        totalDiscount: discounts.reduce((sum, d) => sum + d.discountAmount, 0),
      },
    });
  } catch (error) {
    logger.error('Error validating multiple coupons:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to validate coupons',
      },
    });
  }
});

export default router;