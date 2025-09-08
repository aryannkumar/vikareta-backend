import { Router } from 'express';
import { StatsController } from '@/controllers/stats.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const statsController = new StatsController();

/**
 * @openapi
 * /api/v1/stats:
 *   get:
 *     summary: Get platform statistics
 *     tags:
 *       - Statistics
 *     responses:
 *       200:
 *         description: Platform statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 successfulDeals:
 *                   type: number
 *                 totalCategories:
 *                   type: number
 *                 totalProducts:
 *                   type: number
 *                 totalSuppliers:
 *                   type: number
 */
/**
 * @openapi
 * /api/v1/stats/homepage:
 *   get:
 *     summary: Get homepage statistics (public)
 *     tags:
 *       - Statistics
 *     responses:
 *       200:
 *         description: Homepage statistics for all pages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trendingProducts:
 *                   type: number
 *                 activeSuppliers:
 *                   type: number
 *                 verifiedBusinesses:
 *                   type: number
 *                 dailyTransactions:
 *                   type: number
 *                 serviceCategories:
 *                   type: number
 *                 serviceProviders:
 *                   type: number
 *                 completedProjects:
 *                   type: number
 *                 successRate:
 *                   type: number
 *                 productCategories:
 *                   type: number
 *                 featuredCategories:
 *                   type: number
 *                 activeSuppliersCount:
 *                   type: number
 *                 categorySuccessRate:
 *                   type: number
 *                 activeBusinesses:
 *                   type: number
 *                 verifiedPartners:
 *                   type: number
 *                 citiesCovered:
 *                   type: number
 *                 businessSuccessRate:
 *                   type: number
 *                 liveRfqs:
 *                   type: number
 *                 verifiedBuyers:
 *                   type: number
 *                 responseTime:
 *                   type: string
 *                 rfqSuccessRate:
 *                   type: number
 */
router.get('/', asyncHandler(statsController.getStats.bind(statsController)));
router.get('/homepage', asyncHandler(statsController.getHomepageStats.bind(statsController)));

export { router as statsRoutes };