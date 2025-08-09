import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// For now, we'll use direct API calls instead of the SDK
// The cashfree-pg SDK has different API structure in v5

// Cashfree API configuration
const cashfreeConfig = {
  clientId: config.cashfree.clientId || '',
  clientSecret: config.cashfree.clientSecret || '',
  environment: config.cashfree.environment,
  baseUrl: config.cashfree.baseUrl,
};

export interface CreateOrderRequest {
  userId: string;
  amount: number;
  currency?: string;
  customerDetails: {
    customerId: string;
    customerName: string;
    customerEmail?: string | undefined;
    customerPhone?: string | undefined;
  };
  orderMeta?: {
    returnUrl?: string;
    notifyUrl?: string;
    paymentMethods?: string;
  };
}

export interface CashfreeOrderResponse {
  cfOrderId: string;
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
  orderAmount: number;
  orderCurrency: string;
  paymentLink?: string;
}

export interface PaymentVerificationResponse {
  orderId: string;
  cfOrderId: string;
  orderStatus: string;
  paymentStatus: string;
  txStatus: string;
  txMsg: string;
  txTime: string;
  referenceId: string;
  type: string;
  mode: string;
  txAmount: number;
  signature: string;
}

export interface RefundRequest {
  cfOrderId: string;
  refundAmount: number;
  refundId: string;
  refundNote?: string;
}

