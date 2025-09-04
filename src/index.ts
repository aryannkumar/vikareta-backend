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
import { PrismaClient } from '@prisma/client';

import { logger } from './utils/logger';
import { redisClient, initializeRedis } from './config/redis';
import { elasticsearchService } from './services/elasticsearch.service';
import { minioService } from './services/minio.service';
import { notificationService } from './services/notification.service';
import { analyticsService } from './services/analytics.service';
import { jobScheduler } from './jobs/scheduler';
import { setupRoutes } from './routes';

const prisma = new PrismaClient();

class Application {
  public app: express.Application;
  public server: any;
  public io: any;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = (SocketIOServer as any)(this.server, {
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
      try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        
        // Check Redis connection
        await redisClient.ping();

        // Check MinIO connection
        const minioHealthy = await minioService.healthCheck();

        // Check Elasticsearch connection
        const elasticsearchHealthy = await elasticsearchService.healthCheck();

        const allHealthy = minioHealthy && elasticsearchHealthy;

        res.status(allHealthy ? 200 : 503).json({
          status: allHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            redis: 'connected',
            minio: minioHealthy ? 'connected' : 'disconnected',
            elasticsearch: elasticsearchHealthy ? 'connected' : 'disconnected',
          },
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
    try {
      // Initialize database connection
      await prisma.$connect();
      logger.info('Database connected successfully');

      // Initialize Redis connection
      const redisConnected = await initializeRedis();
      if (redisConnected) {
        logger.info('Redis connected successfully');
      } else {
        logger.warn('Redis connection failed - continuing without Redis');
      }

      // Initialize MinIO
      try {
        await minioService.initialize();
        logger.info('MinIO initialized successfully');
      } catch (error) {
        logger.warn('MinIO initialization failed - continuing without MinIO:', error);
      }

      // Initialize Elasticsearch
      try {
        await elasticsearchService.initializeIndices();
        logger.info('Elasticsearch initialized successfully');
      } catch (error) {
        logger.warn('Elasticsearch initialization failed - continuing without Elasticsearch:', error);
      }

    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize services
      await this.initializeServices();

      // Setup middleware
      this.setupMiddleware();

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

      this.app.use((error: any, req: any, res: any, next: any) => {
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