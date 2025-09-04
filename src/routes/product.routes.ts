import { Router } from 'express';
import { ProductController } from '@/controllers/product.controller';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const productController = new ProductController();

// Public routes
router.get('/', optionalAuthMiddleware, validatePagination, validateSort(['price', 'createdAt', 'title']), asyncHandler(productController.getProducts.bind(productController)));
router.get('/featured', asyncHandler(productController.getFeaturedProducts.bind(productController)));
router.get('/:id', optionalAuthMiddleware, asyncHandler(productController.getProductById.bind(productController)));

// Protected routes
router.use(authMiddleware);
router.post('/', asyncHandler(productController.createProduct.bind(productController)));
router.put('/:id', asyncHandler(productController.updateProduct.bind(productController)));
router.delete('/:id', asyncHandler(productController.deleteProduct.bind(productController)));

export { router as productRoutes };