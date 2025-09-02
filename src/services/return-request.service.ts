/**
 * Return Request Service
 * Manages return requests through shipments with proper schema alignment
 */

import { PrismaClient, Shipment } from '@prisma/client';

export class ReturnRequestService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a return request
   */
  async createReturnRequest(data: {
    orderId: string;
    reason: string;
    description?: string;
    requestedBy: string;
  }): Promise<Shipment> {
    try {
      // Find the shipment for this order
      const shipment = await this.prisma.shipment.findUnique({
        where: { orderId: data.orderId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              status: true,
            },
          },
        },
      });

      if (!shipment) {
        throw new Error('Shipment not found for this order');
      }

      if (shipment.returnRequested) {
        throw new Error('Return already requested for this shipment');
      }

      // Update shipment with return request
      return await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          returnRequested: true,
          returnReason: `${data.reason}: ${data.description || ''}`.trim(),
          updatedAt: new Date(),
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
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
      console.error('Error creating return request:', error);
      throw new Error('Failed to create return request');
    }
  }

  /**
   * Get return request by shipment ID
   */
  async getReturnRequestById(shipmentId: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
        where: { 
          id: shipmentId,
          returnRequested: true,
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
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
      console.error('Error fetching return request:', error);
      throw new Error('Failed to fetch return request');
    }
  }

  /**
   * Get return request by order ID
   */
  async getReturnRequestByOrderId(orderId: string): Promise<Shipment | null> {
    try {
      return await this.prisma.shipment.findUnique({
        where: { 
          orderId,
          returnRequested: true,
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
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
      console.error('Error fetching return request by order:', error);
      throw new Error('Failed to fetch return request by order');
    }
  }

  /**
   * Get all return requests with pagination
   */
  async getAllReturnRequests(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      sellerId?: string;
      buyerId?: string;
    }
  ): Promise<{
    returnRequests: Shipment[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = { returnRequested: true };

      if (filters?.status) where.status = filters.status;
      if (filters?.sellerId) {
        where.order = { sellerId: filters.sellerId };
      }
      if (filters?.buyerId) {
        where.order = { buyerId: filters.buyerId };
      }

      const [returnRequests, total] = await Promise.all([
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
                status: true,
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
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.shipment.count({ where }),
      ]);

      return {
        returnRequests,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching return requests:', error);
      throw new Error('Failed to fetch return requests');
    }
  }

  /**
   * Update return request status
   */
  async updateReturnStatus(
    shipmentId: string,
    status: string,
    notes?: string
  ): Promise<Shipment> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (notes) {
        const currentShipment = await this.prisma.shipment.findUnique({
          where: { id: shipmentId },
          select: { returnReason: true },
        });

        if (currentShipment?.returnReason) {
          updateData.returnReason = `${currentShipment.returnReason}\n\nUpdate: ${notes}`;
        } else {
          updateData.returnReason = notes;
        }
      }

      return await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: updateData,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              status: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error updating return status:', error);
      throw new Error('Failed to update return status');
    }
  }

  /**
   * Approve return request
   */
  async approveReturn(shipmentId: string, notes?: string): Promise<Shipment> {
    try {
      return await this.updateReturnStatus(shipmentId, 'return_approved', notes);
    } catch (error) {
      console.error('Error approving return:', error);
      throw new Error('Failed to approve return');
    }
  }

  /**
   * Reject return request
   */
  async rejectReturn(shipmentId: string, reason: string): Promise<Shipment> {
    try {
      return await this.updateReturnStatus(shipmentId, 'return_rejected', reason);
    } catch (error) {
      console.error('Error rejecting return:', error);
      throw new Error('Failed to reject return');
    }
  }

  /**
   * Process return (mark as returned)
   */
  async processReturn(shipmentId: string, notes?: string): Promise<Shipment> {
    try {
      return await this.updateReturnStatus(shipmentId, 'returned', notes);
    } catch (error) {
      console.error('Error processing return:', error);
      throw new Error('Failed to process return');
    }
  }

  /**
   * Get return statistics
   */
  async getReturnStats(sellerId?: string): Promise<{
    totalReturns: number;
    pendingReturns: number;
    approvedReturns: number;
    rejectedReturns: number;
    processedReturns: number;
    returnRate: number;
    totalOrders: number;
  }> {
    try {
      const orderWhere = sellerId ? { sellerId } : {};
      const returnWhere = sellerId 
        ? { returnRequested: true, order: { sellerId } }
        : { returnRequested: true };

      const [
        totalReturns,
        pendingReturns,
        approvedReturns,
        rejectedReturns,
        processedReturns,
        totalOrders,
      ] = await Promise.all([
        this.prisma.shipment.count({ where: returnWhere }),
        this.prisma.shipment.count({ 
          where: { ...returnWhere, status: 'return_requested' } 
        }),
        this.prisma.shipment.count({ 
          where: { ...returnWhere, status: 'return_approved' } 
        }),
        this.prisma.shipment.count({ 
          where: { ...returnWhere, status: 'return_rejected' } 
        }),
        this.prisma.shipment.count({ 
          where: { ...returnWhere, status: 'returned' } 
        }),
        this.prisma.order.count({ where: orderWhere }),
      ]);

      const returnRate = totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0;

      return {
        totalReturns,
        pendingReturns,
        approvedReturns,
        rejectedReturns,
        processedReturns,
        returnRate: Math.round(returnRate * 100) / 100,
        totalOrders,
      };
    } catch (error) {
      console.error('Error fetching return stats:', error);
      throw new Error('Failed to fetch return stats');
    }
  }

  /**
   * Cancel return request
   */
  async cancelReturnRequest(shipmentId: string): Promise<Shipment> {
    try {
      return await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          returnRequested: false,
          returnReason: null,
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
      console.error('Error canceling return request:', error);
      throw new Error('Failed to cancel return request');
    }
  }

  /**
   * Check if return is eligible
   */
  async checkReturnEligibility(orderId: string): Promise<{
    eligible: boolean;
    reason: string;
    daysLeft?: number;
  }> {
    try {
      const shipment = await this.prisma.shipment.findUnique({
        where: { orderId },
        select: {
          status: true,
          deliveredAt: true,
          returnRequested: true,
        },
      });

      if (!shipment) {
        return { eligible: false, reason: 'Shipment not found' };
      }

      if (shipment.returnRequested) {
        return { eligible: false, reason: 'Return already requested' };
      }

      if (shipment.status !== 'delivered') {
        return { eligible: false, reason: 'Order must be delivered to request return' };
      }

      if (!shipment.deliveredAt) {
        return { eligible: false, reason: 'Delivery date not available' };
      }

      // Check if within return window (e.g., 7 days)
      const returnWindowDays = 7;
      const deliveryDate = new Date(shipment.deliveredAt);
      const currentDate = new Date();
      const daysSinceDelivery = Math.floor(
        (currentDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceDelivery > returnWindowDays) {
        return { 
          eligible: false, 
          reason: `Return window expired. Returns must be requested within ${returnWindowDays} days of delivery.` 
        };
      }

      const daysLeft = returnWindowDays - daysSinceDelivery;
      return { 
        eligible: true, 
        reason: 'Eligible for return',
        daysLeft: Math.max(0, daysLeft)
      };
    } catch (error) {
      console.error('Error checking return eligibility:', error);
      throw new Error('Failed to check return eligibility');
    }
  }
}

export const returnRequestService = new ReturnRequestService();