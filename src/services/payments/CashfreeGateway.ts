import axios from 'axios';
import { PaymentGatewayBase } from './PaymentGatewayBase';
import { PaymentRequest, PaymentResponse, PaymentVerificationRequest } from '../../types/payment';

export class CashfreeGateway extends PaymentGatewayBase {
  private clientId: string;
  private clientSecret: string;
  private environment: string;
  private baseUrl: string;

  constructor(gateway?: any) {
    super(gateway);
    
    // Use environment variables directly for production readiness
    this.clientId = process.env.CASHFREE_CLIENT_ID || '';
    this.clientSecret = process.env.CASHFREE_CLIENT_SECRET || '';
    this.environment = process.env.CASHFREE_ENVIRONMENT || 'sandbox';
    this.baseUrl = this.environment === 'production' 
      ? 'https://api.cashfree.com' 
      : 'https://sandbox.cashfree.com';
  }

  private async getAuthHeaders() {
    return {
      'X-Client-Id': this.clientId,
      'X-Client-Secret': this.clientSecret,
      'X-API-Version': '2023-08-01',
      'Content-Type': 'application/json'
    };
  }

  async createOrder(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!this.validateAmount(request.amount)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid amount');
      }

      if (!this.validateCurrency(request.currency)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid currency');
      }

      const createOrderRequest = {
        order_id: request.orderId,
        order_amount: request.amount,
        order_currency: request.currency,
        customer_details: {
          customer_id: `customer_${Date.now()}`,
          customer_name: request.customerName,
          customer_email: request.customerEmail,
          customer_phone: this.sanitizePhoneNumber(request.customerPhone)
        },
        order_meta: {
          return_url: request.returnUrl,
          notify_url: request.notifyUrl,
          payment_methods: 'cc,dc,nb,upi,paylater,wallet'
        },
        order_note: request.description || `Payment for order ${request.orderId}`,
        order_tags: request.metadata
      };

      const headers = await this.getAuthHeaders();
      const response = await axios.post(
        `${this.baseUrl}/pg/orders`,
        createOrderRequest,
        { headers }
      );

      if (response.data && response.data.payment_session_id) {
        return this.createSuccessResponse(
          request.orderId,
          request.amount,
          request.currency,
          response.data.payment_session_id,
          response.data.payment_link
        );
      } else {
        throw new Error('Order creation failed');
      }

    } catch (error: any) {
      console.error('Cashfree order creation failed:', error);
      return this.createErrorResponse(
        request.orderId,
        request.amount,
        request.currency,
        error.response?.data?.message || error.message || 'Order creation failed'
      );
    }
  }

  async verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResponse> {
    try {
      const { orderId } = request;

      // Get order status from Cashfree
      const headers = await this.getAuthHeaders();
      const response = await axios.get(
        `${this.baseUrl}/pg/orders/${orderId}/payments`,
        { headers }
      );

      if (response.data && response.data.length > 0) {
        const payment = response.data[0]; // Get the latest payment

        const status = payment.payment_status === 'SUCCESS' ? 'success' : 
                      payment.payment_status === 'FAILED' ? 'failed' : 'pending';

        return {
          success: true,
          paymentId: payment.cf_payment_id,
          orderId: payment.order_id,
          amount: Number(payment.payment_amount),
          currency: payment.payment_currency,
          status,
          gatewayResponse: payment,
          message: 'Payment verification completed'
        };
      } else {
        throw new Error('Payment not found or verification failed');
      }

    } catch (error: any) {
      console.error('Cashfree payment verification failed:', error);
      return {
        success: false,
        orderId: request.orderId,
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: error.response?.data?.message || error.message || 'Payment verification failed'
      };
    }
  }

  async handleWebhook(payload: any): Promise<{ success: boolean; orderId?: string; status?: string }> {
    try {
      const { type, data } = payload;

      switch (type) {
        case 'PAYMENT_SUCCESS_WEBHOOK':
          return {
            success: true,
            orderId: data.order.order_id,
            status: 'success'
          };
        
        case 'PAYMENT_FAILED_WEBHOOK':
          return {
            success: true,
            orderId: data.order.order_id,
            status: 'failed'
          };
        
        case 'PAYMENT_USER_DROPPED_WEBHOOK':
          return {
            success: true,
            orderId: data.order.order_id,
            status: 'cancelled'
          };
        
        default:
          return { success: false };
      }
    } catch (error) {
      console.error('Cashfree webhook handling failed:', error);
      return { success: false };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(
        `${this.baseUrl}/pg/payments/${paymentId}`,
        { headers }
      );

      if (response.data) {
        const payment = response.data;
        const status = payment.payment_status === 'SUCCESS' ? 'success' : 
                      payment.payment_status === 'FAILED' ? 'failed' : 'pending';

        return {
          success: true,
          paymentId: payment.cf_payment_id,
          orderId: payment.order_id,
          amount: Number(payment.payment_amount),
          currency: payment.payment_currency,
          status,
          gatewayResponse: payment
        };
      } else {
        throw new Error('Payment not found');
      }
    } catch (error: any) {
      return {
        success: false,
        orderId: '',
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: error.response?.data?.message || error.message || 'Failed to fetch payment status'
      };
    }
  }

  // Cashfree specific method for creating payment link
  async createPaymentLink(request: PaymentRequest, linkExpiry?: Date): Promise<{ success: boolean; paymentLink?: string; error?: string }> {
    try {
      const linkRequest = {
        link_id: `link_${request.orderId}`,
        link_amount: request.amount,
        link_currency: request.currency,
        link_purpose: request.description || `Payment for order ${request.orderId}`,
        customer_details: {
          customer_name: request.customerName,
          customer_email: request.customerEmail,
          customer_phone: this.sanitizePhoneNumber(request.customerPhone)
        },
        link_partial_payments: false,
        link_minimum_partial_amount: request.amount,
        link_expiry_time: linkExpiry ? linkExpiry.toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours default
        link_notify: {
          send_sms: true,
          send_email: true
        },
        link_auto_reminders: true,
        link_meta: {
          return_url: request.returnUrl,
          notify_url: request.notifyUrl
        }
      };

      const headers = await this.getAuthHeaders();
      const response = await axios.post(
        `${this.baseUrl}/pg/links`,
        linkRequest,
        { headers }
      );

      if (response.data && response.data.link_url) {
        return {
          success: true,
          paymentLink: response.data.link_url
        };
      } else {
        throw new Error('Payment link creation failed');
      }

    } catch (error: any) {
      console.error('Cashfree payment link creation failed:', error);
      return {
        success: false,
        error: error.message || 'Payment link creation failed'
      };
    }
  }
}