import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { v4 as uuidv4 } from 'uuid';

// Mock logger for now
const logger = {
  error: (message: string, error?: any) => console.error(message, error),
  debug: (message: string) => console.log(message),
};

// Extend Request interface to include analytics data
declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      analyticsData?: {
        startTime: number;
        userAgent?: string | undefined;
        ipAddress?: string | undefined;
      };
    }
  }
}

/**
 * Middleware to automatically track page views and user behavior
 */
export const analyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Generate or retrieve session ID
    req.sessionId = req.session?.id || (req.headers['x-session-id'] as string) || uuidv4();
    
    // Store analytics data
    req.analyticsData = {
      startTime: Date.now(),
      userAgent: req.headers['user-agent'] || undefined,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
    };

    // Track page view for GET requests
    if (req.method === 'GET' && !req.path.startsWith('/api/analytics')) {
      const userId = (req as any).user?.id;
      
      // Track page view asynchronously
      setImmediate(async () => {
        try {
          await AnalyticsService.trackUserBehavior({
            userId,
            sessionId: req.sessionId!,
            eventType: 'page_view',
            eventData: {
              page: req.path,
              query: req.query,
              referrer: req.headers.referer,
            },
            timestamp: new Date(),
            userAgent: req.analyticsData?.userAgent,
            ipAddress: req.analyticsData?.ipAddress,
          });
        } catch (error) {
          logger.error('Failed to track page view:', error);
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Analytics middleware error:', error);
    next(); // Continue even if analytics fails
  }
};

/**
 * Middleware to track API response times and errors
 */
export const apiAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Override res.json to track API responses
  const originalJson = res.json;
  res.json = function(body: any) {
    const responseTime = Date.now() - startTime;
    const userId = (req as any).user?.id;
    
    // Track API call asynchronously
    setImmediate(async () => {
      try {
        await AnalyticsService.trackBusinessEvent({
          userId,
          eventType: 'api_call',
          eventData: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTime,
            success: res.statusCode < 400,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to track API call:', error);
      }
    });
    
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Middleware to track search events
 */
export const searchAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/search') && req.method === 'GET') {
    const userId = (req as any).user?.id;
    const query = req.query['q'] as string;
    
    if (query) {
      // Track search event asynchronously
      setImmediate(async () => {
        try {
          await AnalyticsService.trackUserBehavior({
            userId,
            sessionId: req.sessionId!,
            eventType: 'search',
            eventData: {
              searchQuery: query,
              searchType: req.query['searchType'] || 'text',
              language: req.query['language'] || 'en',
              categoryId: req.query['categoryId'] as string | undefined,
              filters: {
                priceRange: req.query['minPrice'] || req.query['maxPrice'] ? {
                  min: req.query['minPrice'],
                  max: req.query['maxPrice'],
                } : undefined,
                location: req.query['latitude'] && req.query['longitude'] ? {
                  latitude: req.query['latitude'],
                  longitude: req.query['longitude'],
                  radius: req.query['radius'],
                } : undefined,
                isService: req.query['isService'],
                verificationTier: req.query['verificationTier'],
              },
            },
            timestamp: new Date(),
            userAgent: req.analyticsData?.userAgent,
            ipAddress: req.analyticsData?.ipAddress,
          });
        } catch (error) {
          logger.error('Failed to track search event:', error);
        }
      });
    }
  }
  
  next();
};

/**
 * Middleware to track product views
 */
export const productViewAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/products/') && req.method === 'GET' && req.params['id']) {
    const userId = (req as any).user?.id;
    const productId = req.params['id'];
    
    // Track product view asynchronously
    setImmediate(async () => {
      try {
        await AnalyticsService.trackUserBehavior({
          userId,
          sessionId: req.sessionId!,
          eventType: 'product_view',
          eventData: {
            productId,
            referrer: req.headers.referer,
            source: req.query['source'] || 'direct',
          },
          timestamp: new Date(),
          userAgent: req.analyticsData?.userAgent,
          ipAddress: req.analyticsData?.ipAddress,
        });
      } catch (error) {
        logger.error('Failed to track product view:', error);
      }
    });
  }
  
  next();
};

/**
 * Middleware to track cart events
 */
export const cartAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  
  if (req.path.startsWith('/api/cart') && userId) {
    let eventType: 'add_to_cart' | 'remove_from_cart' | 'update_cart' | null = null;
    
    if (req.method === 'POST' && req.path === '/api/cart/items') {
      eventType = 'add_to_cart';
    } else if (req.method === 'DELETE' && req.path.includes('/api/cart/items/')) {
      eventType = 'remove_from_cart';
    } else if (req.method === 'PUT' && req.path.includes('/api/cart/items/')) {
      eventType = 'update_cart';
    }
    
    if (eventType) {
      // Track cart event asynchronously
      setImmediate(async () => {
        try {
          await AnalyticsService.trackUserBehavior({
            userId,
            sessionId: req.sessionId!,
            eventType: eventType as any,
            eventData: {
              productId: req.body.productId || req.params['id'],
              quantity: req.body.quantity,
              variantId: req.body.variantId,
            },
            timestamp: new Date(),
            userAgent: req.analyticsData?.userAgent,
            ipAddress: req.analyticsData?.ipAddress,
          });
        } catch (error) {
          logger.error('Failed to track cart event:', error);
        }
      });
    }
  }
  
  next();
};

