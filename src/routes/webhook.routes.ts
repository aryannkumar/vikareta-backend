import { Router } from 'express';
import { WebhookController } from '@/controllers/webhook.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const webhookController = new WebhookController();

// Webhook routes (no authentication required)
/**
 * @openapi
 * /api/v1/webhooks/cashfree:
 *   post:
 *     summary: Handle Cashfree payment webhook
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Handled
 */
router.post('/cashfree', asyncHandler(webhookController.handleCashfreeWebhook.bind(webhookController)));
/**
 * @openapi
 * /api/v1/webhooks/whatsapp:
 *   post:
 *     summary: Handle WhatsApp webhook
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Handled
 */
router.post('/whatsapp', asyncHandler(webhookController.handleWhatsAppWebhook.bind(webhookController)));
/**
 * @openapi
 * /api/v1/webhooks/shipping:
 *   post:
 *     summary: Handle shipping provider webhook
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Handled
 */
router.post('/shipping', asyncHandler(webhookController.handleShippingWebhook.bind(webhookController)));

export { router as webhookRoutes };