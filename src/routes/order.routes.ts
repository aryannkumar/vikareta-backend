import { Router } from 'express';
import { OrderController } from '@/controllers/order.controller';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { validateQuery, validateBody, validateParams } from '@/middleware/zod-validate';
import { orderCreateSchema, orderUpdateSchema, orderStatusUpdateSchema, orderIdParamsSchema, orderListQuerySchema, orderTrackingEventSchema } from '@/validation/schemas';
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
router.get('/', validateQuery(orderListQuerySchema), asyncHandler(orderController.getOrders.bind(orderController)));
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
router.post('/', validateBody(orderCreateSchema), asyncHandler(orderController.createOrder.bind(orderController)));
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
router.get('/:id', validateParams(orderIdParamsSchema), asyncHandler(orderController.getOrderById.bind(orderController)));
router.put('/:id', validateParams(orderIdParamsSchema), validateBody(orderUpdateSchema), asyncHandler(orderController.updateOrder.bind(orderController)));
router.put('/:id/status', validateParams(orderIdParamsSchema), validateBody(orderStatusUpdateSchema), asyncHandler(orderController.updateOrderStatus.bind(orderController)));
router.get('/:id/tracking', asyncHandler(orderController.getOrderTracking.bind(orderController)));
router.post('/:id/tracking-events', validateParams(orderIdParamsSchema), validateBody(orderTrackingEventSchema), asyncHandler(orderController.addTrackingEvent.bind(orderController)));

// Order statistics routes
router.get('/pending/stats', asyncHandler(orderController.getPendingOrderStats.bind(orderController)));
router.get('/completed/stats', asyncHandler(orderController.getCompletedOrderStats.bind(orderController)));
router.get('/ready-to-ship', asyncHandler(orderController.getReadyToShipOrders.bind(orderController)));

// Buyer and seller specific routes
router.get('/buyer', asyncHandler(orderController.getBuyerOrders.bind(orderController)));
router.get('/seller', asyncHandler(orderController.getSellerOrders.bind(orderController)));

export { router as orderRoutes };