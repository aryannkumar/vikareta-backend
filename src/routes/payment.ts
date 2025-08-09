import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { paymentService } from '../services/payment.service';
import { checkoutService } from '../services/checkout.service';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

const router = express.Router();

/**
 * @route POST /api/payments/webhook
 * @desc Handle Cashfree webhook notifications
 * @access Public (but secured with signature verification)
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    logger.info('Received Cashfree webhook:', req.body);

    // Verify webhook signature and process
    await paymentService.handleWebhook(req.body);

    // Respond to Cashfree that webhook was processed successfully
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    logger.error('Error processing Cashfree webhook:', error);
    
    // Still respond with 200 to prevent Cashfree from retrying
    // Log the error for manual investigation
    return res.status(200).json({ 
      status: 'ERROR',
      message: 'Webhook processing failed but acknowledged'
    });
  }
});

/**
 * @route POST /api/payments/verify
 * @desc Verify payment status manually
 * @access Public (for return URL handling)
 */
router.post('/verify',
  [
    body('orderId').notEmpty().withMessage('Order ID is required'),
    body('orderToken').optional().isString().withMessage('Order token must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.array(),
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
          },
        };
        return res.status(400).json(response);
      }

      const { orderId } = req.body;

      // Verify payment with Cashfree
      const verification = await paymentService.verifyPayment(orderId);

      // Complete checkout if payment is successful
      if (verification.paymentStatus === 'SUCCESS') {
        await checkoutService.completeCheckout(orderId, verification);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Payment verification completed',
        data: {
          orderId: verification.orderId,
          paymentStatus: verification.paymentStatus,
          txStatus: verification.txStatus,
          txMsg: verification.txMsg,
          txAmount: verification.txAmount,
        },
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('Error verifying payment:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Failed to verify payment',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route GET /api/payments/return
 * @desc Handle payment return URL from Cashfree
 * @access Public
 */
router.get('/return', async (req: Request, res: Response) => {
  try {
    const { order_id, order_token, cf_order_id } = req.query;

    if (!order_id) {
      return res.status(400).send('Missing order ID');
    }

    logger.info('Payment return URL accessed:', { order_id, cf_order_id });

    // Verify payment status
    const verification = await paymentService.verifyPayment(order_id as string);

    // Redirect to frontend with payment status
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/checkout/result?orderId=${order_id}&status=${verification.paymentStatus}&cfOrderId=${cf_order_id}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Error handling payment return:', error);
    
    // Redirect to error page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorUrl = `${frontendUrl}/checkout/error?message=Payment verification failed`;
    return res.redirect(errorUrl);
  }
});

/**
 * @route POST /api/payments/refund
 * @desc Process refund for an order
 * @access Private (Admin only - would need admin middleware)
 */
router.post('/refund',
  [
    body('cfOrderId').notEmpty().withMessage('Cashfree Order ID is required'),
    body('refundAmount').isFloat({ min: 0.01 }).withMessage('Valid refund amount is required'),
    body('refundReason').optional().isString().withMessage('Refund reason must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.array(),
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
          },
        };
        return res.status(400).json(response);
      }

      const { cfOrderId, refundAmount, refundReason } = req.body;

      // Generate unique refund ID
      const refundId = `REFUND_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const refund = await paymentService.processRefund({
        cfOrderId,
        refundAmount,
        refundId,
        refundNote: refundReason || 'Refund processed',
      });

      const response: ApiResponse = {
        success: true,
        message: 'Refund processed successfully',
        data: {
          refundId,
          cfRefundId: refund.cf_refund_id,
          refundStatus: refund.refund_status,
          refundAmount: refund.refund_amount,
        },
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('Error processing refund:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'REFUND_FAILED',
          message: 'Failed to process refund',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route GET /api/payments/status/:orderId
 * @desc Get payment status for an order
 * @access Public (for status checking)
 */
router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Order ID is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(400).json(response);
    }

    const verification = await paymentService.verifyPayment(orderId);

    const response: ApiResponse = {
      success: true,
      message: 'Payment status retrieved successfully',
      data: {
        orderId: verification.orderId,
        paymentStatus: verification.paymentStatus,
        txStatus: verification.txStatus,
        txAmount: verification.txAmount,
        txTime: verification.txTime,
      },
    };
    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error getting payment status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PAYMENT_STATUS_FAILED',
        message: 'Failed to get payment status',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
      },
    };
    return res.status(500).json(response);
  }
});

export default router;