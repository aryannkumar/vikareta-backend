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
router.get('/', asyncHandler(statsController.getStats.bind(statsController)));

export { router as statsRoutes };