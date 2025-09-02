import { PrismaClient, BulkQuote } from '@prisma/client';

export class BulkQuoteService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createBulkQuote(data: {
    bulkOrderId: string;
    sellerId: string;
    totalPrice: number;
    deliveryTimeline?: string;
    paymentTerms?: string;
    termsConditions?: string;
    validUntil?: Date;
  }): Promise<BulkQuote> {
    return this.prisma.bulkQuote.create({
      data: {
        bulkOrderId: data.bulkOrderId,
        sellerId: data.sellerId,
        totalPrice: data.totalPrice,
        deliveryTimeline: data.deliveryTimeline,
        paymentTerms: data.paymentTerms,
        termsConditions: data.termsConditions,
        validUntil: data.validUntil,
        status: 'pending',
      },
    });
  }

  async getBulkQuoteById(id: string): Promise<BulkQuote | null> {
    return this.prisma.bulkQuote.findUnique({
      where: { id },
      include: {
        bulkOrder: {
          include: {
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                email: true,
                phone: true,
                verificationTier: true,
              },
            },
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
            gstNumber: true,
            verificationTier: true,
          },
        },
      },
    });
  }

  async getBulkQuotesBySeller(sellerId: string, filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<BulkQuote[]> {
    return this.prisma.bulkQuote.findMany({
      where: {
        sellerId,
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
        bulkOrder: {
          select: {
            id: true,
            requestNumber: true,
            title: true,
            estimatedValue: true,
            buyer: {
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
    });
  }

  async getBulkQuotesByBulkOrder(bulkOrderId: string): Promise<BulkQuote[]> {
    return this.prisma.bulkQuote.findMany({
      where: { bulkOrderId },
      orderBy: [
        { status: 'asc' }, // Show accepted/pending first
        { totalPrice: 'asc' }, // Then by price
        { createdAt: 'desc' },
      ],
      include: {
        seller: {
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
      },
    });
  }

  async updateBulkQuoteStatus(id: string, status: string): Promise<BulkQuote> {
    const updateData: any = { status };
    
    if (status === 'accepted') {
      updateData.acceptedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
    }

    return this.prisma.bulkQuote.update({
      where: { id },
      data: updateData,
    });
  }

  async async updateBulkQuote(orderId: string
    id: string,
    data: Partial<{
      totalPrice: number;
      deliveryTimeline: string;
      paymentTerms: string;
      termsConditions: string;
      validUntil: Date;
    }>
  ): Promise<BulkQuote> {
    return this.prisma.bulkQuote.update({
      where: { id },
      data,
    });
  }

  async compareBulkQuotes(bulkOrderId: string): Promise<{
    quotes: BulkQuote[];
    comparison: {
      lowestPrice: number;
      highestPrice: number;
      averagePrice: number;
      priceRange: number;
      fastestDelivery: string | null;
      bestRatedSeller: any;
    };
  }> {
    const quotes = await this.getBulkQuotesByBulkOrder(bulkOrderId);
    
    if (quotes.length === 0) {
      return {
        quotes: [],
        comparison: {
          lowestPrice: 0,
          highestPrice: 0,
          averagePrice: 0,
          priceRange: 0,
          fastestDelivery: null,
          bestRatedSeller: null,
        },
      };
    }

    const prices = quotes.map(q => Number(q.totalPrice));
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Find fastest delivery (simplified - would need proper parsing)
    const fastestDelivery = quotes
      .filter(q => q.deliveryTimeline)
      .sort((a, b) => (a.deliveryTimeline || '').localeCompare(b.deliveryTimeline || ''))[0]
      ?.deliveryTimeline || null;

    // Best rated seller (would need to join with ratings)
    const bestRatedSeller = quotes[0]?.seller || null;

    return {
      quotes,
      comparison: {
        lowestPrice,
        highestPrice,
        averagePrice: Math.round(averagePrice),
        priceRange: highestPrice - lowestPrice,
        fastestDelivery,
        bestRatedSeller,
      },
    };
  }

  async getBulkQuoteStats(sellerId?: string): Promise<{
    totalQuotes: number;
    pendingQuotes: number;
    acceptedQuotes: number;
    rejectedQuotes: number;
    totalValue: number;
    acceptanceRate: number;
  }> {
    const where = sellerId ? { sellerId } : {};

    const [totalCount, statusCounts, totalValue] = await Promise.all([
      this.prisma.bulkQuote.count({ where }),
      this.prisma.bulkQuote.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.bulkQuote.aggregate({
        where: { ...where, status: 'accepted' },
        _sum: { totalPrice: true },
      }),
    ]);

    const statusMap = statusCounts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    const acceptedCount = statusMap['accepted'] || 0;
    const acceptanceRate = totalCount > 0 ? (acceptedCount / totalCount) * 100 : 0;

    return {
      totalQuotes: totalCount,
      pendingQuotes: statusMap['pending'] || 0,
      acceptedQuotes: acceptedCount,
      rejectedQuotes: statusMap['rejected'] || 0,
      totalValue: Number(totalValue._sum.totalPrice || 0),
      acceptanceRate: Math.round(acceptanceRate),
    };
  }

  async getExpiringBulkQuotes(days: number = 3): Promise<BulkQuote[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    return this.prisma.bulkQuote.findMany({
      where: {
        status: 'pending',
        validUntil: {
          lte: expiryDate,
          gt: new Date(),
        },
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true,
          },
        },
        bulkOrder: {
          select: {
            id: true,
            requestNumber: true,
            title: true,
          },
        },
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  async withdrawBulkQuote(id: string): Promise<BulkQuote> {
    return this.prisma.bulkQuote.update({
      where: { id },
      data: { status: 'withdrawn' },
    });
  }
}

export const bulkQuoteService = new BulkQuoteService(new PrismaClient());