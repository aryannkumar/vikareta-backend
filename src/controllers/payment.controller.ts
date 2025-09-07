import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { paymentService } from '@/services/payment.service';


export class PaymentController {
  /**
   * @openapi
   * /payments/create:
   *   post:
   *     tags:
   *       - Payments
   *     summary: Create a payment record
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               orderId:
   *                 type: string
   *               amount:
   *                 type: number
   *               paymentMethod:
   *                 type: string
   *     responses:
   *       201:
   *         description: Payment created
   */
  async createPayment(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, amount, paymentMethod = 'upi', paymentGateway = 'cashfree', gatewayTransactionId } = req.body;

      if (!orderId || !amount) {
        res.status(400).json({ error: 'orderId and amount are required' });
        return;
      }

      const payment = await paymentService.create({ orderId, amount: Number(amount), paymentMethod, paymentGateway, gatewayTransactionId });

      res.status(201).json({ success: true, message: 'Payment created successfully', data: payment });
    } catch (error) {
      logger.error('Error creating payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getPayment(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /payments/{id}:
   *   get:
   *     tags:
   *       - Payments
   *     summary: Get payment by id
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Payment details
   */
    try {
      const { id } = req.params;
      const payment = await paymentService.get(id);
      res.json({ success: true, data: payment });
    } catch (error) {
      logger.error('Error fetching payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async verifyPayment(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /payments/verify/{id}:
   *   post:
   *     tags:
   *       - Payments
   *     summary: Verify a payment and update order status
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *     responses:
   *       200:
   *         description: Payment verified
   */
    try {
      const { id } = req.params;
      const { status, gatewayTransactionId } = req.body;

      if (!id) {
        res.status(400).json({ error: 'Payment id is required' });
        return;
      }

      const payment = await paymentService.verify(id, status, gatewayTransactionId);

      res.json({ success: true, message: 'Payment verified successfully', data: payment });
    } catch (error) {
      logger.error('Error verifying payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}