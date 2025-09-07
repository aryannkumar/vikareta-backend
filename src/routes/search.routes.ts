import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';
import { validateQuery } from '@/middleware/zod-validate';
import { searchProductsQuerySchema, searchServicesQuerySchema, searchGlobalQuerySchema, searchSuggestionsQuerySchema, popularSearchesQuerySchema } from '@/validation/schemas';

const router = Router();
const searchController = new SearchController();

// Legacy express-validator validations removed in favor of Zod schemas

// Routes
/**
 * @openapi
 * /api/v1/search/products:
 *   get:
 *     summary: Search products
 *     tags:
 *       - Search
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/products', validateQuery(searchProductsQuerySchema), searchController.searchProducts.bind(searchController));
/**
 * @openapi
 * /api/v1/search/services:
 *   get:
 *     summary: Search services
 *     tags:
 *       - Search
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/services', validateQuery(searchServicesQuerySchema), searchController.searchServices.bind(searchController));
/**
 * @openapi
 * /api/v1/search/global:
 *   get:
 *     summary: Global search across products, services, and businesses
 *     tags:
 *       - Search
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/global', validateQuery(searchGlobalQuerySchema), searchController.globalSearch.bind(searchController));
/**
 * @openapi
 * /api/v1/search/suggestions:
 *   get:
 *     summary: Get search suggestions
 *     tags:
 *       - Search
 *     responses:
 *       200:
 *         description: Suggestions
 */
router.get('/suggestions', validateQuery(searchSuggestionsQuerySchema), searchController.searchSuggestions.bind(searchController));
/**
 * @openapi
 * /api/v1/search/popular:
 *   get:
 *     summary: Get popular searches
 *     tags:
 *       - Search
 *     responses:
 *       200:
 *         description: Popular terms
 */
router.get('/popular', validateQuery(popularSearchesQuerySchema), searchController.getPopularSearches.bind(searchController));

export default router;