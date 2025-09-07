import type { Order } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';

export interface CreateOrderData {
  buyerId: string;
  sellerId: string;
  quoteId?: string;
  orderType: 'product' | 'service';
  items: {
    productId?: string;
    serviceId?: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }[];
  deliveryAddress?: any;
  billingAddress?: any;
  notes?: string;
  estimatedDelivery?: Date;
}

export interface UpdateOrderData {
  status?: string;
  paymentStatus?: string;
  deliveryAddress?: any;
  billingAddress?: any;
  notes?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  trackingNumber?: string;
  shippingProvider?: string;
  shippingNotes?: string;
}

export interface OrderFilters {
  buyerId?: string;
  sellerId?: string;
  status?: string;
  paymentStatus?: string;
  orderType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class OrderService extends BaseService {
  private notificationService: NotificationService;

  constructor() {
    super();
    this.notificationService = new NotificationService();
  }

  async createOrder(data: CreateOrderData): Promise<Order> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Calculate totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of data.items) {
          const totalPrice = item.unitPrice * item.quantity;
          subtotal += totalPrice;

          orderItems.push({
            productId: item.productId,
            serviceId: item.serviceId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice,
          });
        }

        const taxAmount = subtotal * 0.18; // 18% GST
        const shippingAmount = data.orderType === 'product' ? 50 : 0; // Flat shipping for products
        const discountAmount = 0; // No discount for now
        const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

        // Generate order number
        const orderNumber = await this.generateOrderNumber();

        // Create order
        const order = await tx.order.create({
          data: {
            buyerId: data.buyerId,
            sellerId: data.sellerId,
            quoteId: data.quoteId,
            orderNumber,
            orderType: data.orderType,
            subtotal,
            taxAmount,
            shippingAmount,
            discountAmount,
            totalAmount,
            status: 'pending',
            paymentStatus: 'pending',
            deliveryAddress: data.deliveryAddress,
            billingAddress: data.billingAddress,
            notes: data.notes,
            estimatedDelivery: data.estimatedDelivery,
            items: {
              create: orderItems,
            },
          },
          include: {
            buyer: true,
            seller: true,
            items: {
              include: {
                product: true,
                service: true,
                variant: true,
              },
            },
          },
        });

