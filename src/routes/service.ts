import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '@/middleware/auth';
import { serviceService } from '../services/service.service';
import { logger } from '@/utils/logger';

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

// Service creation validation
const createServiceValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage('Title must be between 3 and 255 characters'),
  body('description')
    .trim()
    .isLength({ min: 3, max: 5000 })
    .withMessage('Description must be at least 3 characters'),
  body('categoryId').custom((value) => {
    // Accept both UUID/CUID and slug formats
    if (!require('../utils/validation').isValidId(value) && !/^[a-z0-9-]+$/.test(value)) {
      throw new Error('Category ID must be a valid UUID, CUID, or slug');
    }
    return true;
  }),
  body('subcategoryId').optional().custom((value) => {
    // Accept both UUID/CUID and slug formats
    if (value && !require('../utils/validation').isValidId(value) && !/^[a-z0-9-]+$/.test(value)) {
      throw new Error('Subcategory ID must be a valid UUID, CUID, or slug');
    }
    return true;
  }),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('currency')
    .optional()
    .isIn(['INR', 'USD', 'EUR'])
    .withMessage('Currency must be INR, USD, or EUR'),
  body('serviceType')
    .isIn(['one_time', 'recurring', 'subscription'])
    .withMessage('Service type must be one_time, recurring, or subscription'),
  body('duration')
    .optional()
    .isInt({ min: 15 })
    .withMessage('Duration must be at least 15 minutes'),
  body('location')
    .isIn(['online', 'on_site', 'both'])
    .withMessage('Location must be online, on_site, or both'),
  body('serviceArea')
    .optional()
    .isArray()
    .withMessage('Service area must be an array'),
  body('availability')
    .optional()
    .isObject()
    .withMessage('Availability must be an object'),
];

// GET /api/services - Get services with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('categoryId').optional().custom((value) => {
    // Accept both UUID/CUID and slug formats
    if (value && !require('../utils/validation').isValidId(value) && !/^[a-z0-9-]+$/.test(value)) {
      throw new Error('Category ID must be a valid UUID, CUID, or slug');
    }
    return true;
  }),
  query('subcategoryId').optional().custom((value) => {
    // Accept both UUID/CUID and slug formats
    if (value && !require('../utils/validation').isValidId(value) && !/^[a-z0-9-]+$/.test(value)) {
      throw new Error('Subcategory ID must be a valid UUID, CUID, or slug');
    }
    return true;
  }),
  query('providerId').optional().isUUID().withMessage('Provider ID must be a valid UUID'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be non-negative'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be non-negative'),
  query('location').optional().isIn(['online', 'on_site', 'both']).withMessage('Invalid location type'),
  query('serviceType').optional().isIn(['one_time', 'recurring', 'subscription']).withMessage('Invalid service type'),
  query('sortBy').optional().isIn(['price', 'createdAt', 'title', 'rating']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters: any = {
      categoryId: req.query.categoryId as string,
      subcategoryId: req.query.subcategoryId as string,
      providerId: req.query.providerId as string,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      location: req.query.location as string,
      serviceType: req.query.serviceType as string,
      search: req.query.search as string,
      serviceArea: req.query.serviceArea as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sortBy: req.query.sortBy as 'price' | 'createdAt' | 'title' | 'rating' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await serviceService.getServices(filters);

    return res.json({
      success: true,
      data: {
        services: result.services,
        total: result.pagination.total,
        page: result.pagination.page,
        limit: result.pagination.limit,
        hasMore: result.pagination.page < result.pagination.pages,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching services:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch services',
        details: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
});

// GET /api/services/featured - Get featured services
router.get('/featured', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('categoryId').optional().custom((value) => {
    if (value && !require('../utils/validation').isValidId(value)) {
      throw new Error('Category ID must be a valid UUID or CUID');
    }
    return true;
  }),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const categoryId = req.query.categoryId as string;

    const services = await serviceService.getFeaturedServices(limit, categoryId);

    return res.json({
      success: true,
      data: services,
    });
  } catch (error) {
    logger.error('Error fetching featured services:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch featured services',
      },
    });
  }
});

