import { logger } from '@/utils/logger';
import { redisClient } from '@/config/redis';
import { prisma } from '@/config/database';
import cashfreeService from '@/services/cashfree.service';
import { notificationService } from '@/services/notification.service';

export const processPaymentWebhooksJob = async (): Promise<void> => {
  try {
    // Process up to 50 webhooks per run
    const raw = await redisClient.lrange('payment_webhooks', 0, 49);
    if (!raw || raw.length === 0) {
      logger.info('No payment webhooks to process');
      return;
    }

    for (const entry of raw) {
      try {
        const payload = JSON.parse(entry);

        // Attempt to validate signature if present
  const valid = cashfreeService.validateSignature(payload, payload.signature || payload.sign || undefined);
  const status = cashfreeService.parsePaymentStatus(payload);
  logger.debug(`Processing webhook (validSignature=${valid}) for status=${status}`);

        // Map common transaction id keys
        const gatewayTxnId = payload.txnId || payload.transactionId || payload.txnid || payload.txn_id || payload.txId || payload.orderId;
        const orderId = payload.orderId || payload.order_id || payload.order;

        // Update Payment(s) by gateway transaction id when present
        if (gatewayTxnId) {
          await prisma.payment.updateMany({ where: { gatewayTransactionId: gatewayTxnId as string }, data: { status } });
        }

        // If orderId present, update order status/paymentStatus accordingly
        if (orderId) {
          const updateData: any = {};
          if (status === 'paid') updateData.paymentStatus = 'paid';
          if (status === 'failed') updateData.paymentStatus = 'failed';

          if (Object.keys(updateData).length > 0) {
            await prisma.order.updateMany({ where: { id: orderId as string }, data: updateData });

            // Fetch order to send notifications
            const order = await prisma.order.findUnique({ where: { id: orderId as string } });
            if (order) {
              await notificationService.sendOrderNotification(order, 'payment_updated');
            }
          }
        }

        // Remove processed webhook entry
        await redisClient.lrem('payment_webhooks', 1, entry);
      } catch (innerErr) {
        logger.error('Failed to process individual payment webhook entry:', innerErr);
        // If JSON parse failed or unknown schema, remove to avoid repeated failures
        try {
          await redisClient.lrem('payment_webhooks', 1, entry);
        } catch (remErr) {
          logger.warn('Failed to remove malformed webhook entry from Redis:', remErr);
        }
      }
    }

    logger.info(`Processed ${raw.length} payment webhooks`);
  } catch (error) {
    logger.error('Error in process payment webhooks job:', error);
    throw error;
  }
};