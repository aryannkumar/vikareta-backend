import { PaymentGateway, PaymentRequest, PaymentResponse, PaymentVerificationRequest } from '../../types/payment';

export abstract class PaymentGatewayBase {
  protected gateway: PaymentGateway;

  constructor(gateway: PaymentGateway) {
    this.gateway = gateway;
  }

  abstract createOrder(request: PaymentRequest): Promise<PaymentResponse>;
  abstract verifyPayment(request: PaymentVerificationRequest): Promise<PaymentResponse>;
  abstract handleWebhook(payload: any): Promise<{ success: boolean; orderId?: string; status?: string }>;
  abstract getPaymentStatus(paymentId: string): Promise<PaymentResponse>;

  protected generateOrderId(): string {
    return `VKR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected validateAmount(amount: number): boolean {
    return amount > 0 && amount <= 100000000; // Max 1 crore
  }

  protected validateCurrency(currency: string): boolean {
    return ['INR', 'USD'].includes(currency);
  }

  protected sanitizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    } else if (cleaned.length === 13 && cleaned.startsWith('+91')) {
      return cleaned;
    }
    
    return phone; // Return original if can't sanitize
  }

  protected createErrorResponse(orderId: string, amount: number, currency: string, error: string): PaymentResponse {
    return {
      success: false,
      orderId,
      amount,
      currency,
      status: 'failed',
      error,
      message: 'Payment processing failed'
    };
  }

  protected createSuccessResponse(
    orderId: string, 
    amount: number, 
    currency: string, 
    paymentId: string, 
    redirectUrl?: string
  ): PaymentResponse {
    return {
      success: true,
      paymentId,
      orderId,
      amount,
      currency,
      status: 'pending',
      redirectUrl,
      message: 'Payment initiated successfully'
    };
  }
}