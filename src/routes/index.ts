/**
 * Route Registry - Central export and registration for all API routes
 * This ensures all routes are properly mounted and available
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { apiLimiter, authLimiter, paymentLimiter } from '@/middleware/security';

// Import all route modules
import authRoutes from './auth';
import { healthRoutes } from './health';
import monitoringRoutes from './monitoring';
import productRoutes from './product';
import { categoryRoutes } from './category';
import { subcategoryRoutes } from './subcategory';
import cartRoutes from './cart';
import orderRoutes from './order';
import ordersRoutes from './orders';
import { rfqRoutes } from './rfq';
import { quoteRoutes } from './quote';
import walletRoutes from './wallet';
import paymentRoutes from './payment';
import { userRoutes } from './user';
import { dashboardRoutes } from './dashboard';
import { analyticsRoutes } from './analytics';
import { searchRoutes } from './search';
import { marketplaceRoutes } from './marketplace';
import dealRoutes from './deal';
import { negotiationRoutes } from './negotiation';
import followRoutes from './follow';
import subscriptionRoutes from './subscription';
import notificationRoutes from './notification';
import whatsappRoutes from './whatsapp';
import privacyRoutes from './privacy';
import fraudRoutes from './fraud';
import kycRoutes from './kyc';
import adsRoutes from './ads';
import { serviceRoutes } from './service';
import logisticsRoutes from './logistics';
import mediaRoutes from './media';
import couponRoutes from './coupon';
import checkoutRoutes from './checkout';
import featuredRoutes from './featured';
import featuredProductsRoutes from './featuredProducts';
import featuredServicesRoutes from './featuredServices';
import wishlistRoutes from './wishlist';
import providerRoutes from './provider';
import { adminRoutes } from './admin';
import adminNotificationRoutes from './admin-notifications';
import { workerManagementRoutes } from './worker-management';

/**
 * Route Configuration Interface
 */
interface RouteConfig {
  path: string;
  router: Router;
  middleware?: any[];
  description: string;
  version: string;
  public?: boolean;
}

/**
 * Route Registry Class
 */
export class RouteRegistry {
  private routes: RouteConfig[] = [];
  private mainRouter: Router;

  constructor() {
    this.mainRouter = Router();
    this.registerRoutes();
  }

