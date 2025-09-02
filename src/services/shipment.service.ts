/**
 * Shipment Service
 * Manages shipments with proper schema alignment
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
    estimatedDelivery?: Date;
    shippingAddress: any;
    packageDetails?: any;
  }): Promise<Shipment> {
    try {
      return await this.prisma.shipment.create({
        data: {
          orderId: data.orderId,
          providerId: data.providerId,
          trackingNumber: data.trackingNumber,
          status: 'pending',
          estimatedDelivery: data.estimatedDelivery,
          shippingAddress: data.shippingAddress,
          packageDetails: data.packageDetails || {},
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
              seller: {
                select: {
                  id: true,
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
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
   * Get shipment by tracking number
   */
  async getShipmentByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
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
              seller: {
                select: {
                  id: true,
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
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching shipment by tracking number:', error);
      throw new Error('Failed to fetch shipment by tracking number');
    }
  }

  /**
   * Update shipment status
   */
  async updateShipmentStatus(
    id: string,
    status: string,
    notes?: string
  ): Promise<Shipment> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (notes) updateData.notes = notes;

      if (status === 'shipped' && !updateData.shippedAt) {
        updateData.shippedAt = new Date();
      } else if (status === 'delivered') {
        updateData.deliveredAt = new Date();
      }

      return await this.prisma.shipment.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      console.error('Error updating shipment status:', error);
      throw new Error('Failed to update shipment status');
    }
  }

  /**
   * Update tracking number
   */
  async updateTrackingNumber(id: string, trackingNumber: string): Promise<Shipment> {
    try {
      return await this.prisma.shipment.update({
        where: { id },
        data: { trackingNumber },
      });
    } catch (error) {
      console.error('Error updating tracking number:', error);
      throw new Error('Failed to update tracking number');
    }
  }

  /**
   * Update estimated delivery
   */
  async updateEstimatedDelivery(id: string, estimatedDelivery: Date): Promise<Shipment> {
    try {
      return await this.prisma.shipment.update({
        where: { id },
        data: { estimatedDelivery },
      });
    } catch (error) {
      console.error('Error updating estimated delivery:', error);
      throw new Error('Failed to update estimated delivery');
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
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
   * Get shipments for seller
   */
  async getShipmentsForSeller(sellerId: string, status?: string): Promise<Shipment[]> {
    try {
      const where: any = {
        order: { sellerId },
      };

      if (status) {
        where.status = status;
      }

      return await this.prisma.shipment.findMany({
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching shipments for seller:', error);
      throw new Error('Failed to fetch shipments for seller');
    }
  }

  /**
   * Get shipments for buyer
   */
  async getShipmentsForBuyer(buyerId: string, status?: string): Promise<Shipment[]> {
    try {
      const where: any = {
        order: { buyerId },
      };

      if (status) {
        where.status = status;
      }

      return await this.prisma.shipment.findMany({
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching shipments for buyer:', error);
      throw new Error('Failed to fetch shipments for buyer');
    }
  }

  /**
   * Get delayed shipments
   */
  async getDelayedShipments(): Promise<Shipment[]> {
    try {
      const now = new Date();

      return await this.prisma.shipment.findMany({
        where: {
          status: {
            in: ['pending', 'shipped', 'in_transit'],
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
          logisticsProvider: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: { estimatedDelivery: 'asc' },
      });
    } catch (error) {
      console.error('Error fetching delayed shipments:', error);
      throw new Error('Failed to fetch delayed shipments');
    }
  }

  /**
   * Get shipment statistics
   */
  async getShipmentStats(): Promise<{
    total: number;
    pending: number;
    shipped: number;
    inTransit: number;
    delivered: number;
    delayed: number;
  }> {
    try {
      const [total, pending, shipped, inTransit, delivered, delayed] = await Promise.all([
        this.prisma.shipment.count(),
        this.prisma.shipment.count({ where: { status: 'pending' } }),
        this.prisma.shipment.count({ where: { status: 'shipped' } }),
        this.prisma.shipment.count({ where: { status: 'in_transit' } }),
        this.prisma.shipment.count({ where: { status: 'delivered' } }),
        this.prisma.shipment.count({
          where: {
            status: { in: ['pending', 'shipped', 'in_transit'] },
            estimatedDelivery: { lt: new Date() },
          },
        }),
      ]);

      return { total, pending, shipped, inTransit, delivered, delayed };
    } catch (error) {
      console.error('Error fetching shipment stats:', error);
      throw new Error('Failed to fetch shipment stats');
    }
  }

  /**
   * Delete shipment
   */
  async deleteShipment(id: string): Promise<void> {
    try {
      await this.prisma.shipment.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting shipment:', error);
      throw new Error('Failed to delete shipment');
    }
  }
}

export const shipmentService = new ShipmentService();