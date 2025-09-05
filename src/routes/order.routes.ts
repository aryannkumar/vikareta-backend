import { Router } from 'express';
import { OrderController } from '@/controllers/order.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const orderController = new OrderController();

// All routes require authentication
router.use(authMiddleware);
/**
 * @openapi
 * /api/v1/orders:
 *   get:
 *     summary: List orders for current user
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders list
 */
router.get('/', validatePagination, validateSort(['createdAt', 'totalAmount', 'status']), asyncHandler(orderController.getOrders.bind(orderController)));
/**
 * @openapi
 * /api/v1/orders:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Order created
 */
router.post('/', asyncHandler(orderController.createOrder.bind(orderController)));
router.post('/', asyncHandler(orderController.createOrder.bind(orderController)));
/**
 * @openapi
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Get order by id
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order detail
 */
router.get('/:id', asyncHandler(orderController.getOrderById.bind(orderController)));
router.put('/:id', asyncHandler(orderController.updateOrder.bind(orderController)));
router.put('/:id/status', asyncHandler(orderController.updateOrderStatus.bind(orderController)));
router.get('/:id/tracking', asyncHandler(orderController.getOrderTracking.bind(orderController)));

export { router as orderRoutes };