        // Create order status history
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'pending',
            notes: 'Order created',
          },
        });

        // Order history audit
        await tx.orderHistory.create({
          data: {
            orderId: order.id,
            action: 'ORDER_CREATED',
            details: `Order created with ${order.items.length} item(s)`
          }
        });

        // Create service order rows if service items exist
        const serviceItems = order.items.filter(i => i.serviceId);
        for (const sItem of serviceItems) {
          await tx.serviceOrder.create({
            data: {
              orderId: order.id,
              serviceId: sItem.serviceId!,
              quantity: sItem.quantity,
              unitPrice: sItem.unitPrice,
              totalPrice: sItem.totalPrice,
              status: 'pending'
            }
          });
        }

        // Send notifications
        await this.notificationService.sendOrderNotification(order, 'created');

        logger.info(`Order created: ${order.id} - ${order.orderNumber}`);
        return order;
      });
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId: string, status: string, notes?: string, updatedBy?: string): Promise<Order> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
          where: { id: orderId },
          data: { status },
          include: {
            buyer: true,
            seller: true,
            items: {
              include: {
                product: true,
                service: true,
              },
            },
          },
        });

        // Create status history entry
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status,
            notes,
            updatedBy,
          },
        });

        // Order history audit
        await tx.orderHistory.create({
          data: {
            orderId,
            action: 'STATUS_UPDATE',
            details: `Status changed to ${status}${notes ? ' - ' + notes : ''}`,
            userId: updatedBy
          }
        });

        // Send notification
        await this.notificationService.sendOrderNotification(order, 'status_updated');

        logger.info(`Order status updated: ${orderId} - ${status}`);
        return order;
      });
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async updatePaymentStatus(orderId: string, paymentStatus: string): Promise<Order> {
    try {
      const order = await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus },
        include: {
          buyer: true,
          seller: true,
          items: {
            include: {
              product: true,
              service: true,
            },
          },
        },
      });

      // If payment is successful, update order status
      if (paymentStatus === 'paid' && order.status === 'pending') {
        await this.updateOrderStatus(orderId, 'confirmed', 'Payment received');
      }

      // Order history audit
      await this.prisma.orderHistory.create({
        data: {
          orderId,
          action: 'PAYMENT_STATUS',
          details: `Payment status set to ${paymentStatus}`
        }
      });

      // Send notification
      await this.notificationService.sendOrderNotification(order, 'payment_updated');

      logger.info(`Order payment status updated: ${orderId} - ${paymentStatus}`);
      return order;
    } catch (error) {
      logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    try {
      return await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          seller: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          quote: true,
          items: {
            include: {
              product: {
                include: {
                  media: { take: 1 },
                },
              },
              service: true,
              variant: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
          deliveryTracking: {
            orderBy: { createdAt: 'desc' },
          },
          trackingHistory: {
            orderBy: { timestamp: 'desc' },
          },
          reviews: true,
          shipment: true,
        },
      });
    } catch (error) {
      logger.error('Error fetching order:', error);
      throw error;
    }
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    try {
      return await this.prisma.order.findUnique({
        where: { orderNumber },
        include: {
          buyer: true,
          seller: true,
          items: {
            include: {
              product: true,
              service: true,
              variant: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
          },
          payments: true,
        },
      });
    } catch (error) {
      logger.error('Error fetching order by number:', error);
      throw error;
    }
  }

  async getOrders(filters: OrderFilters = {}, page = 1, limit = 20): Promise<{
    orders: Order[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {};

      if (filters.buyerId) where.buyerId = filters.buyerId;
      if (filters.sellerId) where.sellerId = filters.sellerId;
      if (filters.status) where.status = filters.status;
      if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
      if (filters.orderType) where.orderType = filters.orderType;

      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
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
                    media: { take: 1 },
                  },
                },
                service: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
            _count: {
              select: { items: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
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
      logger.error('Error fetching orders:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, reason?: string, cancelledBy?: string): Promise<Order> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });

        if (!order) {
          throw new Error('Order not found');
        }

        if (!['pending', 'confirmed'].includes(order.status)) {
          throw new Error('Order cannot be cancelled in current status');
        }

        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: 'cancelled' },
          include: {
            buyer: true,
            seller: true,
            items: {
              include: {
                product: true,
                service: true,
              },
            },
          },
        });

        // Create status history
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: 'cancelled',
            notes: reason || 'Order cancelled',
            updatedBy: cancelledBy,
          },
        });

        await tx.orderHistory.create({
          data: {
            orderId,
            action: 'ORDER_CANCELLED',
            details: reason || 'Cancelled',
            userId: cancelledBy
          }
        });

        // Restore inventory for products
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockQuantity: {
                  increment: item.quantity,
                },
              },
            });
          }
        }

        // Send notification
        await this.notificationService.sendOrderNotification(updatedOrder, 'cancelled');

        logger.info(`Order cancelled: ${orderId}`);
        return updatedOrder;
      });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  async addTrackingEvent(orderId: string, data: { status: string; location?: string; description?: string; provider?: string; providerTrackingId?: string; metadata?: any; userId?: string; }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error('Order not found');

      await tx.orderTrackingHistory.create({
        data: {
          orderId,
          status: data.status,
            location: data.location,
            description: data.description,
            provider: data.provider,
            providerTrackingId: data.providerTrackingId,
            metadata: data.metadata
        }
      });

      // If first shipping related status, create/update deliveryTracking record
      if (['shipped','in_transit','out_for_delivery','delivered'].includes(data.status)) {
        const existingDelivery = await tx.deliveryTracking.findFirst({ where: { orderId } });
        if (!existingDelivery) {
          await tx.deliveryTracking.create({
            data: {
              orderId,
              trackingNumber: data.providerTrackingId || order.trackingNumber,
              carrier: data.provider,
              status: data.status,
              notes: data.description,
            }
          });
        } else {
          await tx.deliveryTracking.update({
            where: { id: existingDelivery.id },
            data: { status: data.status, notes: data.description, carrier: data.provider }
          });
        }
      }

      await tx.orderHistory.create({
        data: {
          orderId,
          action: 'TRACKING_EVENT',
          details: `${data.status}${data.description ? ' - ' + data.description : ''}`,
          userId: data.userId
        }
      });

      // Optional: if status influences overall order status for shipping milestones
      const shippingStatuses = ['shipped','delivered'];
      if (shippingStatuses.includes(data.status) && order.status !== data.status) {
        // Fire and forget; rely on existing status update for history
        try { await this.updateOrderStatus(orderId, data.status, 'Tracking event update'); } catch (e) { /* swallow */ }
      }
    });
  }

  async getOrderAnalytics(sellerId?: string, dateFrom?: Date, dateTo?: Date): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    ordersByStatus: Record<string, number>;
    ordersByType: Record<string, number>;
    recentOrders: Order[];
  }> {
    try {
      const where: any = {};
      if (sellerId) where.sellerId = sellerId;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      const [
        totalOrders,
        totalRevenue,
        ordersByStatus,
        ordersByType,
        recentOrders,
      ] = await Promise.all([
        this.prisma.order.count({ where }),
        this.prisma.order.aggregate({
          where,
          _sum: { totalAmount: true },
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        this.prisma.order.groupBy({
          by: ['orderType'],
          where,
          _count: true,
        }),
        this.prisma.order.findMany({
          where,
          include: {
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
            items: {
              take: 1,
              include: {
                product: {
                  select: { title: true },
                },
                service: {
                  select: { title: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const revenue = Number(totalRevenue._sum.totalAmount || 0);
      const averageOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;

      const statusCounts = ordersByStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>);

      const typeCounts = ordersByType.reduce((acc, item) => {
        acc[item.orderType] = item._count;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalOrders,
        totalRevenue: revenue,
        averageOrderValue,
        ordersByStatus: statusCounts,
        ordersByType: typeCounts,
        recentOrders,
      };
    } catch (error) {
      logger.error('Error fetching order analytics:', error);
      throw error;
    }
  }

  private async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const prefix = `VKR${year}${month}${day}`;
    
    // Get the count of orders created today
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    const todayOrderCount = await this.prisma.order.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });
    
    const sequence = (todayOrderCount + 1).toString().padStart(4, '0');
    return `${prefix}${sequence}`;
  }
}