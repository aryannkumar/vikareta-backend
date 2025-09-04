import { Router } from 'express';
import { CategoryController } from '@/controllers/category.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const categoryController = new CategoryController();

// Public routes
router.get('/', asyncHandler(categoryController.getCategories.bind(categoryController)));
router.get('/:id', asyncHandler(categoryController.getCategoryById.bind(categoryController)));
router.get('/:id/subcategories', asyncHandler(categoryController.getSubcategories.bind(categoryController)));

export { router as categoryRoutes };