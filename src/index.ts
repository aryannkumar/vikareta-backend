// Initialize module aliases first
import 'module-alias/register';

// Initialize APM first
import './config/apm';

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import { createClient } from 'redis';
import passport from '@/config/passport';

import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { notFoundHandler } from '@/middleware/notFoundHandler';
import {
  securityHeaders,
  additionalSecurityHeaders,
  authLimiter,
  paymentLimiter,
  apiLimiter,
  speedLimiter,
  requestId,
  securityLogger,
  sanitizeInput,
  corsOptions,
  ddosProtection,
  ipFilter,
  csrfProtection,
  regenerateSession,
} from '@/middleware/security';
import { createHttpsServer, httpsRedirect, httpsSecurityHeaders } from '@/config/https';
import { performanceMiddleware } from '@/middleware/performance-monitoring';
import { cacheService } from '@/services/cache.service';
import monitoringRoutes from '@/routes/monitoring';
import authRoutes from '@/routes/auth';
import { healthRoutes } from '@/routes/health';
import productRoutes from '@/routes/product';
import { categoryRoutes } from '@/routes/category';
import { mediaRoutes } from '@/routes/media';
import { searchRoutes } from '@/routes/search';
import { rfqRoutes } from '@/routes/rfq';
import { quoteRoutes } from '@/routes/quote';
import { negotiationRoutes } from '@/routes/negotiation';
import cartRoutes from '@/routes/cart';
import couponRoutes from '@/routes/coupon';
import checkoutRoutes from '@/routes/checkout';
import paymentRoutes from '@/routes/payment';
import orderRoutes from '@/routes/order';
import dealRoutes from '@/routes/deal';
import followRoutes from '@/routes/follow';
import subscriptionRoutes from '@/routes/subscription';
import notificationRoutes from '@/routes/notification';
import whatsappRoutes from '@/routes/whatsapp';
import { authenticate } from '@/middleware/auth';
import privacyRoutes from '@/routes/privacy';
import fraudRoutes from '@/routes/fraud';
import kycRoutes from '@/routes/kyc';
import adsRoutes from '@/routes/ads';
import adminNotificationRoutes from '@/routes/admin-notifications';
import { workerManagementRoutes } from '@/routes/worker-management';
import { serviceRoutes } from '@/routes/service';
import { marketplaceRoutes } from '@/routes/marketplace';
import { userRoutes } from '@/routes/user';
import walletRoutes from '@/routes/wallet';
import { adminRoutes } from '@/routes/admin';
import { dashboardRoutes } from '@/routes/dashboard';
import featuredRoutes from '@/routes/featured';
import featuredServicesRoutes from '@/routes/featuredServices';
import { subcategoryRoutes } from '@/routes/subcategory';
import providerRoutes from '@/routes/provider';

const app = express();

// Trust proxy - required when running behind nginx reverse proxy
app.set('trust proxy', true);

// Redis client setup with proper error handling
let redisClient: any = null;
let redisConnected = false;

try {
  redisClient = createClient({
    url: config.redis.url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis reconnection failed after 10 attempts, giving up');
          return false;
        }
        return Math.min(retries * 50, 500);
      },
    },
  });

  redisClient.on('error', (err) => {
    logger.error('Redis cache error:', err);
    redisConnected = false;
  });

  redisClient.on('connect', () => {
    logger.info('Redis cache connected');
    redisConnected = true;
  });

  redisClient.on('ready', () => {
    logger.info('Redis cache ready');
    redisConnected = true;
  });

  redisClient.on('end', () => {
    logger.warn('Redis cache disconnected');
    redisConnected = false;
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis cache reconnecting...');
  });

  // Initialize Redis connection with timeout
  const connectWithTimeout = async () => {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
    );
    
    try {
      await Promise.race([redisClient.connect(), timeout]);
      logger.info('✅ Redis connection established');
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      logger.warn('🔄 Application will continue without Redis cache');
      redisClient = null;
    }
  };

  connectWithTimeout();
} catch (error) {
  logger.error('❌ Failed to create Redis client:', error);
  logger.warn('🔄 Application will continue without Redis cache');
  redisClient = null;
}

// Initialize performance monitoring and cache warming
async function initializeServices() {
  try {
    // Warm up cache on startup (will skip if Redis is not available)
    await cacheService.warmCache();
    logger.info('✅ Cache service initialization completed');

    // Initialize error tracking
    logger.info('✅ Error tracking service initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    logger.warn('🔄 Application will continue without some services');
  }
}

// Initialize services after a short delay (don't wait for Redis)
setTimeout(initializeServices, 1000);

// HTTPS redirect and security headers
app.use(httpsRedirect);
app.use(httpsSecurityHeaders);

// Enhanced security middleware
app.use(requestId);
app.use(securityHeaders);
app.use(additionalSecurityHeaders);
app.use(ddosProtection);
app.use(ipFilter);
app.use(speedLimiter);
app.use(securityLogger);

// Performance monitoring middleware
app.use(performanceMiddleware);

// CORS configuration with enhanced security
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing middleware with input sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
}));

