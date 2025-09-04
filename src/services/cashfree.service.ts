import crypto from 'crypto';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

export class CashfreeService {
  private clientId: string;
  private clientSecret: string;
  private environment: string;

  constructor() {
    this.clientId = config.payment.cashfree.clientId;
    this.clientSecret = config.payment.cashfree.clientSecret;
    this.environment = config.payment.cashfree.environment;
  }

  /**
   * Validate webhook signature for Cashfree (best-effort)
   * Cashfree sends signatures differently per integration; this attempts HMAC with client secret.
   */
  validateSignature(payload: any, signatureHeader?: string): boolean {
    try {
      if (!signatureHeader) return false;
      const payloadString = JSON.stringify(payload || {});
      const hmac = crypto.createHmac('sha256', this.clientSecret).update(payloadString).digest('hex');
      return hmac === signatureHeader || hmac === (signatureHeader || '').replace('sha256=', '');
    } catch (error) {
      logger.error('Error validating cashfree signature:', error);
      return false;
    }
  }

  /**
   * Map Cashfree webhook to internal payment status
   */
  parsePaymentStatus(payload: any): 'paid' | 'failed' | 'pending' | 'processing' {
    const status = (payload.event?.toString() || payload.txStatus || payload.status || '').toLowerCase();
    if (status.includes('success') || status === 'paid' || status === 'settled') return 'paid';
    if (status.includes('failed') || status === 'declined' || status === 'failure') return 'failed';
    if (status.includes('processing') || status.includes('pending')) return 'processing';
    return 'pending';
  }
}

export default new CashfreeService();
