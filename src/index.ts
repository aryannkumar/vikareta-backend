// Initialize module aliases first
import 'module-alias/register';

// Initialize APM first
import './config/apm';

import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
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
import { traceHeaders } from '@/middleware/traceHeaders';
import { cacheService } from '@/services/cache.service';
import monitoringRoutes from '@/routes/monitoring';
import authRoutes from '@/routes/auth';
import { healthRoutes } from '@/routes/health';
import productRoutes from '@/routes/product';
import { categoryRoutes } from '@/routes/category';
import mediaRoutes from '@/routes/media';
import { minioService } from '@/services/minio.service';
import { searchRoutes } from '@/routes/search';
import { rfqRoutes } from '@/routes/rfq';
import { rfqPublicRoutes } from '@/routes/rfq-public';
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
import analyticsRoutes from '@/routes/analytics';
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
import statsRoutes from '@/routes/stats';
import { subcategoryRoutes } from '@/routes/subcategory';
import providerRoutes from '@/routes/provider';
import wishlistRoutes from '@/routes/wishlist';
import customersRoutes from '@/routes/customers';
import shipmentsRoutes from '@/routes/shipments';
import analyticsBackendRoutes from '@/routes/analytics';
import messagesRoutes from '@/routes/messages';
import { setupWebSocket } from '@/routes/websocket';

const app = express();

// Trust proxy configuration - prefer explicit env-driven value
// Acceptable values: 'true'|'false'|'loopback'|'linklocal'|'uniquelocal'|number|string
// We parse the configured value and apply it safely. Default to 'loopback' in dev.
const rawTrustProxy = config.trustProxy;
let parsedTrustProxy: any = 'loopback';
try {
  if (rawTrustProxy === 'true') parsedTrustProxy = true;
  else if (rawTrustProxy === 'false') parsedTrustProxy = false;
  else if (!Number.isNaN(Number(rawTrustProxy))) parsedTrustProxy = Number(rawTrustProxy);
  else parsedTrustProxy = rawTrustProxy; // allow strings like 'loopback' or comma-separated proxies
} catch (err) {
  logger.warn('Invalid TRUST_PROXY value, falling back to "loopback"', { rawTrustProxy, err });
}

app.set('trust proxy', parsedTrustProxy);
logger.info('Express trust proxy set to', { trustProxy: parsedTrustProxy });

// Redis client setup with proper error handling
let redisClient: any = null;
let redisConnected = false;

try {
  const redisUrlStr = config.redis.url || process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = new URL(redisUrlStr);

  logger.info('Redis configuration:', {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port) || 6379,
    username: redisUrl.username || 'none',
    hasPassword: !!redisUrl.password,
    database: parseInt(redisUrl.pathname.slice(1)) || 0
  });

  // Create an ioredis client (unified across the codebase)
  redisClient = new Redis(redisUrlStr, {
    lazyConnect: true,
    connectTimeout: 10000,
    maxRetriesPerRequest: 5,
    enableAutoPipelining: true,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 50, 500);
    }
  });

  // Event handlers
  redisClient.on('error', (err: any) => {
    logger.error('Redis cache error:', {
      message: err && err.message ? err.message : String(err),
      code: err && err.code,
    });
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

  redisClient.on('reconnecting', (delay: number) => {
    logger.warn('Redis cache reconnecting...', { delay });
  });

  // Initialize Redis connection with timeout; attempt single short fallback on auth failure
  const connectWithTimeout = async () => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
    );

    try {
      await Promise.race([redisClient.connect(), timeout]);
      logger.info('✅ Redis connection established');
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);

      const errMsg = error && (error as any).message ? String((error as any).message) : '';
      if (errMsg.includes('WRONGPASS') || errMsg.toLowerCase().includes('invalid username-password')) {
        logger.warn('🔁 Redis auth failed with WRONGPASS — attempting a single password-only fallback (short timeout)');

        try {
          const fallbackPassword = process.env.REDIS_PASSWORD || redisUrl.password || '';
          if (fallbackPassword) {
            const fallbackClient = new Redis({
              host: redisUrl.hostname,
              port: parseInt(redisUrl.port) || 6379,
              password: fallbackPassword,
              lazyConnect: true,
              connectTimeout: 5000,
              maxRetriesPerRequest: 1,
              retryStrategy(times) {
                if (times > 1) return null;
                return Math.min(times * 50, 200);
              }
            });

            // Only log a single error from the fallback attempt
            let fallbackConnected = false;
            try {
              const fbTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis fallback connection timeout')), 5000));
              await Promise.race([fallbackClient.connect(), fbTimeout]);
              fallbackConnected = true;
            } catch (fbErr) {
              logger.error('❌ Redis fallback connection failed:', fbErr && (fbErr as any).message ? (fbErr as any).message : fbErr);
            }

            if (fallbackConnected) {
              logger.info('✅ Redis fallback (password-only) connection established');
              redisClient = fallbackClient;
              redisConnected = true;
              return;
            }
          } else {
            logger.warn('No fallback password available in env to attempt Redis password-only fallback');
          }
        } catch (fallbackError) {
          logger.error('❌ Redis fallback connection failed:', fallbackError);
        }
      }

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
    // Initialize MinIO service
    await minioService.initialize();
    logger.info('✅ MinIO service initialized successfully');

    // Warm up cache on startup (will skip if Redis is not available)
    await cacheService.warmCache();
    logger.info('✅ Cache service initialization completed');

    // Initialize analytics indices
    try {
      const { AnalyticsService } = await import('@/services/analytics.service');
      await AnalyticsService.initializeAnalyticsIndices();
      logger.info('✅ Analytics indices initialized successfully');
    } catch (analyticsError) {
      logger.warn('⚠️ Analytics initialization failed:', analyticsError);
      logger.info('📊 Analytics will fall back to database-only mode');
    }

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
app.use(traceHeaders);

// Performance monitoring middleware
app.use(performanceMiddleware);

// CORS configuration with enhanced security - this handles all CORS logic
app.use(cors(corsOptions));

// Handle all OPTIONS requests before other middleware
app.options('*', (req: Request, res: Response) => {
  const origin = req.headers.origin;

  if (origin && (
    origin.includes('vikareta.com') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  )) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, X-CSRF-Token, X-XSRF-TOKEN, x-xsrf-token, Accept, Origin, Cache-Control, Pragma');
    res.header('Access-Control-Max-Age', '86400');

    logger.info(`OPTIONS handled for ${req.path} from ${origin}`);
    return res.status(200).end();
  }

  res.status(403).end();
});

