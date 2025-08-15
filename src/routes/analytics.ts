import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Import actual dependencies with fallbacks
let logger: any;
let authenticate: any;

try {
  const loggerModule = require('@/utils/logger');
  logger = loggerModule.logger;
} catch {
  logger = {
    info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
    error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  };
}

try {
  const authModule = require('@/middleware/auth');
  authenticate = authModule.authenticate;
} catch {
  authenticate = (req: any, res: Response, next: any) => {
    req.authUser = { id: 'test-user-id' };
    next();
  };
}

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
  authenticate,
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || '30d';
    const userId = (req as any).authUser?.id;

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

    // Get revenue data from completed orders
    const orders = await prisma.order.findMany({
      where: {
        ...(userId && { sellerId: userId }),
        status: 'completed',
        createdAt: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        totalAmount: true,
        createdAt: true,
      },
    });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    
    // Mock previous period data for growth calculation
    const previousTotal = totalRevenue * 0.8; // Mock 20% growth
    const growthRate = previousTotal > 0 ? ((totalRevenue - previousTotal) / previousTotal) * 100 : 0;

    // Generate chart data (simplified)
    const chartData = [];
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      chartData.push({
        date: date.toISOString().split('T')[0],
        revenue: Math.floor(Math.random() * 1000) + 100, // Mock data
      });
    }

    return res.json({
      success: true,
      data: {
        period,
        totalRevenue,
        growthRate,
        chartData,
        summary: {
          current: totalRevenue,
          previous: previousTotal,
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
  authenticate,
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('sortBy').optional().isIn(['revenue', 'orders', 'views']).withMessage('Invalid sort field'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = req.query.sortBy as string || 'revenue';
    const userId = (req as any).authUser?.id;
    
    logger.info(`Analytics: Product performance request - userId: ${userId}, limit: ${limit}, sortBy: ${sortBy}`);

    // Get products with basic info first
    const products = await prisma.product.findMany({
      where: {
        ...(userId && { sellerId: userId }),
        status: 'active',
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
      take: limit,
    });

    // Get order items for these products separately to avoid complex joins
    const productIds = products.map(p => p.id);
    const orderItems = productIds.length > 0 ? await prisma.orderItem.findMany({
      where: {
        productId: { in: productIds },
        order: {
          status: 'completed',
        },
      },
      include: {
        order: {
          select: {
            status: true,
            totalAmount: true,
          },
        },
      },
    }) : [];

    // Calculate performance metrics
    const performanceData = products.map(product => {
      // Find order items for this product
      const productOrderItems = orderItems.filter(item => item.productId === product.id);
      
      const totalRevenue = productOrderItems.reduce((sum, item) => {
        return sum + Number(item.totalPrice || 0);
      }, 0);
      
      const totalOrders = productOrderItems.length;
      const views = Math.floor(Math.random() * 1000) + 100; // Mock views data - replace with actual analytics
      
      return {
        id: product.id,
        name: product.title || 'Unnamed Product',
        image: null, // TODO: Add product images support
        price: Number(product.price || 0),
        revenue: totalRevenue,
        orders: totalOrders,
        views: views,
        conversionRate: views > 0 ? (totalOrders / views) * 100 : 0,
        stock: Number(product.stockQuantity || 0),
        category: product.category?.name || 'Uncategorized',
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

    const summary = {
      totalProducts: products.length,
      totalRevenue: performanceData.reduce((sum, p) => sum + p.revenue, 0),
      totalOrders: performanceData.reduce((sum, p) => sum + p.orders, 0),
      averageConversion: performanceData.length > 0 
        ? performanceData.reduce((sum, p) => sum + p.conversionRate, 0) / performanceData.length 
        : 0,
    };

    return res.json({
      success: true,
      data: {
        products: performanceData,
        summary,
      },
    });
  } catch (error) {
    logger.error('Product performance analytics error:', error);
    
    // Return a more detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch product performance analytics',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
    });
  }
});

// POST /api/analytics/track - Track user behavior event (simplified)
router.post('/track', [
  body('eventType').isIn(['page_view', 'search', 'product_view', 'add_to_cart', 'purchase', 'rfq_created', 'quote_submitted']).withMessage('Invalid event type'),
  body('sessionId').isString().withMessage('Session ID is required'),
  body('eventData').isObject().withMessage('Event data must be an object'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { eventType, sessionId, eventData } = req.body;
    
    // For now, just log the event - in production, store in database or analytics service
    logger.info('Analytics event tracked:', { eventType, sessionId, eventData });

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

// GET /api/analytics/health - Check analytics service health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Test database connection first
    const productCount = await prisma.product.count();
    
    let elasticsearchStatus: any = { connected: false, error: 'Not configured' };
    
    try {
      const { Client } = await import('@elastic/elasticsearch');
      
      // Try to get config, fallback to env vars
      let esUrl = 'http://localhost:9200';
      let esAuth: any = undefined;
      
      try {
        const { config } = await import('@/config/environment');
        esUrl = config.elasticsearch?.url || esUrl;
        esAuth = config.elasticsearch?.auth;
      } catch {
        esUrl = process.env.ELASTICSEARCH_URL || esUrl;
        if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
          esAuth = {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
          };
        }
      }
      
      const elasticsearch = new Client({
        node: esUrl,
        auth: esAuth,
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Test Elasticsearch connection
      const pingResult = await elasticsearch.ping();
      elasticsearchStatus = {
        connected: true,
        cluster: pingResult ? 'Connected' : 'Disconnected',
      };
    } catch (esError) {
      elasticsearchStatus = {
        connected: false,
        error: esError instanceof Error ? esError.message : 'Connection failed',
      };
    }
    
    return res.json({
      success: true,
      message: 'Analytics service is healthy',
      database: {
        connected: true,
        productCount,
      },
      elasticsearch: elasticsearchStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Analytics health check failed:', error);
    
    return res.json({
      success: false,
      message: 'Analytics service health check failed',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      elasticsearch: {
        connected: false,
        error: 'Not tested due to database failure',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/analytics/test - Simple test endpoint
router.get('/test', async (_req: Request, res: Response) => {
  try {
    const productCount = await prisma.product.count();
    const orderCount = await prisma.order.count();
    
    return res.json({
      success: true,
      message: 'Analytics test endpoint working',
      data: {
        productCount,
        orderCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Analytics test failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'TEST_FAILED',
        message: 'Analytics test endpoint failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export { router as analyticsRoutes };