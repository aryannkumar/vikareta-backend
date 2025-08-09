import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { negotiationService, CreateCounterOfferData } from '@/services/negotiation.service';
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

// Create counter-offer validation
const createCounterOfferValidation = [
  body('quoteId')
    .isUUID()
    .withMessage('Quote ID must be a valid UUID'),
  body('counterPrice')
    .isFloat({ min: 0 })
    .withMessage('Counter price must be a positive number'),
  body('counterTerms')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Counter terms must not exceed 2000 characters'),
  body('message')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Message must not exceed 1000 characters'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid ISO 8601 date'),
];

// Respond to counter-offer validation
const respondToCounterOfferValidation = [
  param('id')
    .isUUID()
    .withMessage('Negotiation ID must be a valid UUID'),
  body('action')
    .isIn(['accept', 'reject', 'counter'])
    .withMessage('Action must be accept, reject, or counter'),
  body('counterPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Counter price must be a positive number'),
  body('counterTerms')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Counter terms must not exceed 2000 characters'),
  body('message')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Message must not exceed 1000 characters'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be a valid ISO 8601 date'),
];

/**
 * @route POST /api/negotiations/counter-offer
 * @desc Create a counter-offer for a quote
 * @access Private (RFQ owner only)
 */
router.post(
  '/counter-offer',
  authenticate,
  createCounterOfferValidation,
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

      const counterOfferData: CreateCounterOfferData = {
        quoteId: req.body.quoteId,
        counterPrice: req.body.counterPrice,
        counterTerms: req.body.counterTerms,
        message: req.body.message,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
      };

      const negotiation = await negotiationService.createCounterOffer(userId, counterOfferData);

      return res.status(201).json({
        success: true,
        data: negotiation,
        message: 'Counter-offer created successfully',
      });
    } catch (error: any) {
      logger.error('Error creating counter-offer:', error);
      
      if (error.message === 'Access denied: You can only negotiate on your own RFQs') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Cannot negotiate') || error.message.includes('Maximum negotiation')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NEGOTIATION_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'COUNTER_OFFER_CREATION_FAILED',
          message: error.message || 'Failed to create counter-offer',
        },
      });
    }
  }
);

/**
 * @route POST /api/negotiations/:id/respond
 * @desc Respond to a counter-offer
 * @access Private (Quote owner only)
 */
router.post(
  '/:id/respond',
  authenticate,
  respondToCounterOfferValidation,
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

      const negotiationId = req.params.id;
      const action = req.body.action;
      const data = {
        counterPrice: req.body.counterPrice,
        counterTerms: req.body.counterTerms,
        message: req.body.message,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
      };

      const result = await negotiationService.respondToCounterOffer(userId, negotiationId, action, data);

      return res.json({
        success: true,
        data: result,
        message: `Counter-offer ${action}ed successfully`,
      });
    } catch (error: any) {
      logger.error('Error responding to counter-offer:', error);
      
      if (error.message === 'Access denied: You can only respond to negotiations directed to you') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Cannot respond') || error.message.includes('Counter price is required')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RESPONSE_NOT_ALLOWED',
            message: error.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'COUNTER_OFFER_RESPONSE_FAILED',
          message: error.message || 'Failed to respond to counter-offer',
        },
      });
    }
  }
);

/**
 * @route GET /api/negotiations/:id
 * @desc Get negotiation by ID
 * @access Private (Authenticated users)
 */
router.get(
  '/:id',
  authenticate,
  [param('id').isUUID().withMessage('Negotiation ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const negotiationId = req.params.id;
      const negotiation = await negotiationService.getNegotiationById(negotiationId);

      return res.json({
        success: true,
        data: negotiation,
      });
    } catch (error: any) {
      logger.error('Error fetching negotiation:', error);
      
      if (error.message === 'Negotiation not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NEGOTIATION_NOT_FOUND',
            message: 'Negotiation not found',
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'NEGOTIATION_FETCH_FAILED',
          message: error.message || 'Failed to fetch negotiation',
        },
      });
    }
  }
);

/**
 * @route GET /api/negotiations/quote/:quoteId/history
 * @desc Get negotiation history for a quote
 * @access Private (Authenticated users)
 */
router.get(
  '/quote/:quoteId/history',
  authenticate,
  [param('quoteId').isUUID().withMessage('Quote ID must be a valid UUID')],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.quoteId;
      const history = await negotiationService.getNegotiationHistory(quoteId);

      return res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      logger.error('Error fetching negotiation history:', error);
      
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
          code: 'NEGOTIATION_HISTORY_FETCH_FAILED',
          message: error.message || 'Failed to fetch negotiation history',
        },
      });
    }
  }
);

/**
 * @route GET /api/negotiations/stats
 * @desc Get negotiation statistics for current user
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

      const stats = await negotiationService.getUserNegotiationStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Error fetching negotiation stats:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error.message || 'Failed to fetch negotiation statistics',
        },
      });
    }
  }
);

/**
 * @route POST /api/negotiations/process-expired
 * @desc Process expired negotiations (admin only)
 * @access Private (Admin only)
 */
router.post(
  '/process-expired',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      // TODO: Add admin role check
      const result = await negotiationService.processExpiredNegotiations();

      return res.json({
        success: true,
        data: result,
        message: `Processed ${result.expiredCount} expired negotiations`,
      });
    } catch (error: any) {
      logger.error('Error processing expired negotiations:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'PROCESS_EXPIRED_FAILED',
          message: error.message || 'Failed to process expired negotiations',
        },
      });
    }
  }
);

/**
 * @route POST /api/negotiations/auto-convert
 * @desc Process auto-conversion of negotiations (admin only)
 * @access Private (Admin only)
 */
router.post(
  '/auto-convert',
  authenticate,
  [
    body('maxNegotiationRounds')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Max negotiation rounds must be between 1 and 10'),
    body('autoAcceptThreshold')
      .optional()
      .isFloat({ min: 0, max: 50 })
      .withMessage('Auto accept threshold must be between 0 and 50 percent'),
    body('negotiationTimeout')
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage('Negotiation timeout must be between 1 and 168 hours'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      // TODO: Add admin role check
      const settings = {
        maxNegotiationRounds: req.body.maxNegotiationRounds,
        autoAcceptThreshold: req.body.autoAcceptThreshold,
        negotiationTimeout: req.body.negotiationTimeout,
      };

      const result = await negotiationService.processAutoConversion(settings);

      return res.json({
        success: true,
        data: result,
        message: `Auto-converted ${result.convertedCount} negotiations`,
      });
    } catch (error: any) {
      logger.error('Error processing auto-conversion:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'AUTO_CONVERSION_FAILED',
          message: error.message || 'Failed to process auto-conversion',
        },
      });
    }
  }
);

export { router as negotiationRoutes };