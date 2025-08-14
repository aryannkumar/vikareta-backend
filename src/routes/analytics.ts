import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { AnalyticsService } from '@/services/analytics.service';
import { logger } from '@/utils/logger';
// Mock auth middleware for now - replace with actual implementation
const authMiddleware = (req: any, res: any, next: any) => {
  // Mock user for testing
  req.user = { id: 'mock-user-id' };
  return next();
};

const router = Router();
const prisma = new (require('@prisma/client').PrismaClient)();

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

// GET /api/analytics/revenue - Get revenue analytics
router.get('/revenue', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || '30d';
    const userId = (req as any).user?.id;

    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get revenue data from orders
    const revenueData = await prisma.order.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: startDate,
          lte: now,
        },
        status: 'completed',
        ...(userId && { sellerId: userId }),
      },
      _sum: {
        totalAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Format data for chart
    const chartData = revenueData.map(item => ({
      date: item.createdAt.toISOString().split('T')[0],
      revenue: item._sum.totalAmount || 0,
    }));

    // Calculate totals
    const totalRevenue = revenueData.reduce((sum, item) => sum + (item._sum.totalAmount || 0), 0);
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const previousRevenue = await prisma.order.aggregate({
      where: {
        createdAt: {
          gte: previousPeriodStart,
          lt: startDate,
        },
        status: 'completed',
        ...(userId && { sellerId: userId }),
      },
      _sum: {
        totalAmount: true,
      },
    });

    const previousTotal = previousRevenue._sum.totalAmount || 0;
    const growthRate = previousTotal > 0 ? ((totalRevenue - previousTotal) / previousTotal) * 100 : 0;

    return res.json({
      success: true,
      data: {
        period,
        totalRevenue,
        growthRate: Math.round(growthRate * 100) / 100,
        chartData,
        summary: {
          currentPeriod: totalRevenue,
          previousPeriod: previousTotal,
          change: totalRevenue - previousTotal,
        },
      },
    });
  } catch (error) {
    logger.error('Revenue analytics error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch revenue analytics',
      },
    });
  }
});

// GET /api/analytics/products/performance - Get product performance analytics
router.get('/products/performance', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('sortBy').optional().isIn(['revenue', 'orders', 'views']).withMessage('Invalid sort field'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = req.query.sortBy as string || 'revenue';
    const userId = (req as any).user?.id;

    // Get product performance data
    const products = await prisma.product.findMany({
      where: {
        ...(userId && { sellerId: userId }),
      },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
        orders: {
          where: {
            status: 'completed',
          },
          select: {
            totalAmount: true,
          },
        },
      },
      take: limit,
    });

    // Calculate performance metrics
    const performanceData = products.map(product => {
      const totalRevenue = product.orders.reduce((sum, order) => sum + order.totalAmount, 0);
      const totalOrders = product._count.orders;
      
      return {
        id: product.id,
        name: product.name,
        image: product.images?.[0] || null,
        price: product.price,
        revenue: totalRevenue,
        orders: totalOrders,
        views: Math.floor(Math.random() * 1000) + 100, // Mock views data
        conversionRate: totalOrders > 0 ? (totalOrders / (Math.floor(Math.random() * 1000) + 100)) * 100 : 0,
        stock: product.stock,
        category: product.categoryId,
      };
    });

    // Sort by requested field
    performanceData.sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.revenue - a.revenue;
        case 'orders':
          return b.orders - a.orders;
        case 'views':
          return b.views - a.views;
        default:
          return b.revenue - a.revenue;
      }
    });

    return res.json({
      success: true,
      data: {
        products: performanceData,
        summary: {
          totalProducts: products.length,
          totalRevenue: performanceData.reduce((sum, p) => sum + p.revenue, 0),
          totalOrders: performanceData.reduce((sum, p) => sum + p.orders, 0),
          averageConversion: performanceData.reduce((sum, p) => sum + p.conversionRate, 0) / performanceData.length,
        },
      },
    });
  } catch (error) {
    logger.error('Product performance analytics error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch product performance analytics',
      },
    });
  }
});

// POST /api/analytics/track - Track user behavior event
router.post('/track', [
  body('eventType').isIn(['page_view', 'search', 'product_view', 'add_to_cart', 'purchase', 'rfq_created', 'quote_submitted']).withMessage('Invalid event type'),
  body('sessionId').isString().withMessage('Session ID is required'),
  body('eventData').isObject().withMessage('Event data must be an object'),
  body('userAgent').optional().isString().withMessage('User agent must be a string'),
  body('ipAddress').optional().isIP().withMessage('Invalid IP address'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { eventType, sessionId, eventData, userAgent, ipAddress } = req.body;
    const userId = (req as any).user?.id; // From auth middleware if authenticated

    await AnalyticsService.trackUserBehavior({
      userId,
      sessionId,
      eventType,
      eventData,
      timestamp: new Date(),
      userAgent,
      ipAddress,
    });

    return res.json({
      success: true,
      message: 'Event tracked successfully',
    });
  } catch (error) {
    logger.error('Failed to track user behavior:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'TRACKING_FAILED',
        message: 'Failed to track user behavior',
      },
    });
  }
});