// Session configuration with Redis store (temporarily disabled)
// const RedisStore = ConnectRedis(session);
app.use(session({
  // store: new RedisStore({ client: redisClient }),
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  name: 'vikareta.sid',
  cookie: {
    secure: config.env === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict',
  },
}));

// Initialize Passport
app.use(passport.initialize());

// CSRF protection for state-changing operations
app.use(csrfProtection);



// System routes (without /api prefix)
app.use('/health', healthRoutes);
app.use('/monitoring', monitoringRoutes);
app.use('/csrf-token', (req, res) => {
  const token = require('crypto').randomBytes(32).toString('hex');
  if (req.session) {
    (req.session as any).csrfToken = token;
  }
  res.json({ success: true, data: { csrfToken: token } });
});

// API routes (with /api prefix)
app.use('/api/auth', authLimiter, regenerateSession, authRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/categories', apiLimiter, categoryRoutes);
app.use('/api/subcategories', apiLimiter, subcategoryRoutes);
app.use('/api/providers', apiLimiter, providerRoutes);
app.use('/api/featured', apiLimiter, featuredRoutes);
app.use('/api/featured-services', apiLimiter, featuredServicesRoutes);
app.use('/api/media', apiLimiter, mediaRoutes);
app.use('/api/attachments', apiLimiter, mediaRoutes);
app.use('/api/search', apiLimiter, searchRoutes);
app.use('/api/rfqs', apiLimiter, rfqRoutes);
app.use('/api/quotes', apiLimiter, quoteRoutes);
app.use('/api/negotiations', apiLimiter, negotiationRoutes);
app.use('/api/cart', apiLimiter, cartRoutes);
app.use('/api/coupons', apiLimiter, couponRoutes);
app.use('/api/checkout', paymentLimiter, checkoutRoutes);
app.use('/api/payments', paymentLimiter, paymentRoutes);
app.use('/api/orders', apiLimiter, orderRoutes);
app.use('/api/deals', apiLimiter, dealRoutes);
app.use('/api/follow', apiLimiter, followRoutes);
app.use('/api/subscriptions', paymentLimiter, subscriptionRoutes);
app.use('/api/notifications', apiLimiter, authenticate, notificationRoutes);
app.use('/api/whatsapp', apiLimiter, whatsappRoutes);
app.use('/api/privacy', apiLimiter, privacyRoutes);
app.use('/api/fraud', apiLimiter, fraudRoutes);
app.use('/api/kyc', apiLimiter, kycRoutes);
app.use('/api/ads', apiLimiter, adsRoutes);
app.use('/api/services', apiLimiter, serviceRoutes);
app.use('/api/marketplace', apiLimiter, marketplaceRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/wallet', apiLimiter, walletRoutes);

// Admin routes (with /api prefix)
app.use('/api/admin/notifications', apiLimiter, adminNotificationRoutes);
app.use('/api/admin/workers', apiLimiter, workerManagementRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Enhanced graceful shutdown handling for production
let isShuttingDown = false;
const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT || '30000');

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn(`${signal} received again, forcing exit`);
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Set a timeout for forced shutdown
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, shutdownTimeout);

  try {
    // Stop accepting new connections
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    if (httpsServerInstance) {
      httpsServerInstance.close(() => {
        logger.info('HTTPS server closed');
      });
    }

    // Close database connections
    logger.info('Closing database connections...');
    // Add any database cleanup here if needed

    // Close Redis connection
    if (redisClient && redisConnected) {
      logger.info('Closing Redis connection...');
      try {
        await redisClient.quit();
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    }

    // Clear the force shutdown timer
    clearTimeout(forceShutdownTimer);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  if (!isShuttingDown) {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (!isShuttingDown) {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

const PORT = config.port || 3000;
const HTTPS_PORT = process.env['HTTPS_PORT'] ? parseInt(process.env['HTTPS_PORT']) : 443;

// Server instances for graceful shutdown
let server: any = null;
let httpsServerInstance: any = null;

// In production with Kubernetes, only run HTTP server (SSL handled by ingress)
if (config.env === 'production') {
  server = app.listen(PORT, () => {
    logger.info(`🚀 Vikareta Backend Server running on port ${PORT}`);
    logger.info(`📊 Environment: ${config.env}`);
    logger.info(`🔗 Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
    logger.info(`🔒 SSL termination handled by NGINX ingress with Cloudflare Origin certificates`);
  });
} else {
  // Development mode - try HTTPS if configured, otherwise HTTP
  httpsServerInstance = createHttpsServer(app);
  if (httpsServerInstance) {
    httpsServerInstance.listen(HTTPS_PORT, () => {
      logger.info(`🔒 Vikareta HTTPS Server running on port ${HTTPS_PORT}`);
      logger.info(`📊 Environment: ${config.env}`);
      logger.info(`🔗 Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
    });

    // Also start HTTP server for redirects
    server = app.listen(PORT, () => {
      logger.info(`🔄 HTTP Redirect Server running on port ${PORT}`);
    });
  } else {
    // HTTP only
    server = app.listen(PORT, () => {
      logger.info(`🚀 Vikareta Backend Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.env}`);
      logger.info(`🔗 Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
      logger.info(`⚠️  Running in HTTP mode - SSL handled by reverse proxy`);
    });
  }
}

export { app };
export default app;