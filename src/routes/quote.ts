import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { quoteService, CreateQuoteData, UpdateQuoteData, QuoteFilters } from '@/services/quote.service';
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

// Create quote validation
const createQuoteValidation = [
  body('rfqId')
    .isUUID()
    .withMessage('RFQ ID must be a valid UUID'),
  body('totalPrice')
    .isFloat({ min: 0 })
    .withMessage('Total price must be a positive number'),
  body('deliveryTimeline')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Delivery timeline must not exceed 100 characters'),
  body('termsConditions')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Terms and conditions must not exceed 2000 characters'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid ISO 8601 date'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array must contain at least one item'),
  body('items.*.productId')
    .isUUID()
    .withMessage('Product ID must be a valid UUID'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a positive number'),
  body('items.*.totalPrice')
    .isFloat({ min: 0 })
    .withMessage('Total price must be a positive number'),
];

// Update quote validation
const updateQuoteValidation = [
  param('id')
    .isUUID()
    .withMessage('Quote ID must be a valid UUID'),
  body('totalPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total price must be a positive number'),
  body('deliveryTimeline')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Delivery timeline must not exceed 100 characters'),
  body('termsConditions')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Terms and conditions must not exceed 2000 characters'),
  body('status')
    .optional()
    .isIn(['pending', 'accepted', 'rejected', 'expired', 'withdrawn'])
    .withMessage('Status must be pending, accepted, rejected, expired, or withdrawn'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid ISO 8601 date'),
];

// Get quotes validation
const getQuotesValidation = [
  query('rfqId')
    .optional()
    .isUUID()
    .withMessage('RFQ ID must be a valid UUID'),
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'rejected', 'expired', 'withdrawn'])
    .withMessage('Status must be pending, accepted, rejected, expired, or withdrawn'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  query('validOnly')
    .optional()
    .isBoolean()
    .withMessage('Valid only must be a boolean'),
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
    .isIn(['createdAt', 'totalPrice', 'validUntil'])
    .withMessage('Sort by must be createdAt, totalPrice, or validUntil'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
];

/**
 * @route POST /api/quotes
 * @desc Create a new quote
 * @access Private (Authenticated sellers)
 */
router.post(
  '/',
  authenticate,
  createQuoteValidation,
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

      const quoteData: CreateQuoteData = {
        rfqId: req.body.rfqId,
        totalPrice: req.body.totalPrice,
        deliveryTimeline: req.body.deliveryTimeline,
        termsConditions: req.body.termsConditions,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        items: req.body.items,
      };

      // Validate that total price matches sum of item totals
      const itemsTotal = quoteData.items.reduce((sum, item) => sum + item.totalPrice, 0);
      if (Math.abs(quoteData.totalPrice - itemsTotal) > 0.01) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PRICE_MISMATCH',
            message: 'Total price does not match sum of item totals',
          },
        });
      }

      const quote = await quoteService.createQuote(userId, quoteData);

      return res.status(201).json({
        success: true,
        data: quote,
        message: 'Quote created successfully',
      });
    } catch (error: any) {
      logger.error('Error creating quote:', error);
      
      if (error.message === 'RFQ not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RFQ_NOT_FOUND',
            message: 'RFQ not found',
          },
        });
      }

      if (error.message === 'RFQ is not active' || error.message === 'RFQ has expired') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RFQ_NOT_AVAILABLE',
            message: error.message,
          },
        });
      }

      if (error.message === 'You have already submitted a quote for this RFQ') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'QUOTE_ALREADY_EXISTS',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Insufficient stock')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_CREATION_FAILED',
          message: error.message || 'Failed to create quote',
        },
      });
    }
  }
);

/**
 * @route GET /api/quotes
 * @desc Get quotes with filtering and pagination
 * @access Private (Authenticated users)
 */
router.get(
  '/',
  authenticate,
  getQuotesValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const filters: QuoteFilters = {
        rfqId: req.query.rfqId as string,
        status: req.query.status as string,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        validOnly: req.query.validOnly === 'true',
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await quoteService.getQuotes(filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error fetching quotes:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_FETCH_FAILED',
          message: error.message || 'Failed to fetch quotes',
        },
      });
    }
  }
);

/**
 * @route GET /api/quotes/my
 * @desc Get current seller's quotes
 * @access Private (Authenticated sellers)
 */
router.get(
  '/my',
  authenticate,
  getQuotesValidation,
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

      const filters: QuoteFilters = {
        sellerId: userId,
        rfqId: req.query.rfqId as string,
        status: req.query.status as string,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        validOnly: req.query.validOnly === 'true',
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await quoteService.getQuotes(filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error fetching seller quotes:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_FETCH_FAILED',
          message: error.message || 'Failed to fetch quotes',
        },
      });
    }
  }
);

/**
 * @route GET /api/quotes/stats
 * @desc Get quote statistics for current seller
 * @access Private (Authenticated sellers)
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

      const stats = await quoteService.getSellerQuoteStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Error fetching quote stats:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error.message || 'Failed to fetch quote statistics',
        },
      });
    }
  }
);

/**
 * @route GET /api/quotes/compare/:rfqId
 * @desc Get quotes for comparison and evaluation
 * @access Private (RFQ owner only)
 */
