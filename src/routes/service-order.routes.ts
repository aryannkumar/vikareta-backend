import { Router } from 'express';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { serviceOrderStatusUpdateSchema, serviceOrderIdParamsSchema } from '@/validation/schemas';
import { serviceOrderController } from '@/controllers/service-order.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);

router.patch('/:id/status', validateParams(serviceOrderIdParamsSchema), validateBody(serviceOrderStatusUpdateSchema), asyncHandler(serviceOrderController.updateStatus.bind(serviceOrderController)));

export { router as serviceOrderRoutes };