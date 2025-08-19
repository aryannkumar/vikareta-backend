import { Router, Request, Response } from 'express';
import { whatsAppService } from '../services/WhatsAppService';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';

const router = Router();

// WhatsApp webhook verification (GET)
router.get('/webhook', (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    logger.info('WhatsApp webhook verification request:', { mode, token });

    const verificationResult = whatsAppService.verifyWebhook(token, challenge);
    
    if (verificationResult) {
      return res.status(200).send(verificationResult);
    } else {
      return res.status(403).json({ error: 'Webhook verification failed' });
    }
  } catch (error) {
    logger.error('WhatsApp webhook verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// WhatsApp webhook message handler (POST)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    logger.info('WhatsApp webhook received:', JSON.stringify(body, null, 2));

    // Verify webhook signature if needed
    // const signature = req.headers['x-hub-signature-256'] as string;
    // if (!verifyWebhookSignature(body, signature)) {
    //   return res.status(403).json({ error: 'Invalid signature' });
    // }

    // Process webhook data
    const result = await whatsAppService.handleWebhook(body);

    if (result.success) {
      return res.status(200).json({ status: 'ok' });
    } else {
      return res.status(400).json({ error: result.message || 'Failed to process webhook' });
    }
  } catch (error) {
    logger.error('WhatsApp webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send test WhatsApp message (authenticated endpoint)
router.post('/send-test', authenticate, async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    const result = await whatsAppService.sendCustomMessage(phone, message);
    
    if (result.success) {
      return res.json({ success: true, message: 'WhatsApp message sent successfully' });
    } else {
      return res.status(500).json({ error: result.error || 'Failed to send WhatsApp message' });
    }
  } catch (error) {
    logger.error('Send test WhatsApp message error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send RFQ notification via WhatsApp
router.post('/send-rfq-notification', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, phone, rfqData } = req.body;

    if (!userId || !phone || !rfqData) {
      return res.status(400).json({ error: 'userId, phone, and rfqData are required' });
    }

    const success = await notificationService.sendRFQWhatsAppNotification({
      userId,
      phone,
      rfqData
    });
    
    if (success) {
      return res.json({ success: true, message: 'RFQ WhatsApp notification sent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send RFQ WhatsApp notification' });
    }
  } catch (error) {
    logger.error('Send RFQ WhatsApp notification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send quote notification via WhatsApp
router.post('/send-quote-notification', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, phone, quoteData } = req.body;

    if (!userId || !phone || !quoteData) {
      return res.status(400).json({ error: 'userId, phone, and quoteData are required' });
    }

    const success = await notificationService.sendQuoteWhatsAppNotification({
      userId,
      phone,
      quoteData
    });
    
    if (success) {
      return res.json({ success: true, message: 'Quote WhatsApp notification sent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send quote WhatsApp notification' });
    }
  } catch (error) {
    logger.error('Send quote WhatsApp notification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send order update via WhatsApp
router.post('/send-order-update', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, phone, orderData } = req.body;

    if (!userId || !phone || !orderData) {
      return res.status(400).json({ error: 'userId, phone, and orderData are required' });
    }

    const success = await notificationService.sendOrderWhatsAppUpdate({
      userId,
      phone,
      orderData
    });
    
    if (success) {
      return res.json({ success: true, message: 'Order WhatsApp update sent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send order WhatsApp update' });
    }
  } catch (error) {
    logger.error('Send order WhatsApp update error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send payment link via WhatsApp
router.post('/send-payment-link', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, phone, orderId, amount, paymentLink } = req.body;

    if (!userId || !phone || !orderId || !amount || !paymentLink) {
      return res.status(400).json({ 
        error: 'userId, phone, orderId, amount, and paymentLink are required' 
      });
    }

    const success = await notificationService.sendPaymentLinkWhatsApp({
      userId,
      phone,
      orderId,
      amount,
      paymentLink
    });
    
    if (success) {
      return res.json({ success: true, message: 'Payment link WhatsApp message sent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send payment link WhatsApp message' });
    }
  } catch (error) {
    logger.error('Send payment link WhatsApp message error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get WhatsApp service status
router.get('/status', authenticate, (req: Request, res: Response) => {
  try {
    return res.json(whatsAppService.getServiceStatus());
  } catch (error) {
    logger.error('Get WhatsApp status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;