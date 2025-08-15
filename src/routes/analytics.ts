import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { AnalyticsService } from '@/services/analytics.service';

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

/**
 * GET /api/analytics/dashboard
 * Get real-time dashboard analytics
 */
router.get('/dashboard', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const dashboardData = await AnalyticsService.getRealTimeDashboard();
  
  return res.json({
    success: true,
    message: 'Dashboard analytics retrieved successfully',
    data: dashboardData,
  });
}));

/**
 * GET /api/analytics/orders/recent
 * Get recent orders with details
 */
router.get('/orders/recent', [
  authenticate,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
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

  const recentOrders = await prisma.order.findMany({
    where: {
      OR: [
        { buyerId: userId },
        { sellerId: userId },
      ],
    },
    include: {
      buyer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              price: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  const ordersWithDetails = recentOrders.map(order => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: Number(order.totalAmount),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    buyer: order.buyer,
    seller: order.seller,
    itemCount: order.items.length,
    items: order.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.title,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
    })),
    userRole: order.buyerId === userId ? 'buyer' : 'seller',
  }));

  return res.json({
    success: true,
    message: 'Recent orders retrieved successfully',
    data: {
      orders: ordersWithDetails,
      total: ordersWithDetails.length,
    },
  });
}));

/**
 * GET /api/analytics/summary
 * Get overall analytics summary for the user
 */
router.get('/summary', authenticate, asyncHandler(async (req: Request, res: Response) => {
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

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get counts for different entities
  const [
    totalOrders,
    totalProducts,
    totalRfqs,
    totalQuotes,
    recentOrders,
    recentRevenue,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
        ],
      },
    }),
    prisma.product.count({
      where: {
        sellerId: userId,
      },
    }),
    prisma.rfq.count({
      where: {
        buyerId: userId,
      },
    }),
    prisma.quote.count({
      where: {
        sellerId: userId,
      },
    }),
    prisma.order.count({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
        ],
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
    }),
    prisma.order.aggregate({
      where: {
        sellerId: userId,
        status: { in: ['completed', 'delivered'] },
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
  ]);

  const summary = {
    totalOrders,
    totalProducts,
    totalRfqs,
    totalQuotes,
    recentOrders,
    recentRevenue: Number(recentRevenue._sum.totalAmount || 0),
    period: '30 days',
  };

  return res.json({
    success: true,
    message: 'Analytics summary retrieved successfully',
    data: summary,
  });
}));

export { router as analyticsRoutes };