import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { subcategoryService } from '@/services/subcategory.service';
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

// GET /api/subcategories - Get all subcategories
router.get('/', async (req: Request, res: Response) => {
  try {
    const subcategories = await subcategoryService.getAllSubcategories();

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

// GET /api/subcategories/:id - Get subcategory by ID
router.get('/:id', [
  param('id').isString().withMessage('Subcategory ID is required'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const subcategory = await subcategoryService.getSubcategoryById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBCATEGORY_NOT_FOUND',
          message: 'Subcategory not found',
        },
      });
    }

    return res.json({
      success: true,
      data: subcategory,
    });
  } catch (error) {
    logger.error('Error fetching subcategory:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch subcategory',
      },
    });
  }
});

// GET /api/subcategories/category/:categoryId - Get subcategories by category ID
router.get('/category/:categoryId', [
  param('categoryId').isString().withMessage('Category ID is required'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const subcategories = await subcategoryService.getSubcategoriesByCategoryId(req.params.categoryId);

    return res.json({
      success: true,
      data: subcategories,
    });
  } catch (error) {
    logger.error('Error fetching subcategories by category:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch subcategories',
      },
    });
  }
});

export { router as subcategoryRoutes };