import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '@/middleware/auth';
import { categoryService } from '@/services/category.service';
import { logger } from '@/utils/logger';
import { getAllCategoryIcons, getCategoryIcon, suggestCategoryIcon } from '@/utils/categoryIcons';

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

// Category validation rules
const createCategoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Category name must be between 2 and 255 characters'),
  body('slug')
    .trim()
    .isLength({ min: 2, max: 255 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('parentId')
    .optional()
    .isUUID()
    .withMessage('Parent ID must be a valid UUID'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
];

const updateCategoryValidation = [
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Category name must be between 2 and 255 characters'),
  body('slug')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('parentId')
    .optional()
    .isUUID()
    .withMessage('Parent ID must be a valid UUID'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
];

// GET /api/categories - Get all root categories with hierarchy
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.getRootCategories();

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch categories',
      },
    });
  }
});

// GET /api/categories/all - Get all categories in flat structure
router.get('/all', [
  query('includeInactive').optional().isBoolean().withMessage('includeInactive must be a boolean'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const categories = await categoryService.getAllCategories(includeInactive);

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error fetching all categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch categories',
      },
    });
  }
});

// GET /api/categories/popular - Get popular categories based on product count
router.get('/popular', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const categories = await categoryService.getPopularCategories(limit);

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error fetching popular categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch popular categories',
      },
    });
  }
});

// GET /api/categories/icons - Get all available category icons
router.get('/icons', async (req: Request, res: Response) => {
  try {
    const icons = getAllCategoryIcons();

    return res.json({
      success: true,
      data: icons,
    });
  } catch (error) {
    logger.error('Error fetching category icons:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch category icons',
      },
    });
  }
});

// GET /api/categories/icons/:slug - Get icon for specific category slug
router.get('/icons/:slug', [
  param('slug').trim().isLength({ min: 1 }).withMessage('Category slug is required'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const icon = getCategoryIcon(req.params.slug);

    return res.json({
      success: true,
      data: {
        slug: req.params.slug,
        icon: icon,
      },
    });
  } catch (error) {
    logger.error('Error fetching category icon:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch category icon',
      },
    });
  }
});

// POST /api/categories/icons/suggest - Get icon suggestions for category
router.post('/icons/suggest', [
  body('name').trim().isLength({ min: 1 }).withMessage('Category name is required'),
  body('description').optional().trim(),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const suggestions = suggestCategoryIcon(name, description);

    return res.json({
      success: true,
      data: {
        name,
        suggestions,
      },
    });
  } catch (error) {
    logger.error('Error getting icon suggestions:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get icon suggestions',
      },
    });
  }
});

// GET /api/categories/search - Search categories
router.get('/search', [
  query('q').trim().isLength({ min: 1 }).withMessage('Search query is required'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const categories = await categoryService.searchCategories(query, limit);

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error searching categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search categories',
      },
    });
  }
});

// GET /api/categories/slug/:slug - Get category by slug
router.get('/slug/:slug', [
  param('slug').trim().isLength({ min: 1 }).withMessage('Category slug is required'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const category = await categoryService.getCategoryBySlug(req.params.slug);

    return res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error fetching category by slug:', error);

    if (error instanceof Error && error.message === 'Category not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch category',
      },
    });
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const category = await categoryService.getCategoryById(req.params.id);

    return res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error fetching category:', error);

    if (error instanceof Error && error.message === 'Category not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch category',
      },
    });
  }
});

// GET /api/categories/:id/subcategories - Get subcategories
router.get('/:id/subcategories', [
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const subcategories = await categoryService.getSubcategories(req.params.id);

    return res.json({
      success: true,
      data: subcategories,
    });
  } catch (error) {
    logger.error('Error fetching subcategories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch subcategories',
      },
    });
  }
});

// GET /api/categories/:id/path - Get category breadcrumb path
router.get('/:id/path', [
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const path = await categoryService.getCategoryPath(req.params.id);

    return res.json({
      success: true,
      data: path,
    });
  } catch (error) {
    logger.error('Error fetching category path:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch category path',
      },
    });
  }
});

// POST /api/categories - Create new category (requires authentication - admin only)
router.post('/', [
  authenticate,
  ...createCategoryValidation,
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Note: In a real implementation, you'd check if user is admin
    // For now, we'll allow any authenticated user to create categories

    const category = await categoryService.createCategory(req.body);

    return res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error creating category:', error);

    if (error instanceof Error) {
      if (error.message === 'Parent category not found') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: 'Parent category not found',
          },
        });
      }

      if (error.message === 'Category slug already exists') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLUG_EXISTS',
            message: 'Category slug already exists',
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create category',
      },
    });
  }
});

// PUT /api/categories/:id - Update category (requires authentication - admin only)
router.put('/:id', [
  authenticate,
  ...updateCategoryValidation,
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Note: In a real implementation, you'd check if user is admin

    const category = await categoryService.updateCategory(req.params.id, req.body);

    return res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Error updating category:', error);

    if (error instanceof Error) {
      if (error.message === 'Category not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
          },
        });
      }

      if (error.message === 'Parent category not found') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: 'Parent category not found',
          },
        });
      }

      if (error.message === 'Category slug already exists') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLUG_EXISTS',
            message: 'Category slug already exists',
          },
        });
      }

      if (error.message.includes('circular') || error.message.includes('descendant')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_HIERARCHY',
            message: error.message,
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update category',
      },
    });
  }
});

// DELETE /api/categories/:id - Delete category (requires authentication - admin only)
router.delete('/:id', [
  authenticate,
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Note: In a real implementation, you'd check if user is admin

    await categoryService.deleteCategory(req.params.id);

    return res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting category:', error);

    if (error instanceof Error) {
      if (error.message === 'Category not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
          },
        });
      }

      if (error.message.includes('products') || error.message.includes('subcategories')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CATEGORY_IN_USE',
            message: error.message,
          },
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete category',
      },
    });
  }
});

// PUT /api/categories/reorder - Reorder categories (requires authentication - admin only)
router.put('/reorder', [
  authenticate,
  body('categoryIds').isArray({ min: 1 }).withMessage('Category IDs array is required'),
  body('categoryIds.*').isUUID().withMessage('Each category ID must be a valid UUID'),
  body('parentId').optional().isUUID().withMessage('Parent ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Note: In a real implementation, you'd check if user is admin

    const { categoryIds, parentId } = req.body;
    await categoryService.reorderCategories(categoryIds, parentId);

    return res.json({
      success: true,
      message: 'Categories reordered successfully',
    });
  } catch (error) {
    logger.error('Error reordering categories:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORIES',
          message: error.message,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reorder categories',
      },
    });
  }
});

export { router as categoryRoutes };