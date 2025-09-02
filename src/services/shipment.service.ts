/**
 * Shipment Service
 * Manages shipments and delivery tracking with proper schema alignment
 */

import { PrismaClient, Shipment } from '@prisma/client';

export class ShipmentService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new shipment
   */
  async createShipment(data: {
    orderId: string;
    providerId?: string;
    trackingNumber?: string;
    carrier?: string;
    pickupAddress?: any;
    deliveryAddress?: any;
    packageDetails?: any;
    shippingCost?: number;
    service?: string;
    provider?: string;
    estimatedDelivery?: Date;
  }): Promise<Shipment> {
    try {
      return await this.prisma.shipment.create({
        data: {
          orderId: data.orderId,
          providerId: data.providerId,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          status: 'pending',
          pickupAddress: data.pickupAddress,
          deliveryAddress: data.deliveryAddress,
          packageDetails: data.packageDetails,
          shippingCost: data.shippingCost,
          service: data.service,
          provider: data.provider,
          estimatedDelivery: data.estimatedDelivery,
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
            },
          },
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error creating shipment:', error);
      throw new Error('Failed to create shipment');
    }
  }

  /**
   * Get shipment by ID
   */
  async getShipmentById(id: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
        where: { id },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching shipment:', error);
      throw new Error('Failed to fetch shipment');
    }
  }

  /**
   * Get shipment by order ID
   */
  async getShipmentByOrderId(orderId: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
        where: { orderId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
            },
          },
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching shipment by order:', error);
      throw new Error('Failed to fetch shipment by order');
    }
  }

  /**
   * Update shipment status
   */
  async updateShipmentStatus(
    id: string,
    status: string,
    trackingData?: {
      trackingNumber?: string;
      carrier?: string;
      shippedAt?: Date;
      deliveredAt?: Date;
      deliveryProof?: string;
      actualDelivery?: Date;
    }
  ): Promise<Shipment> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (trackingData) {
        if (trackingData.trackingNumber) updateData.trackingNumber = trackingData.trackingNumber;
        if (trackingData.carrier) updateData.carrier = trackingData.carrier;
        if (trackingData.shippedAt) updateData.shippedAt = trackingData.shippedAt;
        if (trackingData.deliveredAt) updateData.deliveredAt = trackingData.deliveredAt;
        if (trackingData.deliveryProof) updateData.deliveryProof = trackingData.deliveryProof;
        if (trackingData.actualDelivery) updateData.actualDelivery = trackingData.actualDelivery;
      }

      return await this.prisma.shipment.update({
        where: { id },
        data: updateData,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
            },
          },
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error updating shipment status:', error);
      throw new Error('Failed to update shipment status');
    }
  }

  /**
   * Get shipments by status
   */
  async getShipmentsByStatus(status: string): Promise<Shipment[]> {
    try {
      return await this.prisma.shipment.findMany({
        where: { status },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
            },
          },
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching shipments by status:', error);
      throw new Error('Failed to fetch shipments by status');
    }
  }

  /**
   * Get shipments by provider
   */
  async getShipmentsByProvider(providerId: string): Promise<Shipment[]> {
    try {
      return await this.prisma.shipment.findMany({
        where: { providerId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
            },
          },
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching shipments by provider:', error);
      throw new Error('Failed to fetch shipments by provider');
    }
  }

  /**
   * Track shipment by tracking number
   */
  async trackShipment(trackingNumber: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
        where: { trackingNumber },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              totalAmount: true,
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
              code: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error tracking shipment:', error);
      throw new Error('Failed to track shipment');
    }
  }

  /**
   * Request return
   */
  async requestReturn(
    id: string,
    returnReason: string
  ): Promise<Shipment> {
    try {
      return await this.prisma.shipment.update({
        where: { id },
        data: {
          returnRequested: true,
          returnReason,
          updatedAt: new Date(),
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error requesting return:', error);
      throw new Error('Failed to request return');
    }
  }

  /**
   * Get shipment statistics
   */
  async getShipmentStats(providerId?: string): Promise<{
    total: number;
    pending: number;
    shipped: number;
    delivered: number;
    returned: number;
    avgDeliveryTime: number;
    totalShippingCost: number;
  }> {
    try {
      const where = providerId ? { providerId } : {};

      const [
        total,
        pending,
        shipped,
        delivered,
        returned,
        shippingCostSum,
        deliveredShipments
      ] = await Promise.all([
        this.prisma.shipment.count({ where }),
        this.prisma.shipment.count({ where: { ...where, status: 'pending' } }),
        this.prisma.shipment.count({ where: { ...where, status: 'shipped' } }),
        this.prisma.shipment.count({ where: { ...where, status: 'delivered' } }),
        this.prisma.shipment.count({ where: { ...where, returnRequested: true } }),
        this.prisma.shipment.aggregate({
          where,
          _sum: { shippingCost: true },
        }),
        this.prisma.shipment.findMany({
          where: {
            ...where,
            status: 'delivered',
            shippedAt: { not: null },
            deliveredAt: { not: null },
          },
          select: {
            shippedAt: true,
            deliveredAt: true,
          },
        }),
      ]);

      // Calculate average delivery time
      let avgDeliveryTime = 0;
      if (deliveredShipments.length > 0) {
        const totalDeliveryTime = deliveredShipments.reduce((sum, shipment) => {
          if (shipment.shippedAt && shipment.deliveredAt) {
            const deliveryTime = shipment.deliveredAt.getTime() - shipment.shippedAt.getTime();
            return sum + (deliveryTime / (1000 * 60 * 60 * 24)); // Convert to days
          }
          return sum;
        }, 0);
        avgDeliveryTime = totalDeliveryTime / deliveredShipments.length;
      }

      return {
        total,
        pending,
        shipped,
        delivered,
        returned,
        avgDeliveryTime: Math.round(avgDeliveryTime * 100) / 100,
        totalShippingCost: Number(shippingCostSum._sum.shippingCost || 0),
      };
    } catch (error) {
      console.error('Error fetching shipment stats:', error);
      throw new Error('Failed to fetch shipment stats');
    }
  }

  /**
   * Generate AWB number
   */
  async generateAwbNumber(shipmentId: string): Promise<string> {
    try {
      const shipment = await this.getShipmentById(shipmentId);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      // Generate AWB number (Air Waybill)
      const prefix = 'AWB';
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const awbNumber = `${prefix}${timestamp}${random}`;

      // Update shipment with AWB number
      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: { awbNumber },
      });

      return awbNumber;
    } catch (error) {
      console.error('Error generating AWB number:', error);
      throw new Error('Failed to generate AWB number');
    }
  }

  /**
   * Update package details
   */
  async updatePackageDetails(
    id: string,
    packageDetails: any
  ): Promise<Shipment> {
    try {
      return await this.prisma.shipment.update({
        where: { id },
        data: {
          packageDetails,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error updating package details:', error);
      throw new Error('Failed to update package details');
    }
  }

  /**
   * Get shipments with pagination
   */
  async getShipments(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      providerId?: string;
      carrier?: string;
    }
  ): Promise<{
    shipments: Shipment[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (filters?.status) where.status = filters.status;
      if (filters?.providerId) where.providerId = filters.providerId;
      if (filters?.carrier) where.carrier = filters.carrier;

      const [shipments, total] = await Promise.all([
        this.prisma.shipment.findMany({
          where,
          skip,
          take: limit,
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                buyerId: true,
                sellerId: true,
                totalAmount: true,
              },
            },
            logisticsProvider: {
              select: {
                id: true,
                name: true,
                displayName: true,
                code: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.shipment.count({ where }),
      ]);

      return {
        shipments,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching shipments:', error);
      throw new Error('Failed to fetch shipments');
    }
  }
}

export const shipmentService = new ShipmentService();