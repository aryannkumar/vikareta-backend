import { prisma } from '@/config/database';
import cashfreeService from './cashfree.service';
import { logger } from '@/utils/logger';

export class PaymentReconciliationService {
  /**
   * Attempt immediate reconciliation of incoming Cashfree webhook payload.
   * Non-throwing; logs and swallows errors to avoid impacting webhook response time.
   */
  async reconcileCashfreePayload(payload: any) {
    try {
      const paymentStatus = cashfreeService.parsePaymentStatus(payload);
      const orderId = payload.orderId || payload.order_id || payload.order;
      const gatewayTransactionId = payload.txnId || payload.txnIdExternal || payload.transactionId || payload.txnid || payload.txId || undefined;

      if (gatewayTransactionId) {
        await prisma.payment.updateMany({ where: { gatewayTransactionId }, data: { status: paymentStatus, gatewayTransactionId } });
      }

      if (orderId && paymentStatus === 'paid') {
        await prisma.order.updateMany({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
      }
    } catch (err) {
      logger.error('PaymentReconciliationService.reconcileCashfreePayload error', err);
    }
  }
}

export const paymentReconciliationService = new PaymentReconciliationService();
