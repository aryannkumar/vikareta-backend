import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { rfqService, CreateRfqData, UpdateRfqData, RfqFilters } from '@/services/rfq.service';
import { logger } from '@/utils/logger';

const router = Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
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

// Create RFQ validation
const createRfqValidation = [
  body('title')
    .isString()
    .isLength({ min: 5, max: 255 })
    .withMessage('Title must be between 5 and 255 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters'),
  body('categoryId')
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  body('subcategoryId')
    .optional()
    .isUUID()
    .withMessage('Subcategory ID must be a valid UUID'),
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('budgetMin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a positive number'),
  body('budgetMax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a positive number'),
  body('deliveryTimeline')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Delivery timeline must not exceed 100 characters'),
  body('deliveryLocation')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Delivery location must not exceed 500 characters'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date'),
];

// Update RFQ validation
const updateRfqValidation = [
  param('id')
    .isUUID()
    .withMessage('RFQ ID must be a valid UUID'),
  body('title')
    .optional()
    .isString()
    .isLength({ min: 5, max: 255 })
    .withMessage('Title must be between 5 and 255 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters'),
  body('categoryId')
    .optional()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  body('subcategoryId')
    .optional()
    .isUUID()
    .withMessage('Subcategory ID must be a valid UUID'),
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('budgetMin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a positive number'),
  body('budgetMax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a positive number'),
  body('deliveryTimeline')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Delivery timeline must not exceed 100 characters'),
  body('deliveryLocation')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Delivery location must not exceed 500 characters'),
  body('status')
    .optional()
    .isIn(['active', 'cancelled', 'expired'])
    .withMessage('Status must be active, cancelled, or expired'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date'),
];

// Get RFQs validation
const getRfqsValidation = [
  query('categoryId')
    .optional()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  query('subcategoryId')
    .optional()
    .isUUID()
    .withMessage('Subcategory ID must be a valid UUID'),
  query('status')
    .optional()
    .isIn(['active', 'cancelled', 'expired'])
    .withMessage('Status must be active, cancelled, or expired'),
  query('minBudget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a positive number'),
  query('maxBudget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a positive number'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'expiresAt', 'budgetMax', 'title'])
    .withMessage('Sort by must be createdAt, expiresAt, budgetMax, or title'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
];

/**
 * @route POST /api/rfqs
 * @desc Create a new RFQ
 * @access Private (Authenticated users)
 */
router.post(
  '/',
  authenticate,
  createRfqValidation,
  validateRequest,
  async (req: Request, res: Response) => {
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

      const rfqData: CreateRfqData = {
        title: req.body.title,
        description: req.body.description,
        categoryId: req.body.categoryId,
        subcategoryId: req.body.subcategoryId,
        quantity: req.body.quantity,
        budgetMin: req.body.budgetMin,
        budgetMax: req.body.budgetMax,
        deliveryTimeline: req.body.deliveryTimeline,
        deliveryLocation: req.body.deliveryLocation,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      };

      // Validate budget range
      if (rfqData.budgetMin && rfqData.budgetMax && rfqData.budgetMin > rfqData.budgetMax) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BUDGET_RANGE',
            message: 'Minimum budget cannot be greater than maximum budget',
          },
        });
      }

      const rfq = await rfqService.createRfq(userId, rfqData);

      // Automatically distribute RFQ to relevant sellers
      const distribution = await rfqService.distributeRfqToSellers(rfq.id);

      return res.status(201).json({
        success: true,
        data: {
          rfq: distribution.rfq,
          notifiedSellers: distribution.notifiedSellers.length,
        },
        message: `RFQ created successfully and sent to ${distribution.notifiedSellers.length} relevant sellers`,
      });
    } catch (error: any) {
      logger.error('Error creating RFQ:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_CREATION_FAILED',
          message: error.message || 'Failed to create RFQ',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs
 * @desc Get RFQs with filtering and pagination
 * @access Private (Authenticated users)
 */
router.get(
  '/',
  authenticate,
  getRfqsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const filters: RfqFilters = {
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        status: req.query.status as string,
        minBudget: req.query.minBudget ? parseFloat(req.query.minBudget as string) : undefined,
        maxBudget: req.query.maxBudget ? parseFloat(req.query.maxBudget as string) : undefined,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await rfqService.getRfqs(filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error fetching RFQs:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_FETCH_FAILED',
          message: error.message || 'Failed to fetch RFQs',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs/my
 * @desc Get current user's RFQs
 * @access Private (Authenticated users)
 */
router.get(
  '/my',
  authenticate,
  getRfqsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
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

      const filters: RfqFilters = {
        buyerId: userId,
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        status: req.query.status as string,
        minBudget: req.query.minBudget ? parseFloat(req.query.minBudget as string) : undefined,
        maxBudget: req.query.maxBudget ? parseFloat(req.query.maxBudget as string) : undefined,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await rfqService.getRfqs(filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error fetching user RFQs:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_FETCH_FAILED',
          message: error.message || 'Failed to fetch RFQs',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs/my-with-responses
 * @desc Get current user's RFQs with detailed responses/quotes
 * @access Private (Authenticated buyers)
 */
router.get(
  '/my-with-responses',
  authenticate,
  getRfqsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
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

      const filters: Omit<RfqFilters, 'buyerId'> = {
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        status: req.query.status as string,
        rfqType: req.query.rfqType as 'product' | 'service',
        minBudget: req.query.minBudget ? parseFloat(req.query.minBudget as string) : undefined,
        maxBudget: req.query.maxBudget ? parseFloat(req.query.maxBudget as string) : undefined,
        location: req.query.location as string,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await rfqService.getMyRfqsWithResponses(userId, filters);

      return res.json({
        success: true,
        data: result,
        message: `Found ${result.rfqs.length} RFQs with ${result.summary.totalResponses} total responses`,
      });
    } catch (error: any) {
      logger.error('Error fetching user RFQs with responses:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_FETCH_FAILED',
          message: error.message || 'Failed to fetch RFQs with responses',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs/relevant
 * @desc Get RFQs relevant to the current seller
 * @access Private (Authenticated sellers)
 */
router.get(
  '/relevant',
  authenticate,
  getRfqsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
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

      const filters: Omit<RfqFilters, 'buyerId'> = {
        categoryId: req.query.categoryId as string,
        subcategoryId: req.query.subcategoryId as string,
        status: req.query.status as string,
        minBudget: req.query.minBudget ? parseFloat(req.query.minBudget as string) : undefined,
        maxBudget: req.query.maxBudget ? parseFloat(req.query.maxBudget as string) : undefined,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await rfqService.getRelevantRfqsForSeller(userId, filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error fetching relevant RFQs:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_FETCH_FAILED',
          message: error.message || 'Failed to fetch relevant RFQs',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs/stats
 * @desc Get RFQ statistics for current user
 * @access Private (Authenticated users)
 */
router.get(
  '/stats',
  authenticate,
  async (req: Request, res: Response) => {
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

      const stats = await rfqService.getBuyerRfqStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Error fetching RFQ stats:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error.message || 'Failed to fetch RFQ statistics',
        },
      });
    }
  }
);

/**
 * @route GET /api/rfqs/:id
 * @desc Get RFQ by ID
 * @access Private (Authenticated users)
 */
router.get(
  '/:id',
  authenticate,
  [param('id').isUUID().withMessage('RFQ ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const rfqId = req.params.id;
      const rfq = await rfqService.getRfqById(rfqId);

      return res.json({
        success: true,
        data: rfq,
      });
    } catch (error: any) {
      logger.error('Error fetching RFQ:', error);
      
      if (error.message === 'RFQ not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RFQ_NOT_FOUND',
            message: 'RFQ not found',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_FETCH_FAILED',
          message: error.message || 'Failed to fetch RFQ',
        },
      });
    }
  }
);

/**
 * @route PUT /api/rfqs/:id
 * @desc Update RFQ
 * @access Private (RFQ owner only)
 */
router.put(
  '/:id',
  authenticate,
  updateRfqValidation,
  validateRequest,
  async (req: Request, res: Response) => {
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

      const rfqId = req.params.id;
      const updateData: UpdateRfqData = {
        title: req.body.title,
        description: req.body.description,
        categoryId: req.body.categoryId,
        subcategoryId: req.body.subcategoryId,
        quantity: req.body.quantity,
        budgetMin: req.body.budgetMin,
        budgetMax: req.body.budgetMax,
        deliveryTimeline: req.body.deliveryTimeline,
        deliveryLocation: req.body.deliveryLocation,
        status: req.body.status,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      };

      // Validate budget range
      if (updateData.budgetMin && updateData.budgetMax && updateData.budgetMin > updateData.budgetMax) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BUDGET_RANGE',
            message: 'Minimum budget cannot be greater than maximum budget',
          },
        });
      }

      const rfq = await rfqService.updateRfq(rfqId, userId, updateData);

      return res.json({
        success: true,
        data: rfq,
        message: 'RFQ updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating RFQ:', error);
      
      if (error.message === 'RFQ not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RFQ_NOT_FOUND',
            message: 'RFQ not found or access denied',
          },
        });
      }

      if (error.message === 'Cannot update expired or inactive RFQ') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RFQ_UPDATE_NOT_ALLOWED',
            message: 'Cannot update expired or inactive RFQ',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_UPDATE_FAILED',
          message: error.message || 'Failed to update RFQ',
        },
      });
    }
  }
);

