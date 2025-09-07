import { Request, Response } from 'express';
import { logger, logHelper } from '@/utils/logger';
import { redisClient } from '@/config/redis';
import cashfreeService from '@/services/cashfree.service';
import { WhatsAppService } from '@/services/whatsapp.service';
import { webhookService } from '@/services/webhook.service';
import { paymentReconciliationService } from '@/services/payment-reconciliation.service';
import { shippingService } from '@/services/shipping.service';

const whatsappService = new WhatsAppService();

export class WebhookController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const hooks = await webhookService.list(userId);
      res.json({ success: true, data: hooks });
    } catch (error) {
      logger.error('WebhookController.list error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch webhooks' });
    }
  }
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { name, url, events } = req.body;
      const hook = await webhookService.create({ userId, name, url, events });
      res.status(201).json({ success: true, message: 'Webhook created', data: hook });
    } catch (error) {
      logger.error('WebhookController.create error', error);
      res.status(400).json({ success: false, error: 'Failed to create webhook' });
    }
  }
  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;
      const hook = await webhookService.update(id, {
        ...(data.name ? { name: data.name } : {}),
        ...(data.url ? { url: data.url } : {}),
        ...(data.events ? { events: data.events } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      });
      res.json({ success: true, message: 'Webhook updated', data: hook });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to update webhook' });
    }
  }
  async regenerateSecret(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const hook = await webhookService.regenerateSecret(id);
      res.json({ success: true, message: 'Secret regenerated', data: hook });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to regenerate secret' });
    }
  }
  async testFire(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; const { event = 'test.event', extra } = req.body;
      const result = await webhookService.testFire(id, event, extra);
      res.json({ success: true, message: 'Test event dispatched', data: result });
    } catch (error) {
      logger.error('WebhookController.testFire error', error);
      res.status(400).json({ success: false, error: 'Failed to dispatch test event' });
    }
  }
  async retryLast(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; const { event = 'retry.event' } = req.body;
      const result = await webhookService.retryLast(id, event);
      res.json({ success: true, message: 'Retry dispatched', data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to retry event' });
    }
  }
  async attempts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const attempts = await webhookService.getAttempts(id);
      res.json({ success: true, data: attempts });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to fetch attempts' });
    }
  }
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

      // Attempt immediate reconciliation if payload references an order or txn (non-blocking best-effort)
      paymentReconciliationService.reconcileCashfreePayload(payload);

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

      await shippingService.handleProviderWebhook(payload);

      res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      logger.error('Error handling shipping webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}