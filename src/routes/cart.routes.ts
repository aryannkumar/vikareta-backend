import { Router } from 'express';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { cartAddItemSchema, cartUpdateItemSchema, cartItemIdParamsSchema } from '@/validation/schemas';
import { cartController } from '@/controllers/cart.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(cartController.getCart.bind(cartController)));
router.post('/items', validateBody(cartAddItemSchema), asyncHandler(cartController.addItem.bind(cartController)));
router.put('/items/:itemId', validateParams(cartItemIdParamsSchema), validateBody(cartUpdateItemSchema), asyncHandler(cartController.updateItem.bind(cartController)));
router.delete('/items/:itemId', validateParams(cartItemIdParamsSchema), asyncHandler(cartController.removeItem.bind(cartController)));
router.delete('/', asyncHandler(cartController.clearCart.bind(cartController)));

export { router as cartRoutes };