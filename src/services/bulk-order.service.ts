import { PrismaClient, BulkOrder } from '@prisma/client';

export class BulkOrderService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createBulkOrder(data: {
    buyerId: string;
    title: string;
    description?: string;
    items: any;
    estimatedValue: number;
    deliverySchedule: any;
    paymentTerms?: string;
    expiresAt?: Date;
  }): Promise<BulkOrder> {
    const requestNumber = await this.generateBulkOrderNumber();
    
    return this.prisma.bulkOrder.create({
      data: {
        buyerId: data.buyerId,
        requestNumber,
        title: data.title,
        description: data.description,
        items: data.items,
        estimatedValue: data.estimatedValue,
        deliverySchedule: data.deliverySchedule,
        paymentTerms: data.paymentTerms || 'net30',
        status: 'draft',
        expiresAt: data.expiresAt,
      },
    });
  }

  async getBulkOrderById(id: string): Promise<BulkOrder | null> {
    return this.prisma.bulkOrder.findUnique({
      where: { id },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
            gstNumber: true,
            verificationTier: true,
          },
        },
        bulkQuotes: {
          include: {
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                verificationTier: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getBulkOrdersByBuyer(buyerId: string, filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<BulkOrder[]> {
    return this.prisma.bulkOrder.findMany({
      where: {
        buyerId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            bulkQuotes: true,
          },
        },
      },
    });
  }

  async searchBulkOrders(filters: {
    query?: string;
    status?: string;
    minQuantity?: number;
    maxQuantity?: number;
    location?: string;
    excludeBuyerId?: string;
  }): Promise<BulkOrder[]> {
    return this.prisma.bulkOrder.findMany({
      where: {
        status: 'active',
        expiresAt: { gt: new Date() },
        ...(filters.excludeBuyerId && {
          buyerId: { not: filters.excludeBuyerId },
        }),
        ...(filters.status && { status: filters.status }),
        ...(filters.minQuantity && {
          estimatedValue: { gte: filters.minQuantity },
        }),
        ...(filters.maxQuantity && {
          estimatedValue: { lte: filters.maxQuantity },
        }),
        ...(filters.query && {
          OR: [
            { title: { contains: filters.query, mode: 'insensitive' } },
            { description: { contains: filters.query, mode: 'insensitive' } },
            { description: { contains: filters.query, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            city: true,
            state: true,
          },
        },
        _count: {
          select: {
            bulkQuotes: true,
          },
        },
      },
    });
  }

  async updateBulkOrderStatus(id: string, status: string): Promise<BulkOrder> {
    const updateData: any = { status };
    
    if (status === 'closed') {
      updateData.closedAt = new Date();
    }

    return this.prisma.bulkOrder.update({
      where: { id },
      data: updateData,
    });
  }

  async extendBulkOrderExpiry(id: string, newExpiryDate: Date): Promise<BulkOrder> {
    return this.prisma.bulkOrder.update({
      where: { id },
      data: { expiresAt: newExpiryDate },
    });
  }

  async getBulkOrderStats(buyerId?: string): Promise<{
    totalOrders: number;
    activeOrders: number;
    closedOrders: number;
    totalQuotesReceived: number;
    avgQuotesPerOrder: number;
  }> {
    const where = buyerId ? { buyerId } : {};

    const [totalCount, statusCounts, quotesCount] = await Promise.all([
      this.prisma.bulkOrder.count({ where }),
      this.prisma.bulkOrder.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.bulkQuote.count({
        where: {
          bulkOrder: where.buyerId ? { buyerId: where.buyerId } : {},
        },
      }),
    ]);

    const statusMap = statusCounts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalOrders: totalCount,
      activeOrders: statusMap['active'] || 0,
      closedOrders: statusMap['closed'] || 0,
      totalQuotesReceived: quotesCount,
      avgQuotesPerOrder: totalCount > 0 ? Math.round(quotesCount / totalCount) : 0,
    };
  }

  async getExpiringBulkOrders(days: number = 3): Promise<BulkOrder[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    return this.prisma.bulkOrder.findMany({
      where: {
        status: 'active',
        expiresAt: {
          lte: expiryDate,
          gt: new Date(),
        },
      },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true,
          },
        },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  private async generateBulkOrderNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const lastOrder = await this.prisma.bulkOrder.findFirst({
      where: {
        requestNumber: {
          startsWith: `BLK-${currentYear}${currentMonth}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.requestNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `BLK-${currentYear}${currentMonth}-${String(sequence).padStart(4, '0')}`;
  }
}

export const bulkOrderService = new BulkOrderService(new PrismaClient());