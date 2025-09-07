import { Router } from 'express';
import { MarketplaceController } from '@/controllers/marketplace.controller';
import { validateQuery } from '@/middleware/zod-validate';
import { marketplaceQuerySchema } from '@/validation/schemas';

const router = Router();
const marketplaceController = new MarketplaceController();

/**
 * @openapi
 * /api/v1/marketplace/businesses:
 *   get:
 *     summary: Get businesses with active subscriptions
 *     tags:
 *       - Marketplace
 *     parameters:
 *       - name: location
 *         in: query
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: radius
 *         in: query
 *         schema:
 *           type: number
 *       - name: sortBy
 *         in: query
 *         schema:
 *           type: string
 *           enum: [trending, rating, distance, price]
 *     responses:
 *       200:
 *         description: List of businesses
 */
router.get('/businesses', validateQuery(marketplaceQuerySchema), marketplaceController.getBusinesses.bind(marketplaceController));

/**
 * @openapi
 * /api/v1/marketplace/featured:
 *   get:
 *     summary: Get featured businesses with active subscriptions
 *     tags:
 *       - Marketplace
 *     parameters:
 *       - name: location
 *         in: query
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [businesses, products, services]
 *     responses:
 *       200:
 *         description: List of featured businesses
 */
router.get('/featured', validateQuery(marketplaceQuerySchema), marketplaceController.getFeatured.bind(marketplaceController));

/**
 * @openapi
 * /api/v1/marketplace/popular:
 *   get:
 *     summary: Get popular businesses with active subscriptions
 *     tags:
 *       - Marketplace
 *     parameters:
 *       - name: location
 *         in: query
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [businesses, products, services]
 *     responses:
 *       200:
 *         description: List of popular businesses
 */
router.get('/popular', validateQuery(marketplaceQuerySchema), marketplaceController.getPopular.bind(marketplaceController));

/**
 * @openapi
 * /api/v1/marketplace/search:
 *   get:
 *     summary: Search marketplace
 *     tags:
 *       - Marketplace
 *     parameters:
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [businesses, products, services]
 *       - name: location
 *         in: query
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', validateQuery(marketplaceQuerySchema), marketplaceController.search.bind(marketplaceController));

/**
 * @openapi
 * /api/v1/marketplace/stats:
 *   get:
 *     summary: Get marketplace statistics
 *     tags:
 *       - Marketplace
 *     responses:
 *       200:
 *         description: Marketplace statistics
 */
router.get('/stats', marketplaceController.getStats.bind(marketplaceController));

export default router;