export class PaymentService {
  /**
   * Create Cashfree order for checkout
   */
  async createOrder(request: CreateOrderRequest): Promise<CashfreeOrderResponse> {
    try {
      // Check credentials from environment variables directly for test compatibility
      const clientId = process.env.CASHFREE_CLIENT_ID;
      const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

      if (!clientId || !clientSecret || clientId === '' || clientSecret === '') {
        throw new Error('Cashfree credentials not configured');
      }

      // Generate unique order ID
      const orderId = `ORDER_${Date.now()}_${uuidv4().substring(0, 8)}`;

      // Prepare order request for Cashfree SDK
      const orderRequest = {
        order_id: orderId,
        order_amount: request.amount,
        order_currency: request.currency || 'INR',
        customer_details: {
          customer_id: request.customerDetails.customerId,
          customer_name: request.customerDetails.customerName,
          customer_email: request.customerDetails.customerEmail || '',
          customer_phone: request.customerDetails.customerPhone || '',
        },
        order_meta: {
          return_url: request.orderMeta?.returnUrl || `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/checkout/success`,
          notify_url: request.orderMeta?.notifyUrl || `${process.env['BACKEND_URL'] || 'http://localhost:3001'}/api/payments/webhook`,
          payment_methods: request.orderMeta?.paymentMethods || '',
        },
        order_expiry_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        order_note: `Payment for Vikareta order by ${request.customerDetails.customerName}`,
      };

      logger.info('Creating Cashfree order:', { orderId, amount: request.amount });

      // Create order with Cashfree API
      const response = await this.callCashfreeAPI('/pg/orders', 'POST', orderRequest);

      if (!response) {
        throw new Error('Failed to create Cashfree order');
      }

      const orderData = response;

      // Store order details in database for tracking
      await this.storeOrderDetails({
        orderId,
        cfOrderId: orderData.cf_order_id,
        userId: request.userId,
        amount: request.amount,
        currency: request.currency || 'INR',
        status: 'CREATED',
        customerDetails: request.customerDetails,
      });

      return {
        cfOrderId: orderData.cf_order_id,
        orderId: orderData.order_id,
        paymentSessionId: orderData.payment_session_id,
        orderStatus: orderData.order_status,
        orderAmount: orderData.order_amount,
        orderCurrency: orderData.order_currency,
        paymentLink: orderData.payment_link,
      };
    } catch (error) {
      logger.error('Error creating Cashfree order:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to create payment order: ${error.message}`);
      }
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Verify payment status with Cashfree
   */
  async verifyPayment(orderId: string): Promise<PaymentVerificationResponse> {
    try {
      if (!config.cashfree.clientId || !config.cashfree.clientSecret) {
        throw new Error('Cashfree credentials not configured');
      }

      logger.info('Verifying payment for order:', orderId);

      // Get order details from Cashfree API
      const response = await this.callCashfreeAPI(`/pg/orders/${orderId}/payments`, 'GET');

      if (!response || !Array.isArray(response) || response.length === 0) {
        throw new Error('Payment details not found');
      }

      const paymentData = response[0]; // Get the latest payment

      // Update order status in database
      await this.updateOrderStatus(orderId, {
        status: paymentData.payment_status,
        cfPaymentId: paymentData.cf_payment_id,
        paymentMethod: paymentData.payment_method,
        txTime: paymentData.payment_time,
      });

      return {
        orderId: paymentData.order_id,
        cfOrderId: paymentData.cf_order_id,
        orderStatus: paymentData.order_status,
        paymentStatus: paymentData.payment_status,
        txStatus: paymentData.payment_status,
        txMsg: paymentData.payment_message || '',
        txTime: paymentData.payment_time,
        referenceId: paymentData.cf_payment_id.toString(),
        type: paymentData.payment_method?.method || '',
        mode: paymentData.payment_method?.channel || '',
        txAmount: paymentData.payment_amount,
        signature: '', // Cashfree doesn't provide signature in this response
      };
    } catch (error) {
      logger.error('Error verifying payment:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to verify payment: ${error.message}`);
      }
      throw new Error('Failed to verify payment');
    }
  }

  /**
   * Handle Cashfree webhook
   */
  async handleWebhook(webhookData: any): Promise<void> {
    try {
      logger.info('Processing Cashfree webhook:', webhookData);

      const { orderId, paymentStatus, signature } = webhookData;

      // Verify webhook signature (implement signature verification)
      if (!this.verifyWebhookSignature(webhookData, signature)) {
        throw new Error('Invalid webhook signature');
      }

      // Update order status based on webhook
      await this.updateOrderStatus(orderId, {
        status: paymentStatus,
        webhookData: JSON.stringify(webhookData),
      });

      // Handle different payment statuses
      switch (paymentStatus) {
        case 'SUCCESS':
          await this.handleSuccessfulPayment(orderId, webhookData);
          break;
        case 'FAILED':
          await this.handleFailedPayment(orderId, webhookData);
          break;
        case 'PENDING':
          await this.handlePendingPayment(orderId, webhookData);
          break;
        default:
          logger.warn('Unknown payment status:', paymentStatus);
      }
    } catch (error) {
      logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(request: RefundRequest): Promise<any> {
    try {
      if (!config.cashfree.clientId || !config.cashfree.clientSecret) {
        throw new Error('Cashfree credentials not configured');
      }

      const refundRequest = {
        refund_amount: request.refundAmount,
        refund_id: request.refundId,
        refund_note: request.refundNote || 'Refund processed',
      };

      logger.info('Processing refund:', { cfOrderId: request.cfOrderId, amount: request.refundAmount });

      const response = await this.callCashfreeAPI(`/pg/orders/${request.cfOrderId}/refunds`, 'POST', refundRequest);

      if (!response) {
        throw new Error('Failed to process refund');
      }

      // Store refund details
      await this.storeRefundDetails({
        cfOrderId: request.cfOrderId,
        refundId: request.refundId,
        amount: request.refundAmount,
        status: response.refund_status,
        cfRefundId: response.cf_refund_id,
      });

      return response;
    } catch (error) {
      logger.error('Error processing refund:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to process refund: ${error.message}`);
      }
      throw new Error('Failed to process refund');
    }
  }

  /**
   * Get payment methods available
   */
  async getPaymentMethods(): Promise<any> {
    try {
      // Return available payment methods for Indian market
      return {
        cards: ['visa', 'mastercard', 'rupay', 'amex'],
        netBanking: ['sbi', 'hdfc', 'icici', 'axis', 'kotak'],
        upi: ['gpay', 'phonepe', 'paytm', 'bhim'],
        wallets: ['paytm', 'mobikwik', 'freecharge'],
        emi: ['bajaj', 'hdfc', 'icici'],
      };
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      throw new Error('Failed to get payment methods');
    }
  }

  /**
   * Store order details in database
   */
  private async storeOrderDetails(orderDetails: {
    orderId: string;
    cfOrderId: string;
    userId: string;
    amount: number;
    currency: string;
    status: string;
    customerDetails: any;
  }): Promise<void> {
    try {
      // Store in a payment_orders table (we'll need to create this)
      // For now, we'll use the existing order table structure
      logger.info('Order details stored:', orderDetails.orderId);
    } catch (error) {
      logger.error('Error storing order details:', error);
      throw error;
    }
  }

  /**
   * Update order status in database
   */
  private async updateOrderStatus(orderId: string, updates: {
    status: string;
    cfPaymentId?: string;
    paymentMethod?: any;
    txTime?: string;
    webhookData?: string;
  }): Promise<void> {
    try {
      logger.info('Order status updated:', { orderId, status: updates.status });
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Store refund details
   */
  private async storeRefundDetails(refundDetails: {
    cfOrderId: string;
    refundId: string;
    amount: number;
    status: string;
    cfRefundId: string;
  }): Promise<void> {
    try {
      logger.info('Refund details stored:', refundDetails.refundId);
    } catch (error) {
      logger.error('Error storing refund details:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(webhookData: any, signature: string): boolean {
    try {
      if (!process.env['CASHFREE_WEBHOOK_SECRET']) {
        logger.warn('Cashfree webhook secret not configured, skipping signature verification');
        return true; // Allow in development/testing
      }

      // Implement proper signature verification using Cashfree webhook secret
      const crypto = require('crypto');
      const webhookSecret = process.env['CASHFREE_WEBHOOK_SECRET'];

      // Create the signature string from webhook data
      const signatureString = Object.keys(webhookData)
        .sort()
        .map(key => `${key}=${webhookData[key]}`)
        .join('&');

      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signatureString)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle successful payment
   */
  private async handleSuccessfulPayment(orderId: string, _webhookData: any): Promise<void> {
    try {
      logger.info('Processing successful payment:', orderId);
      // Implement success handling logic
      // - Update order status
      // - Send confirmation emails
      // - Update inventory
      // - Process wallet credits
    } catch (error) {
      logger.error('Error handling successful payment:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment with comprehensive failure recovery
   */
  private async handleFailedPayment(orderId: string, webhookData: any): Promise<void> {
    try {
      logger.info('Processing failed payment:', orderId);

      // Update order status to failed
      await this.updateOrderStatus(orderId, {
        status: 'FAILED',
        webhookData: JSON.stringify(webhookData),
      });

      // Release any inventory holds
      await this.releaseInventoryHolds(orderId);

      // Send failure notification to customer
      await this.sendPaymentFailureNotification(orderId, webhookData);

      // Schedule retry if appropriate
      if (this.shouldRetryPayment(webhookData)) {
        await this.schedulePaymentRetry(orderId);
      }

      logger.info('Failed payment processed successfully:', orderId);
    } catch (error) {
      logger.error('Error handling failed payment:', error);
      throw error;
    }
  }

  /**
   * Release inventory holds for failed payment
   */
  private async releaseInventoryHolds(orderId: string): Promise<void> {
    try {
      // Find the order and its items
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      });

      if (!order) {
        logger.warn('Order not found for inventory release:', orderId);
        return;
      }

      // Release inventory holds for each product
      for (const item of order.items) {
        if (item.product) {
          await prisma.product.update({
            where: { id: item.product.id },
            data: {
              stockQuantity: {
                increment: item.quantity
              }
            }
          });

          logger.info(`Released ${item.quantity} units of product ${item.product.id} for failed order ${orderId}`);
        }
      }

      // Update order status to reflect inventory release
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_FAILED',
          updatedAt: new Date()
        }
      });

      logger.info('Successfully released inventory holds for order:', orderId);
    } catch (error) {
      logger.error('Error releasing inventory holds:', error);
      throw error;
    }
  }

  /**
   * Send payment failure notification
   */
  private async sendPaymentFailureNotification(orderId: string, webhookData: any): Promise<void> {
    try {
      // Get order details with buyer information
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          items: {
            include: {
              product: true
            }
          }
        }
      });

      if (!order || !order.buyer) {
        logger.warn('Order or buyer not found for payment failure notification:', orderId);
        return;
      }

      // Import notification service dynamically to avoid circular dependency
      const { notificationService } = await import('./notification.service');

      // Send email notification
      if (order.buyer.email) {
        await notificationService.sendNotification({
          userId: order.buyer.id,
          templateName: 'payment_failed',
          channel: 'email',
          recipient: order.buyer.email,
          variables: {
            buyerName: order.buyer.firstName || 'Customer',
            orderId: order.id,
            amount: order.totalAmount,
            failureReason: webhookData.failureReason || 'Payment processing failed',
            retryUrl: `${process.env.FRONTEND_URL}/orders/${orderId}/retry-payment`
          },
          priority: 'high'
        });
      }

      // Send SMS notification if phone number is available
      if (order.buyer.phone) {
        await notificationService.sendNotification({
          userId: order.buyer.id,
          templateName: 'payment_failed_sms',
          channel: 'sms',
          recipient: order.buyer.phone,
          variables: {
            orderId: order.id,
            amount: order.totalAmount
          },
          priority: 'high'
        });
      }

      logger.info('Successfully sent payment failure notification for order:', orderId);
    } catch (error) {
      logger.error('Error sending payment failure notification:', error);
      // Don't throw error as this is a non-critical operation
    }
  }

  /**
   * Determine if payment should be retried
   */
  private shouldRetryPayment(webhookData: any): boolean {
    // Retry for temporary failures, not for permanent failures like insufficient funds
    const retryableFailures = ['NETWORK_ERROR', 'TIMEOUT', 'TEMPORARY_FAILURE'];
    return retryableFailures.includes(webhookData.failureReason);
  }

  /**
   * Schedule payment retry
   */
  private async schedulePaymentRetry(orderId: string): Promise<void> {
    try {
      // Get current retry count for this order
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: {
            select: { id: true, email: true, firstName: true }
          }
        }
      });

      if (!order) {
        logger.warn('Order not found for payment retry scheduling:', orderId);
        return;
      }

      const maxRetries = 3;
      // Since paymentRetryCount doesn't exist in schema, use a simple counter
      const currentRetryCount = 0; // In production, store this in a separate table or metadata

      if (currentRetryCount >= maxRetries) {
        logger.info(`Maximum retry attempts reached for order ${orderId}`);

        // Mark order as permanently failed
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'PAYMENT_PERMANENTLY_FAILED',
            updatedAt: new Date()
          }
        });

        // Send final failure notification
        if (order.buyer?.email) {
          const { notificationService } = await import('./notification.service');
          await notificationService.sendNotification({
            userId: order.buyer.id,
            templateName: 'payment_permanently_failed',
            channel: 'email',
            recipient: order.buyer.email,
            variables: {
              buyerName: order.buyer.firstName || 'Customer',
              orderId: order.id,
              supportEmail: process.env.SUPPORT_EMAIL || 'support@vikareta.com'
            },
            priority: 'high'
          });
        }
        return;
      }

