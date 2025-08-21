import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
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

// GET /api/products - Get products with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('subcategoryId').optional().isUUID().withMessage('Subcategory ID must be a valid UUID'),
  query('sellerId').optional().isUUID().withMessage('Seller ID must be a valid UUID'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be non-negative'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be non-negative'),
  query('sortBy').optional().isIn(['price', 'createdAt', 'title', 'stockQuantity']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const categoryId = req.query.categoryId as string;
    const subcategoryId = req.query.subcategoryId as string;
    const sellerId = req.query.sellerId as string;
    const status = (req.query.status as string) || 'active';
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    const inStock = req.query.inStock === 'true';
    const search = req.query.search as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    // Build where clause
    const where: any = { status };

    if (categoryId) where.categoryId = categoryId;
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (sellerId) where.sellerId = sellerId;
    if (inStock) where.stockQuantity = { gt: 0 };

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Handle isService filter
    if (req.query.isService === 'true') {
      where.isService = true;
    } else if (req.query.isService === 'false') {
      where.isService = false;
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Get total count
    const total = await prisma.product.count({ where });

    // Get products with pagination
    const products = await prisma.product.findMany({
      where,
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: true,
        subcategory: true,
        variants: {
          orderBy: { name: 'asc' },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            orderItems: true,
            cartItems: true,
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data: {
        products,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch products',
      },
    });
  }
});

// GET /api/products/:id - Get product by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: true,
        subcategory: true,
        variants: {
          orderBy: { name: 'asc' },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            orderItems: true,
            cartItems: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        },
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Error fetching product:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

// POST /api/products - Create a new product
router.post('/', authenticate, [
  body('title').trim().isLength({ min: 3, max: 255 }).withMessage('Title must be between 3 and 255 characters'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description must not exceed 5000 characters'),
  body('categoryId').isUUID().withMessage('Category ID must be a valid UUID'),
  body('subcategoryId').optional().isUUID().withMessage('Subcategory ID must be a valid UUID'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative'),
  body('minOrderQuantity').optional().isInt({ min: 1 }).withMessage('Min order quantity must be positive'),
  body('isService').optional().isBoolean().withMessage('isService must be a boolean'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // ✅ Enhanced authentication validation
    if (!req.authUser?.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'User authentication is required to create products',
        },
      });
    }

    const sellerId = req.authUser.userId;
    logger.info('Creating product for seller:', { sellerId });

    const {
      title,
      description,
      categoryId,
      subcategoryId,
      price,
      currency = 'INR',
      stockQuantity = 0,
      minOrderQuantity = 1,
      isService = false,
    } = req.body;

    // ✅ Enhanced category validation
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORY',
          message: 'Selected category does not exist',
        },
      });
    }

    // ✅ Enhanced subcategory validation
    if (subcategoryId) {
      const subcategory = await prisma.subcategory.findUnique({
        where: { id: subcategoryId },
      });

      if (!subcategory || subcategory.categoryId !== categoryId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SUBCATEGORY',
            message: 'Selected subcategory does not exist or does not belong to the selected category',
          },
        });
      }
    }

    const product = await prisma.product.create({
      data: {
        title,
        description,
        categoryId,
        subcategoryId,
        price,
        currency,
        stockQuantity,
        minOrderQuantity,
        isService,
        sellerId, // ✅ Now properly validated
        status: 'active',
      },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: true,
        subcategory: true,
        variants: true,
        media: true,
      },
    });

    logger.info('Product created successfully:', { productId: product.id, sellerId });

    return res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  } catch (error) {
    logger.error('Error creating product:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create product',
      },
    });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', authenticate, [
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  body('title').optional().trim().isLength({ min: 3, max: 255 }).withMessage('Title must be between 3 and 255 characters'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description must not exceed 5000 characters'),
  body('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  body('subcategoryId').optional().isUUID().withMessage('Subcategory ID must be a valid UUID'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative'),
  body('minOrderQuantity').optional().isInt({ min: 1 }).withMessage('Min order quantity must be positive'),
  body('status').optional().isIn(['active', 'inactive', 'draft']).withMessage('Invalid status'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Check if product exists and belongs to user
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        sellerId: req.authUser!.userId,
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found or access denied',
        },
      });
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: true,
        subcategory: true,
        variants: true,
        media: true,
      },
    });

    logger.info('Product updated successfully:', { productId: product.id, sellerId: req.authUser!.userId });

    return res.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  } catch (error) {
    logger.error('Error updating product:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update product',
      },
    });
  }
});

// DELETE /api/products/:id - Delete product
router.delete('/:id', authenticate, [
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Check if product exists and belongs to user
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        sellerId: req.authUser!.userId,
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found or access denied',
        },
      });
    }

    await prisma.product.delete({
      where: { id: req.params.id },
    });

    logger.info('Product deleted successfully:', { productId: req.params.id, sellerId: req.authUser!.userId });

    return res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting product:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete product',
      },
    });
  }
});

export default router;