  /**
   * Register all application routes
   */
  private registerRoutes(): void {
    // Public routes (no authentication required)
    this.addRoute({
      path: '/health',
      router: healthRoutes,
      description: 'Health check endpoints',
      version: 'v1',
      public: true,
    });

    this.addRoute({
      path: '/monitoring',
      router: monitoringRoutes,
      description: 'System monitoring endpoints',
      version: 'v1',
      public: true,
    });

    // Authentication routes
    this.addRoute({
      path: '/auth',
      router: authRoutes,
      middleware: [authLimiter],
      description: 'Authentication and authorization',
      version: 'v1',
      public: true,
    });

    // Product catalog routes
    this.addRoute({
      path: '/products',
      router: productRoutes,
      middleware: [apiLimiter],
      description: 'Product management',
      version: 'v1',
    });

    this.addRoute({
      path: '/categories',
      router: categoryRoutes,
      middleware: [apiLimiter],
      description: 'Category management',
      version: 'v1',
    });

    this.addRoute({
      path: '/subcategories',
      router: subcategoryRoutes,
      middleware: [apiLimiter],
      description: 'Subcategory management',
      version: 'v1',
    });

    // Shopping and orders
    this.addRoute({
      path: '/cart',
      router: cartRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Shopping cart management',
      version: 'v1',
    });

    this.addRoute({
      path: '/order',
      router: orderRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Order management (legacy)',
      version: 'v1',
    });

    this.addRoute({
      path: '/orders',
      router: ordersRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Order management',
      version: 'v1',
    });

    this.addRoute({
      path: '/checkout',
      router: checkoutRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Checkout process',
      version: 'v1',
    });

    // RFQ and Quote system
    this.addRoute({
      path: '/rfqs',
      router: rfqRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Request for Quote management',
      version: 'v1',
    });

    this.addRoute({
      path: '/quotes',
      router: quoteRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Quote management',
      version: 'v1',
    });

    // Financial services
    this.addRoute({
      path: '/wallet',
      router: walletRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Wallet and balance management',
      version: 'v1',
    });

    this.addRoute({
      path: '/payments',
      router: paymentRoutes,
      middleware: [paymentLimiter],
      description: 'Payment processing',
      version: 'v1',
    });

    // User management
    this.addRoute({
      path: '/users',
      router: userRoutes,
      middleware: [apiLimiter],
      description: 'User management',
      version: 'v1',
    });

    this.addRoute({
      path: '/dashboard',
      router: dashboardRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Dashboard data and statistics',
      version: 'v1',
    });

    // Analytics and reporting
    this.addRoute({
      path: '/analytics',
      router: analyticsRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Analytics and reporting',
      version: 'v1',
    });

    // Search and discovery
    this.addRoute({
      path: '/search',
      router: searchRoutes,
      middleware: [apiLimiter],
      description: 'Search functionality',
      version: 'v1',
    });

    this.addRoute({
      path: '/marketplace',
      router: marketplaceRoutes,
      middleware: [apiLimiter],
      description: 'Marketplace features',
      version: 'v1',
    });

    // Business features
    this.addRoute({
      path: '/deals',
      router: dealRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Deal management',
      version: 'v1',
    });

    this.addRoute({
      path: '/negotiations',
      router: negotiationRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Price negotiation',
      version: 'v1',
    });

    // Social features
    this.addRoute({
      path: '/follow',
      router: followRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'User following system',
      version: 'v1',
    });

    this.addRoute({
      path: '/wishlist',
      router: wishlistRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Wishlist management',
      version: 'v1',
    });

    // Subscription and billing
    this.addRoute({
      path: '/subscriptions',
      router: subscriptionRoutes,
      middleware: [paymentLimiter, authenticate],
      description: 'Subscription management',
      version: 'v1',
    });

    // Communication
    this.addRoute({
      path: '/notifications',
      router: notificationRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Notification management',
      version: 'v1',
    });

    this.addRoute({
      path: '/whatsapp',
      router: whatsappRoutes,
      middleware: [apiLimiter],
      description: 'WhatsApp integration',
      version: 'v1',
    });

    // Services
    this.addRoute({
      path: '/services',
      router: serviceRoutes,
      middleware: [apiLimiter],
      description: 'Service management',
      version: 'v1',
    });

    this.addRoute({
      path: '/providers',
      router: providerRoutes,
      middleware: [apiLimiter],
      description: 'Service provider management',
      version: 'v1',
    });

    // Logistics and fulfillment
    this.addRoute({
      path: '/logistics',
      router: logisticsRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Logistics and shipping',
      version: 'v1',
    });

    // Media and content
    this.addRoute({
      path: '/media',
      router: mediaRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Media upload and management',
      version: 'v1',
    });

    // Promotions
    this.addRoute({
      path: '/coupons',
      router: couponRoutes,
      middleware: [apiLimiter],
      description: 'Coupon and discount management',
      version: 'v1',
    });

    // Featured content
    this.addRoute({
      path: '/featured',
      router: featuredRoutes,
      middleware: [apiLimiter],
      description: 'Featured content management',
      version: 'v1',
    });

    this.addRoute({
      path: '/featured-products',
      router: featuredProductsRoutes,
      middleware: [apiLimiter],
      description: 'Featured products',
      version: 'v1',
    });

    this.addRoute({
      path: '/featured-services',
      router: featuredServicesRoutes,
      middleware: [apiLimiter],
      description: 'Featured services',
      version: 'v1',
    });

    // Security and compliance
    this.addRoute({
      path: '/privacy',
      router: privacyRoutes,
      middleware: [apiLimiter],
      description: 'Privacy and data protection',
      version: 'v1',
      public: true,
    });

    this.addRoute({
      path: '/fraud',
      router: fraudRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Fraud detection and prevention',
      version: 'v1',
    });

    this.addRoute({
      path: '/kyc',
      router: kycRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Know Your Customer verification',
      version: 'v1',
    });

    // Advertisement system
    this.addRoute({
      path: '/ads',
      router: adsRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Advertisement management',
      version: 'v1',
    });

    this.addRoute({
      path: '/advertisements',
      router: adsRoutes,
      middleware: [apiLimiter, authenticate],
      description: 'Advertisement management (alias)',
      version: 'v1',
    });

    // Admin routes
    this.addRoute({
      path: '/admin',
      router: adminRoutes,
      middleware: [apiLimiter],
      description: 'Administrative functions',
      version: 'v1',
    });

    this.addRoute({
      path: '/admin/notifications',
      router: adminNotificationRoutes,
      middleware: [apiLimiter],
      description: 'Admin notification management',
      version: 'v1',
    });

    this.addRoute({
      path: '/admin/workers',
      router: workerManagementRoutes,
      middleware: [apiLimiter],
      description: 'Background worker management',
      version: 'v1',
    });
  }

