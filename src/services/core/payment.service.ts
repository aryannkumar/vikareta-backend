import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface PaymentData {
  orderId: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  paymentGateway: string;
  gatewayTransactionId?: string;
}

export interface RefundData {
  paymentId: string;
  amount: number;
  reason: string;
}

export class PaymentService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process payment
   */
  async processPayment(paymentData: PaymentData): Promise<string> {
    try {
      // Verify order exists
      const order = await this.prisma.order.findUnique({
        where: { id: paymentData.orderId },
        include: { buyer: true, seller: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          orderId: paymentData.orderId,
          paymentMethod: paymentData.paymentMethod,
          paymentGateway: paymentData.paymentGateway,
          gatewayTransactionId: paymentData.gatewayTransactionId,
          amount: paymentData.amount,
          currency: paymentData.currency || 'INR',
          status: 'processing',
        },
      });

      // Simulate payment processing
      await this.simulatePaymentProcessing(payment.id);

      // Update order payment status
      await this.prisma.order.update({
        where: { id: paymentData.orderId },
        data: {
          paymentStatus: 'paid',
          status: 'confirmed',
        },
      });

      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          processedAt: new Date(),
        },
      });

      // Process wallet transactions
      await this.processWalletTransactions(order, paymentData.amount);

      // Send notifications
      await this.sendPaymentNotifications(order, payment.id);

      logger.info('Payment processed successfully', {
        paymentId: payment.id,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
      });

      return payment.id;
    } catch (error) {
      logger.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(refundData: RefundData): Promise<string> {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: refundData.paymentId },
        include: {
          order: {
            include: { buyer: true, seller: true },
          },
        },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'paid') {
        throw new Error('Payment is not in a refundable state');
      }

      // Create refund record (you would add this to schema)
      // For now, update payment status
      await this.prisma.payment.update({
        where: { id: refundData.paymentId },
        data: {
          status: 'refunded',
        },
      });

      // Update order status
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'refunded',
          status: 'cancelled',
        },
      });

      // Process wallet refund
      await this.processWalletRefund(payment.order, refundData.amount);

      logger.info('Refund processed successfully', {
        paymentId: refundData.paymentId,
        amount: refundData.amount,
        reason: refundData.reason,
      });

      return `refund_${Date.now()}`;
    } catch (error) {
      logger.error('Error processing refund:', error);
      throw error;
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentId: string): Promise<any> {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: {
              buyer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      return payment;
    } catch (error) {
      logger.error('Error getting payment details:', error);
      throw error;
    }
  }

  /**
   * Get payment history for user
   */
  async getPaymentHistory(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{
    payments: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        this.prisma.payment.findMany({
          where: {
            order: {
              OR: [
                { buyerId: userId },
                { sellerId: userId },
              ],
            },
          },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                totalAmount: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.payment.count({
          where: {
            order: {
              OR: [
                { buyerId: userId },
                { sellerId: userId },
              ],
            },
          },
        }),
      ]);

      return {
        payments,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting payment history:', error);
      throw error;
    }
  }

  /**
   * Simulate payment processing
   */
  private async simulatePaymentProcessing(paymentId: string): Promise<void> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, this would integrate with payment gateways
    logger.info('Payment processing simulated', { paymentId });
  }

  /**
   * Process wallet transactions
   */
  private async processWalletTransactions(order: any, amount: number): Promise<void> {
    try {
      // Get or create seller wallet
      let sellerWallet = await this.prisma.wallet.findUnique({
        where: { userId: order.sellerId },
      });

      if (!sellerWallet) {
        sellerWallet = await this.prisma.wallet.create({
          data: {
            userId: order.sellerId,
            availableBalance: 0,
            lockedBalance: 0,
            negativeBalance: 0,
          },
        });
      }

      // Calculate platform fee (5%)
      const platformFee = amount * 0.05;
      const sellerAmount = amount - platformFee;

      // Credit seller wallet
      await this.prisma.wallet.update({
        where: { id: sellerWallet.id },
        data: {
          availableBalance: {
            increment: sellerAmount,
          },
        },
      });

      // Create wallet transaction
      await this.prisma.walletTransaction.create({
        data: {
          walletId: sellerWallet.id,
          transactionType: 'credit',
          amount: sellerAmount,
          balanceAfter: Number(sellerWallet.availableBalance) + sellerAmount,
          referenceType: 'order_payment',
          referenceId: order.id,
          description: `Payment received for order #${order.orderNumber}`,
        },
      });

      logger.info('Wallet transactions processed', {
        orderId: order.id,
        sellerAmount,
        platformFee,
      });
    } catch (error) {
      logger.error('Error processing wallet transactions:', error);
      throw error;
    }
  }

  /**
   * Process wallet refund
   */
  private async processWalletRefund(order: any, amount: number): Promise<void> {
    try {
      const sellerWallet = await this.prisma.wallet.findUnique({
        where: { userId: order.sellerId },
      });

      if (sellerWallet) {
        // Debit seller wallet
        await this.prisma.wallet.update({
          where: { id: sellerWallet.id },
          data: {
            availableBalance: {
              decrement: amount,
            },
          },
        });

        // Create wallet transaction
        await this.prisma.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            transactionType: 'debit',
            amount: amount,
            balanceAfter: Number(sellerWallet.availableBalance) - amount,
            referenceType: 'order_refund',
            referenceId: order.id,
            description: `Refund for order #${order.orderNumber}`,
          },
        });
      }

      logger.info('Wallet refund processed', {
        orderId: order.id,
        amount,
      });
    } catch (error) {
      logger.error('Error processing wallet refund:', error);
      throw error;
    }
  }

  /**
   * Send payment notifications
   */
  private async sendPaymentNotifications(order: any, paymentId: string): Promise<void> {
    try {
      // Notify buyer
      await this.prisma.notification.create({
        data: {
          userId: order.buyerId,
          type: 'payment_success',
          title: 'Payment Successful',
          message: `Your payment for order #${order.orderNumber} has been processed successfully.`,
          data: { orderId: order.id, paymentId },
        },
      });

      // Notify seller
      await this.prisma.notification.create({
        data: {
          userId: order.sellerId,
          type: 'payment_received',
          title: 'Payment Received',
          message: `You have received payment for order #${order.orderNumber}.`,
          data: { orderId: order.id, paymentId },
        },
      });

      logger.info('Payment notifications sent', {
        orderId: order.id,
        paymentId,
      });
    } catch (error) {
      logger.error('Error sending payment notifications:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    sellerId?: string;
  } = {}): Promise<{
    totalPayments: number;
    totalAmount: number;
    successfulPayments: number;
    failedPayments: number;
    refundedPayments: number;
    averagePaymentAmount: number;
    paymentsByMethod: Record<string, number>;
    paymentsByGateway: Record<string, number>;
  }> {
    try {
      const where: any = {};
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      if (filters.sellerId) {
        where.order = { sellerId: filters.sellerId };
      }

      const [
        payments,
        paymentsByMethod,
        paymentsByGateway,
      ] = await Promise.all([
        this.prisma.payment.findMany({ where }),
        this.prisma.payment.groupBy({
          by: ['paymentMethod'],
          where,
          _count: { id: true },
        }),
        this.prisma.payment.groupBy({
          by: ['paymentGateway'],
          where,
          _count: { id: true },
        }),
      ]);

      const totalPayments = payments.length;
      const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const successfulPayments = payments.filter(p => p.status === 'paid').length;
      const failedPayments = payments.filter(p => p.status === 'failed').length;
      const refundedPayments = payments.filter(p => p.status === 'refunded').length;
      const averagePaymentAmount = totalPayments > 0 ? totalAmount / totalPayments : 0;

      const methodStats: Record<string, number> = {};
      paymentsByMethod.forEach(group => {
        methodStats[group.paymentMethod] = group._count.id;
      });

      const gatewayStats: Record<string, number> = {};
      paymentsByGateway.forEach(group => {
        gatewayStats[group.paymentGateway] = group._count.id;
      });

      return {
        totalPayments,
        totalAmount,
        successfulPayments,
        failedPayments,
        refundedPayments,
        averagePaymentAmount,
        paymentsByMethod: methodStats,
        paymentsByGateway: gatewayStats,
      };
    } catch (error) {
      logger.error('Error getting payment analytics:', error);
      throw error;
    }
  }
}

export default PaymentService;