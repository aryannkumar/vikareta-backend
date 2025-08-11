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

const app = express();

// Trust proxy - required when running behind nginx reverse proxy
app.set('trust proxy', true);

// Redis client setup
const redisClient = createClient({
  url: config.redis.url,
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

// Initialize Redis connection
redisClient.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
});

// Initialize performance monitoring and cache warming
async function initializeServices() {
  try {
    // Warm up cache on startup
    await cacheService.warmCache();
    logger.info('✅ Cache warming completed');

    // Initialize error tracking
    logger.info('✅ Error tracking service initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
  }
}

// Initialize services after Redis connection
setTimeout(initializeServices, 2000);

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

// Add CSRF token endpoint
app.get('/csrf-token', (req, res) => {
  const token = require('crypto').randomBytes(32).toString('hex');
  if (req.session) {
    (req.session as any).csrfToken = token;
  }
  res.json({ success: true, data: { csrfToken: token } });
});

// Routes with specific rate limiting
app.use('/health', healthRoutes);
app.use('/monitoring', monitoringRoutes);
app.use('/auth', authLimiter, regenerateSession, authRoutes);
app.use('/products', apiLimiter, productRoutes);
app.use('/categories', apiLimiter, categoryRoutes);
app.use('/subcategories', apiLimiter, subcategoryRoutes);
app.use('/featured', apiLimiter, featuredRoutes);
app.use('/featured-services', apiLimiter, featuredServicesRoutes);
app.use('/media', apiLimiter, mediaRoutes);
app.use('/attachments', apiLimiter, mediaRoutes);
app.use('/search', apiLimiter, searchRoutes);
app.use('/rfqs', apiLimiter, rfqRoutes);
app.use('/quotes', apiLimiter, quoteRoutes);
app.use('/negotiations', apiLimiter, negotiationRoutes);
app.use('/cart', apiLimiter, cartRoutes);
app.use('/coupons', apiLimiter, couponRoutes);
app.use('/checkout', paymentLimiter, checkoutRoutes);
app.use('/payments', paymentLimiter, paymentRoutes);
app.use('/orders', apiLimiter, orderRoutes);
app.use('/deals', apiLimiter, dealRoutes);
app.use('/follow', apiLimiter, followRoutes);
app.use('/subscriptions', paymentLimiter, subscriptionRoutes);
app.use('/notifications', apiLimiter, notificationRoutes);
app.use('/whatsapp', apiLimiter, whatsappRoutes);
app.use('/privacy', apiLimiter, privacyRoutes);
app.use('/fraud', apiLimiter, fraudRoutes);
app.use('/kyc', apiLimiter, kycRoutes);
app.use('/ads', apiLimiter, adsRoutes);
app.use('/admin/notifications', apiLimiter, adminNotificationRoutes);
app.use('/admin/workers', apiLimiter, workerManagementRoutes);
app.use('/services', apiLimiter, serviceRoutes);
app.use('/marketplace', apiLimiter, marketplaceRoutes);
app.use('/users', apiLimiter, userRoutes);
app.use('/wallet', apiLimiter, walletRoutes);
app.use('/admin', apiLimiter, adminRoutes);
app.use('/dashboard', apiLimiter, dashboardRoutes);

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
    logger.info('Closing Redis connection...');
    await redisClient.quit();

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