// Compression
app.use(compression());

// Body parsing middleware with input sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // Add cookie parser for SSO
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
    sameSite: config.env === 'production' ? 'none' : 'lax', // Allow cross-subdomain sharing
    domain: config.env === 'production' ? '.vikareta.com' : undefined, // Share across subdomains
  },
}));

// Initialize Passport
app.use(passport.initialize());

// CSRF protection for state-changing operations
app.use(csrfProtection);



// System routes (without /api prefix)
app.use('/health', healthRoutes);
app.use('/monitoring', monitoringRoutes);

// Debug endpoints removed - use structured logging in auth.refresh and browser devtools to inspect requests.

// CORS test endpoint
app.get('/cors-test', (req, res) => {
  const origin = req.headers.origin;
  logger.info(`CORS test endpoint hit from origin: ${origin}`);

  res.json({
    success: true,
    message: 'CORS is working correctly',
    origin: origin,
    timestamp: new Date().toISOString(),
  });
});

// CSRF token endpoint for SSO system
app.get('/csrf-token', (req, res) => {
  const origin = req.headers.origin;
  logger.info('CSRF token request from origin:', origin);

  // Generate CSRF token using unified function
  const { generateCSRFToken } = require('@/middleware/security');
  const csrfToken = generateCSRFToken();

  // More flexible cookie configuration for production
  const cookieConfig = {
    domain: process.env.NODE_ENV === 'production' ? '.vikareta.com' : undefined,
    path: '/',
    httpOnly: false, // Allow JavaScript access
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
    maxAge: 60 * 60 * 1000 // 1 hour
  };

  logger.info('Setting CSRF cookie with config:', {
    domain: cookieConfig.domain,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite
  });

  res.cookie('XSRF-TOKEN', csrfToken, cookieConfig);

  // Also return token in response body as fallback
  res.json({
    success: true,
    data: { csrfToken },
    cookieSet: true
  });
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
app.use('/api/public/rfqs', apiLimiter, rfqPublicRoutes);
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
app.use('/api/advertisements', apiLimiter, adsRoutes); // Alternative route for ads
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/services', apiLimiter, serviceRoutes);
app.use('/api/marketplace', apiLimiter, marketplaceRoutes);
app.use('/api/stats', apiLimiter, statsRoutes);
// User routes with explicit CORS handling
app.use('/api/users', (req, res, next) => {
  // Ensure CORS headers for user routes
  const origin = req.headers.origin;
  if (origin && (origin.includes('vikareta.com') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, X-CSRF-Token, Accept, Origin, Cache-Control, Pragma');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}, apiLimiter, userRoutes);
app.use('/api/wallet', apiLimiter, walletRoutes);
app.use('/api/wishlist', apiLimiter, wishlistRoutes);
app.use('/api/customers', apiLimiter, customersRoutes);
app.use('/api/shipments', apiLimiter, shipmentsRoutes);
app.use('/api/analytics-backend', apiLimiter, analyticsBackendRoutes);
app.use('/api/messages', apiLimiter, messagesRoutes);

// Admin routes (with /api prefix) - with explicit CORS handling
app.use('/api/admin', (req, res, next) => {
  // Ensure CORS headers for admin routes
  const origin = req.headers.origin;
  if (origin && (origin.includes('admin.vikareta.com') || origin.includes('vikareta.com') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, X-CSRF-Token, Accept, Origin, Cache-Control, Pragma');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}, apiLimiter, adminRoutes);

app.use('/api/admin/notifications', apiLimiter, adminNotificationRoutes);
app.use('/api/admin/workers', apiLimiter, workerManagementRoutes);
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
    
    // Setup WebSocket server
    setupWebSocket(server);
  });
} else {
  // Development mode - try HTTPS if configured, otherwise HTTP
  httpsServerInstance = createHttpsServer(app);
  if (httpsServerInstance) {
    httpsServerInstance.listen(HTTPS_PORT, () => {
      logger.info(`🔒 Vikareta HTTPS Server running on port ${HTTPS_PORT}`);
      logger.info(`📊 Environment: ${config.env}`);
      logger.info(`🔗 Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
      
      // Setup WebSocket server on HTTPS
      setupWebSocket(httpsServerInstance);
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
      
      // Setup WebSocket server
      setupWebSocket(server);
    });
  }
}

export { app };
export default app;