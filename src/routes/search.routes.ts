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
router.get('/products', validateRequest(searchProductsValidation), searchController.searchProducts.bind(searchController));
router.get('/services', validateRequest(searchServicesValidation), searchController.searchServices.bind(searchController));
router.get('/global', validateRequest(globalSearchValidation), searchController.globalSearch.bind(searchController));
router.get('/suggestions', validateRequest(searchSuggestionsValidation), searchController.searchSuggestions.bind(searchController));
router.get('/popular', validateRequest(popularSearchesValidation), searchController.getPopularSearches.bind(searchController));

export default router;