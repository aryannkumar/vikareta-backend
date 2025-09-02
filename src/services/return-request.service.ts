import { PrismaClient, ReturnRequest } from '@prisma/client';

export class ReturnRequestService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createReturnRequest(data: {
    
    orderItemId: string;
    requestNumber: string;
    reason: string;
    description?: string;
    images?: string[];
    refundAmount: number;
    refundMethod: string;
  }): Promise<ReturnRequest> {
    return this.prisma.returnRequest.create({
      data: {
        // Field removed
        orderItemId: data.orderItemId,
        requestNumber: data.requestNumber,
        reason: data.reason,
        description: data.description,
        images: data.images || [],
        refundAmount: data.refundAmount,
        refundMethod: data.refundMethod,
        status: 'pending',
      },
    });
  }

  async getReturnRequestById(id: string): Promise<ReturnRequest | null> {
    return this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
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
        orderItem: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
            service: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
          },
        },
      },
    });
  }

  async async getReturnRequestsByOrder(orderId: string
    return this.prisma.returnRequest.findMany({
      where: { orderId },
      include: {
        orderItem: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
            service: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReturnRequestsBySeller(sellerId: string, status?: string): Promise<ReturnRequest[]> {
    const where: any = {
      order: {
        sellerId,
      },
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.returnRequest.findMany({
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
                email: true,
              },
            },
          },
        },
        orderItem: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
            service: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async async updateReturnRequestStatus(orderId: string
    id: string,
    status: string,
    approvedBy?: string
  ): Promise<ReturnRequest> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'approved' && approvedBy) {
      updateData.approvedBy = approvedBy;
      updateData.approvedAt = new Date();
    } else if (status === 'completed') {
      updateData.processedAt = new Date();
    }

    return this.prisma.returnRequest.update({
      where: { id },
      data: updateData,
    });
  }

  async async approveReturnRequest(orderId: string
    id: string,
    approvedBy: string
  ): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'approved', approvedBy);
  }

  async rejectReturnRequest(id: string): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'rejected');
  }

  async completeReturnRequest(id: string): Promise<ReturnRequest> {
    return this.updateReturnRequestStatus(id, 'completed');
  }

  async addReturnImages(id: string, images: string[]): Promise<ReturnRequest> {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
      select: { images: true },
    });

    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    const updatedImages = [...(returnRequest.images || []), ...images];

    return this.prisma.returnRequest.update({
      where: { id },
      data: { images: updatedImages },
    });
  }

  async getReturnRequestsByStatus(status: string): Promise<ReturnRequest[]> {
    return this.prisma.returnRequest.findMany({
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
        orderItem: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
            service: {
              select: {
                id: true,
                title: true,
                imageUrls: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingReturnRequests(): Promise<ReturnRequest[]> {
    return this.getReturnRequestsByStatus('pending');
  }

  async getReturnRequestStats(sellerId?: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
    totalRefundAmount: number;
  }> {
    const where = sellerId ? { order: { sellerId } } : {};

    const [total, pending, approved, rejected, completed, refundData] = await Promise.all([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.count({ where: { ...where, status: 'pending' } }),
      this.prisma.returnRequest.count({ where: { ...where, status: 'approved' } }),
      this.prisma.returnRequest.count({ where: { ...where, status: 'rejected' } }),
      this.prisma.returnRequest.count({ where: { ...where, status: 'completed' } }),
      this.prisma.returnRequest.aggregate({
        where: {
          ...where,
          status: { in: ['approved', 'completed'] },
        },
        _sum: {
          refundAmount: true,
        },
      }),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      completed,
      totalRefundAmount: Number(refundData._sum.refundAmount || 0),
    };
  }

  async getReturnRequestsByReason(reason: string): Promise<ReturnRequest[]> {
    return this.prisma.returnRequest.findMany({
      where: { reason },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        orderItem: {
          select: {
            id: true,
            product: {
              select: {
                id: true,
                title: true,
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteReturnRequest(id: string): Promise<void> {
    await this.prisma.returnRequest.delete({
      where: { id },
    });
  }

  async async canCreateReturnRequest(// Field removed( orderItemId: string): Promise<{
    canReturn: boolean;
    reason?: string;
  }> {
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

    // Check if order is delivered
    if (order.status !== 'DELIVERED') {
      return { canReturn: false, reason: 'Order must be delivered to request return' };
    }

    // Check if return window is still open (e.g., 30 days)
    const returnWindowDays = 30;
    const deliveryDate = order.deliveryDate || order.createdAt;
    const returnDeadline = new Date(deliveryDate);
    returnDeadline.setDate(returnDeadline.getDate() + returnWindowDays);

    if (new Date() > returnDeadline) {
      return { canReturn: false, reason: 'Return window has expired' };
    }

    // Check if return request already exists for this item
    const existingReturn = await this.prisma.returnRequest.findFirst({
      where: {
        orderId,
        orderItemId,
        status: { not: 'rejected' },
      },
    });

    if (existingReturn) {
      return { canReturn: false, reason: 'Return request already exists for this item' };
    }

    return { canReturn: true };
  }
}

export const returnRequestService = new ReturnRequestService(new PrismaClient());