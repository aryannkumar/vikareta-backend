// Initialize module aliases first
import 'module-alias/register';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import productRoutes from './routes/product';
import cartRoutes from './routes/cart';
import featuredRoutes from './routes/featured';
import featuredServicesRoutes from './routes/featuredServices';
import { categoryRoutes } from './routes/category';
import { subcategoryRoutes } from './routes/subcategory';
import { serviceRoutes } from './routes/service';
import { userRoutes } from './routes/user';
import { searchRoutes } from './routes/search';
import orderRoutes from './routes/order';
import { dashboardRoutes } from './routes/dashboard';
import { rfqRoutes } from './routes/rfq';
import { quoteRoutes } from './routes/quote';
import paymentRoutes from './routes/payment';
import dealRoutes from './routes/deal';
import adsRoutes from './routes/ads';
import notificationRoutes from './routes/notification';
import { mediaRoutes } from './routes/media';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/featured', featuredRoutes);
app.use('/api/featured-services', featuredServicesRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/attachments', mediaRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

const PORT = process.env.PORT || 8000;

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Vikareta Backend Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

export default app;