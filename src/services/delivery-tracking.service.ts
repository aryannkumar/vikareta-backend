import { BaseService } from '@/services/base.service';
import { logger } from '@/utils/logger';

export interface CreateDeliveryTrackingDto {
  orderId: string;
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  estimatedDelivery?: Date;
  trackingUrl?: string;
  notes?: string;
}

export interface UpdateDeliveryTrackingDto {
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  trackingUrl?: string;
  notes?: string;
}

export class DeliveryTrackingService extends BaseService {

  async create(createDeliveryTrackingDto: CreateDeliveryTrackingDto) {
    logger.info(`Creating delivery tracking for order ${createDeliveryTrackingDto.orderId}`);

    const tracking = await this.prisma.deliveryTracking.create({
      data: createDeliveryTrackingDto,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
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
                email: true,
              },
            },
          },
        },
      },
    });

    logger.info(`Delivery tracking created with ID: ${tracking.id}`);
    return tracking;
  }

  async findById(id: string) {
    logger.info(`Finding delivery tracking by ID: ${id}`);

    const tracking = await this.prisma.deliveryTracking.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryAddress: true,
            estimatedDelivery: true,
            actualDelivery: true,
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
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!tracking) {
      throw new Error(`Delivery tracking with ID ${id} not found`);
    }

    return tracking;
  }

  async findByOrderId(orderId: string) {
    logger.info(`Finding delivery tracking for order ${orderId}`);

    const tracking = await this.prisma.deliveryTracking.findFirst({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryAddress: true,
            estimatedDelivery: true,
            actualDelivery: true,
          },
        },
      },
    });

    return tracking;
  }

  async findByTrackingNumber(trackingNumber: string) {
    logger.info(`Finding delivery tracking by tracking number: ${trackingNumber}`);

    const tracking = await this.prisma.deliveryTracking.findFirst({
      where: { trackingNumber },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return tracking;
  }

  async update(id: string, updateDeliveryTrackingDto: UpdateDeliveryTrackingDto) {
    logger.info(`Updating delivery tracking ${id}`);

    const tracking = await this.prisma.deliveryTracking.update({
      where: { id },
      data: updateDeliveryTrackingDto,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    logger.info(`Delivery tracking updated: ${tracking.id}`);
    return tracking;
  }

  async updateStatus(id: string, status: string, notes?: string) {
    logger.info(`Updating delivery tracking status to ${status} for ID ${id}`);

    const updateData: any = { status };

    if (status === 'delivered') {
      updateData.actualDelivery = new Date();
    }

    if (notes) {
      updateData.notes = notes;
    }

    const tracking = await this.prisma.deliveryTracking.update({
      where: { id },
      data: updateData,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    logger.info(`Delivery tracking status updated: ${tracking.id} -> ${status}`);
    return tracking;
  }

  async updateByOrderId(orderId: string, updateDeliveryTrackingDto: UpdateDeliveryTrackingDto) {
    logger.info(`Updating delivery tracking for order ${orderId}`);

    // First find the tracking record
    const existingTracking = await this.prisma.deliveryTracking.findFirst({
      where: { orderId },
    });

    if (!existingTracking) {
      throw new Error(`Delivery tracking not found for order ${orderId}`);
    }

    const tracking = await this.prisma.deliveryTracking.update({
      where: { id: existingTracking.id },
      data: updateDeliveryTrackingDto,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    logger.info(`Delivery tracking updated for order: ${orderId}`);
    return tracking;
  }

  async delete(id: string) {
    logger.info(`Deleting delivery tracking ${id}`);

    const tracking = await this.prisma.deliveryTracking.delete({
      where: { id },
    });

    logger.info(`Delivery tracking deleted: ${tracking.id}`);
    return tracking;
  }

  async getTrackingStats() {
    logger.info(`Getting delivery tracking statistics`);

    const stats = await this.prisma.deliveryTracking.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    return stats;
  }

  async getOverdueDeliveries() {
    logger.info(`Finding overdue deliveries`);

    const overdueTrackings = await this.prisma.deliveryTracking.findMany({
      where: {
        status: {
          not: 'delivered',
        },
        estimatedDelivery: {
          lt: new Date(),
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
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
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        estimatedDelivery: 'asc',
      },
    });

    return overdueTrackings;
  }

  async getDeliveredToday() {
    logger.info(`Finding deliveries completed today`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const deliveredToday = await this.prisma.deliveryTracking.findMany({
      where: {
        status: 'delivered',
        actualDelivery: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: {
        actualDelivery: 'desc',
      },
    });

    return deliveredToday;
  }

  async getExpectedDeliveries(dateRange: { start: Date; end: Date }) {
    logger.info(`Finding expected deliveries between ${dateRange.start} and ${dateRange.end}`);

    const expectedDeliveries = await this.prisma.deliveryTracking.findMany({
      where: {
        status: {
          not: 'delivered',
        },
        estimatedDelivery: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
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
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        estimatedDelivery: 'asc',
      },
    });

    return expectedDeliveries;
  }

  async bulkUpdateStatus(trackingIds: string[], status: string, notes?: string) {
    logger.info(`Bulk updating ${trackingIds.length} tracking records to status ${status}`);

    const updateData: any = { status };

    if (status === 'delivered') {
      updateData.actualDelivery = new Date();
    }

    if (notes) {
      updateData.notes = notes;
    }

    const result = await this.prisma.deliveryTracking.updateMany({
      where: {
        id: {
          in: trackingIds,
        },
      },
      data: updateData,
    });

    logger.info(`Bulk status update completed: ${result.count} records updated`);
    return result;
  }

  async getTrackingHistory(orderId: string) {
    logger.info(`Getting tracking history for order ${orderId}`);

    // Get the main tracking record
    const tracking = await this.prisma.deliveryTracking.findFirst({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!tracking) {
      return null;
    }

    // Get order tracking history if available
    const trackingHistory = await this.prisma.orderTrackingHistory.findMany({
      where: { orderId },
      orderBy: {
        timestamp: 'asc',
      },
    });

    return {
      currentTracking: tracking,
      history: trackingHistory,
    };
  }
}