router.get(
  '/compare/:rfqId',
  authenticate,
  [param('rfqId').isUUID().withMessage('RFQ ID must be a valid UUID')],
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

      const rfqId = req.params.rfqId;
      const comparison = await quoteService.getQuotesForComparison(rfqId, userId);

      return res.json({
        success: true,
        data: comparison,
      });
    } catch (error: any) {
      logger.error('Error fetching quote comparison:', error);
      
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
          code: 'COMPARISON_FETCH_FAILED',
          message: error.message || 'Failed to fetch quote comparison',
        },
      });
    }
  }
);

/**
 * @route GET /api/quotes/:id
 * @desc Get quote by ID
 * @access Private (Authenticated users)
 */
router.get(
  '/:id',
  authenticate,
  [param('id').isUUID().withMessage('Quote ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      const quote = await quoteService.getQuoteById(quoteId);

      return res.json({
        success: true,
        data: quote,
      });
    } catch (error: any) {
      logger.error('Error fetching quote:', error);
      
      if (error.message === 'Quote not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_FETCH_FAILED',
          message: error.message || 'Failed to fetch quote',
        },
      });
    }
  }
);

/**
 * @route PUT /api/quotes/:id
 * @desc Update quote
 * @access Private (Quote owner only)
 */
router.put(
  '/:id',
  authenticate,
  updateQuoteValidation,
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

      const quoteId = req.params.id;
      const updateData: UpdateQuoteData = {
        totalPrice: req.body.totalPrice,
        deliveryTimeline: req.body.deliveryTimeline,
        termsConditions: req.body.termsConditions,
        status: req.body.status,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
      };

      const quote = await quoteService.updateQuote(quoteId, userId, updateData);

      return res.json({
        success: true,
        data: quote,
        message: 'Quote updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating quote:', error);
      
      if (error.message === 'Quote not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found or access denied',
          },
        });
      }

      if (error.message.includes('Cannot update')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'QUOTE_UPDATE_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_UPDATE_FAILED',
          message: error.message || 'Failed to update quote',
        },
      });
    }
  }
);

/**
 * @route DELETE /api/quotes/:id
 * @desc Withdraw quote
 * @access Private (Quote owner only)
 */
router.delete(
  '/:id',
  authenticate,
  [param('id').isUUID().withMessage('Quote ID must be a valid UUID')],
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

      const quoteId = req.params.id;
      await quoteService.withdrawQuote(quoteId, userId);

      return res.json({
        success: true,
        message: 'Quote withdrawn successfully',
      });
    } catch (error: any) {
      logger.error('Error withdrawing quote:', error);
      
      if (error.message === 'Quote not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found or access denied',
          },
        });
      }

      if (error.message === 'Cannot withdraw accepted quote') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'QUOTE_WITHDRAWAL_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_WITHDRAWAL_FAILED',
          message: error.message || 'Failed to withdraw quote',
        },
      });
    }
  }
);

/**
 * @route POST /api/quotes/:id/accept
 * @desc Accept quote (buyer action)
 * @access Private (RFQ owner only)
 */
router.post(
  '/:id/accept',
  authenticate,
  [param('id').isUUID().withMessage('Quote ID must be a valid UUID')],
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

      const quoteId = req.params.id;
      const quote = await quoteService.acceptQuote(quoteId, userId);

      return res.json({
        success: true,
        data: quote,
        message: 'Quote accepted successfully',
      });
    } catch (error: any) {
      logger.error('Error accepting quote:', error);
      
      if (error.message === 'Quote not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found or access denied',
          },
        });
      }

      if (error.message.includes('not in pending status') || error.message.includes('expired') || error.message.includes('not active')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'QUOTE_ACCEPTANCE_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_ACCEPTANCE_FAILED',
          message: error.message || 'Failed to accept quote',
        },
      });
    }
  }
);

/**
 * @route POST /api/quotes/:id/reject
 * @desc Reject quote (buyer action)
 * @access Private (RFQ owner only)
 */
router.post(
  '/:id/reject',
  authenticate,
  [
    param('id').isUUID().withMessage('Quote ID must be a valid UUID'),
    body('reason').optional().isString().isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),
  ],
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

      const quoteId = req.params.id;
      const reason = req.body.reason;
      
      await quoteService.rejectQuote(quoteId, userId, reason);

      return res.json({
        success: true,
        message: 'Quote rejected successfully',
      });
    } catch (error: any) {
      logger.error('Error rejecting quote:', error);
      
      if (error.message === 'Quote not found or access denied') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUOTE_NOT_FOUND',
            message: 'Quote not found or access denied',
          },
        });
      }

      if (error.message === 'Quote is not in pending status') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'QUOTE_REJECTION_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTE_REJECTION_FAILED',
          message: error.message || 'Failed to reject quote',
        },
      });
    }
  }
);

export { router as quoteRoutes };