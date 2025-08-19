import { PaymentGatewayBase } from './PaymentGatewayBase';
import { RazorpayGateway } from './RazorpayGateway';
import { CashfreeGateway } from './CashfreeGateway';
import { PhonePeGateway } from './PhonePeGateway';
import { PaymentGateway, PaymentRequest, PaymentResponse, PaymentVerificationRequest } from '../../types/payment';

export class PaymentManager {
  private static instance: PaymentManager;
  private gateways: Map<string, PaymentGatewayBase> = new Map();

  private constructor() {
    this.initializeGateways();
  }

  public static getInstance(): PaymentManager {
    if (!PaymentManager.instance) {
      PaymentManager.instance = new PaymentManager();
    }
    return PaymentManager.instance;
  }

  private initializeGateways(): void {
    // Initialize payment gateways based on environment configuration
    const gatewayConfigs = this.getGatewayConfigurations();

    gatewayConfigs.forEach(config => {
      if (config.status === 'active') {
        let gateway: PaymentGatewayBase;

        switch (config.slug) {
          case 'razorpay':
            gateway = new RazorpayGateway(config);
            break;
          case 'cashfree':
            gateway = new CashfreeGateway(config);
            break;
          case 'phonepe':
            gateway = new PhonePeGateway(config);
            break;
          default:
            console.warn(`Unsupported payment gateway: ${config.slug}`);
            return;
        }

        this.gateways.set(config.slug, gateway);
      }
    });
  }

  private getGatewayConfigurations(): PaymentGateway[] {
    return [
      {
        id: '1',
        name: 'Razorpay',
        slug: 'razorpay',
        status: process.env.RAZORPAY_ENABLED === 'true' ? 'active' : 'inactive',
        config: {
          keyId: process.env.RAZORPAY_KEY_ID,
          keySecret: process.env.RAZORPAY_KEY_SECRET,
          webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
        }
      },
      {
        id: '2',
        name: 'Cashfree',
        slug: 'cashfree',
        status: process.env.CASHFREE_ENABLED === 'true' ? 'active' : 'inactive',
        config: {
          clientId: process.env.CASHFREE_CLIENT_ID,
          clientSecret: process.env.CASHFREE_CLIENT_SECRET,
          environment: process.env.CASHFREE_ENVIRONMENT || 'sandbox'
        }
      },
      {
        id: '3',
        name: 'PhonePe',
        slug: 'phonepe',
        status: process.env.PHONEPE_ENABLED === 'true' ? 'active' : 'inactive',
        config: {
          merchantId: process.env.PHONEPE_MERCHANT_ID,
          saltKey: process.env.PHONEPE_SALT_KEY,
          saltIndex: process.env.PHONEPE_SALT_INDEX || '1',
          environment: process.env.PHONEPE_ENVIRONMENT || 'sandbox'
        }
      }
    ];
  }

  public getAvailableGateways(): PaymentGateway[] {
    return this.getGatewayConfigurations().filter(gateway => gateway.status === 'active');
  }

  public getGateway(slug: string): PaymentGatewayBase | null {
    return this.gateways.get(slug) || null;
  }

  public async createPayment(gatewaySlug: string, request: PaymentRequest): Promise<PaymentResponse> {
    const gateway = this.getGateway(gatewaySlug);
    
    if (!gateway) {
      return {
        success: false,
        orderId: request.orderId,
        amount: request.amount,
        currency: request.currency,
        status: 'failed',
        error: `Payment gateway ${gatewaySlug} not available`
      };
    }

    // Add Vikareta middleware tracking
    const enhancedRequest = {
      ...request,
      metadata: {
        ...request.metadata,
        vikaretaOrderId: request.orderId,
        vikaretaTimestamp: new Date().toISOString(),
        vikaretaGateway: gatewaySlug
      }
    };

    try {
      const response = await gateway.createOrder(enhancedRequest);
      
      // Log transaction for Vikareta middleware
      await this.logTransaction('create_order', gatewaySlug, enhancedRequest, response);
      
      return response;
    } catch (error: any) {
      console.error(`Payment creation failed for gateway ${gatewaySlug}:`, error);
      return {
        success: false,
        orderId: request.orderId,
        amount: request.amount,
        currency: request.currency,
        status: 'failed',
        error: error.message || 'Payment creation failed'
      };
    }
  }

