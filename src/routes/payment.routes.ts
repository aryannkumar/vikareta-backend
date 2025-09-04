import { Router } from 'express';
import { PaymentController } from '@/controllers/payment.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const paymentController = new PaymentController();

router.use(authMiddleware);

router.post('/create', asyncHandler(paymentController.createPayment.bind(paymentController)));
router.get('/:id', asyncHandler(paymentController.getPayment.bind(paymentController)));
router.post('/verify', asyncHandler(paymentController.verifyPayment.bind(paymentController)));

export { router as paymentRoutes };