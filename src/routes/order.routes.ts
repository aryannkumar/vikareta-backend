import { Router } from 'express';
import { OrderController } from '@/controllers/order.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const orderController = new OrderController();

// All routes require authentication
router.use(authMiddleware);

router.get('/', validatePagination, validateSort(['createdAt', 'totalAmount', 'status']), asyncHandler(orderController.getOrders.bind(orderController)));
router.post('/', asyncHandler(orderController.createOrder.bind(orderController)));
router.get('/:id', asyncHandler(orderController.getOrderById.bind(orderController)));
router.put('/:id', asyncHandler(orderController.updateOrder.bind(orderController)));
router.put('/:id/status', asyncHandler(orderController.updateOrderStatus.bind(orderController)));
router.get('/:id/tracking', asyncHandler(orderController.getOrderTracking.bind(orderController)));

export { router as orderRoutes };