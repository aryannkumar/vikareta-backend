import { Router } from 'express';
import { DashboardController } from '@/controllers/dashboard.controller';
import { requireDashboardAccess } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const dashboardController = new DashboardController();

router.use(requireDashboardAccess);

/**
 * @openapi
 * /api/v1/dashboard/stats:
 *   get:
 *     summary: Get dashboard stats for current user
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats
 */
router.get('/stats', asyncHandler(dashboardController.getStats.bind(dashboardController)));
/**
 * @openapi
 * /api/v1/dashboard/recent-activity:
 *   get:
 *     summary: Get recent activity
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent activity
 */
router.get('/recent-activity', asyncHandler(dashboardController.getRecentActivity.bind(dashboardController)));
/**
 * @openapi
 * /api/v1/dashboard/notifications:
 *   get:
 *     summary: Get dashboard notifications
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications
 */
router.get('/notifications', asyncHandler(dashboardController.getNotifications.bind(dashboardController)));
/**
 * @openapi
 * /api/v1/dashboard/orders:
 *   get:
 *     summary: Get recent orders for dashboard
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders
 */
router.get('/orders', asyncHandler(dashboardController.getOrders.bind(dashboardController)));
/**
 * @openapi
 * /api/v1/dashboard/rfqs:
 *   get:
 *     summary: Get recent RFQs for dashboard
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: RFQs
 */
router.get('/rfqs', asyncHandler(dashboardController.getRfqs.bind(dashboardController)));

export { router as dashboardRoutes };