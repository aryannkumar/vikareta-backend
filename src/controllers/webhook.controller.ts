import { Request, Response } from 'express';

export class WebhookController {
  async handleCashfreeWebhook(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Webhook processed' });
  }

  async handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Webhook processed' });
  }

  async handleShippingWebhook(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Webhook processed' });
  }
}