  public async verifyPayment(gatewaySlug: string, request: PaymentVerificationRequest): Promise<PaymentResponse> {
    const gateway = this.getGateway(gatewaySlug);
    
    if (!gateway) {
      return {
        success: false,
        orderId: request.orderId,
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: `Payment gateway ${gatewaySlug} not available`
      };
    }

    try {
      const response = await gateway.verifyPayment(request);
      
      // Log verification for Vikareta middleware
      await this.logTransaction('verify_payment', gatewaySlug, request, response);
      
      return response;
    } catch (error: any) {
      console.error(`Payment verification failed for gateway ${gatewaySlug}:`, error);
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

  public async handleWebhook(gatewaySlug: string, payload: any): Promise<{ success: boolean; orderId?: string; status?: string }> {
    const gateway = this.getGateway(gatewaySlug);
    
    if (!gateway) {
      console.error(`Webhook received for unavailable gateway: ${gatewaySlug}`);
      return { success: false };
    }

    try {
      const result = await gateway.handleWebhook(payload);
      
      // Log webhook for Vikareta middleware
      await this.logTransaction('webhook', gatewaySlug, payload, result);
      
      return result;
    } catch (error: any) {
      console.error(`Webhook handling failed for gateway ${gatewaySlug}:`, error);
      return { success: false };
    }
  }

  public async getPaymentStatus(gatewaySlug: string, paymentId: string): Promise<PaymentResponse> {
    const gateway = this.getGateway(gatewaySlug);
    
    if (!gateway) {
      return {
        success: false,
        orderId: '',
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: `Payment gateway ${gatewaySlug} not available`
      };
    }

    try {
      const response = await gateway.getPaymentStatus(paymentId);
      
      // Log status check for Vikareta middleware
      await this.logTransaction('status_check', gatewaySlug, { paymentId }, response);
      
      return response;
    } catch (error: any) {
      console.error(`Payment status check failed for gateway ${gatewaySlug}:`, error);
      return {
        success: false,
        orderId: '',
        amount: 0,
        currency: 'INR',
        status: 'failed',
        error: error.message || 'Payment status check failed'
      };
    }
  }

  private async logTransaction(action: string, gateway: string, request: any, response: any): Promise<void> {
    try {
      // Log to Vikareta middleware database/logging system
      const logEntry = {
        action,
        gateway,
        timestamp: new Date().toISOString(),
        request: this.sanitizeLogData(request),
        response: this.sanitizeLogData(response),
        success: response.success || false
      };

      // You would typically save this to a database or logging service
      console.log('Payment transaction log:', logEntry);
      
      // TODO: Implement actual logging to database
      // await this.paymentLogService.log(logEntry);
      
    } catch (error) {
      console.error('Failed to log payment transaction:', error);
    }
  }

  private sanitizeLogData(data: any): any {
    if (!data) return data;
    
    const sensitiveFields = ['keySecret', 'saltKey', 'clientSecret', 'signature', 'password', 'token'];
    const sanitized = JSON.parse(JSON.stringify(data));
    
    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      Object.keys(obj).forEach(key => {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      });
      
      return obj;
    };
    
    return sanitizeObject(sanitized);
  }

  // Utility method to get gateway statistics
  public getGatewayStats(): { gateway: string; isActive: boolean; lastUsed?: Date }[] {
    const configs = this.getGatewayConfigurations();
    
    return configs.map(config => ({
      gateway: config.name,
      isActive: config.status === 'active',
      lastUsed: undefined // TODO: Implement from logs
    }));
  }
}

export const paymentManager = PaymentManager.getInstance();