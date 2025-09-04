import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import { OrderService } from '../services/order.service';

const orderService = new OrderService();

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

      const payment = await prisma.payment.create({
        data: {
          orderId,
          amount: Number(amount),
          paymentMethod,
          paymentGateway,
          gatewayTransactionId,
          status: 'pending',
        },
      });

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
      const payment = await prisma.payment.findUnique({ where: { id } });
      if (!payment) {
        res.status(404).json({ error: 'Payment not found' });
        return;
      }
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

      const payment = await prisma.payment.update({ where: { id }, data: { status: status || 'processing', gatewayTransactionId } });

      // Update order payment status if payment is paid
      if (payment && payment.orderId && payment.status === 'paid') {
        await orderService.updatePaymentStatus(payment.orderId, 'paid');
      }

      res.json({ success: true, message: 'Payment verified successfully', data: payment });
    } catch (error) {
      logger.error('Error verifying payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}