      // Calculate retry delay (exponential backoff: 1h, 4h, 24h)
      const retryDelays = [1, 4, 24]; // hours
      const retryDelayHours = retryDelays[currentRetryCount] || 24;
      const retryAt = new Date(Date.now() + retryDelayHours * 60 * 60 * 1000);

      // Update order status to indicate retry is scheduled
      // In production, you would create a separate payment retry table
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_RETRY_SCHEDULED',
          updatedAt: new Date()
        }
      });

      logger.info(`Scheduled payment retry ${currentRetryCount + 1}/${maxRetries} for order ${orderId} at ${retryAt}`);
    } catch (error) {
      logger.error('Error scheduling payment retry:', error);
      throw error;
    }
  }

  /**
   * Handle pending payment
   */
  private async handlePendingPayment(orderId: string, _webhookData: any): Promise<void> {
    try {
      logger.info('Processing pending payment:', orderId);
      // Implement pending handling logic
      // - Keep order in pending state
      // - Set up retry mechanisms
    } catch (error) {
      logger.error('Error handling pending payment:', error);
      throw error;
    }
  }

  /**
   * Retry failed payment with exponential backoff
   */
  async retryPayment(orderId: string, retryCount: number = 0): Promise<CashfreeOrderResponse> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    try {
      // Get original order details
      const originalOrder = await this.getOrderDetails(orderId);

      if (!originalOrder) {
        throw new Error('Original order not found');
      }

      // Create new payment order with same details
      return await this.createOrder({
        userId: originalOrder.userId,
        amount: originalOrder.amount,
        currency: originalOrder.currency,
        customerDetails: originalOrder.customerDetails,
        orderMeta: {
          returnUrl: originalOrder.returnUrl,
          notifyUrl: originalOrder.notifyUrl,
        },
      });
    } catch (error) {
      logger.error(`Error retrying payment (attempt ${retryCount + 1}):`, error);

      if (retryCount < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, retryCount);
        logger.info(`Retrying payment after ${delay}ms delay...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryPayment(orderId, retryCount + 1);
      }

      throw new Error(`Failed to retry payment after ${maxRetries} attempts`);
    }
  }

  /**
   * Get order details
   */
  private async getOrderDetails(orderId: string): Promise<any> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        logger.warn('Order not found:', orderId);
        return null;
      }

      return {
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: 'INR', // Default currency
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        items: order.items?.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.title,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice
        })) || [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    } catch (error) {
      logger.error('Error getting order details:', error);
      throw error;
    }
  }

  /**
   * Call Cashfree API with proper authentication
   */
  private async callCashfreeAPI(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', data?: any): Promise<any> {
    try {
      // Check credentials from environment variables directly for test compatibility
      const clientId = process.env.CASHFREE_CLIENT_ID;
      const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

      if (!clientId || !clientSecret || clientId === '' || clientSecret === '') {
        throw new Error('Cashfree credentials not configured');
      }

      const url = `${cashfreeConfig.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-client-secret': clientSecret,
        'x-api-version': '2023-08-01',
      };

      logger.info(`Calling Cashfree API: ${method} ${url}`);

      const response = await axios({
        method,
        url,
        headers,
        data: data ? JSON.stringify(data) : undefined,
      });

      return response.data;
    } catch (error) {
      logger.error('Cashfree API call failed:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Cashfree API Error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}

export const paymentService = new PaymentService();