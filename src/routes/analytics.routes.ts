import { Router } from 'express';
import { AnalyticsController } from '@/controllers/analytics.controller';
import { authMiddleware, requireAdmin } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const analyticsController = new AnalyticsController();

router.use(authMiddleware);
router.use(requireAdmin);

/**
 * @openapi
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
router.get('/dashboard', asyncHandler(analyticsController.getDashboardStats.bind(analyticsController)));
/**
 * @openapi
 * /api/v1/analytics/users:
 *   get:
 *     summary: Get user analytics
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User analytics
 */
router.get('/users', asyncHandler(analyticsController.getUserAnalytics.bind(analyticsController)));
/**
 * @openapi
 * /api/v1/analytics/orders:
 *   get:
 *     summary: Get order analytics
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order analytics
 */
router.get('/orders', asyncHandler(analyticsController.getOrderAnalytics.bind(analyticsController)));
/**
 * @openapi
 * /api/v1/analytics/revenue:
 *   get:
 *     summary: Get revenue analytics
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Revenue analytics
 */
router.get('/revenue', asyncHandler(analyticsController.getRevenueAnalytics.bind(analyticsController)));
/**
 * @openapi
 * /api/v1/analytics/customers:
 *   get:
 *     summary: Get customer analytics
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer analytics
 */
router.get('/customers', asyncHandler(analyticsController.getCustomerAnalytics.bind(analyticsController)));

export { router as analyticsRoutes };