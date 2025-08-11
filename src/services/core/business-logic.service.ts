import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export class BusinessLogicService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process order completion workflow
   */
  async processOrderCompletion(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          seller: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'completed',
          actualDelivery: new Date(),
        },
      });

      // Update product stock
      for (const item of order.items) {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      // Create notification for buyer
      await this.prisma.notification.create({
        data: {
          userId: order.buyerId,
          type: 'order_completed',
          title: 'Order Completed',
          message: `Your order #${order.orderNumber} has been completed successfully.`,
          data: { orderId: order.id },
        },
      });

      logger.info('Order completion processed successfully', { orderId });
    } catch (error) {
      logger.error('Error processing order completion:', error);
      throw error;
    }
  }

  /**
   * Process RFQ to Quote workflow
   */
  async processRfqToQuote(rfqId: string, sellerId: string, quoteData: {
    totalPrice: number;
    deliveryTimeline: string;
    termsConditions?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>;
  }): Promise<string> {
    try {
      const rfq = await this.prisma.rfq.findUnique({
        where: { id: rfqId },
        include: { buyer: true },
      });

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      // Create quote
      const quote = await this.prisma.quote.create({
        data: {
          rfqId,
          sellerId,
          totalPrice: quoteData.totalPrice,
          deliveryTimeline: quoteData.deliveryTimeline,
          termsConditions: quoteData.termsConditions,
          status: 'pending',
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Create quote items
      for (const item of quoteData.items) {
        await this.prisma.quoteItem.create({
          data: {
            quoteId: quote.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          },
        });
      }

      // Notify buyer
      await this.prisma.notification.create({
        data: {
          userId: rfq.buyerId,
          type: 'quote_received',
          title: 'New Quote Received',
          message: `You have received a new quote for your RFQ: ${rfq.title}`,
          data: { rfqId, quoteId: quote.id },
        },
      });

      logger.info('RFQ to Quote processed successfully', { rfqId, quoteId: quote.id });
      return quote.id;
    } catch (error) {
      logger.error('Error processing RFQ to Quote:', error);
      throw error;
    }
  }

  /**
   * Process service booking workflow
   */
  async processServiceBooking(serviceId: string, buyerId: string, bookingData: {
    scheduledDate: Date;
    duration?: string;
    requirements?: string;
    location?: any;
  }): Promise<string> {
    try {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
        include: { provider: true },
      });

      if (!service) {
        throw new Error('Service not found');
      }

      // Create order for service
      const order = await this.prisma.order.create({
        data: {
          buyerId,
          sellerId: service.providerId,
          orderNumber: `SRV-${Date.now()}`,
          orderType: 'service',
          subtotal: service.price,
          taxAmount: Number(service.price) * 0.18, // 18% GST
          shippingAmount: 0,
          discountAmount: 0,
          totalAmount: Number(service.price) * 1.18,
          status: 'confirmed',
          paymentStatus: 'pending',
        },
      });

      // Create service order
      const serviceOrder = await this.prisma.serviceOrder.create({
        data: {
          orderId: order.id,
          serviceId,
          quantity: 1,
          unitPrice: service.price,
          totalPrice: service.price,
          scheduledDate: bookingData.scheduledDate,
          duration: bookingData.duration,
          location: bookingData.location,
          requirements: bookingData.requirements,
          status: 'scheduled',
        },
      });

      // Create service appointment
      await this.prisma.serviceAppointment.create({
        data: {
          orderId: order.id,
          serviceId,
          scheduledDate: bookingData.scheduledDate,
          duration: bookingData.duration,
          status: 'scheduled',
        },
      });

      // Notify service provider
      await this.prisma.notification.create({
        data: {
          userId: service.providerId,
          type: 'service_booked',
          title: 'New Service Booking',
          message: `You have a new booking for ${service.title}`,
          data: { serviceId, orderId: order.id },
        },
      });

      logger.info('Service booking processed successfully', { 
        serviceId, 
        orderId: order.id,
        serviceOrderId: serviceOrder.id 
      });
      return order.id;
    } catch (error) {
      logger.error('Error processing service booking:', error);
      throw error;
    }
  }

  /**
   * Process payment completion workflow
   */
  async processPaymentCompletion(orderId: string, paymentData: {
    paymentMethod: string;
    gatewayTransactionId: string;
    amount: number;
  }): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { buyer: true, seller: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Update order payment status
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'paid',
          status: 'processing',
        },
      });

      // Create payment record
      await this.prisma.payment.create({
        data: {
          orderId,
          paymentMethod: paymentData.paymentMethod,
          paymentGateway: 'cashfree', // Default gateway
          gatewayTransactionId: paymentData.gatewayTransactionId,
          amount: paymentData.amount,
          currency: 'INR',
          status: 'paid',
          processedAt: new Date(),
        },
      });

      // Update seller wallet
      const seller = await this.prisma.user.findUnique({
        where: { id: order.sellerId },
        include: { wallet: true },
      });

      if (seller?.wallet) {
        await this.prisma.wallet.update({
          where: { id: seller.wallet.id },
          data: {
            availableBalance: {
              increment: paymentData.amount * 0.95, // 5% platform fee
            },
          },
        });

        // Create wallet transaction
        await this.prisma.walletTransaction.create({
          data: {
            walletId: seller.wallet.id,
            transactionType: 'credit',
            amount: Number(paymentData.amount) * 0.95,
            balanceAfter: Number(seller.wallet.availableBalance) + (Number(paymentData.amount) * 0.95),
            referenceType: 'order_payment',
            referenceId: orderId,
            description: `Payment received for order #${order.orderNumber}`,
          },
        });
      }

      // Notify both parties
      await Promise.all([
        this.prisma.notification.create({
          data: {
            userId: order.buyerId,
            type: 'payment_confirmed',
            title: 'Payment Confirmed',
            message: `Your payment for order #${order.orderNumber} has been confirmed.`,
            data: { orderId },
          },
        }),
        this.prisma.notification.create({
          data: {
            userId: order.sellerId,
            type: 'payment_received',
            title: 'Payment Received',
            message: `You have received payment for order #${order.orderNumber}.`,
            data: { orderId },
          },
        }),
      ]);

      logger.info('Payment completion processed successfully', { orderId });
    } catch (error) {
      logger.error('Error processing payment completion:', error);
      throw error;
    }
  }
}

export default BusinessLogicService;