import { Router, Request, Response } from 'express';
import { paymentManager } from '../services/payments/PaymentManager';
import { whatsAppService } from '../services/WhatsAppService';
import { PaymentRequest, PaymentVerificationRequest, OrderNotification } from '../types/payment';

const router = Router();

// Get available payment gateways
router.get('/gateways', async (req: Request, res: Response) => {
  try {
    const gateways = paymentManager.getAvailableGateways();
    
    // Remove sensitive config data before sending to frontend
    const publicGateways = gateways.map(gateway => ({
      id: gateway.id,
      name: gateway.name,
      slug: gateway.slug,
      logo: gateway.logo,
      status: gateway.status
    }));

    res.json({
      success: true,
      gateways: publicGateways
    });
  } catch (error: any) {
    console.error('Failed to get payment gateways:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment gateways'
    });
  }
});

// Create payment order
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { gateway, orderId, amount, currency, customerName, customerEmail, customerPhone, description, metadata } = req.body;

    if (!gateway || !orderId || !amount || !customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    const paymentRequest: PaymentRequest = {
      orderId,
      amount: Number(amount),
      currency: currency || 'INR',
      customerName,
      customerEmail,
      customerPhone,
      description,
      returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
      notifyUrl: `${process.env.BACKEND_URL}/api/payment/webhook/${gateway}`,
      metadata: {
        ...metadata,
        vikaretaMiddleware: true,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      }
    };

    const response = await paymentManager.createPayment(gateway, paymentRequest);

    if (response.success) {
      // Send WhatsApp notification for payment initiation
      const notification: OrderNotification = {
        orderId,
        buyerId: metadata?.buyerId || customerEmail,
        type: 'order_placed',
        status: 'payment_initiated',
        message: `Payment of ₹${amount} has been initiated for your order.`,
        additionalData: {
          amount,
          gateway,
          paymentId: response.paymentId
        }
      };

      // Send WhatsApp notification (non-blocking)
      whatsAppService.sendOrderNotification(notification).catch(err => {
        console.error('Failed to send WhatsApp notification:', err);
      });
    }

    res.json(response);
  } catch (error: any) {
    console.error('Payment order creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment order creation failed'
    });
  }
});

// Verify payment
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { gateway, paymentId, orderId, signature, additionalData } = req.body;

    if (!gateway || !paymentId || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required verification parameters'
      });
    }

    const verificationRequest: PaymentVerificationRequest = {
      paymentId,
      orderId,
      signature,
      additionalData
    };

    const response = await paymentManager.verifyPayment(gateway, verificationRequest);

    if (response.success && response.status === 'success') {
      // Send WhatsApp notification for successful payment
      const notification: OrderNotification = {
        orderId,
        buyerId: additionalData?.buyerId || 'unknown',
        type: 'payment_received',
        status: 'payment_completed',
        message: `Payment of ₹${response.amount} has been successfully received. Your order is now being processed.`,
        additionalData: {
          amount: response.amount,
          gateway,
          paymentId: response.paymentId,
          transactionId: response.gatewayResponse?.id
        }
      };

      // Send WhatsApp notification (non-blocking)
      whatsAppService.sendOrderNotification(notification).catch(err => {
        console.error('Failed to send WhatsApp notification:', err);
      });
    }

    res.json(response);
  } catch (error: any) {
    console.error('Payment verification failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment verification failed'
    });
  }
});

// Payment status check
router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { gateway } = req.query;

    if (!gateway) {
      return res.status(400).json({
        success: false,
        error: 'Gateway parameter is required'
      });
    }

    const response = await paymentManager.getPaymentStatus(gateway as string, orderId);
    res.json(response);
  } catch (error: any) {
    console.error('Payment status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment status check failed'
    });
  }
});

// Webhook handlers for different gateways
router.post('/webhook/:gateway', async (req: Request, res: Response) => {
  try {
    const { gateway } = req.params;
    const payload = req.body;

    console.log(`Received webhook from ${gateway}:`, payload);

    const result = await paymentManager.handleWebhook(gateway, payload);

    if (result.success && result.orderId && result.status) {
      // Send WhatsApp notification based on webhook status
      let notificationType: any = 'order_placed';
      let message = '';

      switch (result.status) {
        case 'success':
          notificationType = 'payment_received';
          message = 'Your payment has been successfully processed. Your order is now being prepared.';
          break;
        case 'failed':
          notificationType = 'order_placed';
          message = 'Your payment could not be processed. Please try again or contact support.';
          break;
        case 'cancelled':
          notificationType = 'order_placed';
          message = 'Your payment was cancelled. You can retry payment anytime.';
          break;
      }

      const notification: OrderNotification = {
        orderId: result.orderId,
        buyerId: 'webhook_user', // You'd typically get this from order details
        type: notificationType,
        status: result.status,
        message,
        additionalData: {
          gateway,
          webhookData: payload
        }
      };

      // Send WhatsApp notification (non-blocking)
      whatsAppService.sendOrderNotification(notification).catch(err => {
        console.error('Failed to send WhatsApp notification:', err);
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error(`Webhook handling failed for ${req.params.gateway}:`, error);
    res.status(500).json({
      success: false,
      error: 'Webhook handling failed'
    });
  }
});

// Gateway statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = paymentManager.getGatewayStats();
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('Failed to get payment gateway stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment gateway stats'
    });
  }
});

// Test payment gateway connection
router.post('/test/:gateway', async (req: Request, res: Response) => {
  try {
    const { gateway } = req.params;
    
    const testRequest: PaymentRequest = {
      orderId: `TEST_${Date.now()}`,
      amount: 1, // ₹1 for testing
      currency: 'INR',
      customerName: 'Test User',
      customerEmail: 'test@vikareta.com',
      customerPhone: '+919999999999',
      description: 'Test payment for gateway verification',
      returnUrl: `${process.env.FRONTEND_URL}/payment/test`,
      notifyUrl: `${process.env.BACKEND_URL}/api/payment/webhook/${gateway}`,
      metadata: {
        isTest: true
      }
    };

    const response = await paymentManager.createPayment(gateway, testRequest);
    
    res.json({
      success: response.success,
      message: response.success ? 'Payment gateway is working correctly' : 'Payment gateway test failed',
      details: response
    });
  } catch (error: any) {
    console.error(`Payment gateway test failed for ${req.params.gateway}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment gateway test failed'
    });
  }
});

export default router;