// GET /api/analytics/business-performance - Get business performance metrics
router.get('/business-performance', [
  authMiddleware,
  query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
  query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid group by value'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const sellerId = (req as any).user.id;
    const startDate = new Date(req.query['startDate'] as string);
    const endDate = new Date(req.query['endDate'] as string);
    const groupBy = req.query['groupBy'] as 'day' | 'week' | 'month' || 'day';

    const metrics = await AnalyticsService.getBusinessPerformanceMetrics(sellerId, {
      startDate,
      endDate,
      groupBy,
    });

    return res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get business performance metrics:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FAILED',
        message: 'Failed to get business performance metrics',
      },
    });
  }
});

// GET /api/analytics/user-behavior - Get user behavior analytics
router.get('/user-behavior', [
  authMiddleware, // Admin only in production
  query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
  query('userId').optional().isUUID().withMessage('User ID must be a valid UUID'),
  query('eventType').optional().isString().withMessage('Event type must be a string'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const startDate = new Date(req.query['startDate'] as string);
    const endDate = new Date(req.query['endDate'] as string);
    const userId = req.query['userId'] as string;
    const eventType = req.query['eventType'] as string;

    const analytics = await AnalyticsService.getUserBehaviorAnalytics({
      startDate,
      endDate,
      userId,
      eventType,
    });

    return res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get user behavior analytics:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_FAILED',
        message: 'Failed to get user behavior analytics',
      },
    });
  }
});

// POST /api/analytics/custom-report - Generate custom report
router.post('/custom-report', [
  authMiddleware,
  body('name').isString().withMessage('Report name is required'),
  body('metrics').isArray().withMessage('Metrics must be an array'),
  body('dimensions').isArray().withMessage('Dimensions must be an array'),
  body('filters').isObject().withMessage('Filters must be an object'),
  body('dateRange.startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
  body('dateRange.endDate').isISO8601().withMessage('End date must be a valid ISO date'),
  body('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid group by value'),
  body('sortBy').optional().isString().withMessage('Sort by must be a string'),
  body('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  body('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const config = {
      ...req.body,
      dateRange: {
        startDate: new Date(req.body.dateRange.startDate),
        endDate: new Date(req.body.dateRange.endDate),
      },
    };

    const report = await AnalyticsService.generateCustomReport(config);

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Failed to generate custom report:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_FAILED',
        message: 'Failed to generate custom report',
      },
    });
  }
});

// GET /api/analytics/dashboard - Get real-time dashboard data
router.get('/dashboard', [
  authMiddleware, // Admin only in production
], async (_req: Request, res: Response) => {
  try {
    const dashboardData = await AnalyticsService.getRealTimeDashboard();

    return res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_FAILED',
        message: 'Failed to get dashboard data',
      },
    });
  }
});

// GET /api/analytics/export - Export analytics data
router.get('/export', [
  authMiddleware,
  query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
  query('format').optional().isIn(['csv', 'json', 'excel']).withMessage('Invalid export format'),
  query('userId').optional().isUUID().withMessage('User ID must be a valid UUID'),
  query('sellerId').optional().isUUID().withMessage('Seller ID must be a valid UUID'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('eventType').optional().isString().withMessage('Event type must be a string'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const startDate = new Date(req.query['startDate'] as string);
    const endDate = new Date(req.query['endDate'] as string);
    const format = req.query['format'] as 'csv' | 'json' | 'excel' || 'csv';
    const userId = req.query['userId'] as string;
    const sellerId = req.query['sellerId'] as string;
    const categoryId = req.query['categoryId'] as string;
    const eventType = req.query['eventType'] as string;

    const exportData = await AnalyticsService.exportAnalyticsData({
      startDate,
      endDate,
      userId,
      sellerId,
      categoryId,
      eventType,
    }, format);

    res.setHeader('Content-Type', exportData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);

    if (format === 'json') {
      return res.json(exportData.data);
    } else if (format === 'csv') {
      // Convert to CSV format
      if (exportData.data.length > 0) {
        const headers = Object.keys(exportData.data[0]).join(',');
        const rows = exportData.data.map(row => 
          Object.values(row).map(value => 
            typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
          ).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        res.send(csv);
      } else {
        res.send('No data available');
      }
    } else {
      // Excel format would require additional library like xlsx
      return res.json({
        success: false,
        error: {
          code: 'FORMAT_NOT_SUPPORTED',
          message: 'Excel format not yet implemented',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to export analytics data:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: 'Failed to export analytics data',
      },
    });
  }
});

// GET /api/analytics/search-analytics - Get search analytics
router.get('/search-analytics', [
  authMiddleware,
  query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const _startDate = new Date(req.query['startDate'] as string);
    const _endDate = new Date(req.query['endDate'] as string);

    // This would integrate with the search service to get search analytics
    const searchAnalytics = {
      totalSearches: 0,
      uniqueSearchers: 0,
      averageResultsPerSearch: 0,
      topSearchQueries: [],
      searchConversionRate: 0,
      noResultsQueries: [],
      searchTrends: [],
    };

    return res.json({
      success: true,
      data: searchAnalytics,
    });
  } catch (error) {
    logger.error('Failed to get search analytics:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ANALYTICS_FAILED',
        message: 'Failed to get search analytics',
      },
    });
  }
});

// POST /api/analytics/initialize - Initialize analytics indices (admin only)
router.post('/initialize', [
  authMiddleware, // Admin only
], async (_req: Request, res: Response) => {
  try {
    await AnalyticsService.initializeAnalyticsIndices();

    return res.json({
      success: true,
      message: 'Analytics indices initialized successfully',
    });
  } catch (error) {
    logger.error('Failed to initialize analytics indices:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INITIALIZATION_FAILED',
        message: 'Failed to initialize analytics indices',
      },
    });
  }
});

export { router as analyticsRoutes };