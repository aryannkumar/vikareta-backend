import { PrismaClient, Shipment } from '@prisma/client';

export class ShipmentService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createShipment(data: {
    
    providerId?: string;
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: Date;
    shippingCost?: number;
    pickupAddress?: any;
    deliveryAddress?: any;
    packageDetails?: any;
    service?: string;
    provider?: string;
  }): Promise<Shipment> {
    return this.prisma.shipment.create({
      data: {
        // Field removed
        providerId: data.providerId,
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
        status: 'pending',
        estimatedDelivery: data.estimatedDelivery,
        shippingCost: data.shippingCost,
        pickupAddress: data.pickupAddress,
        deliveryAddress: data.deliveryAddress,
        packageDetails: data.packageDetails,
        service: data.service,
        provider: data.provider,
      },
    });
  }

  async getShipmentById(id: string): Promise<Shipment | null> {
    return this.prisma.shipment.findUnique({
      where: { id },
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
                phone: true,
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        logisticsProvider: {
          select: {
            id: true,
            name: true,
            contactInfo: true,
          },
        },
      },
    });
  }

  async async getShipmentByOrderId(orderId: string
    return this.prisma.shipment.findUnique({
      where: { orderId },
      include: {
        logisticsProvider: {
          select: {
            id: true,
            name: true,
            contactInfo: true,
          },
        },
      },
    });
  }

  async getShipmentByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
    return this.prisma.shipment.findUnique({
      where: { trackingNumber },
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
    });
  }

  async async updateShipmentStatus(orderId: string
    id: string,
    status: string,
    notes?: string
  ): Promise<Shipment> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'shipped' && !updateData.shippedAt) {
      updateData.shippedAt = new Date();
    } else if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    return this.prisma.shipment.update({
      where: { id },
      data: updateData,
    });
  }

  // Tracking history functionality can be added when the model is available

  async updateTrackingNumber(id: string, trackingNumber: string): Promise<Shipment> {
    return this.prisma.shipment.update({
      where: { id },
      data: { trackingNumber },
    });
  }

  async updateEstimatedDelivery(id: string, estimatedDelivery: Date): Promise<Shipment> {
    return this.prisma.shipment.update({
      where: { id },
      data: { estimatedDelivery },
    });
  }

  async getShipmentsByStatus(status: string): Promise<Shipment[]> {
    return this.prisma.shipment.findMany({
      where: { status },
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
            seller: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
        carrier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShipmentsByProvider(providerId: string): Promise<Shipment[]> {
    return this.prisma.shipment.findMany({
      where: { providerId },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShipmentsForSeller(sellerId: string, status?: string): Promise<Shipment[]> {
    const where: any = {
      order: {
        sellerId,
      },
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.shipment.findMany({
      where,
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
        carrier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShipmentsForBuyer(buyerId: string, status?: string): Promise<Shipment[]> {
    const where: any = {
      order: {
        buyerId,
      },
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.shipment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            seller: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
        carrier: {
          select: {
            id: true,
            name: true,
          },
        },

      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDelayedShipments(): Promise<Shipment[]> {
    const now = new Date();
    
    return this.prisma.shipment.findMany({
      where: {
        status: {
          in: ['pending', 'picked_up', 'in_transit'],
        },
        estimatedDelivery: {
          lt: now,
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
                businessName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { estimatedDelivery: 'asc' },
    });
  }

  async getShipmentStats(): Promise<{
    total: number;
    pending: number;
    shipped: number;
    inTransit: number;
    delivered: number;
    delayed: number;
  }> {
    const [total, pending, shipped, inTransit, delivered, delayed] = await Promise.all([
      this.prisma.shipment.count(),
      this.prisma.shipment.count({ where: { status: 'pending' } }),
      this.prisma.shipment.count({ where: { status: 'shipped' } }),
      this.prisma.shipment.count({ where: { status: 'in_transit' } }),
      this.prisma.shipment.count({ where: { status: 'delivered' } }),
      this.getDelayedShipments().then(shipments => shipments.length),
    ]);

    return {
      total,
      pending,
      shipped,
      inTransit,
      delivered,
      delayed,
    };
  }

  async deleteShipment(id: string): Promise<void> {
    await this.prisma.shipment.delete({
      where: { id },
    });
  }
}

export const shipmentService = new ShipmentService(new PrismaClient());