import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { logger } from '@/utils/logger';

const router = Router();

// GET /api/stats - Public homepage metrics
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [categories, products, services, rfqs] = await Promise.all([
      prisma.category.count(),
      prisma.product.count({ where: { status: 'active' as any } }),
      // optional chaining in case Service model doesn't exist yet
      (prisma as any).service?.count?.() ?? Promise.resolve(0),
      prisma.rfq.count({ where: { status: 'active' as any } }),
    ]);

    return res.json({
      success: true,
      data: {
        totals: {
          categories,
          products,
          services,
          rfqs,
        },
        velocity: {
          rfqsToday: Math.min(rfqs, 25),
          quotesToday: 0,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error generating public stats', error);
    return res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: 'Failed to load stats' },
    });
  }
});

export default router;
