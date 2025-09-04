import { Router } from 'express';
import { DashboardController } from '@/controllers/dashboard.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const dashboardController = new DashboardController();

router.use(authMiddleware);

router.get('/stats', asyncHandler(dashboardController.getStats.bind(dashboardController)));
router.get('/recent-activity', asyncHandler(dashboardController.getRecentActivity.bind(dashboardController)));
router.get('/notifications', asyncHandler(dashboardController.getNotifications.bind(dashboardController)));
router.get('/orders', asyncHandler(dashboardController.getOrders.bind(dashboardController)));
router.get('/rfqs', asyncHandler(dashboardController.getRfqs.bind(dashboardController)));

export { router as dashboardRoutes };