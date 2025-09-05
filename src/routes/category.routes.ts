import { Router } from 'express';
import { CategoryController } from '@/controllers/category.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const categoryController = new CategoryController();

// Public routes
/**
 * @openapi
 * /api/v1/categories:
 *   get:
 *     summary: List categories
 *     tags:
 *       - Categories
 *     responses:
 *       200:
 *         description: Categories list
 */
router.get('/', asyncHandler(categoryController.getCategories.bind(categoryController)));
/**
 * @openapi
 * /api/v1/categories/{id}:
 *   get:
 *     summary: Get category by id
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category detail
 */
router.get('/:id', asyncHandler(categoryController.getCategoryById.bind(categoryController)));
/**
 * @openapi
 * /api/v1/categories/{id}/subcategories:
 *   get:
 *     summary: Get subcategories for a category
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subcategories list
 */
router.get('/:id/subcategories', asyncHandler(categoryController.getSubcategories.bind(categoryController)));

export { router as categoryRoutes };