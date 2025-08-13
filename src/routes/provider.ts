import { Router, Request, Response } from 'express';
import { query, param, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

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

// GET /api/providers - Get providers with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('location').optional().isString().withMessage('Location must be a string'),
  query('experience').optional().isString().withMessage('Experience must be a string'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('sortBy').optional().isIn(['createdAt', 'rating', 'experience', 'projects']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string;
    const location = req.query.location as string;
    const experience = req.query.experience as string;
    const search = req.query.search as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      userType: {
        in: ['seller', 'both']
      },
      isActive: true
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (location) {
      where.OR = [
        ...(where.OR || []),
        { location: { contains: location, mode: 'insensitive' } },
        { city: { contains: location, mode: 'insensitive' } },
        { state: { contains: location, mode: 'insensitive' } }
      ];
    }

    // Get providers (users who are sellers/service providers)
    const [providers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          email: true,
          phone: true,
          location: true,
          city: true,
          state: true,
          country: true,
          avatar: true,
          userType: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
          // Add aggregated data
          _count: {
            select: {
              products: true,
              services: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Transform data to match frontend expectations
    const transformedProviders = providers.map(provider => {
      const fullLocation = [provider.city, provider.state, provider.country]
        .filter(Boolean)
        .join(', ') || provider.location || 'Location not specified';
      
      return {
        id: provider.id,
        name: `${provider.firstName} ${provider.lastName}`.trim() || provider.businessName || 'Unknown Provider',
        businessName: provider.businessName,
        email: provider.email,
        phone: provider.phone,
        location: fullLocation,
        avatar: provider.avatar,
        verified: provider.isVerified,
        active: provider.isActive,
        rating: 4.5, // TODO: Calculate actual rating from reviews
        totalReviews: 0, // TODO: Calculate actual review count
        experience: '2+ years', // TODO: Calculate from createdAt or add experience field
        completedOrders: 0, // TODO: Calculate from orders
        responseTime: '< 1 hour', // TODO: Calculate actual response time
        totalProducts: provider._count.products,
        totalServices: provider._count.services,
        joinedAt: provider.createdAt.toISOString(),
        userType: provider.userType
      };
    });

    return res.json({
      success: true,
      data: {
        providers: transformedProviders,
        total,
        page,
        limit,
        totalPages,
        hasMore
      }
    });

  } catch (error) {
    logger.error('Error fetching providers:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch providers'
      }
    });
  }
});

// GET /api/providers/:id - Get provider by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Provider ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const provider = await prisma.user.findFirst({
      where: {
        id,
        userType: {
          in: ['seller', 'both']
        },
        isActive: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        email: true,
        phone: true,
        location: true,
        city: true,
        state: true,
        country: true,
        avatar: true,
        userType: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        products: {
          where: { status: 'active' },
          take: 10,
          select: {
            id: true,
            title: true,
            price: true,
            createdAt: true
          }
        },
        services: {
          where: { status: 'active' },
          take: 10,
          select: {
            id: true,
            title: true,
            price: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            products: true,
            services: true
          }
        }
      }
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found'
        }
      });
    }

    // Transform data
    const fullLocation = [provider.city, provider.state, provider.country]
      .filter(Boolean)
      .join(', ') || provider.location || 'Location not specified';
    
    const transformedProvider = {
      id: provider.id,
      name: `${provider.firstName} ${provider.lastName}`.trim() || provider.businessName || 'Unknown Provider',
      businessName: provider.businessName,
      email: provider.email,
      phone: provider.phone,
      location: fullLocation,
      avatar: provider.avatar,
      verified: provider.isVerified,
      active: provider.isActive,
      rating: 4.5, // TODO: Calculate actual rating
      totalReviews: 0, // TODO: Calculate actual review count
      experience: '2+ years', // TODO: Calculate from createdAt
      completedOrders: 0, // TODO: Calculate from orders
      responseTime: '< 1 hour', // TODO: Calculate actual response time
      totalProducts: provider._count?.products || 0,
      totalServices: provider._count?.services || 0,
      joinedAt: provider.createdAt.toISOString(),
      userType: provider.userType,
      products: provider.products || [],
      services: provider.services || []
    };

    return res.json({
      success: true,
      data: transformedProvider
    });

  } catch (error) {
    logger.error('Error fetching provider:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch provider'
      }
    });
  }
});

export default router;