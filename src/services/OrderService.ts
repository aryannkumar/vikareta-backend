/**
 * Order Service
 * Handles both product orders and service orders with comprehensive order management
 */

import { PrismaClient } from '@prisma/client';
import {
  OrderCreateRequest,
  OrderResponse,
  OrderType,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentGateway,
  ServiceOrderStatus,
  OrderUpdateRequest,
  ServiceOrderUpdateRequest,
  OrderFilters,
  OrderListResponse,
  OrderStats,
  ServiceBookingRequest,
  ServiceBookingResponse,
  OrderError,
  PaymentError,
  ServiceBookingError
} from '../types/orders';

export class OrderService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new order (product or service)
   */
  async createOrder(
    buyerId: string,
    orderData: OrderCreateRequest
  ): Promise<OrderResponse> {
    try {
      // Validate order data
      await this.validateOrderData(orderData);

      // Calculate totals
      const calculations = await this.calculateOrderTotals(orderData);

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Determine seller ID (for now, use the first item's seller)
      const sellerId = await this.determineSellerId(orderData);

      // Create order in transaction
      const order = await this.prisma.$transaction(async (tx) => {
        // Create main order
        const newOrder = await tx.order.create({
          data: {
            buyerId,
            sellerId,
            orderNumber,
            orderType: orderData.orderType,
            subtotal: calculations.subtotal,
            taxAmount: calculations.taxAmount,
            shippingAmount: calculations.shippingAmount,
            discountAmount: calculations.discountAmount,
            totalAmount: calculations.totalAmount,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            deliveryAddress: orderData.deliveryAddress as any,
            billingAddress: orderData.billingAddress as any,
            notes: orderData.notes,
          },
        });

        // Create order items for products
        if (orderData.items && orderData.items.length > 0) {
          await tx.orderItem.createMany({
            data: orderData.items.map(item => ({
              orderId: newOrder.id,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              notes: item.notes,
            })),
          });
        }

        // Create service orders
        if (orderData.serviceOrders && orderData.serviceOrders.length > 0) {
          await tx.serviceOrder.createMany({
            data: orderData.serviceOrders.map(serviceOrder => ({
              orderId: newOrder.id,
              serviceId: serviceOrder.serviceId,
              quantity: serviceOrder.quantity,
              unitPrice: serviceOrder.unitPrice,
              totalPrice: serviceOrder.unitPrice * serviceOrder.quantity,
              scheduledDate: serviceOrder.scheduledDate,
              duration: serviceOrder.duration,
              location: serviceOrder.location as any,
              requirements: serviceOrder.requirements,
              customerNotes: serviceOrder.customerNotes,
              status: ServiceOrderStatus.PENDING,
            })),
          });
        }

        // Create initial status history
        await tx.orderStatusHistory.create({
          data: {
            orderId: newOrder.id,
            status: OrderStatus.PENDING,
            notes: 'Order created',
          },
        });

        // Create payment record
        await tx.payment.create({
          data: {
            orderId: newOrder.id,
            paymentMethod: orderData.paymentMethod as any,
            paymentGateway: orderData.paymentGateway as any,
            amount: calculations.totalAmount,
            currency: 'INR',
            status: PaymentStatus.PENDING,
          },
        });

        return newOrder;
      });

      // Return complete order data
      return await this.getOrderById(order.id);
    } catch (error) {
      if (error instanceof OrderError) {
        throw error;
      }
      throw new OrderError(
        'Failed to create order',
        'ORDER_CREATION_FAILED',
        500
      );
    }
  }

  /**
   * Get order by ID with all relations
   */
  async getOrderById(orderId: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
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
              include: {
                media: true,
              },
            },
            variant: true,
          },
        },
        serviceOrders: {
          include: {
            service: {
              include: {
                media: true,
                provider: {
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
        },
        payments: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
        deliveryTracking: true,
      },
    });

    if (!order) {
      throw new OrderError('Order not found', 'ORDER_NOT_FOUND', 404);
    }

    return this.formatOrderResponse(order);
  }

  /**
   * Update order status
   */
  async updateOrder(
    orderId: string,
    updateData: OrderUpdateRequest,
    updatedBy?: string
  ): Promise<OrderResponse> {
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        // Update order
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            ...updateData,
            updatedAt: new Date(),
          },
        });

        // Add status history if status changed
        if (updateData.status) {
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              status: updateData.status,
              notes: updateData.notes,
              updatedBy,
            },
          });
        }

        return updatedOrder;
      });

      return await this.getOrderById(order.id);
    } catch (error) {
      throw new OrderError(
        'Failed to update order',
        'ORDER_UPDATE_FAILED',
        500
      );
    }
  }

  /**
   * Update service order
   */
  async updateServiceOrder(
    serviceOrderId: string,
    updateData: ServiceOrderUpdateRequest
  ): Promise<void> {
    try {
      await this.prisma.serviceOrder.update({
        where: { id: serviceOrderId },
        data: {
          ...updateData,
          location: updateData.location ? JSON.parse(JSON.stringify(updateData.location)) : undefined,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new ServiceBookingError(
        'Failed to update service order',
        'SERVICE_ORDER_UPDATE_FAILED',
        500
      );
    }
  }

  /**
   * Get orders with filters and pagination
   */
  async getOrders(
    filters: OrderFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<OrderListResponse> {
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply filters
    if (filters.orderType) where.orderType = filters.orderType;
    if (filters.status) where.status = filters.status;
    if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters.buyerId) where.buyerId = filters.buyerId;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.minAmount) where.totalAmount = { gte: filters.minAmount };
    if (filters.maxAmount) {
      where.totalAmount = { ...where.totalAmount, lte: filters.maxAmount };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    // Search functionality
    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { buyer: { businessName: { contains: filters.search, mode: 'insensitive' } } },
        { seller: { businessName: { contains: filters.search, mode: 'insensitive' } } },
      ];
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
                include: { media: true },
              },
              variant: true,
            },
          },
          serviceOrders: {
            include: {
              service: {
                include: {
                  media: true,
                  provider: {
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
          },
          payments: true,
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map(order => this.formatOrderResponse(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters,
    };
  }

  /**
   * Book a service
   */
  async bookService(
    buyerId: string,
    bookingData: ServiceBookingRequest
  ): Promise<ServiceBookingResponse> {
    try {
      // Validate service availability
      await this.validateServiceAvailability(
        bookingData.serviceId,
        bookingData.scheduledDate
      );

      // Get service details
      const service = await this.prisma.service.findUnique({
        where: { id: bookingData.serviceId },
        include: {
          provider: {
            select: {
              id: true,
              businessName: true,
              phone: true,
              email: true,
            },
          },
        },
      });

      if (!service) {
        throw new ServiceBookingError(
          'Service not found',
          'SERVICE_NOT_FOUND',
          404
        );
      }

      // Create service order
      const orderData: OrderCreateRequest = {
        orderType: OrderType.SERVICE,
        items: [],
        serviceOrders: [{
          serviceId: bookingData.serviceId,
          quantity: bookingData.quantity || 1,
          unitPrice: service.price.toNumber(),
          scheduledDate: bookingData.scheduledDate,
          duration: bookingData.duration,
          location: bookingData.location,
          requirements: bookingData.requirements,
          customerNotes: bookingData.customerNotes,
        }],
        paymentMethod: PaymentMethod.WALLET, // Default for service booking
        paymentGateway: PaymentGateway.RAZORPAY,
      };

      const order = await this.createOrder(buyerId, orderData);
      const serviceOrder = order.serviceOrders[0];

      return {
        id: serviceOrder.id,
        orderId: order.id,
        serviceId: bookingData.serviceId,
        scheduledDate: bookingData.scheduledDate,
        status: ServiceOrderStatus.PENDING,
        confirmationCode: this.generateConfirmationCode(),
        estimatedDuration: bookingData.duration,
        location: bookingData.location,
        requirements: bookingData.requirements,
        service: {
          id: service.id,
          title: service.title,
          provider: {
            id: service.provider.id,
            businessName: service.provider.businessName || undefined,
            phone: service.provider.phone || undefined,
            email: service.provider.email || undefined,
          },
        },
      };
    } catch (error) {
      if (error instanceof ServiceBookingError) {
        throw error;
      }
      throw new ServiceBookingError(
        'Failed to book service',
        'SERVICE_BOOKING_FAILED',
        500
      );
    }
  }

  /**
   * Get order statistics
   */
  async getOrderStats(
    sellerId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<OrderStats> {
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
      topProducts,
      topServices,
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
      this.getTopProducts(where),
      this.getTopServices(where),
    ]);

    const averageOrderValue = totalOrders > 0 
      ? (totalRevenue._sum.totalAmount?.toNumber() || 0) / totalOrders 
      : 0;

    return {
      totalOrders,
      totalRevenue: totalRevenue._sum.totalAmount?.toNumber() || 0,
      ordersByStatus: ordersByStatus.reduce((acc, item) => {
        acc[item.status as OrderStatus] = item._count;
        return acc;
      }, {} as Record<OrderStatus, number>),
      ordersByType: ordersByType.reduce((acc, item) => {
        acc[item.orderType as OrderType] = item._count;
        return acc;
      }, {} as Record<OrderType, number>),
      averageOrderValue,
      topProducts,
      topServices,
    };
  }

  // Private helper methods

  private async validateOrderData(orderData: OrderCreateRequest): Promise<void> {
    if (orderData.orderType === OrderType.PRODUCT && (!orderData.items || orderData.items.length === 0)) {
      throw new OrderError('Product orders must have at least one item', 'INVALID_ORDER_DATA');
    }

    if (orderData.orderType === OrderType.SERVICE && (!orderData.serviceOrders || orderData.serviceOrders.length === 0)) {
      throw new OrderError('Service orders must have at least one service', 'INVALID_ORDER_DATA');
    }
  }

  private async calculateOrderTotals(orderData: OrderCreateRequest) {
    let subtotal = 0;

    // Calculate product items total
    if (orderData.items) {
      subtotal += orderData.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    }

    // Calculate service orders total
    if (orderData.serviceOrders) {
      subtotal += orderData.serviceOrders.reduce((sum, service) => sum + (service.unitPrice * service.quantity), 0);
    }

    const taxAmount = subtotal * 0.18; // 18% GST
    const shippingAmount = orderData.orderType === OrderType.PRODUCT ? 50 : 0; // Shipping only for products
    const discountAmount = 0; // TODO: Apply coupon logic

    return {
      subtotal,
      taxAmount,
      shippingAmount,
      discountAmount,
      totalAmount: subtotal + taxAmount + shippingAmount - discountAmount,
    };
  }

  private async generateOrderNumber(): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD${timestamp}${random}`;
  }

  private async determineSellerId(orderData: OrderCreateRequest): Promise<string> {
    if (orderData.items && orderData.items.length > 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: orderData.items[0].productId },
        select: { sellerId: true },
      });
      return product?.sellerId || '';
    }

    if (orderData.serviceOrders && orderData.serviceOrders.length > 0) {
      const service = await this.prisma.service.findUnique({
        where: { id: orderData.serviceOrders[0].serviceId },
        select: { providerId: true },
      });
      return service?.providerId || '';
    }

    throw new OrderError('Unable to determine seller', 'INVALID_ORDER_DATA');
  }

  private async validateServiceAvailability(serviceId: string, scheduledDate: Date): Promise<void> {
    // TODO: Implement service availability validation
    // Check service provider's availability, existing bookings, etc.
  }

  private generateConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private formatOrderResponse(order: any): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      subtotal: order.subtotal.toNumber(),
      taxAmount: order.taxAmount.toNumber(),
      shippingAmount: order.shippingAmount.toNumber(),
      discountAmount: order.discountAmount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryAddress: order.deliveryAddress,
      billingAddress: order.billingAddress,
      notes: order.notes,
      estimatedDelivery: order.estimatedDelivery,
      actualDelivery: order.actualDelivery,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      buyer: order.buyer,
      seller: order.seller,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        totalPrice: item.totalPrice.toNumber(),
        status: item.status,
        notes: item.notes,
        product: {
          id: item.product.id,
          title: item.product.title,
          description: item.product.description,
          media: item.product.media,
        },
        variant: item.variant,
      })),
      serviceOrders: order.serviceOrders.map((serviceOrder: any) => ({
        id: serviceOrder.id,
        serviceId: serviceOrder.serviceId,
        quantity: serviceOrder.quantity,
        unitPrice: serviceOrder.unitPrice.toNumber(),
        totalPrice: serviceOrder.totalPrice.toNumber(),
        scheduledDate: serviceOrder.scheduledDate,
        completedDate: serviceOrder.completedDate,
        duration: serviceOrder.duration,
        location: serviceOrder.location,
        requirements: serviceOrder.requirements,
        status: serviceOrder.status,
        providerNotes: serviceOrder.providerNotes,
        customerNotes: serviceOrder.customerNotes,
        createdAt: serviceOrder.createdAt,
        updatedAt: serviceOrder.updatedAt,
        service: {
          id: serviceOrder.service.id,
          title: serviceOrder.service.title,
          description: serviceOrder.service.description,
          duration: serviceOrder.service.duration,
          serviceType: serviceOrder.service.serviceType,
          media: serviceOrder.service.media,
          provider: {
            id: serviceOrder.service.provider.id,
            businessName: serviceOrder.service.provider.businessName || undefined,
            phone: serviceOrder.service.provider.phone || undefined,
            email: serviceOrder.service.provider.email || undefined,
          },
        },
      })),
      payments: order.payments.map((payment: any) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        paymentGateway: payment.paymentGateway,
        gatewayTransactionId: payment.gatewayTransactionId,
        amount: payment.amount.toNumber(),
        currency: payment.currency,
        status: payment.status,
        failureReason: payment.failureReason,
        processedAt: payment.processedAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
      statusHistory: order.statusHistory,
      deliveryTracking: order.deliveryTracking?.[0],
    };
  }

  private async getTopProducts(where: any) {
    // TODO: Implement top products query
    return [];
  }

  private async getTopServices(where: any) {
    // TODO: Implement top services query
    return [];
  }
}