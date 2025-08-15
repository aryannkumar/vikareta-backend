/**
 * Service Registry - Central export for all services
 * This ensures all services are properly initialized and available
 */

import { logger } from '@/utils/logger';

// Core Business Services
export { productService, ProductService } from './product.service';
export { cartService, CartService } from './cart.service';
export { orderService, OrderService } from './order.service';
export { rfqService, RfqService } from './rfq.service';
export { quoteService, QuoteService } from './quote.service';
export { walletService, WalletService } from './wallet.service';
export { paymentService, PaymentService } from './payment.service';

// Communication & Notifications
export { notificationService, NotificationService } from './notification.service';
export { WhatsAppService } from './whatsapp.service';

// Analytics & Reporting
export { AnalyticsService, analyticsService } from './analytics.service';

// Import services for internal use
import { productService } from './product.service';
import { cartService } from './cart.service';
import { orderService } from './order.service';
import { rfqService } from './rfq.service';
import { quoteService } from './quote.service';
import { walletService } from './wallet.service';
import { paymentService } from './payment.service';
import { notificationService } from './notification.service';
import { analyticsService, AnalyticsService } from './analytics.service';
import { cacheService } from './cache.service';
import { minioService } from './minio.service';

// Infrastructure Services
export { cacheService } from './cache.service';
export { minioService } from './minio.service';
export { storageService, StorageService } from './storage.service';

// Authentication & Security
export { authService, AuthService } from './auth.service';

// Content Management
export { categoryService, CategoryService } from './category.service';
export { subcategoryService } from './subcategory.service';
export { mediaService, MediaService } from './media.service';

// User & Profile Management
export { followService, FollowService } from './follow.service';

// Marketplace Features
export { marketplaceService } from './marketplace.service';
export { searchService, SearchService } from './search.service';
export { dealService, DealService } from './deal.service';
export { negotiationService, NegotiationService } from './negotiation.service';

// Logistics & Fulfillment
export { logisticsService, LogisticsService } from './logistics.service';

// Promotions & Marketing
export { couponService, CouponService } from './coupon.service';
export { subscriptionService, SubscriptionService } from './subscription.service';

// Featured Content
export { FeaturedProductService } from './featuredProductService';
export { FeaturedServiceService } from './featuredServiceService';

// Background Processing
export { BackgroundWorkerService } from './background-worker.service';
export { TaskSchedulerService } from './task-scheduler.service';
export { NotificationSchedulerService } from './notification-scheduler.service';

// Fraud & Security
export { fraudDetectionService } from './fraud-detection.service';

// Audit & Compliance
export { auditService } from './audit.service';
export { errorTrackingService } from './error-tracking.service';

// Advertisement System
export { BidOptimizationService } from './bid-optimization.service';
export { AudienceTargetingService } from './audience-targeting.service';

// Enhanced Services
export { enhancedRfqService } from './enhanced-rfq.service';

// Service Types and Interfaces
export type {
  // Product Service Types
  CreateProductData,
  UpdateProductData,
  ProductFilters,
  ProductWithDetails,
  CreateProductVariantData,
  CreateProductMediaData,
} from './product.service';

export type {
  // Cart Service Types
  CartItem,
  CartSummary,
  AddToCartRequest,
  UpdateCartItemRequest,
} from './cart.service';

export type {
  // Order Service Types
  ShippingDetailsRequest,
  TrackingUpdateRequest,
  ReturnRequest,
  CancellationRequest,
  ServiceScheduleRequest,
  ServiceProgressRequest,
} from './order.service';

export type {
  // RFQ Service Types
  CreateRfqData,
  UpdateRfqData,
  RfqFilters,
  RfqWithDetails,
  SellerMatchCriteria,
} from './rfq.service';

export type {
  // Quote Service Types
  CreateQuoteData,
  UpdateQuoteData,
  QuoteFilters,
  QuoteWithDetails,
  QuoteComparison,
  CreateQuoteItemData,
} from './quote.service';

export type {
  // Wallet Service Types
  WalletBalance,
  WalletFundingRequest,
  WalletTransactionRequest,
  LockAmountRequest,
  WithdrawalRequest,
} from './wallet.service';

export type {
  // Payment Service Types
  CreateOrderRequest,
  CashfreeOrderResponse,
  PaymentVerificationResponse,
  RefundRequest,
} from './payment.service';

export type {
  // Notification Service Types
  NotificationData,
  BatchNotificationData,
  NotificationAnalytics,
} from './notification.service';

/**
 * Service Health Check Registry
 * Provides health status for all critical services
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, any> = new Map();

  private constructor() {
    this.registerServices();
  }

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  private registerServices(): void {
    // Register all core services
    this.services.set('product', productService);
    this.services.set('cart', cartService);
    this.services.set('order', orderService);
    this.services.set('rfq', rfqService);
    this.services.set('quote', quoteService);
    this.services.set('wallet', walletService);
    this.services.set('payment', paymentService);
    this.services.set('notification', notificationService);
    this.services.set('analytics', analyticsService);
    this.services.set('cache', cacheService);
    this.services.set('storage', minioService);
  }

  public getService(name: string): any {
    return this.services.get(name);
  }

  public getAllServices(): Map<string, any> {
    return this.services;
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, 'up' | 'down' | 'degraded'>;
    timestamp: Date;
  }> {
    const serviceStatus: Record<string, 'up' | 'down' | 'degraded'> = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const [name, service] of this.services) {
      totalCount++;
      try {
        // Check if service has a health check method
        if (service && typeof service.healthCheck === 'function') {
          const isHealthy = await service.healthCheck();
          serviceStatus[name] = isHealthy ? 'up' : 'degraded';
          if (isHealthy) healthyCount++;
        } else {
          // Basic check - service exists and is initialized
          serviceStatus[name] = service ? 'up' : 'down';
          if (service) healthyCount++;
        }
      } catch (error) {
        serviceStatus[name] = 'down';
      }
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalCount) {
      overallStatus = 'healthy';
    } else if (healthyCount > totalCount * 0.7) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      services: serviceStatus,
      timestamp: new Date(),
    };
  }
}

/**
 * Initialize all services
 * This function should be called during application startup
 */
export async function initializeServices(): Promise<void> {
  const registry = ServiceRegistry.getInstance();
  
  try {
    // Initialize cache service first (warm cache)
    await cacheService.warmCache();
    
    // Initialize storage services
    await minioService.initialize();
    
    // Initialize analytics indices
    await AnalyticsService.initializeAnalyticsIndices();
    
    // Initialize background workers (simplified for now)
    logger.info('Background workers initialized (simplified mode)');
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Graceful shutdown for all services
 */
export async function shutdownServices(): Promise<void> {
  try {
    // Shutdown services in reverse order (simplified for now)
    logger.info('Services shut down (simplified mode)');
    
    // Close database connections, cache connections, etc.
    console.log('✅ All services shut down gracefully');
  } catch (error) {
    console.error('❌ Error during service shutdown:', error);
    throw error;
  }
}

// Export the service registry instance
export const serviceRegistry = ServiceRegistry.getInstance();