import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
import { logger } from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

// GET /api/ads - Get ads with filtering
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('type').optional().isIn(['banner', 'product', 'category']).withMessage('Invalid ad type'),
  query('placement').optional().isIn(['home', 'category', 'product', 'search']).withMessage('Invalid placement'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as string;
    const placement = req.query.placement as string;

    // Build where clause
    const where: any = { 
      status: 'active',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    };

    if (type) where.type = type;
    if (placement) where.placement = placement;

    // Get ads with pagination
    const ads = await prisma.advertisement.findMany({
      where,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { priority: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.advertisement.count({ where });
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data: {
        ads,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    logger.error('Error fetching ads:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch ads',
      },
    });
  }
});

// GET /api/ads/:id - Get ad by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Ad ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const ad = await prisma.advertisement.findUnique({
      where: { id: req.params.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!ad) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AD_NOT_FOUND',
          message: 'Advertisement not found',
        },
      });
    }

    return res.json({
      success: true,
      data: ad,
    });
  } catch (error) {
    logger.error('Error fetching ad:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch advertisement',
      },
    });
  }
});

// POST /api/ads - Create new ad
router.post('/', authenticate, [
  body('title').trim().isLength({ min: 3, max: 255 }).withMessage('Title must be between 3 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  body('type').isIn(['banner', 'product', 'category']).withMessage('Invalid ad type'),
  body('placement').isIn(['home', 'category', 'product', 'search']).withMessage('Invalid placement'),
  body('imageUrl').isURL().withMessage('Valid image URL is required'),
  body('targetUrl').optional().isURL().withMessage('Target URL must be valid'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('budget').isFloat({ min: 0 }).withMessage('Budget must be non-negative'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      type,
      placement,
      imageUrl,
      targetUrl,
      startDate,
      endDate,
      budget,
      priority = 5,
    } = req.body;

    const ad = await prisma.advertisement.create({
      data: {
        title,
        description,
        adType: type,
        adFormat: 'image',
        content: { imageUrl, placement },
        callToAction: 'Learn More',
        destinationUrl: targetUrl,
        priority,
        campaignId: req.body.campaignId, // This should be provided
        status: 'active',
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    logger.info('Advertisement created:', { adId: ad.id, advertiserId: req.authUser!.userId });

    return res.status(201).json({
      success: true,
      data: ad,
      message: 'Advertisement created successfully',
    });
  } catch (error) {
    logger.error('Error creating ad:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create advertisement',
      },
    });
  }
});

// PUT /api/ads/:id - Update ad
router.put('/:id', authenticate, [
  param('id').isUUID().withMessage('Ad ID must be a valid UUID'),
  body('title').optional().trim().isLength({ min: 3, max: 255 }).withMessage('Title must be between 3 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  body('imageUrl').optional().isURL().withMessage('Valid image URL is required'),
  body('targetUrl').optional().isURL().withMessage('Target URL must be valid'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be non-negative'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Check if ad exists and belongs to user
    const existingAd = await prisma.advertisement.findFirst({
      where: {
        id: req.params.id,
        campaign: {
          businessId: req.authUser!.userId,
        },
      },
    });

    if (!existingAd) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AD_NOT_FOUND',
          message: 'Advertisement not found or access denied',
        },
      });
    }

    const ad = await prisma.advertisement.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return res.json({
      success: true,
      data: ad,
      message: 'Advertisement updated successfully',
    });
  } catch (error) {
    logger.error('Error updating ad:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update advertisement',
      },
    });
  }
});

// DELETE /api/ads/:id - Delete ad
router.delete('/:id', authenticate, [
  param('id').isUUID().withMessage('Ad ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Check if ad exists and belongs to user
    const existingAd = await prisma.advertisement.findFirst({
      where: {
        id: req.params.id,
        campaign: {
          businessId: req.authUser!.userId,
        },
      },
    });

    if (!existingAd) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AD_NOT_FOUND',
          message: 'Advertisement not found or access denied',
        },
      });
    }

    await prisma.advertisement.delete({
      where: { id: req.params.id },
    });

    return res.json({
      success: true,
      message: 'Advertisement deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting ad:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete advertisement',
      },
    });
  }
});

export default router;