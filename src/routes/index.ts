import { Application } from 'express';
import searchRoutes from './search.routes';
import wishlistRoutes from './wishlist.routes';
import inventoryRoutes from './inventory.routes';
import supportRoutes from './support.routes';
import dealRoutes from './deal.routes';
import messageRoutes from './message.routes';
import { authRoutes } from './auth.routes';
import { userRoutes } from './user.routes';
import { productRoutes } from './product.routes';
import { serviceRoutes } from './service.routes';
import { categoryRoutes } from './category.routes';
import { rfqRoutes } from './rfq.routes';
import { quoteRoutes } from './quote.routes';
import { orderRoutes } from './order.routes';
import { notificationRoutes } from './notification.routes';
import { paymentRoutes } from './payment.routes';
import { uploadRoutes } from './upload.routes';
import { reviewRoutes } from './review.routes';
import { walletRoutes } from './wallet.routes';
import { analyticsRoutes } from './analytics.routes';
import { advertisementRoutes } from './advertisement.routes';
import { shippingRoutes } from './shipping.routes';
import { webhookRoutes } from './webhook.routes';
import { dashboardRoutes } from './dashboard.routes';
import { adminRoutes } from './admin.routes';

// Import existing routes that are available
// import authRoutes from './auth.routes';
// import userRoutes from './user.routes';
// import productRoutes from './product.routes';
// import serviceRoutes from './service.routes';
// import categoryRoutes from './category.routes';
// import rfqRoutes from './rfq.routes';
// import quoteRoutes from './quote.routes';
// import orderRoutes from './order.routes';

export const setupRoutes = (app: Application): void => {
  // API version prefix
  const API_PREFIX = '/api/v1';

  // Available routes
  app.use(`${API_PREFIX}/search`, searchRoutes);
  app.use(`${API_PREFIX}/wishlist`, wishlistRoutes);
  app.use(`${API_PREFIX}/inventory`, inventoryRoutes);
  app.use(`${API_PREFIX}/support`, supportRoutes);
  app.use(`${API_PREFIX}/deals`, dealRoutes);
  app.use(`${API_PREFIX}/messages`, messageRoutes);

  // Register additional routes
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/users`, userRoutes);
  app.use(`${API_PREFIX}/products`, productRoutes);
  app.use(`${API_PREFIX}/services`, serviceRoutes);
  app.use(`${API_PREFIX}/categories`, categoryRoutes);
  app.use(`${API_PREFIX}/rfqs`, rfqRoutes);
  app.use(`${API_PREFIX}/quotes`, quoteRoutes);
  app.use(`${API_PREFIX}/orders`, orderRoutes);
  app.use(`${API_PREFIX}/notifications`, notificationRoutes);
  app.use(`${API_PREFIX}/payments`, paymentRoutes);
  app.use(`${API_PREFIX}/upload`, uploadRoutes);
  app.use(`${API_PREFIX}/reviews`, reviewRoutes);
  app.use(`${API_PREFIX}/wallet`, walletRoutes);
  app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
  app.use(`${API_PREFIX}/ads`, advertisementRoutes);
  app.use(`${API_PREFIX}/shipping`, shippingRoutes);
  app.use(`${API_PREFIX}/webhooks`, webhookRoutes);
  app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Vikareta Backend API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        ready: '/ready',
        api: `${API_PREFIX}`,
        docs: '/docs',
      },
    });
  });

  // API info endpoint
  app.get(`${API_PREFIX}`, (req, res) => {
    res.json({
      name: 'Vikareta Backend API',
      version: '1.0.0',
      description: 'B2B Marketplace Backend API',
      endpoints: [
        'search',
        'wishlist',
        'inventory',
        'support',
        'deals',
        'messages',
      ],
    });
  });
};