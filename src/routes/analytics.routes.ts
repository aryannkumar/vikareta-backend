import { Router } from 'express';
import { AnalyticsController } from '@/controllers/analytics.controller';
import { authMiddleware, requireAdmin } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const analyticsController = new AnalyticsController();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/dashboard', asyncHandler(analyticsController.getDashboardStats.bind(analyticsController)));
router.get('/users', asyncHandler(analyticsController.getUserAnalytics.bind(analyticsController)));
router.get('/orders', asyncHandler(analyticsController.getOrderAnalytics.bind(analyticsController)));
router.get('/revenue', asyncHandler(analyticsController.getRevenueAnalytics.bind(analyticsController)));

export { router as analyticsRoutes };