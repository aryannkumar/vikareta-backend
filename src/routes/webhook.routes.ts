import { Router } from 'express';
import { WebhookController } from '@/controllers/webhook.controller';
import { burstyTestWebhookLimiter, retryWebhookLimiter } from '@/middleware/rate-limit';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const webhookController = new WebhookController();

// CRUD for stored webhooks
router.get('/', asyncHandler(webhookController.list.bind(webhookController)));
router.post('/', asyncHandler(webhookController.create.bind(webhookController)));
router.patch('/:id', asyncHandler(webhookController.update.bind(webhookController)));
router.post('/:id/secret', asyncHandler(webhookController.regenerateSecret.bind(webhookController)));
router.post('/:id/test', burstyTestWebhookLimiter, asyncHandler(webhookController.testFire.bind(webhookController)));
router.post('/:id/retry', retryWebhookLimiter, asyncHandler(webhookController.retryLast.bind(webhookController)));
router.get('/:id/attempts', asyncHandler(webhookController.attempts.bind(webhookController)));

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

export const webhookRoutes = router;
export default router;