  /**
   * Add a route to the registry
   */
  private addRoute(config: RouteConfig): void {
    this.routes.push(config);
    
    // Apply middleware if specified
    if (config.middleware && config.middleware.length > 0) {
      this.mainRouter.use(config.path, ...config.middleware, config.router);
    } else {
      this.mainRouter.use(config.path, config.router);
    }
  }

  /**
   * Get the main router with all routes mounted
   */
  public getRouter(): Router {
    return this.mainRouter;
  }

  /**
   * Get route information for documentation
   */
  public getRouteInfo(): RouteConfig[] {
    return this.routes.map(route => ({
      ...route,
      middleware: undefined, // Don't expose middleware details
    }));
  }

  /**
   * Get route statistics
   */
  public getStats(): {
    totalRoutes: number;
    publicRoutes: number;
    protectedRoutes: number;
    versions: Record<string, number>;
  } {
    const stats = {
      totalRoutes: this.routes.length,
      publicRoutes: this.routes.filter(r => r.public).length,
      protectedRoutes: this.routes.filter(r => !r.public).length,
      versions: {} as Record<string, number>,
    };

    this.routes.forEach(route => {
      stats.versions[route.version] = (stats.versions[route.version] || 0) + 1;
    });

    return stats;
  }

  /**
   * Health check for all routes
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded';
    routeCount: number;
    timestamp: Date;
  }> {
    const routeCount = this.routes.length;
    const expectedMinimumRoutes = 25; // Minimum expected routes

    return {
      status: routeCount >= expectedMinimumRoutes ? 'healthy' : 'degraded',
      routeCount,
      timestamp: new Date(),
    };
  }
}

// Create and export the route registry instance
export const routeRegistry = new RouteRegistry();

// Export the configured router
export const apiRouter = routeRegistry.getRouter();

// Export route information for documentation
export const routeInfo = routeRegistry.getRouteInfo();

// Export route statistics
export const routeStats = routeRegistry.getStats();

/**
 * Mount all API routes with /api prefix
 */
export function mountApiRoutes(app: any): void {
  // Mount all routes under /api prefix
  app.use('/api', apiRouter);
  
  // Add route documentation endpoint
  app.get('/api/routes', (req: any, res: any) => {
    res.json({
      success: true,
      data: {
        routes: routeInfo,
        stats: routeStats,
      },
    });
  });

  console.log(`✅ Mounted ${routeStats.totalRoutes} API routes`);
  console.log(`   - Public routes: ${routeStats.publicRoutes}`);
  console.log(`   - Protected routes: ${routeStats.protectedRoutes}`);
  console.log(`   - API versions: ${Object.keys(routeStats.versions).join(', ')}`);
}

export default routeRegistry;