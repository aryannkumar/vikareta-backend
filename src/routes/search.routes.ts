import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { query } from 'express-validator';

const router = Router();
const searchController = new SearchController();

// Validation schemas
const searchProductsValidation = [
    query('q').optional().isLength({ min: 1, max: 255 }).withMessage('Search query must be between 1 and 255 characters'),
    query('category').optional().isLength({ min: 1, max: 100 }).withMessage('Category must be between 1 and 100 characters'),
    query('subcategory').optional().isLength({ min: 1, max: 100 }).withMessage('Subcategory must be between 1 and 100 characters'),
    query('minPrice').optional().isNumeric().withMessage('Min price must be a number'),
    query('maxPrice').optional().isNumeric().withMessage('Max price must be a number'),
    query('location').optional().isLength({ min: 1, max: 255 }).withMessage('Location must be between 1 and 255 characters'),
    query('sortBy').optional().isIn(['relevance', 'price_low', 'price_high', 'newest', 'oldest', 'rating']).withMessage('Invalid sort option'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const searchServicesValidation = [
    query('q').optional().isLength({ min: 1, max: 255 }).withMessage('Search query must be between 1 and 255 characters'),
    query('category').optional().isLength({ min: 1, max: 100 }).withMessage('Category must be between 1 and 100 characters'),
    query('subcategory').optional().isLength({ min: 1, max: 100 }).withMessage('Subcategory must be between 1 and 100 characters'),
    query('minPrice').optional().isNumeric().withMessage('Min price must be a number'),
    query('maxPrice').optional().isNumeric().withMessage('Max price must be a number'),
    query('location').optional().isLength({ min: 1, max: 255 }).withMessage('Location must be between 1 and 255 characters'),
    query('serviceType').optional().isIn(['one-time', 'recurring', 'subscription']).withMessage('Invalid service type'),
    query('sortBy').optional().isIn(['relevance', 'price_low', 'price_high', 'newest', 'oldest', 'rating', 'popular']).withMessage('Invalid sort option'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const globalSearchValidation = [
    query('q').notEmpty().isLength({ min: 1, max: 255 }).withMessage('Search query is required and must be between 1 and 255 characters'),
    query('type').optional().isIn(['products', 'services', 'businesses']).withMessage('Type must be products, services, or businesses'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const searchSuggestionsValidation = [
    query('q').notEmpty().isLength({ min: 2, max: 255 }).withMessage('Search query is required and must be between 2 and 255 characters'),
    query('type').optional().isIn(['all', 'products', 'services', 'categories', 'businesses']).withMessage('Invalid type'),
];

const popularSearchesValidation = [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
];

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
router.get('/products', validateRequest(searchProductsValidation), searchController.searchProducts.bind(searchController));
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
router.get('/services', validateRequest(searchServicesValidation), searchController.searchServices.bind(searchController));
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
router.get('/global', validateRequest(globalSearchValidation), searchController.globalSearch.bind(searchController));
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
router.get('/suggestions', validateRequest(searchSuggestionsValidation), searchController.searchSuggestions.bind(searchController));
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
router.get('/popular', validateRequest(popularSearchesValidation), searchController.getPopularSearches.bind(searchController));

export default router;