import { Router } from 'express';
import multer from 'multer';
import { ServiceController } from '@/controllers/service.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authentication.middleware';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const serviceController = new ServiceController();

// Public routes
/**
 * @openapi
 * /api/v1/services:
 *   get:
 *     summary: List services
 *     tags:
 *       - Services
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Service list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Service'
 */
router.get('/', optionalAuthMiddleware, validateQuery(paginationQuerySchema), asyncHandler(serviceController.getServices.bind(serviceController)));

/**
 * @openapi
 * /api/v1/services/featured:
 *   get:
 *     summary: Get featured services
 *     tags:
 *       - Services
 *     responses:
 *       200:
 *         description: Featured services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Service'
 */
router.get('/featured', asyncHandler(serviceController.getFeaturedServices.bind(serviceController)));

/**
 * @openapi
 * /api/v1/services/{id}:
 *   get:
 *     summary: Get service by id
 *     tags:
 *       - Services
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Service'
 */
router.get('/:id', optionalAuthMiddleware, asyncHandler(serviceController.getServiceById.bind(serviceController)));

// Protected routes
router.use(authMiddleware);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/', upload.array('images', 10), asyncHandler(serviceController.createService.bind(serviceController)));
router.put('/:id', upload.array('images', 10), asyncHandler(serviceController.updateService.bind(serviceController)));
/**
 * @openapi
 * /api/v1/services:
 *   post:
 *     summary: Create a service
 *     tags:
 *       - Services
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Service'
 *     responses:
 *       201:
 *         description: Created service
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Service'
 */
router.post('/', asyncHandler(serviceController.createService.bind(serviceController)));

/**
 * @openapi
 * /api/v1/services/{id}:
 *   put:
 *     summary: Update a service
 *     tags:
 *       - Services
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
 *             $ref: '#/components/schemas/Service'
 *     responses:
 *       200:
 *         description: Updated service
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Service'
 */
router.put('/:id', asyncHandler(serviceController.updateService.bind(serviceController)));
router.delete('/:id', asyncHandler(serviceController.deleteService.bind(serviceController)));

export { router as serviceRoutes };