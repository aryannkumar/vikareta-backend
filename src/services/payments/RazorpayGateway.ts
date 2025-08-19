import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentGatewayBase } from './PaymentGatewayBase';
import { PaymentRequest, PaymentResponse, PaymentVerificationRequest } from '../../types/payment';

export class RazorpayGateway extends PaymentGatewayBase {
  private razorpay: Razorpay;

  constructor(gateway: any) {
    super(gateway);
    
    this.razorpay = new Razorpay({
      key_id: this.gateway.config.keyId,
      key_secret: this.gateway.config.keySecret,
    });
  }

  async createOrder(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!this.validateAmount(request.amount)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid amount');
      }

      if (!this.validateCurrency(request.currency)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid currency');
      }

      const orderOptions = {
        amount: request.amount * 100, // Convert to paise
        currency: request.currency,
        receipt: request.orderId,
        notes: {
          orderId: request.orderId,
          customerName: request.customerName,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone,
          ...request.metadata
        }
      };

      const razorpayOrder = await this.razorpay.orders.create(orderOptions);

      return this.createSuccessResponse(
        request.orderId,
        request.amount,
        request.currency,
        razorpayOrder.id
      );

    } catch (error: any) {
      console.error('Razorpay order creation failed:', error);
      return this.createErrorResponse(
        request.orderId,
        request.amount,
        request.currency,
        error.message || 'Order creation failed'
      );
    }
  }

  async verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResponse> {
    try {
      const { paymentId, orderId, signature } = request;
      
      if (!signature) {
        throw new Error('Payment signature is required');
      }

      // Verify signature
      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', this.gateway.config.keySecret)
        .update(body.toString())
        .digest('hex');

      const isValidSignature = expectedSignature === signature;

      if (!isValidSignature) {
        return {
          success: false,
          orderId,
          amount: 0,
          currency: 'INR',
          status: 'failed',
          error: 'Invalid payment signature'
        };
      }

      // Fetch payment details from Razorpay
      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: Number(payment.amount) / 100, // Convert from paise
        currency: payment.currency,
        status: payment.status === 'captured' ? 'success' : 'pending',
        gatewayResponse: payment,
        message: 'Payment verified successfully'
      };

    } catch (error: any) {
      console.error('Razorpay payment verification failed:', error);
      return {
        success: false,
        orderId: request.orderId,
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: error.message || 'Payment verification failed'
      };
    }
  }

  async handleWebhook(payload: any): Promise<{ success: boolean; orderId?: string; status?: string }> {
    try {
      const event = payload.event;
      const paymentEntity = payload.payload.payment.entity;

      switch (event) {
        case 'payment.captured':
          return {
            success: true,
            orderId: paymentEntity.order_id,
            status: 'success'
          };
        
        case 'payment.failed':
          return {
            success: true,
            orderId: paymentEntity.order_id,
            status: 'failed'
          };
        
        default:
          return { success: false };
      }
    } catch (error) {
      console.error('Razorpay webhook handling failed:', error);
      return { success: false };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: Number(payment.amount) / 100,
        currency: payment.currency,
        status: payment.status === 'captured' ? 'success' : payment.status === 'failed' ? 'failed' : 'pending',
        gatewayResponse: payment
      };
    } catch (error: any) {
      return {
        success: false,
        orderId: '',
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: error.message || 'Failed to fetch payment status'
      };
    }
  }
}