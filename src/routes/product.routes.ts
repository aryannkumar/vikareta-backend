import { Router } from 'express';
import multer from 'multer';
import { ProductController } from '@/controllers/product.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth-middleware';
import { validatePagination, validateSort } from '../middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const productController = new ProductController();

// Public routes
/**
 * @openapi
 * /api/v1/products:
 *   get:
 *     summary: List products
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product list
 */
router.get('/', optionalAuthMiddleware, validatePagination, validateSort(['price', 'createdAt', 'title']), asyncHandler(productController.getProducts.bind(productController)));

/**
 * @openapi
 * /api/v1/products/featured:
 *   get:
 *     summary: Get featured products
 *     tags:
 *       - Products
 *     responses:
 *       200:
 *         description: Featured products
 */
router.get('/featured', asyncHandler(productController.getFeaturedProducts.bind(productController)));

/**
 * @openapi
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get product by id
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product detail
 */
/**
 * @openapi
 * /api/v1/products:
 *   post:
 *     summary: Create a product
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Created product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 */
router.get('/:id', optionalAuthMiddleware, asyncHandler(productController.getProductById.bind(productController)));

/**
 * @openapi
 * /api/v1/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Updated product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 */
// Protected routes
router.use(authMiddleware);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/', upload.array('images', 10), asyncHandler(productController.createProduct.bind(productController)));
router.put('/:id', upload.array('images', 10), asyncHandler(productController.updateProduct.bind(productController)));
router.delete('/:id', asyncHandler(productController.deleteProduct.bind(productController)));

export { router as productRoutes };