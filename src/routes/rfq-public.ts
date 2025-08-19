import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { rfqService } from '@/services/rfq.service';
import { logger } from '@/utils/logger';

const router = Router();

const validate = (req: Request, res: Response, next: any) => {
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
  next();
};

// GET /api/public/rfqs/recent - Public top-N RFQs with limited fields
router.get(
  '/recent',
  [query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const rfqs = await rfqService.getPublicRecentRfqs(limit);
      return res.json({ success: true, data: rfqs });
    } catch (error: any) {
      logger.error('Error fetching public recent RFQs:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'RFQ_PUBLIC_FETCH_FAILED', message: error.message || 'Failed to fetch recent RFQs' },
      });
    }
  }
);

export { router as rfqPublicRoutes };