/**
 * @route DELETE /api/rfqs/:id
 * @desc Delete (cancel) RFQ
 * @access Private (RFQ owner only)
 */
router.delete(
  '/:id',
  authenticate,
  [param('id').isUUID().withMessage('RFQ ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
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

      const rfqId = req.params.id;
      await rfqService.deleteRfq(rfqId, userId);

      return res.json({
        success: true,
        message: 'RFQ cancelled successfully',
      });
    } catch (error: any) {
      logger.error('Error deleting RFQ:', error);
      
      if (error.message === 'RFQ not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RFQ_NOT_FOUND',
            message: 'RFQ not found or access denied',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_DELETE_FAILED',
          message: error.message || 'Failed to cancel RFQ',
        },
      });
    }
  }
);

/**
 * @route POST /api/rfqs/:id/distribute
 * @desc Manually distribute RFQ to relevant sellers
 * @access Private (RFQ owner only)
 */
router.post(
  '/:id/distribute',
  authenticate,
  [param('id').isUUID().withMessage('RFQ ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
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

      const rfqId = req.params.id;
      
      // Verify RFQ belongs to user
      const rfq = await rfqService.getRfqById(rfqId);
      if (rfq.buyer.id !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied',
          },
        });
      }

      const distribution = await rfqService.distributeRfqToSellers(rfqId);

      return res.json({
        success: true,
        data: {
          rfq: distribution.rfq,
          notifiedSellers: distribution.notifiedSellers.length,
        },
        message: `RFQ distributed to ${distribution.notifiedSellers.length} relevant sellers`,
      });
    } catch (error: any) {
      logger.error('Error distributing RFQ:', error);
      
      if (error.message === 'RFQ not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RFQ_NOT_FOUND',
            message: 'RFQ not found',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_DISTRIBUTION_FAILED',
          message: error.message || 'Failed to distribute RFQ',
        },
      });
    }
  }
);

export { router as rfqRoutes };