import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface CreateOrderData {
  buyerId: string;
  sellerId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }>;
  deliveryAddress: any;
  billingAddress?: any;
  notes?: string;
}

export interface OrderFilters {
  status?: string;
  paymentStatus?: string;
  buyerId?: string;
  sellerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class OrderManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new order
   */
  async createOrder(orderData: CreateOrderData): Promise<string> {
    try {
      // Calculate order totals
      let subtotal = 0;
      for (const item of orderData.items) {
        subtotal += item.quantity * item.unitPrice;
      }

      const taxAmount = subtotal * 0.18; // 18% GST
      const shippingAmount = subtotal > 500 ? 0 : 50; // Free shipping above ₹500
      const totalAmount = subtotal + taxAmount + shippingAmount;

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Create order
      const order = await this.prisma.order.create({
        data: {
          buyerId: orderData.buyerId,
          sellerId: orderData.sellerId,
          orderNumber,
          orderType: 'product',
          subtotal,
          taxAmount,
          shippingAmount,
          discountAmount: 0,
          totalAmount,
          status: 'pending',
          paymentStatus: 'pending',
          deliveryAddress: orderData.deliveryAddress,
          billingAddress: orderData.billingAddress || orderData.deliveryAddress,
          notes: orderData.notes,
        },
      });

      // Create order items
      for (const item of orderData.items) {
        await this.prisma.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            status: 'pending',
          },
        });
      }

      // Create initial status history
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'pending',
          notes: 'Order created',
        },
      });

      // Notify seller
      await this.prisma.notification.create({
        data: {
          userId: orderData.sellerId,
          type: 'new_order',
          title: 'New Order Received',
          message: `You have received a new order #${orderNumber}`,
          data: { orderId: order.id },
        },
      });

      logger.info('Order created successfully', { orderId: order.id, orderNumber });
      return order.id;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: string, notes?: string, updatedBy?: string): Promise<void> {
    try {
      // Update order
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status },
      });

      // Create status history
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          status,
          notes,
          updatedBy,
        },
      });

      // Get order details for notification
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { buyerId: true, orderNumber: true },
      });

      if (order) {
        // Notify buyer
        await this.prisma.notification.create({
          data: {
            userId: order.buyerId,
            type: 'order_status_updated',
            title: 'Order Status Updated',
            message: `Your order #${order.orderNumber} status has been updated to ${status}`,
            data: { orderId, status },
          },
        });
      }

      logger.info('Order status updated', { orderId, status });
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  media: {
                    take: 1,
                    select: { url: true, altText: true },
                  },
                },
              },
              variant: {
                select: {
                  id: true,
                  name: true,
                  value: true,
                },
              },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
          // shipment model doesn't exist, using order tracking instead
          trackingHistory: {
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      return order;
    } catch (error) {
      logger.error('Error getting order details:', error);
      throw error;
    }
  }

  /**
   * Get orders with filters
   */
  async getOrders(filters: OrderFilters, page = 1, limit = 20): Promise<{
    orders: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {};

      if (filters.status) where.status = filters.status;
      if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
      if (filters.buyerId) where.buyerId = filters.buyerId;
      if (filters.sellerId) where.sellerId = filters.sellerId;
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
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
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    media: {
                      take: 1,
                      select: { url: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        orders,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting orders:', error);
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason: string, cancelledBy: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
        throw new Error('Order cannot be cancelled in current status');
      }

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          notes: reason,
        },
      });

      // Restore product stock
      for (const item of order.items) {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              increment: item.quantity,
            },
          },
        });
      }

      // Create status history
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          status: 'cancelled',
          notes: reason,
          updatedBy: cancelledBy,
        },
      });

      // Process refund if payment was made
      if (order.paymentStatus === 'paid') {
        // TODO: Implement refund logic
        await this.prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'refunded' },
        });
      }

      // Notify both parties
      await Promise.all([
        this.prisma.notification.create({
          data: {
            userId: order.buyerId,
            type: 'order_cancelled',
            title: 'Order Cancelled',
            message: `Your order #${order.orderNumber} has been cancelled. ${reason}`,
            data: { orderId, reason },
          },
        }),
        this.prisma.notification.create({
          data: {
            userId: order.sellerId,
            type: 'order_cancelled',
            title: 'Order Cancelled',
            message: `Order #${order.orderNumber} has been cancelled. ${reason}`,
            data: { orderId, reason },
          },
        }),
      ]);

      logger.info('Order cancelled successfully', { orderId, reason });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  /**
   * Get order analytics
   */
  async getOrderAnalytics(sellerId?: string, dateRange?: { from: Date; to: Date }): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    ordersByStatus: Record<string, number>;
    recentOrders: any[];
  }> {
    try {
      const where: any = {};
      if (sellerId) where.sellerId = sellerId;
      if (dateRange) {
        where.createdAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      const [orders, ordersByStatus] = await Promise.all([
        this.prisma.order.findMany({
          where,
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            buyer: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where,
          _count: { id: true },
        }),
      ]);

      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const statusCounts: Record<string, number> = {};
      ordersByStatus.forEach(group => {
        statusCounts[group.status] = group._count.id;
      });

      return {
        totalOrders,
        totalRevenue,
        averageOrderValue,
        ordersByStatus: statusCounts,
        recentOrders: orders,
      };
    } catch (error) {
      logger.error('Error getting order analytics:', error);
      throw error;
    }
  }
}

export default OrderManagementService;