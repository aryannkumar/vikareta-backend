import axios from 'axios';
import crypto from 'crypto';
import { PaymentGatewayBase } from './PaymentGatewayBase';
import { PaymentRequest, PaymentResponse, PaymentVerificationRequest } from '../../types/payment';

export class PhonePeGateway extends PaymentGatewayBase {
  private merchantId: string;
  private saltKey: string;
  private saltIndex: string;
  private environment: string;
  private baseUrl: string;

  constructor(gateway: any) {
    super(gateway);
    
    this.merchantId = this.gateway.config.merchantId;
    this.saltKey = this.gateway.config.saltKey;
    this.saltIndex = this.gateway.config.saltIndex || '1';
    this.environment = this.gateway.config.environment || 'sandbox';
    this.baseUrl = this.environment === 'production' 
      ? 'https://api.phonepe.com/apis/hermes' 
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  private generateChecksum(payload: string): string {
    const string = payload + '/pg/v1/pay' + this.saltKey;
    return crypto.createHash('sha256').update(string).digest('hex') + '###' + this.saltIndex;
  }

  private generateStatusChecksum(merchantTransactionId: string): string {
    const string = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}` + this.saltKey;
    return crypto.createHash('sha256').update(string).digest('hex') + '###' + this.saltIndex;
  }

  async createOrder(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!this.validateAmount(request.amount)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid amount');
      }

      if (!this.validateCurrency(request.currency)) {
        return this.createErrorResponse(request.orderId, request.amount, request.currency, 'Invalid currency');
      }

      const merchantTransactionId = `TXN_${request.orderId}_${Date.now()}`;
      
      const paymentPayload = {
        merchantId: this.merchantId,
        merchantTransactionId,
        merchantUserId: `USER_${Date.now()}`,
        amount: request.amount * 100, // Convert to paise
        redirectUrl: request.returnUrl,
        redirectMode: 'POST',
        callbackUrl: request.notifyUrl,
        mobileNumber: this.sanitizePhoneNumber(request.customerPhone).replace('+91', ''),
        paymentInstrument: {
          type: 'PAY_PAGE'
        }
      };

      const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      const checksum = this.generateChecksum(base64Payload);

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      };

      const requestBody = {
        request: base64Payload
      };

      const response = await axios.post(
        `${this.baseUrl}/pg/v1/pay`,
        requestBody,
        { headers }
      );

      if (response.data.success && response.data.data.instrumentResponse.redirectInfo) {
        return this.createSuccessResponse(
          request.orderId,
          request.amount,
          request.currency,
          merchantTransactionId,
          response.data.data.instrumentResponse.redirectInfo.url
        );
      } else {
        throw new Error(response.data.message || 'Payment initiation failed');
      }

    } catch (error: any) {
      console.error('PhonePe order creation failed:', error);
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
      const { paymentId } = request; // This is merchantTransactionId for PhonePe
      
      const checksum = this.generateStatusChecksum(paymentId);

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
        'accept': 'application/json'
      };

      const response = await axios.get(
        `${this.baseUrl}/pg/v1/status/${this.merchantId}/${paymentId}`,
        { headers }
      );

      if (response.data.success && response.data.data) {
        const payment = response.data.data;
        const status = payment.state === 'COMPLETED' ? 'success' : 
                      payment.state === 'FAILED' ? 'failed' : 'pending';

        return {
          success: true,
          paymentId: payment.transactionId,
          orderId: payment.merchantTransactionId,
          amount: Number(payment.amount) / 100, // Convert from paise
          currency: 'INR',
          status,
          gatewayResponse: payment,
          message: 'Payment verification completed'
        };
      } else {
        throw new Error(response.data.message || 'Payment verification failed');
      }

    } catch (error: any) {
      console.error('PhonePe payment verification failed:', error);
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
      // PhonePe webhook payload is base64 encoded
      const base64Response = payload.response;
      const decodedResponse = JSON.parse(Buffer.from(base64Response, 'base64').toString());

      // Verify checksum
      const receivedChecksum = payload['X-VERIFY'];
      const expectedChecksum = this.generateStatusChecksum(decodedResponse.data.merchantTransactionId);
      
      if (receivedChecksum !== expectedChecksum) {
        console.error('PhonePe webhook checksum verification failed');
        return { success: false };
      }

      const status = decodedResponse.data.state === 'COMPLETED' ? 'success' : 
                    decodedResponse.data.state === 'FAILED' ? 'failed' : 'pending';

      return {
        success: true,
        orderId: decodedResponse.data.merchantTransactionId,
        status
      };

    } catch (error) {
      console.error('PhonePe webhook handling failed:', error);
      return { success: false };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    try {
      const checksum = this.generateStatusChecksum(paymentId);

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
        'accept': 'application/json'
      };

      const response = await axios.get(
        `${this.baseUrl}/pg/v1/status/${this.merchantId}/${paymentId}`,
        { headers }
      );

      if (response.data.success && response.data.data) {
        const payment = response.data.data;
        const status = payment.state === 'COMPLETED' ? 'success' : 
                      payment.state === 'FAILED' ? 'failed' : 'pending';

        return {
          success: true,
          paymentId: payment.transactionId,
          orderId: payment.merchantTransactionId,
          amount: Number(payment.amount) / 100,
          currency: 'INR',
          status,
          gatewayResponse: payment
        };
      } else {
        throw new Error(response.data.message || 'Payment not found');
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

  // PhonePe specific method for UPI intent
  async createUPIIntent(request: PaymentRequest): Promise<{ success: boolean; upiIntent?: string; error?: string }> {
    try {
      const merchantTransactionId = `UPI_${request.orderId}_${Date.now()}`;
      
      const paymentPayload = {
        merchantId: this.merchantId,
        merchantTransactionId,
        merchantUserId: `USER_${Date.now()}`,
        amount: request.amount * 100,
        mobileNumber: this.sanitizePhoneNumber(request.customerPhone).replace('+91', ''),
        paymentInstrument: {
          type: 'UPI_INTENT',
          targetApp: 'com.phonepe.app'
        }
      };

      const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      const checksum = this.generateChecksum(base64Payload);

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      };

      const requestBody = {
        request: base64Payload
      };

      const response = await axios.post(
        `${this.baseUrl}/pg/v1/pay`,
        requestBody,
        { headers }
      );

      if (response.data.success && response.data.data.instrumentResponse.intentUrl) {
        return {
          success: true,
          upiIntent: response.data.data.instrumentResponse.intentUrl
        };
      } else {
        throw new Error(response.data.message || 'UPI intent creation failed');
      }

    } catch (error: any) {
      console.error('PhonePe UPI intent creation failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'UPI intent creation failed'
      };
    }
  }
}