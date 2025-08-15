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

/**
 * GET /api/analytics/revenue
 * Get revenue analytics for a specific period
 */
router.get('/revenue', [
  authenticate,
  query('period').optional().isString().withMessage('Period must be a string'),
  handleValidationErrors,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = req.authUser?.userId;
  const period = req.query.period as string || '30d';

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not authenticated',
      },
    });
  }

  // Parse period (30d, 7d, 90d, etc.)
  const days = parseInt(period.replace('d', '')) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const revenueData = await prisma.order.groupBy({
    by: ['createdAt'],
    where: {
      sellerId: userId,
      status: { in: ['completed', 'delivered'] },
      createdAt: {
        gte: startDate,
      },
    },
    _sum: {
      totalAmount: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Group by day for chart data
  const dailyRevenue = revenueData.reduce((acc: any, item) => {
    const date = item.createdAt.toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += Number(item._sum.totalAmount || 0);
    return acc;
  }, {});

  const chartData = Object.entries(dailyRevenue).map(([date, revenue]) => ({
    date,
    revenue: Number(revenue),
  }));

  const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);

  return res.json({
    success: true,
    message: 'Revenue analytics retrieved successfully',
    data: {
      period,
      totalRevenue,
      chartData,
      summary: {
        days,
        averageDaily: totalRevenue / days,
        totalOrders: revenueData.length,
      },
    },
  });
}));

/**
 * GET /api/analytics/products/performance
 * Get product performance analytics
 */
router.get('/products/performance', [
  authenticate,
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = req.authUser?.userId;
  const limit = parseInt(req.query.limit as string) || 10;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not authenticated',
      },
    });
  }

  // Get products with their performance metrics
  const products = await prisma.product.findMany({
    where: {
      sellerId: userId,
    },
    include: {
      _count: {
        select: {
          orderItems: true,
          reviews: true,
        },
      },
      orderItems: {
        select: {
          quantity: true,
          totalPrice: true,
        },
      },
    },
    take: limit,
    orderBy: {
      createdAt: 'desc',
    },
  });

  const performanceData = products.map(product => {
    const totalSold = product.orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalRevenue = product.orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    return {
      id: product.id,
      title: product.title,
      price: Number(product.price),
      totalSold,
      totalRevenue,
      orderCount: product._count.orderItems,
      reviewCount: product._count.reviews,
      stockQuantity: product.stockQuantity,
      performance: {
        salesRate: product.stockQuantity > 0 ? (totalSold / product.stockQuantity) * 100 : 0,
        averageOrderValue: product._count.orderItems > 0 ? totalRevenue / product._count.orderItems : 0,
      },
      createdAt: product.createdAt,
    };
  });

  // Sort by total revenue descending
  performanceData.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return res.json({
    success: true,
    message: 'Product performance analytics retrieved successfully',
    data: {
      products: performanceData,
      summary: {
        totalProducts: performanceData.length,
        totalRevenue: performanceData.reduce((sum, p) => sum + p.totalRevenue, 0),
        totalSold: performanceData.reduce((sum, p) => sum + p.totalSold, 0),
      },
    },
  });
}));

export { router as analyticsRoutes };