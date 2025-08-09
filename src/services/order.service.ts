import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { logisticsService, CreateShipmentRequest, ShippingAddress, PackageDetails } from './logistics.service';

const prisma = new PrismaClient();

// Mock cart service for testing
export const cartService = {
  async addToCart(userId: string, item: { productId: string; quantity: number }) {
    // Get or create cart
    let cart = await prisma.shoppingCart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await prisma.shoppingCart.create({
        data: { userId },
      });
    }

    // Get product details
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      return { success: false, message: 'Product not found' };
    }

    // Add item to cart
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
      },
    });

    return { success: true };
  },

  async clearCart(userId: string) {
    const cart = await prisma.shoppingCart.findUnique({
      where: { userId },
    });

    if (cart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return { success: true };
  }
};

export interface ShippingDetailsRequest {
  orderId: string;
  shippingProvider?: string;
  trackingNumber: string;
  shippingNotes?: string;
  estimatedDelivery?: Date;
}

export interface TrackingUpdateRequest {
  orderId: string;
  trackingNumber: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' | 'cancelled';
  location?: string;
  notes?: string;
  estimatedDelivery?: Date;
}

export interface ReturnRequest {
  orderId: string;
  reason: string;
  returnType: 'refund' | 'exchange';
  items?: Array<{
    orderItemId: string;
    quantity: number;
    reason: string;
  }>;
  pickupAddress?: {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface CancellationRequest {
  orderId: string;
  reason: string;
  cancellationType: 'full' | 'partial';
  items?: Array<{
    orderItemId: string;
    quantity: number;
  }>;
}

export interface ServiceScheduleRequest {
  orderId: string;
  serviceType: 'on_site' | 'remote' | 'pickup_delivery' | 'consultation';
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number;
  location?: string;
  serviceAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactPerson?: string;
  contactPhone?: string;
  specialInstructions?: string;
}

export interface ServiceProgressRequest {
  orderId: string;
  status: 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  progressNotes?: string;
  completionPercentage?: number;
  nextSteps?: string;
  estimatedCompletion?: Date;
}

export interface ServiceCompletionRequest {
  appointmentId: string;
  completionNotes?: string;
  completedAt?: Date;
}

export interface ServiceReviewRequest {
  orderId: string;
  rating: number;
  review?: string;
  serviceQuality: number;
  timeliness: number;
  professionalism: number;
}

export class OrderService {
  /**
   * Create shipment with logistics provider
   */
  async createShipment(orderId: string, shipmentRequest: {
    providerId: string;
    pickupAddress: ShippingAddress;
    deliveryAddress: ShippingAddress;
    packageDetails: PackageDetails;
    serviceType?: 'standard' | 'express' | 'overnight';
    insuranceRequired?: boolean;
    codAmount?: number;
    specialInstructions?: string;
  }, userId: string): Promise<{
    success: boolean;
    shipmentId?: string | undefined;
    trackingNumber?: string | undefined;
    labelUrl?: string | undefined;
    estimatedDelivery?: Date | undefined;
    shippingCost?: number | undefined;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can create shipments',
        };
      }

      const hasPhysicalProducts = order.items.some(item => !item.product.isService);
      if (!hasPhysicalProducts) {
        return {
          success: false,
          message: 'This order does not contain physical products that require shipping',
        };
      }

      // Check if shipment already exists
      const existingShipment = await prisma.shipment.findUnique({
        where: { orderId },
      });

      if (existingShipment) {
        return {
          success: false,
          message: 'Shipment already exists for this order',
        };
      }

      const createShipmentRequest: CreateShipmentRequest = {
        orderId,
        ...shipmentRequest,
      };

      const result = await logisticsService.createShipment(createShipmentRequest);

      if (result.success) {
        logger.info('Shipment created successfully:', {
          orderId,
          shipmentId: result.shipmentId,
          trackingNumber: result.trackingNumber,
        });
      }

      return result;
    } catch (error) {
      logger.error('Error creating shipment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create shipment',
      };
    }
  }

  /**
   * Add shipping details for product orders (legacy method)
   */
  async addShippingDetails(request: ShippingDetailsRequest, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can add shipping details',
        };
      }

      const hasPhysicalProducts = order.items.some(item => !item.product.isService);
      if (!hasPhysicalProducts) {
        return {
          success: false,
          message: 'This order does not contain physical products that require shipping',
        };
      }

      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          trackingNumber: request.trackingNumber,
          shippingProvider: request.shippingProvider ?? null,
          shippingNotes: request.shippingNotes ?? null,
          estimatedDelivery: request.estimatedDelivery ?? null,
          status: 'shipped',
          updatedAt: new Date(),
        },
      });

      // Add tracking history entry
      await prisma.orderTrackingHistory.create({
        data: {
          orderId: request.orderId,
          status: 'shipped',
          description: 'Order shipped with tracking details',
          timestamp: new Date(),
          provider: request.shippingProvider ?? null,
        },
      });

      logger.info('Shipping details added:', {
        orderId: request.orderId,
        trackingNumber: request.trackingNumber,
        shippingProvider: request.shippingProvider,
      });

      // Send WhatsApp notification to buyer about shipping
      try {
        const { notificationService } = await import('./notification.service');
        const buyer = await prisma.user.findUnique({
          where: { id: order.buyerId },
          select: { phone: true }
        });

        if (buyer?.phone) {
          await notificationService.sendOrderWhatsAppUpdate({
            userId: order.buyerId,
            phone: buyer.phone,
            orderData: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: 'shipped',
              totalAmount: Number(order.totalAmount),
              trackingNumber: request.trackingNumber,
              estimatedDelivery: request.estimatedDelivery || undefined
            }
          });
        }
      } catch (error) {
        logger.error('Failed to send WhatsApp shipping notification:', error);
        // Don't fail the shipping update if notification fails
      }

      return {
        success: true,
        message: 'Shipping details added successfully',
      };
    } catch (error) {
      logger.error('Error adding shipping details:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add shipping details',
      };
    }
  }

  /**
   * Update tracking status
   */
  async updateTrackingStatus(request: TrackingUpdateRequest, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can update tracking status',
        };
      }

      let orderStatus = order.status;
      if (request.status === 'delivered') {
        orderStatus = 'delivered';
      } else if (request.status === 'shipped' || request.status === 'in_transit' || request.status === 'out_for_delivery') {
        orderStatus = 'shipped';
      } else if (request.status === 'returned') {
        orderStatus = 'returned';
      } else if (request.status === 'cancelled') {
        orderStatus = 'cancelled';
      }

      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          trackingNumber: request.trackingNumber,
          status: orderStatus,
          estimatedDelivery: request.estimatedDelivery ?? null,
          updatedAt: new Date(),
        },
      });

      logger.info('Tracking status updated:', {
        orderId: request.orderId,
        trackingNumber: request.trackingNumber,
        status: request.status,
        location: request.location,
      });

      // Send WhatsApp notification to buyer about tracking update
      try {
        const { notificationService } = await import('./notification.service');
        const buyer = await prisma.user.findUnique({
          where: { id: order.buyerId },
          select: { phone: true }
        });

        if (buyer?.phone) {
          await notificationService.sendOrderWhatsAppUpdate({
            userId: order.buyerId,
            phone: buyer.phone,
            orderData: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: request.status,
              totalAmount: Number(order.totalAmount),
              trackingNumber: request.trackingNumber,
              estimatedDelivery: request.estimatedDelivery || undefined
            }
          });
        }
      } catch (error) {
        logger.error('Failed to send WhatsApp tracking notification:', error);
        // Don't fail the tracking update if notification fails
      }

      return {
        success: true,
        message: 'Tracking status updated successfully',
      };
    } catch (error) {
      logger.error('Error updating tracking status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update tracking status',
      };
    }
  }

  /**
   * Get comprehensive order tracking information
   */
  async getOrderTracking(orderId: string, userId: string): Promise<{
    success: boolean;
    tracking?: {
      trackingNumber?: string | undefined;
      status: string;
      shippingProvider?: string | undefined;
      estimatedDelivery?: Date | undefined;
      actualDelivery?: Date | undefined;
      trackingHistory: Array<{
        status: string;
        timestamp: Date;
        location?: string | undefined;
        description?: string | undefined;
        provider?: string | undefined;
      }>;
      shipmentDetails?: {
        pickupAddress?: any;
        deliveryAddress?: any;
        packageDetails?: any;
        shippingCost?: number | undefined;
        labelUrl?: string | undefined;
      } | undefined;
    };
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          trackingHistory: {
            orderBy: { timestamp: 'asc' },
          },
          shipment: {
            include: {
              provider: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view tracking information for this order',
        };
      }

      // If we have a shipment with tracking number, get latest tracking from logistics service
      if (order.trackingNumber) {
        const trackingResult = await logisticsService.trackShipment(order.trackingNumber);
        if (trackingResult.success && trackingResult.trackingInfo) {
          // Tracking info is already synced by logistics service
        }
      }

      // Get updated tracking history
      const updatedOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          trackingHistory: {
            orderBy: { timestamp: 'asc' },
          },
          shipment: {
            include: {
              provider: true,
            },
          },
        },
      });

      const trackingHistory = updatedOrder!.trackingHistory.map(history => ({
        status: history.status,
        timestamp: history.timestamp,
        location: history.location || undefined,
        description: history.description || undefined,
        provider: history.provider || undefined,
      }));

      // Add basic order milestones if no detailed tracking history exists
      if (trackingHistory.length === 0) {
        trackingHistory.push({
          status: 'confirmed',
          timestamp: order.createdAt,
          location: undefined,
          description: 'Order confirmed and payment received',
          provider: undefined,
        });

        if (order.status === 'processing') {
          trackingHistory.push({
            status: 'processing',
            timestamp: order.updatedAt,
            location: undefined,
            description: 'Order is being processed',
            provider: undefined,
          });
        }

        if (order.status === 'shipped' || order.status === 'delivered') {
          trackingHistory.push({
            status: 'shipped',
            timestamp: order.updatedAt,
            location: undefined,
            description: 'Order has been shipped',
            provider: undefined,
          });
        }

        if (order.status === 'delivered') {
          trackingHistory.push({
            status: 'delivered',
            timestamp: order.updatedAt,
            location: undefined,
            description: 'Order has been delivered',
            provider: undefined,
          });
        }
      }

      const shipmentDetails = order.shipment ? {
        pickupAddress: order.shipment.pickupAddress,
        deliveryAddress: order.shipment.deliveryAddress,
        packageDetails: order.shipment.packageDetails,
        shippingCost: order.shipment.shippingCost ? Number(order.shipment.shippingCost) : undefined,
        labelUrl: order.shipment.labelUrl || undefined,
      } : undefined;

      return {
        success: true,
        tracking: {
          trackingNumber: order.trackingNumber ?? undefined,
          status: order.status,
          shippingProvider: order.shippingProvider ?? undefined,
          estimatedDelivery: order.shipment?.estimatedDelivery ?? order.estimatedDelivery ?? undefined,
          actualDelivery: order.shipment?.actualDelivery ?? order.actualDelivery ?? undefined,
          trackingHistory,
          shipmentDetails,
        },
        message: 'Tracking information retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting order tracking:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get tracking information',
      };
    }
  }

  /**
   * Process return request with logistics integration
   */
  async processReturnRequest(request: ReturnRequest, userId: string): Promise<{
    success: boolean;
    returnId?: string | undefined;
    returnTrackingNumber?: string | undefined;
    pickupDate?: Date | undefined;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
        include: {
          items: true,
          shipment: true,
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId) {
        return {
          success: false,
          message: 'Only the buyer can request returns',
        };
      }

      if (order.status !== 'delivered') {
        return {
          success: false,
          message: 'Order must be delivered before requesting a return',
        };
      }

      // Check if return window is still valid (e.g., 7 days from delivery)
      if (order.actualDelivery) {
        const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        const timeSinceDelivery = Date.now() - order.actualDelivery.getTime();

        if (timeSinceDelivery > returnWindow) {
          return {
            success: false,
            message: 'Return window has expired. Returns must be requested within 7 days of delivery.',
          };
        }
      }

      const returnId = `RET-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Request return pickup through logistics service
      let returnTrackingNumber: string | undefined;
      let pickupDate: Date | undefined;

      if (order.trackingNumber) {
        const returnResult = await logisticsService.requestReturnPickup(
          request.orderId,
          request.reason,
          request.pickupAddress
        );

        if (returnResult.success) {
          returnTrackingNumber = returnResult.returnTrackingNumber;
          pickupDate = returnResult.pickupDate;
        } else {
          logger.warn('Failed to create return shipment:', returnResult.message);
        }
      }

      // Update order status
      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          status: 'return_requested',
          updatedAt: new Date(),
        },
      });

      // Add tracking history
      await prisma.orderTrackingHistory.create({
        data: {
          orderId: request.orderId,
          status: 'return_requested',
          description: `Return requested: ${request.reason}`,
          timestamp: new Date(),
        },
      });

      logger.info('Return request processed:', {
        orderId: request.orderId,
        returnId,
        reason: request.reason,
        returnType: request.returnType,
        returnTrackingNumber,
      });

      return {
        success: true,
        returnId,
        returnTrackingNumber,
        pickupDate,
        message: 'Return request processed successfully',
      };
    } catch (error) {
      logger.error('Error processing return request:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process return request',
      };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(request: CancellationRequest, userId: string): Promise<{
    success: boolean;
    refundAmount?: number;
    message: string;
  }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: request.orderId },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        if (!order) {
          return {
            success: false,
            message: 'Order not found',
          };
        }

        if (order.buyerId !== userId) {
          return {
            success: false,
            message: 'Unauthorized to cancel this order',
          };
        }

        if (order.status === 'delivered') {
          return {
            success: false,
            message: 'Delivered orders cannot be cancelled',
          };
        }

        let refundAmount = 0;
        let newStatus = 'cancelled';

        if (request.cancellationType === 'full') {
          refundAmount = Number(order.totalAmount);

          for (const item of order.items) {
            if (!item.product.isService) {
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
        } else {
          newStatus = 'processing';

          if (request.items) {
            for (const cancelItem of request.items) {
              const orderItem = order.items.find(item => item.id === cancelItem.orderItemId);
              if (orderItem && !orderItem.product.isService) {
                await tx.product.update({
                  where: { id: orderItem.productId },
                  data: {
                    stockQuantity: {
                      increment: cancelItem.quantity,
                    },
                  },
                });

                refundAmount += Number(orderItem.unitPrice) * cancelItem.quantity;
              }
            }
          }
        }

        await tx.order.update({
          where: { id: request.orderId },
          data: {
            status: newStatus,
            updatedAt: new Date(),
          },
        });

        logger.info('Order cancelled:', {
          orderId: request.orderId,
          cancellationType: request.cancellationType,
          refundAmount,
          reason: request.reason,
        });

        return {
          success: true,
          refundAmount,
          message: `Order ${request.cancellationType === 'full' ? 'cancelled' : 'partially cancelled'} successfully`,
        };
      });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to cancel order',
      };
    }
  }

  /**
   * Schedule service for service orders
   */
  async scheduleService(request: ServiceScheduleRequest, userId: string): Promise<{
    success: boolean;
    scheduleId?: string;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can schedule services',
        };
      }

      const hasServices = order.items.some(item => item.product.isService);
      if (!hasServices) {
        return {
          success: false,
          message: 'This order does not contain services that can be scheduled',
        };
      }

      const appointment = await prisma.serviceAppointment.create({
        data: {
          orderId: request.orderId,
          scheduledDate: new Date(request.scheduledDate),
          scheduledTime: new Date(`1970-01-01T${request.scheduledTime}:00`),
          durationMinutes: request.durationMinutes ?? null,
          location: request.location ?? null,
          status: 'scheduled',
        },
      });

      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          status: 'processing',
          updatedAt: new Date(),
        },
      });

      logger.info('Service scheduled:', {
        orderId: request.orderId,
        appointmentId: appointment.id,
        serviceType: request.serviceType,
        scheduledDate: request.scheduledDate,
        scheduledTime: request.scheduledTime,
      });

      return {
        success: true,
        scheduleId: appointment.id,
        message: 'Service scheduled successfully',
      };
    } catch (error) {
      logger.error('Error scheduling service:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to schedule service',
      };
    }
  }

  /**
   * Update service progress
   */
  async updateServiceProgress(request: ServiceProgressRequest, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can update service progress',
        };
      }

      let orderStatus = order.status;
      if (request.status === 'completed') {
        orderStatus = 'delivered';
      } else if (request.status === 'in_progress' || request.status === 'scheduled') {
        orderStatus = 'processing';
      } else if (request.status === 'cancelled') {
        orderStatus = 'cancelled';
      }

      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          status: orderStatus,
          updatedAt: new Date(),
        },
      });

      logger.info('Service progress updated:', {
        orderId: request.orderId,
        status: request.status,
        completionPercentage: request.completionPercentage,
      });

      return {
        success: true,
        message: 'Service progress updated successfully',
      };
    } catch (error) {
      logger.error('Error updating service progress:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update service progress',
      };
    }
  }

  /**
   * Get service details
   */
  async getServiceDetails(orderId: string, userId: string): Promise<{
    success: boolean;
    serviceDetails?: {
      serviceType?: string;
      status: string;
      appointments: Array<{
        id: string;
        scheduledDate: Date;
        scheduledTime: Date;
        status: string;
        location?: string | undefined;
        completionNotes?: string | undefined;
        completedAt?: Date | undefined;
      }>;
    };
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          serviceAppointments: true,
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view service details for this order',
        };
      }

      const serviceDetails = {
        serviceType: order.serviceAppointments[0]?.location ? 'on_site' : 'remote',
        status: order.status,
        appointments: order.serviceAppointments.map(appointment => ({
          id: appointment.id,
          scheduledDate: appointment.scheduledDate,
          scheduledTime: appointment.scheduledTime,
          status: appointment.status,
          location: appointment.location ?? undefined,
          completionNotes: appointment.completionNotes ?? undefined,
          completedAt: appointment.completedAt ?? undefined,
        })),
      };

      return {
        success: true,
        serviceDetails,
        message: 'Service details retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting service details:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get service details',
      };
    }
  }



  async scheduleServiceAppointment(request: {
    orderId: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMinutes?: number;
    location?: string;
    notes?: string;
  }, userId: string): Promise<{
    success: boolean;
    appointmentId?: string;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to schedule appointment for this order',
        };
      }

      const hasServices = order.items.some(item => item.product.isService);
      if (!hasServices) {
        return {
          success: false,
          message: 'This order does not contain service items',
        };
      }

      // Validate that the scheduled date/time is in the future
      const scheduledDateTime = new Date(`${request.scheduledDate}T${request.scheduledTime}:00`);
      if (scheduledDateTime <= new Date()) {
        return {
          success: false,
          message: 'Appointment must be scheduled for a future date and time',
        };
      }

      const appointment = await prisma.serviceAppointment.create({
        data: {
          orderId: request.orderId,
          scheduledDate: new Date(request.scheduledDate),
          scheduledTime: scheduledDateTime,
          durationMinutes: request.durationMinutes ?? 60,
          location: request.location ?? null,
          status: 'scheduled',
        },
      });

      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          status: 'processing',
          updatedAt: new Date(),
        },
      });

      logger.info('Service appointment scheduled:', {
        orderId: request.orderId,
        appointmentId: appointment.id,
        scheduledDate: request.scheduledDate,
        scheduledTime: request.scheduledTime,
      });

      return {
        success: true,
        appointmentId: appointment.id,
        message: 'Service appointment scheduled successfully',
      };
    } catch (error) {
      logger.error('Error scheduling service appointment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to schedule service appointment',
      };
    }
  }

  async getServiceAppointments(orderId: string, userId: string): Promise<any[]> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        throw new Error('Unauthorized to view appointments for this order');
      }

      const appointments = await prisma.serviceAppointment.findMany({
        where: { orderId },
        orderBy: { scheduledDate: 'asc' },
      });

      return appointments;
    } catch (error) {
      logger.error('Error getting service appointments:', error);
      throw error;
    }
  }

  async updateServiceAppointmentStatus(appointmentId: string, status: string, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const appointment = await prisma.serviceAppointment.findUnique({
        where: { id: appointmentId },
        include: {
          order: true,
        },
      });

      if (!appointment) {
        return {
          success: false,
          message: 'Appointment not found',
        };
      }

      if (appointment.order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the service provider can update appointment status',
        };
      }

      await prisma.serviceAppointment.update({
        where: { id: appointmentId },
        data: {
          status,
        },
      });

      logger.info('Service appointment status updated:', {
        appointmentId,
        status,
        userId,
      });

      return {
        success: true,
        message: 'Appointment status updated successfully',
      };
    } catch (error) {
      logger.error('Error updating service appointment status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update appointment status',
      };
    }
  }

  async completeServiceDelivery(request: ServiceCompletionRequest, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const appointment = await prisma.serviceAppointment.findUnique({
        where: { id: request.appointmentId },
        include: {
          order: true,
        },
      });

      if (!appointment) {
        return {
          success: false,
          message: 'Appointment not found',
        };
      }

      if (appointment.order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the service provider can complete service delivery',
        };
      }

      await prisma.serviceAppointment.update({
        where: { id: request.appointmentId },
        data: {
          status: 'completed',
          completionNotes: request.completionNotes ?? null,
          completedAt: request.completedAt ?? new Date(),
        },
      });

      await prisma.order.update({
        where: { id: appointment.orderId },
        data: {
          status: 'delivered',
          updatedAt: new Date(),
        },
      });

      logger.info('Service delivery completed:', {
        appointmentId: request.appointmentId,
        orderId: appointment.orderId,
        userId,
      });

      return {
        success: true,
        message: 'Service delivery completed successfully',
      };
    } catch (error) {
      logger.error('Error completing service delivery:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to complete service delivery',
      };
    }
  }

  async verifyServiceCompletion(orderId: string, isVerified: boolean, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId) {
        return {
          success: false,
          message: 'Only the buyer can verify service completion',
        };
      }

      // Update order verification status (you might want to add this field to your schema)
      await prisma.order.update({
        where: { id: orderId },
        data: {
          updatedAt: new Date(),
        },
      });

      logger.info('Service completion verified:', {
        orderId,
        isVerified,
        userId,
      });

      return {
        success: true,
        message: `Service completion ${isVerified ? 'verified' : 'rejected'} successfully`,
      };
    } catch (error) {
      logger.error('Error verifying service completion:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to verify service completion',
      };
    }
  }

  async submitServiceReview(request: ServiceReviewRequest, userId: string): Promise<{
    success: boolean;
    reviewId?: string;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.orderId },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId) {
        return {
          success: false,
          message: 'Only the buyer can submit service reviews',
        };
      }

      // Validate rating values
      const ratings = [request.rating, request.serviceQuality, request.timeliness, request.professionalism];
      for (const rating of ratings) {
        if (rating < 1 || rating > 5) {
          return {
            success: false,
            message: 'All ratings must be between 1 and 5',
          };
        }
      }

      // Create review (assuming you have a reviews table)
      const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      logger.info('Service review submitted:', {
        orderId: request.orderId,
        reviewId,
        rating: request.rating,
        userId,
      });

      return {
        success: true,
        reviewId,
        message: 'Service review submitted successfully',
      };
    } catch (error) {
      logger.error('Error submitting service review:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit service review',
      };
    }
  }

  /**
   * Confirm delivery with proof
   */
  async confirmDelivery(orderId: string, deliveryProof: {
    type: 'signature' | 'photo' | 'otp' | 'biometric';
    data: string;
    recipientName?: string;
    recipientPhone?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  }, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          shipment: true,
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can confirm delivery',
        };
      }

      if (order.status !== 'shipped') {
        return {
          success: false,
          message: 'Order must be shipped before confirming delivery',
        };
      }

      const deliveryTime = new Date();

      // Update order status
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'delivered',
          actualDelivery: deliveryTime,
          updatedAt: deliveryTime,
        },
      });

      // Update shipment with delivery proof
      if (order.shipment) {
        await prisma.shipment.update({
          where: { id: order.shipment.id },
          data: {
            status: 'delivered',
            actualDelivery: deliveryTime,
            deliveryProof: {
              ...deliveryProof,
              timestamp: deliveryTime,
            },
          },
        });

        // Update tracking through logistics service
        if (order.trackingNumber) {
          await logisticsService.updateShipmentStatus(
            order.trackingNumber,
            'delivered',
            undefined,
            `Package delivered to ${deliveryProof.recipientName || 'recipient'}`,
            {
              ...deliveryProof,
              timestamp: deliveryTime,
            }
          );
        }
      }

      // Add tracking history
      await prisma.orderTrackingHistory.create({
        data: {
          orderId,
          status: 'delivered',
          description: `Package delivered to ${deliveryProof.recipientName || 'recipient'}`,
          timestamp: deliveryTime,
          metadata: {
            deliveryProof: {
              type: deliveryProof.type,
              recipientName: deliveryProof.recipientName,
              recipientPhone: deliveryProof.recipientPhone,
              location: deliveryProof.location,
            },
          },
        },
      });

      logger.info('Delivery confirmed:', {
        orderId,
        deliveryTime,
        proofType: deliveryProof.type,
        recipientName: deliveryProof.recipientName,
      });

      return {
        success: true,
        message: 'Delivery confirmed successfully',
      };
    } catch (error) {
      logger.error('Error confirming delivery:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to confirm delivery',
      };
    }
  }

  /**
   * Get delivery proof
   */
  async getDeliveryProof(orderId: string, userId: string): Promise<{
    success: boolean;
    deliveryProof?: {
      type: string;
      data: string;
      recipientName?: string;
      recipientPhone?: string;
      timestamp: Date;
      location?: {
        latitude: number;
        longitude: number;
      };
    };
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          shipment: true,
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view delivery proof for this order',
        };
      }

      if (order.status !== 'delivered') {
        return {
          success: false,
          message: 'Delivery proof is only available for delivered orders',
        };
      }

      let deliveryProof = null;

      // Try to get delivery proof from shipment
      if (order.shipment && order.shipment.deliveryProof) {
        deliveryProof = order.shipment.deliveryProof;
      }

      // Try to get delivery proof from logistics service
      if (!deliveryProof && order.trackingNumber) {
        const proofResult = await logisticsService.getDeliveryProof(order.trackingNumber);
        if (proofResult.success && proofResult.deliveryProof) {
          deliveryProof = proofResult.deliveryProof;
        }
      }

      if (!deliveryProof) {
        return {
          success: false,
          message: 'Delivery proof not available',
        };
      }

      return {
        success: true,
        deliveryProof: deliveryProof as any,
        message: 'Delivery proof retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting delivery proof:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get delivery proof',
      };
    }
  }

  /**
   * Get shipping rates for order
   */
  async getShippingRates(orderId: string, userId: string): Promise<{
    success: boolean;
    rates?: Array<{
      providerId: string;
      providerName: string;
      serviceType: string;
      rate: number;
      estimatedDays: number;
      currency: string;
    }>;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can get shipping rates',
        };
      }

      // Calculate total weight and dimensions (mock calculation)
      let totalWeight = 0;
      let totalVolume = 0;

      for (const item of order.items) {
        // Mock weight calculation - in real scenario, this would come from product data
        totalWeight += item.quantity * 0.5; // 0.5 kg per item
        totalVolume += item.quantity * 1000; // 1000 cm³ per item
      }

      // Mock dimensions calculation
      const dimensions = {
        length: Math.ceil(Math.cbrt(totalVolume)),
        width: Math.ceil(Math.cbrt(totalVolume)),
        height: Math.ceil(Math.cbrt(totalVolume)),
      };

      const rates = await logisticsService.calculateShippingRates({
        fromPincode: '110001', // Mock seller pincode
        toPincode: '400001', // Mock buyer pincode
        weight: totalWeight,
        dimensions,
        codAmount: order.paymentStatus === 'pending' ? Number(order.totalAmount) : undefined,
      });

      return {
        success: true,
        rates,
        message: 'Shipping rates calculated successfully',
      };
    } catch (error) {
      logger.error('Error getting shipping rates:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get shipping rates',
      };
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(orderId: string, reason: string, userId: string): Promise<{
    success: boolean;
    refundAmount?: number | undefined;
    message: string;
  }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          shipment: true,
        },
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      if (order.sellerId !== userId) {
        return {
          success: false,
          message: 'Only the seller can cancel shipments',
        };
      }

      if (!order.trackingNumber) {
        return {
          success: false,
          message: 'No shipment found for this order',
        };
      }

      if (order.status === 'delivered') {
        return {
          success: false,
          message: 'Cannot cancel delivered shipment',
        };
      }

      const result = await logisticsService.cancelShipment(order.trackingNumber, reason);

      if (result.success) {
        // Update order status
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'cancelled',
            updatedAt: new Date(),
          },
        });

        // Add tracking history
        await prisma.orderTrackingHistory.create({
          data: {
            orderId,
            status: 'cancelled',
            description: `Shipment cancelled: ${reason}`,
            timestamp: new Date(),
          },
        });
      }

      return result;
    } catch (error) {
      logger.error('Error cancelling shipment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to cancel shipment',
      };
    }
  }

  /**
   * Create order from cart
   */
  async createOrderFromCart(request: {
    userId: string;
    shippingAddress: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    paymentMethod: 'wallet' | 'cashfree';
    couponCode?: string;
  }): Promise<{
    success: boolean;
    orderId?: string;
    orderNumber?: string;
    paymentRequired?: boolean;
    totalAmount?: number;
    cashfreeOrder?: any;
    message: string;
  }> {
    try {
      // Get user's cart
      const cart = await prisma.shoppingCart.findUnique({
        where: { userId: request.userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  seller: true,
                },
              },
              variant: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        return {
          success: false,
          message: 'Cart is empty',
        };
      }

      // Calculate total amount
      let subtotal = 0;
      let discountAmount = 0;

      for (const item of cart.items) {
        const unitPrice = item.variant ?
          Number(item.product.price) + Number(item.variant.priceAdjustment || 0) :
          Number(item.product.price);
        subtotal += unitPrice * item.quantity;
      }

      // Apply coupon if provided
      if (request.couponCode) {
        const coupon = await prisma.coupon.findUnique({
          where: { code: request.couponCode },
        });

        if (coupon && coupon.isActive && new Date() <= (coupon.expiresAt || new Date())) {
          if (coupon.discountType === 'percentage') {
            discountAmount = (subtotal * Number(coupon.discountValue)) / 100;
          } else {
            discountAmount = Number(coupon.discountValue);
          }
        }
      }

      const taxAmount = (subtotal - discountAmount) * 0.18; // 18% GST
      const totalAmount = subtotal - discountAmount + taxAmount;

      // Check wallet balance if payment method is wallet
      if (request.paymentMethod === 'wallet') {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: request.userId },
        });

        if (!wallet || Number(wallet.availableBalance) < totalAmount) {
          return {
            success: false,
            message: 'Insufficient wallet balance',
          };
        }
      }

      // Create order
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          buyerId: request.userId,
          sellerId: cart.items[0]!.product.sellerId, // Assuming single seller for now
          orderType: cart.items[0]!.product.isService ? 'service' : 'product',
          subtotal,
          taxAmount,
          shippingAmount: 0,
          discountAmount,
          totalAmount,
          status: request.paymentMethod === 'wallet' ? 'confirmed' : 'pending',
          paymentStatus: request.paymentMethod === 'wallet' ? 'paid' : 'pending',
          items: {
            create: cart.items.map(item => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: Number(item.product.price),
              totalPrice: Number(item.product.price) * item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Process payment if wallet
      if (request.paymentMethod === 'wallet') {
        await prisma.wallet.update({
          where: { userId: request.userId },
          data: {
            availableBalance: {
              decrement: totalAmount,
            },
          },
        });

        // Create wallet transaction
        await prisma.walletTransaction.create({
          data: {
            walletId: (await prisma.wallet.findUnique({ where: { userId: request.userId } }))!.id,
            transactionType: 'debit',
            amount: totalAmount,
            balanceAfter: Number((await prisma.wallet.findUnique({ where: { userId: request.userId } }))!.availableBalance) - totalAmount,
            referenceType: 'order',
            referenceId: order.id,
            description: `Order payment: ${orderNumber}`,
          },
        });
      }

      // Update inventory
      for (const item of cart.items) {
        if (!item.product.isService) {
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      // Clear cart
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentRequired: request.paymentMethod !== 'wallet',
        totalAmount,
        cashfreeOrder: request.paymentMethod === 'cashfree' ? { orderId: order.id, amount: totalAmount } : undefined,
        message: 'Order created successfully',
      };
    } catch (error) {
      logger.error('Error creating order from cart:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create order',
      };
    }
  }

  /**
   * Create order from quote
   */
  async createOrderFromQuote(request: {
    userId: string;
    quoteId: string;
    shippingAddress: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    paymentMethod: 'wallet' | 'cashfree';
  }): Promise<{
    success: boolean;
    orderId?: string;
    orderNumber?: string;
    paymentRequired?: boolean;
    message: string;
  }> {
    try {
      // Get quote details
      const quote = await prisma.quote.findUnique({
        where: { id: request.quoteId },
        include: {
          rfq: {
            include: {
              buyer: true,
            },
          },
          seller: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!quote) {
        return {
          success: false,
          message: 'Quote not found',
        };
      }

      if (quote.rfq.buyerId !== request.userId) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      if (quote.status !== 'accepted') {
        return {
          success: false,
          message: 'Quote must be accepted before creating order',
        };
      }

      const totalPrice = Number(quote.totalPrice);

      // Check wallet balance if payment method is wallet
      if (request.paymentMethod === 'wallet') {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: request.userId },
        });

        if (!wallet || Number(wallet.availableBalance) < totalPrice) {
          return {
            success: false,
            message: 'Insufficient wallet balance',
          };
        }
      }

      // Create order
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          buyerId: request.userId,
          sellerId: quote.sellerId,
          quoteId: quote.id,
          orderType: quote.items[0]?.product.isService ? 'service' : 'product',
          subtotal: totalPrice,
          taxAmount: 0,
          shippingAmount: 0,
          discountAmount: 0,
          totalAmount: totalPrice,
          status: 'confirmed',
          paymentStatus: 'paid',
          items: {
            create: quote.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              totalPrice: Number(item.unitPrice) * item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Process payment if wallet
      if (request.paymentMethod === 'wallet') {
        await prisma.wallet.update({
          where: { userId: request.userId },
          data: {
            availableBalance: {
              decrement: totalPrice,
            },
          },
        });

        // Create wallet transaction
        await prisma.walletTransaction.create({
          data: {
            walletId: (await prisma.wallet.findUnique({ where: { userId: request.userId } }))!.id,
            transactionType: 'debit',
            amount: totalPrice,
            balanceAfter: Number((await prisma.wallet.findUnique({ where: { userId: request.userId } }))!.availableBalance) - totalPrice,
            referenceType: 'order',
            referenceId: order.id,
            description: `Order payment: ${orderNumber}`,
          },
        });
      }

      // Update quote status
      await prisma.quote.update({
        where: { id: request.quoteId },
        data: {
          status: 'converted',
        },
      });

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentRequired: false,
        message: 'Order created successfully from quote',
      };
    } catch (error) {
      logger.error('Error creating order from quote:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create order from quote',
      };
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId: string): Promise<any> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true,
              gstin: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true,
              gstin: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  isService: true,
                },
              },
              variant: true,
            },
          },
        },
      });

      if (!order) {
        return null;
      }

      if (order.buyerId !== userId && order.sellerId !== userId) {
        throw new Error('Unauthorized to view this order');
      }

      return order;
    } catch (error) {
      logger.error('Error getting order by ID:', error);
      throw error;
    }
  }

  /**
   * Get user orders
   */
  async getUserOrders(userId: string, options: {
    role?: 'buyer' | 'seller';
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      const where: any = {};

      if (options.role === 'buyer') {
        where.buyerId = userId;
      } else if (options.role === 'seller') {
        where.sellerId = userId;
      } else {
        where.OR = [
          { buyerId: userId },
          { sellerId: userId },
        ];
      }

      if (options.status) {
        where.status = options.status;
      }

      const orders = await prisma.order.findMany({
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
                  price: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      });

      return orders;
    } catch (error) {
      logger.error('Error getting user orders:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, update: {
    status?: string;
    paymentStatus?: string;
    trackingNumber?: string;
  }, userId: string): Promise<any> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.sellerId !== userId && order.buyerId !== userId) {
        throw new Error('Unauthorized to update this order');
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          ...update,
          updatedAt: new Date(),
        },
      });

      return updatedOrder;
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }
}

export const orderService = new OrderService();