import { Request, Response } from 'express';
import { logger, logHelper } from '@/utils/logger';
import { redisClient } from '@/config/redis';
import { prisma } from '@/config/database';
import cashfreeService from '@/services/cashfree.service';
import { WhatsAppService } from '@/services/whatsapp.service';

const whatsappService = new WhatsAppService();

export class WebhookController {
  async handleCashfreeWebhook(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /webhooks/cashfree:
   *   post:
   *     tags:
   *       - Webhooks
   *     summary: Receive Cashfree payment webhooks
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook queued for processing
   */
    try {
      const payload = req.body;
      const signatureHeader = req.headers['x-cashfree-signature'] as string | undefined;

      // Best-effort validation
      const valid = cashfreeService.validateSignature(payload, signatureHeader);

      logHelper.logWebhook('cashfree', valid ? 'incoming_valid' : 'incoming_unverified', payload);

      // Queue for background processing regardless
      await redisClient.lpush('payment_webhooks', JSON.stringify(payload));

      // Attempt immediate reconciliation if payload references an order or txn
      try {
        const paymentStatus = cashfreeService.parsePaymentStatus(payload);
        const orderId = payload.orderId || payload.order_id || payload.order;
        const gatewayTransactionId = payload.txnId || payload.txnIdExternal || payload.transactionId || payload.txnid || payload.txId || undefined;

        if (gatewayTransactionId) {
          // Update payment record(s) by gatewayTransactionId if exists
          await prisma.payment.updateMany({ where: { gatewayTransactionId }, data: { status: paymentStatus, gatewayTransactionId } });
        }

        if (orderId && paymentStatus === 'paid') {
          // Update order payment status immediately
          await prisma.order.updateMany({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
        }
      } catch (err) {
        logger.error('Error during immediate cashfree reconciliation:', err);
      }

      res.json({ success: true, message: 'Webhook queued' });
    } catch (error) {
      logger.error('Error handling cashfree webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /webhooks/whatsapp:
   *   post:
   *     tags:
   *       - Webhooks
   *     summary: Receive WhatsApp incoming webhooks
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processed
   */
    try {
      const payload = req.body;
      // Simple pass-through to whatsapp service if available
      try {
        // WhatsAppService doesn't expose handleIncomingMessage; attempt to send or ignore
        if (whatsappService.isConfigured()) {
          // Best-effort: if payload contains phone and message, forward as text
          const to = payload.from || payload.to || payload.phone;
          const message = payload.message || payload.text || JSON.stringify(payload);
          if (to) await whatsappService.sendMessage({ to, message, type: 'text' });
        }
      } catch (err) {
        logger.error('Error forwarding whatsapp webhook to service:', err);
      }

  logHelper.logWebhook('whatsapp', 'incoming', payload);
      res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      logger.error('Error handling whatsapp webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async handleShippingWebhook(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /webhooks/shipping:
   *   post:
   *     tags:
   *       - Webhooks
   *     summary: Receive shipping provider webhooks
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processed
   */
    try {
      const payload = req.body;
  logHelper.logWebhook('shipping', 'incoming', payload);

      // If payload contains trackingNumber or orderId, update delivery tracking
      const trackingNumber = payload.trackingNumber || payload.awb || payload.awbNumber;
      const orderId = payload.orderId || payload.order_id || payload.order;

      if (trackingNumber) {
        // Update shipment and delivery tracking
  await prisma.shipment.updateMany({ where: { trackingNumber }, data: { status: payload.status || 'in_transit', trackingNumber } });
  await prisma.deliveryTracking.create({ data: { orderId: orderId || (payload.orderId as string) || '', trackingNumber, carrier: payload.carrier || payload.provider, status: payload.status || 'in_transit', trackingUrl: payload.trackingUrl || undefined } }).catch(() => null);
      }

      // If webhook references an order and payment status, update order/payment
      if (payload.orderId && payload.paymentStatus) {
        await prisma.order.updateMany({ where: { id: payload.orderId }, data: { paymentStatus: payload.paymentStatus } }).catch(() => null);
      }

      res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      logger.error('Error handling shipping webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}