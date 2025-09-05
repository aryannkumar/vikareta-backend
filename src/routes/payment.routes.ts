import { Router } from 'express';
import { PaymentController } from '@/controllers/payment.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const paymentController = new PaymentController();

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/payments/create:
 *   post:
 *     summary: Create a payment intent
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Payment created
 */
router.post('/create', asyncHandler(paymentController.createPayment.bind(paymentController)));

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Get payment by id
 *     tags:
 *       - Payments
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
 *         description: Payment detail
 */
router.get('/:id', asyncHandler(paymentController.getPayment.bind(paymentController)));

/**
 * @openapi
 * /api/v1/payments/verify:
 *   post:
 *     summary: Verify a payment
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Payment verified
 */
router.post('/verify', asyncHandler(paymentController.verifyPayment.bind(paymentController)));

export { router as paymentRoutes };