/**
 * Middleware to track order events
 */
export const orderAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  
  if (req.path.startsWith('/api/orders') && userId) {
    if (req.method === 'POST' && req.path === '/api/orders') {
      // Track order creation
      const originalJson = res.json;
      res.json = function(body: any) {
        if (res.statusCode === 201 && body.success) {
          setImmediate(async () => {
            try {
              await AnalyticsService.trackUserBehavior({
                userId,
                sessionId: req.sessionId!,
                eventType: 'purchase',
                eventData: {
                  orderId: body.data?.id,
                  totalAmount: body.data?.totalAmount,
                  itemCount: body.data?.items?.length,
                  paymentMethod: req.body.paymentMethod,
                },
                timestamp: new Date(),
                userAgent: req.analyticsData?.userAgent,
                ipAddress: req.analyticsData?.ipAddress,
              });

              // Also track business event
              await AnalyticsService.trackBusinessEvent({
                userId,
                sellerId: body.data?.sellerId,
                eventType: 'order_created',
                eventData: {
                  orderId: body.data?.id,
                  items: body.data?.items,
                  paymentMethod: req.body.paymentMethod,
                },
                amount: body.data?.totalAmount,
                orderId: body.data?.id,
                timestamp: new Date(),
              });
            } catch (error) {
              logger.error('Failed to track order event:', error);
            }
          });
        }
        
        return originalJson.call(this, body);
      };
    }
  }
  
  next();
};

/**
 * Middleware to track RFQ and quote events
 */
export const rfqAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  
  if (userId) {
    if (req.path.startsWith('/api/rfqs') && req.method === 'POST') {
      // Track RFQ creation
      const originalJson = res.json;
      res.json = function(body: any) {
        if (res.statusCode === 201 && body.success) {
          setImmediate(async () => {
            try {
              await AnalyticsService.trackUserBehavior({
                userId,
                sessionId: req.sessionId!,
                eventType: 'rfq_created',
                eventData: {
                  rfqId: body.data?.id,
                  categoryId: body.data?.categoryId,
                  budgetRange: {
                    min: body.data?.budgetMin,
                    max: body.data?.budgetMax,
                  },
                },
                timestamp: new Date(),
                userAgent: req.analyticsData?.userAgent,
                ipAddress: req.analyticsData?.ipAddress,
              });
            } catch (error) {
              logger.error('Failed to track RFQ event:', error);
            }
          });
        }
        
        return originalJson.call(this, body);
      };
    } else if (req.path.startsWith('/api/quotes') && req.method === 'POST') {
      // Track quote submission
      const originalJson = res.json;
      res.json = function(body: any) {
        if (res.statusCode === 201 && body.success) {
          setImmediate(async () => {
            try {
              await AnalyticsService.trackUserBehavior({
                userId,
                sessionId: req.sessionId!,
                eventType: 'quote_submitted',
                eventData: {
                  quoteId: body.data?.id,
                  rfqId: body.data?.rfqId,
                  totalPrice: body.data?.totalPrice,
                },
                timestamp: new Date(),
                userAgent: req.analyticsData?.userAgent,
                ipAddress: req.analyticsData?.ipAddress,
              });

              // Also track business event
              await AnalyticsService.trackBusinessEvent({
                userId,
                sellerId: userId, // Quote submitter is the seller
                eventType: 'quote_submitted',
                eventData: {
                  quoteId: body.data?.id,
                  rfqId: body.data?.rfqId,
                  items: body.data?.items,
                },
                amount: body.data?.totalPrice,
                rfqId: body.data?.rfqId,
                quoteId: body.data?.id,
                timestamp: new Date(),
              });
            } catch (error) {
              logger.error('Failed to track quote event:', error);
            }
          });
        }
        
        return originalJson.call(this, body);
      };
    }
  }
  
  next();
};

/**
 * Combined analytics middleware that applies all tracking
 */
export const fullAnalyticsMiddleware = [
  analyticsMiddleware,
  apiAnalyticsMiddleware,
  searchAnalyticsMiddleware,
  productViewAnalyticsMiddleware,
  cartAnalyticsMiddleware,
  orderAnalyticsMiddleware,
  rfqAnalyticsMiddleware,
];