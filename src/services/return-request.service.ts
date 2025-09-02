/**
 * Return Request Service
 * Manages return requests with proper schema alignment
 */

import { PrismaClient, ReturnRequest } from '@prisma/client';

export class ReturnRequestService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new return request
   */
  async createReturnRequest(data: {
    orderId: string;
    reason: string;
    description?: string;
    requestedAmount?: number;
    images?: string[];
  }): Promise<ReturnRequest> {
    try {
      return await this.prisma.returnRequest.create({
        data: {
          orderId: data.orderId,
          reason: data.reason,
          description: data.description,
          requestedAmount: data.requestedAmount || 0,
          images: data.images || [],
          status: 'pending',
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
        },
      });
    } catch (error) {
      console.error('Error creating return request:', error);
      throw new Error('Failed to create return request');
    }
  }

  /**
   * Get return request by ID
   */
  async getReturnRequestById(id: string): Promise<ReturnRequest | null> {
    try {
      return await this.prisma.returnRequest.findUnique({
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
        },
      });
    } catch (error) {
      console.error('Error fetching return request:', error);
      throw new Error('Failed to fetch return request');
    }
  }

  /**
   * Get return requests by order
   */
  async getReturnRequestsByOrder(orderId: string): Promise<ReturnRequest[]> {
    try {
      return await this.prisma.returnRequest.findMany({
        where: { orderId },
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
      console.error('Error fetching return requests by order:', error);
      throw new Error('Failed to fetch return requests by order');
    }
  }

  /**
   * Get return requests by seller
   */
  async getReturnRequestsBySeller(sellerId: string, status?: string): Promise<ReturnRequest[]> {
    try {
      const where: any = {
        order: { sellerId },
      };

      if (status) {
        where.status = status;
      }

      return await this.prisma.returnRequest.findMany({
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
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching return requests by seller:', error);
      throw new Error('Failed to fetch return requests by seller');
    }
  }

  /**
   * Update return request status
   */
  async updateReturnRequestStatus(
    id: string,
    status: string,
    approvedBy?: string
  ): Promise<ReturnRequest> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'approved' && approvedBy) {
        updateData.approvedBy = approvedBy;
        updateData.approvedAt = new Date();
      } else if (status === 'completed') {
        updateData.completedAt = new Date();
      }

      return await this.prisma.returnRequest.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      console.error('Error updating return request status:', error);
      throw new Error('Failed to update return request status');
    }
  }

  /**
   * Approve return request
   */
  async approveReturnRequest(
    id: string,
    approvedBy: string
  ): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'approved', approvedBy);
  }

  /**
   * Reject return request
   */
  async rejectReturnRequest(id: string): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'rejected');
  }

  /**
   * Complete return request
   */
  async completeReturnRequest(id: string): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'completed');
  }

  /**
   * Add images to return request
   */
  async addReturnImages(id: string, images: string[]): Promise<ReturnRequest> {
    try {
      const returnRequest = await this.prisma.returnRequest.findUnique({
        where: { id },
        select: { images: true },
      });

      if (!returnRequest) {
        throw new Error('Return request not found');
      }

      const updatedImages = [...(returnRequest.images || []), ...images];

      return await this.prisma.returnRequest.update({
        where: { id },
        data: { images: updatedImages },
      });
    } catch (error) {
      console.error('Error adding return images:', error);
      throw new Error('Failed to add return images');
    }
  }

  /**
   * Get return requests by status
   */
  async getReturnRequestsByStatus(status: string): Promise<ReturnRequest[]> {
    try {
      return await this.prisma.returnRequest.findMany({
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
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching return requests by status:', error);
      throw new Error('Failed to fetch return requests by status');
    }
  }

  /**
   * Get pending return requests
   */
  async getPendingReturnRequests(): Promise<ReturnRequest[]> {
    return this.getReturnRequestsByStatus('pending');
  }

  /**
   * Get return request statistics
   */
  async getReturnRequestStats(sellerId?: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
    totalRefundAmount: number;
  }> {
    try {
      const where = sellerId ? { order: { sellerId } } : {};

      const [total, pending, approved, rejected, completed, refundData] = await Promise.all([
        this.prisma.returnRequest.count({ where }),
        this.prisma.returnRequest.count({ where: { ...where, status: 'pending' } }),
        this.prisma.returnRequest.count({ where: { ...where, status: 'approved' } }),
        this.prisma.returnRequest.count({ where: { ...where, status: 'rejected' } }),
        this.prisma.returnRequest.count({ where: { ...where, status: 'completed' } }),
        this.prisma.returnRequest.aggregate({
          where: { ...where, status: 'completed' },
          _sum: { requestedAmount: true },
        }),
      ]);

      return {
        total,
        pending,
        approved,
        rejected,
        completed,
        totalRefundAmount: refundData._sum.requestedAmount || 0,
      };
    } catch (error) {
      console.error('Error fetching return request stats:', error);
      throw new Error('Failed to fetch return request stats');
    }
  }

  /**
   * Get return requests by reason
   */
  async getReturnRequestsByReason(reason: string): Promise<ReturnRequest[]> {
    try {
      return await this.prisma.returnRequest.findMany({
        where: { reason },
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
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching return requests by reason:', error);
      throw new Error('Failed to fetch return requests by reason');
    }
  }

  /**
   * Delete return request
   */
  async deleteReturnRequest(id: string): Promise<void> {
    try {
      await this.prisma.returnRequest.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting return request:', error);
      throw new Error('Failed to delete return request');
    }
  }

  /**
   * Check if return request can be created
   */
  async canCreateReturnRequest(orderId: string): Promise<{
    canReturn: boolean;
    reason?: string;
  }> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          createdAt: true,
          deliveryDate: true,
        },
      });

      if (!order) {
        return { canReturn: false, reason: 'Order not found' };
      }

      if (order.status !== 'DELIVERED') {
        return { canReturn: false, reason: 'Order must be delivered to create return request' };
      }

      // Check if return window is still open (e.g., 30 days)
      const returnWindowDays = 30;
      const deliveryDate = order.deliveryDate || order.createdAt;
      const returnDeadline = new Date(deliveryDate);
      returnDeadline.setDate(returnDeadline.getDate() + returnWindowDays);

      if (new Date() > returnDeadline) {
        return { canReturn: false, reason: 'Return window has expired' };
      }

      // Check if return request already exists
      const existingReturn = await this.prisma.returnRequest.findFirst({
        where: { orderId },
      });

      if (existingReturn) {
        return { canReturn: false, reason: 'Return request already exists for this order' };
      }

      return { canReturn: true };
    } catch (error) {
      console.error('Error checking return eligibility:', error);
      throw new Error('Failed to check return eligibility');
    }
  }
}

export const returnRequestService = new ReturnRequestService();