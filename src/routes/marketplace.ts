import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { marketplaceService } from '../services/marketplace.service';

const router = Router();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

// GET /api/marketplace/discover - Discover nearby businesses, products, and services
router.get('/discover', [
  query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
  query('type').optional().isIn(['all', 'businesses', 'products', 'services']).withMessage('Type must be all, businesses, products, or services'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      latitude: req.query.latitude ? parseFloat(req.query.latitude as string) : undefined,
      longitude: req.query.longitude ? parseFloat(req.query.longitude as string) : undefined,
      radius: req.query.radius ? parseFloat(req.query.radius as string) : 10,
      type: req.query.type as 'all' | 'businesses' | 'products' | 'services' || 'all',
      categoryId: req.query.categoryId as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const result = await marketplaceService.discoverNearby(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error discovering marketplace items:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to discover marketplace items',
      },
    });
  }
});

// GET /api/marketplace/featured - Get featured businesses, products, and services
router.get('/featured', [
  query('type').optional().isIn(['all', 'businesses', 'products', 'services']).withMessage('Type must be all, businesses, products, or services'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as 'all' | 'businesses' | 'products' | 'services' || 'all',
      categoryId: req.query.categoryId as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
    };

    const result = await marketplaceService.getFeatured(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching featured items:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch featured items',
      },
    });
  }
});

// GET /api/marketplace/popular - Get popular businesses, products, and services
router.get('/popular', [
  query('type').optional().isIn(['all', 'businesses', 'products', 'services']).withMessage('Type must be all, businesses, products, or services'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('timeframe').optional().isIn(['day', 'week', 'month', 'all']).withMessage('Timeframe must be day, week, month, or all'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as 'all' | 'businesses' | 'products' | 'services' || 'all',
      categoryId: req.query.categoryId as string,
      timeframe: req.query.timeframe as 'day' | 'week' | 'month' | 'all' || 'week',
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
    };

    const result = await marketplaceService.getPopular(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching popular items:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch popular items',
      },
    });
  }
});

// GET /api/marketplace/businesses - Get businesses with filtering
router.get('/businesses', [
  query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('verificationTier').optional().isIn(['basic', 'premium', 'enterprise']).withMessage('Invalid verification tier'),
  query('isVerified').optional().isBoolean().withMessage('isVerified must be a boolean'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      latitude: req.query.latitude ? parseFloat(req.query.latitude as string) : undefined,
      longitude: req.query.longitude ? parseFloat(req.query.longitude as string) : undefined,
      radius: req.query.radius ? parseFloat(req.query.radius as string) : 10,
      categoryId: req.query.categoryId as string,
      verificationTier: req.query.verificationTier as string,
      isVerified: req.query.isVerified === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const result = await marketplaceService.getBusinesses(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching businesses:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch businesses',
      },
    });
  }
});

// GET /api/marketplace/categories - Get marketplace categories with counts
router.get('/categories', [
  query('type').optional().isIn(['all', 'products', 'services']).withMessage('Type must be all, products, or services'),
  query('parentId').optional().isUUID().withMessage('Parent ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as 'all' | 'products' | 'services' || 'all',
      parentId: req.query.parentId as string,
    };

    const categories = await marketplaceService.getCategories(filters);

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch categories',
      },
    });
  }
});

// GET /api/marketplace/search - Global marketplace search
router.get('/search', [
  query('q').isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters'),
  query('type').optional().isIn(['all', 'businesses', 'products', 'services']).withMessage('Type must be all, businesses, products, or services'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters = {
      query: req.query.q as string,
      type: req.query.type as 'all' | 'businesses' | 'products' | 'services' || 'all',
      categoryId: req.query.categoryId as string,
      latitude: req.query.latitude ? parseFloat(req.query.latitude as string) : undefined,
      longitude: req.query.longitude ? parseFloat(req.query.longitude as string) : undefined,
      radius: req.query.radius ? parseFloat(req.query.radius as string) : 10,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const result = await marketplaceService.search(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error searching marketplace:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search marketplace',
      },
    });
  }
});

// GET /api/marketplace/stats - Get marketplace statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await marketplaceService.getMarketplaceStats();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching marketplace stats:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch marketplace stats',
      },
    });
  }
});

export { router as marketplaceRoutes };