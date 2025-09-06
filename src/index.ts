import 'module-alias/register';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '@/config/database';

import { logger } from './utils/logger';
import { redisClient, initializeRedis } from './config/redis';
import { elasticsearchService } from './services/elasticsearch.service';
import { minioService } from './services/minio.service';
// notificationService imported where needed in services; avoid unused import here
import { analyticsService } from './services/analytics.service';
import { jobScheduler } from './jobs/scheduler';
import { setupRoutes } from './routes';
import { setupSwagger } from './swagger';

// use shared prisma from config/database

class Application {
  public app: express.Application;
  public server: any;
  public io: any;

    private serviceStatus: { database: boolean; redis: boolean; minio: boolean; elasticsearch: boolean } = {
      database: false,
      redis: false,
      minio: false,
      elasticsearch: false,
    };

  constructor() {
    this.app = express();
    // Trust proxy headers when running behind a reverse proxy (load balancer, Coolify, etc.)
    this.app.set('trust proxy', true);
    this.server = createServer(this.app);
    this.io = new (SocketIOServer as any)(this.server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
      },
    });
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // HSTS for production to force HTTPS (only if behind TLS termination that preserves scheme)
    if (process.env.NODE_ENV === 'production') {
      this.app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }));
    }

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Session configuration (optional - remove if not needed)
    // this.app.use(session({
    //   secret: process.env.SESSION_SECRET || 'fallback-secret',
    //   resave: false,
    //   saveUninitialized: false,
    //   cookie: {
    //     secure: process.env.NODE_ENV === 'production',
    //     httpOnly: true,
    //     maxAge: 24 * 60 * 60 * 1000, // 24 hours
    //   },
    // }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Slow down repeated requests
    const speedLimiter = slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 100, // allow 100 requests per 15 minutes, then...
      delayMs: 500, // begin adding 500ms of delay per request above 100
    });
    this.app.use('/api/', speedLimiter);

    // Custom middleware
    // this.app.use(requestLogger);
  }

  private setupHealthChecks(): void {
    this.app.get('/health', async (req, res) => {
      // Report service readiness but always return 200 so orchestrators
      // that use /health to check container liveness won't fail the deploy
      // if dependent services are temporarily unavailable.
      try {
        const dbConnected = this.serviceStatus.database;
        const redisConnected = this.serviceStatus.redis;
        const minioHealthy = this.serviceStatus.minio;
        const elasticsearchHealthy = this.serviceStatus.elasticsearch;

        res.status(200).json({
          status: dbConnected && redisConnected && minioHealthy && elasticsearchHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          services: {
            database: dbConnected ? 'connected' : 'disconnected',
            redis: redisConnected ? 'connected' : 'disconnected',
            minio: minioHealthy ? 'connected' : 'disconnected',
            elasticsearch: elasticsearchHealthy ? 'connected' : 'disconnected',
          },
        });
      } catch (error) {
        logger.error('Health endpoint failed to generate status:', error);
        res.status(200).json({ status: 'degraded', timestamp: new Date().toISOString() });
      }
    });

    this.app.get('/ready', async (req, res) => {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
      });
    });

    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await analyticsService.getRealTimeMetrics();
        const jobStats = await jobScheduler.getJobStats();
        
        res.status(200).json({
          timestamp: new Date().toISOString(),
          metrics,
          jobs: jobStats,
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
          },
        });
      } catch (error) {
        logger.error('Metrics endpoint failed:', error);
        res.status(500).json({
          error: 'Failed to retrieve metrics',
        });
      }
    });
  }

  private async initializeServices(): Promise<void> {
    // Attempt to initialize services but do not crash the process if they fail.
    // Use simple retries for transient DNS/connectivity errors.
    const retry = async (fn: () => Promise<void>, name: string, attempts = 5, delayMs = 2000) => {
        for (let i = 0; i < attempts; i++) {
        try {
          await fn();
          logger.info(`${name} initialized successfully`);
          return true;
        } catch (err) {
          const e: any = err;
          logger.warn(`Attempt ${i + 1} to initialize ${name} failed:`, e?.message || e);
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      logger.error(`Failed to initialize ${name} after ${attempts} attempts`);
      return false;
    };

    // Database
    try {
      const dbOk = await retry(async () => { await prisma.$connect(); }, 'Database', 5, 2000);
      this.serviceStatus.database = !!dbOk;
      if (!dbOk) logger.warn('Continuing without a database connection. Some features will be limited.');
    } catch (err) {
      logger.error('Unexpected database initialization error:', err);
      this.serviceStatus.database = false;
    }

    // Redis
    try {
      const redisOk = await retry(async () => { const ok = await initializeRedis(); if (!ok) throw new Error('Redis init returned false'); }, 'Redis', 3, 2000);
      this.serviceStatus.redis = !!redisOk;
      if (!redisOk) logger.warn('Continuing without Redis. Caching and realtime features disabled.');
    } catch (err) {
      logger.error('Unexpected Redis initialization error:', err);
      this.serviceStatus.redis = false;
    }

    // MinIO
    try {
      const minioOk = await retry(async () => { await minioService.initialize(); }, 'MinIO', 3, 2000);
      this.serviceStatus.minio = !!minioOk;
      if (!minioOk) logger.warn('Continuing without MinIO. File storage features disabled.');
    } catch (err) {
      logger.error('Unexpected MinIO initialization error:', err);
      this.serviceStatus.minio = false;
    }

    // Elasticsearch
    try {
      const esOk = await retry(async () => { await elasticsearchService.initializeIndices(); }, 'Elasticsearch', 3, 2000);
      this.serviceStatus.elasticsearch = !!esOk;
      if (!esOk) logger.warn('Continuing without Elasticsearch. Search features disabled.');
    } catch (err) {
      logger.error('Unexpected Elasticsearch initialization error:', err);
      this.serviceStatus.elasticsearch = false;
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize services asynchronously so the server can start
      // quickly and pass container healthchecks even if external
      // dependencies are temporarily unavailable.
      void this.initializeServices();

      // Setup middleware
      this.setupMiddleware();

      // Setup Swagger UI
      try {
        // Determine whether to expose API docs in production
        const docsEnabled = process.env.SHOW_API_DOCS ? process.env.SHOW_API_DOCS === 'true' : (process.env.NODE_ENV !== 'production');
        if (!docsEnabled) {
          logger.info('API docs disabled by configuration');
        } else {
          // If credentials are provided, protect docs with basic auth in production
          const docsUser = process.env.DOCS_USERNAME;
          const docsPass = process.env.DOCS_PASSWORD;
          if (process.env.NODE_ENV === 'production' && docsUser && docsPass) {
            // Mount swagger behind simple basic auth middleware
            this.app.use((req, res, next) => {
              const auth = req.headers.authorization;
              if (!auth || !auth.startsWith('Basic ')) {
                res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
                return res.status(401).send('Authentication required');
              }
              try {
                const creds = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
                const [user, pass] = creds.split(':');
                if (user === docsUser && pass === docsPass) return next();
              } catch (err) {
                // fall through to unauthorized
              }
              res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
              return res.status(401).send('Authentication required');
            });
          }

          setupSwagger(this.app as any);
          logger.info('Swagger UI mounted at /api-docs');
        }
      } catch (err) {
        logger.warn('Failed to mount Swagger UI:', err);
      }

      // Setup health checks
      this.setupHealthChecks();

      // Setup routes
      setupRoutes(this.app);

      // Setup WebSocket
      this.setupWebSocket();

      // Error handling middleware (must be last)
      this.app.use((req, res) => {
        res.status(404).json({
          success: false,
          error: 'Route not found',
          path: req.path,
          method: req.method,
        });
      });

      this.app.use((error: any, req: any, res: any, _next: any) => {
        void _next;
        logger.error('Unhandled error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        });
      });

      // Start cron jobs
      jobScheduler.startAllJobs();

      // Start server
      const port = process.env.PORT || 5001;
      this.server.listen(port, () => {
        logger.info(`🚀 Vikareta Backend API server running on port ${port}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔗 Health check: http://localhost:${port}/health`);
        logger.info(`📈 Metrics: http://localhost:${port}/metrics`);
        logger.info(`🔍 API Documentation: http://localhost:${port}/api/v1`);
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  private async setupWebSocket(): Promise<void> {
    (this.io as any).on('connection', (socket: any) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      socket.on('join_user_room', (userId: string) => {
        socket.join(`user:${userId}`);
        logger.info(`User ${userId} joined their room`);
      });

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });
    });

    // Subscribe to Redis notifications for real-time updates using a duplicated client
    try {
      const subscriber = (redisClient as any).duplicate();
      if (typeof subscriber.connect === 'function') {
        await subscriber.connect();
      }

      // psubscribe and handle pmessage events
      await subscriber.psubscribe('user:*:notifications');
      subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
        try {
          const parts = channel.split(':');
          const userId = parts.length >= 2 ? parts[1] : null;
              if (userId) {
                (this.io as any).to(`user:${userId}`).emit('notification', JSON.parse(message));
              }
        } catch (err) {
          logger.warn('Failed to handle pub/sub message:', err);
        }
      });
    } catch (error) {
      logger.warn('Failed to subscribe to Redis notifications:', error);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop cron jobs
          jobScheduler.stopAllJobs();
          logger.info('Cron jobs stopped');

          // Close database connection
          await prisma.$disconnect();
          logger.info('Database disconnected');

          // Close Redis connection
          try {
            await redisClient.quit();
            logger.info('Redis disconnected');
          } catch (error) {
            logger.warn('Redis disconnect error:', error);
          }

          logger.info('Application shut down gracefully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});

export default app;