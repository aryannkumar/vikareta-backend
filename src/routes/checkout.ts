import express, { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { checkoutService } from '../services/checkout.service';
import { paymentService } from '../services/payment.service';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

const router = express.Router();

/**
 * @route POST /api/checkout/initiate
 * @desc Initiate checkout process
 * @access Private
 */
router.post('/initiate',
  authenticate,
  [
    body('shippingAddress.street').notEmpty().withMessage('Street address is required'),
    body('shippingAddress.city').notEmpty().withMessage('City is required'),
    body('shippingAddress.state').notEmpty().withMessage('State is required'),
    body('shippingAddress.postalCode').notEmpty().withMessage('Postal code is required'),
    body('shippingAddress.country').notEmpty().withMessage('Country is required'),
    body('paymentMethod').isIn(['cashfree', 'wallet']).withMessage('Invalid payment method'),
    body('couponCode').optional().isString().withMessage('Coupon code must be a string'),
    body('returnUrl').optional().isURL().withMessage('Return URL must be valid'),
    body('customerNotes').optional().isString().withMessage('Customer notes must be a string'),
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

      const userId = req.authUser!.userId;
      const checkoutRequest = {
        userId,
        ...req.body,
      };

      const result = await checkoutService.initiateCheckout(checkoutRequest);

      if (result.success) {
        const response: ApiResponse = {
          success: true,
          message: result.message,
          data: {
            orderId: result.orderId,
            cashfreeOrder: result.cashfreeOrder,
            paymentRequired: result.paymentRequired,
            totalAmount: result.totalAmount,
          },
        };
        return res.status(200).json(response);
      } else {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'CHECKOUT_FAILED',
            message: result.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
          },
        };
        return res.status(400).json(response);
      }
    } catch (error) {
      logger.error('Error in checkout initiate:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to initiate checkout',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route POST /api/checkout/complete
 * @desc Complete checkout after payment verification
 * @access Private
 */
router.post('/complete',
  authenticate,
  [
    body('orderId').isUUID().withMessage('Valid order ID is required'),
    body('paymentVerification').isObject().withMessage('Payment verification data is required'),
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

      const { orderId, paymentVerification } = req.body;

      const result = await checkoutService.completeCheckout(orderId, paymentVerification);

      if (result.success) {
        const response: ApiResponse = {
          success: true,
          message: result.message,
          data: {
            orderId: result.orderId,
            totalAmount: result.totalAmount,
          },
        };
        return res.status(200).json(response);
      } else {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'CHECKOUT_COMPLETION_FAILED',
            message: result.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
          },
        };
        return res.status(400).json(response);
      }
    } catch (error) {
      logger.error('Error in checkout complete:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to complete checkout',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route GET /api/checkout/status/:orderId
 * @desc Get checkout status
 * @access Private
 */
router.get('/status/:orderId',
  authenticate,
  [
    param('orderId').isUUID().withMessage('Valid order ID is required'),
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

      const { orderId } = req.params;

      const status = await checkoutService.getCheckoutStatus(orderId);

      const response: ApiResponse = {
        success: true,
        message: 'Checkout status retrieved successfully',
        data: status,
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('Error getting checkout status:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get checkout status',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route POST /api/checkout/verify-payment
 * @desc Verify payment with Cashfree
 * @access Private
 */
router.post('/verify-payment',
  authenticate,
  [
    body('orderId').notEmpty().withMessage('Order ID is required'),
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

      const verification = await paymentService.verifyPayment(orderId);

      const response: ApiResponse = {
        success: true,
        message: 'Payment verification completed',
        data: verification,
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
 * @route POST /api/checkout/retry-payment
 * @desc Retry failed payment
 * @access Private
 */
router.post('/retry-payment',
  authenticate,
  [
    body('orderId').notEmpty().withMessage('Order ID is required'),
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

      const retryOrder = await paymentService.retryPayment(orderId);

      const response: ApiResponse = {
        success: true,
        message: 'Payment retry initiated successfully',
        data: retryOrder,
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('Error retrying payment:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PAYMENT_RETRY_FAILED',
          message: 'Failed to retry payment',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * @route GET /api/checkout/payment-methods
 * @desc Get available payment methods
 * @access Private
 */
router.get('/payment-methods',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const paymentMethods = await paymentService.getPaymentMethods();

      const response: ApiResponse = {
        success: true,
        message: 'Payment methods retrieved successfully',
        data: paymentMethods,
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get payment methods',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      return res.status(500).json(response);
    }
  }
);

export default router;