// GET /api/services/nearby - Get nearby services
router.get('/nearby', [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);
    const radius = req.query.radius ? parseFloat(req.query.radius as string) : 10;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const services = await serviceService.getNearbyServices(latitude, longitude, radius, limit);

    return res.json({
      success: true,
      data: services,
    });
  } catch (error) {
    logger.error('Error fetching nearby services:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch nearby services',
      },
    });
  }
});

// GET /api/services/:id - Get service by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const service = await serviceService.getServiceById(req.params.id);

    return res.json({
      success: true,
      data: service,
    });
  } catch (error) {
    logger.error('Error fetching service:', error);
    
    if (error instanceof Error && error.message === 'Service not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch service',
      },
    });
  }
});

// POST /api/services - Create new service (requires authentication)
router.post('/', [
  authenticate,
  ...createServiceValidation,
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // ✅ Enhanced authentication validation
    if (!req.authUser?.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'User authentication is required to create services',
        },
      });
    }

    const providerId = req.authUser.userId;
    logger.info('Creating service for provider:', { providerId });

    const service = await serviceService.createService(providerId, req.body);

    return res.status(201).json({
      success: true,
      data: service,
      message: 'Service created successfully',
    });
  } catch (error) {
    logger.error('Error creating service:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CATEGORY',
            message: error.message,
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create service',
      },
    });
  }
});

// PUT /api/services/:id - Update service (requires authentication)
router.put('/:id', [
  authenticate,
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  body('title').optional().trim().isLength({ min: 3, max: 255 }).withMessage('Title must be between 3 and 255 characters'),
  body('description').optional().trim().isLength({ min: 3, max: 5000 }).withMessage('Description must be at least 3 characters'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('status').optional().isIn(['active', 'inactive', 'draft']).withMessage('Status must be active, inactive, or draft'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const providerId = req.authUser!.userId;
    const service = await serviceService.updateService(req.params.id, providerId, req.body);

    return res.json({
      success: true,
      data: service,
    });
  } catch (error) {
    logger.error('Error updating service:', error);
    
    if (error instanceof Error && error.message === 'Service not found or access denied') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found or access denied',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update service',
      },
    });
  }
});

// DELETE /api/services/:id - Delete service (requires authentication)
router.delete('/:id', [
  authenticate,
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const providerId = req.authUser!.userId;
    await serviceService.deleteService(req.params.id, providerId);

    return res.json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    
    if (error instanceof Error && error.message === 'Service not found or access denied') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found or access denied',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete service',
      },
    });
  }
});

// GET /api/services/:id/availability - Get service availability
router.get('/:id/availability', [
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  query('date').optional().isISO8601().withMessage('Date must be in ISO format'),
  query('duration').optional().isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const serviceId = req.params.id;
    const date = req.query.date as string;
    const duration = req.query.duration ? parseInt(req.query.duration as string) : undefined;

    const availability = await serviceService.getServiceAvailability(serviceId, date, duration);

    return res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    logger.error('Error fetching service availability:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch service availability',
      },
    });
  }
});

// POST /api/services/:id/book - Book service appointment (requires authentication)
router.post('/:id/book', [
  authenticate,
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  body('scheduledDate').isISO8601().withMessage('Scheduled date must be in ISO format'),
  body('scheduledTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Scheduled time must be in HH:MM format'),
  body('duration').optional().isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('location').optional().trim().isLength({ max: 500 }).withMessage('Location must not exceed 500 characters'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.userId;
    const serviceId = req.params.id;
    
    const booking = await serviceService.bookService(serviceId, userId, req.body);

    return res.status(201).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    logger.error('Error booking service:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not available')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SERVICE_NOT_AVAILABLE',
            message: error.message,
          },
        });
      }
      
      if (error.message === 'Service not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SERVICE_NOT_FOUND',
            message: 'Service not found',
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to book service',
      },
    });
  }
});

// GET /api/services/:id/reviews - Get service reviews
router.get('/:id/reviews', [
  param('id').isUUID().withMessage('Service ID must be a valid UUID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const serviceId = req.params.id;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const reviews = await serviceService.getServiceReviews(serviceId, page, limit);

    return res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    logger.error('Error fetching service reviews:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch service reviews',
      },
    });
  }
});

export { router as serviceRoutes };