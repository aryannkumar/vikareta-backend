import { Router } from 'express';
import { WebhookController } from '@/controllers/webhook.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const webhookController = new WebhookController();

// Webhook routes (no authentication required)
router.post('/cashfree', asyncHandler(webhookController.handleCashfreeWebhook.bind(webhookController)));
router.post('/whatsapp', asyncHandler(webhookController.handleWhatsAppWebhook.bind(webhookController)));
router.post('/shipping', asyncHandler(webhookController.handleShippingWebhook.bind(webhookController)));

export { router as webhookRoutes };