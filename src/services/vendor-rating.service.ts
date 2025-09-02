import { PrismaClient, VendorRating } from '@prisma/client';

export class VendorRatingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createVendorRating(data: {
    vendorId: string;
    raterId: string;
    orderId?: string;
    rating: number;
    qualityRating?: number;
    deliveryRating?: number;
    serviceRating?: number;
    communicationRating?: number;
    comment?: string;
    wouldRecommend?: boolean;
  }): Promise<VendorRating> {
    return this.prisma.vendorRating.create({
      data: {
        vendorId: data.vendorId,
        raterId: data.raterId,
        // Field removed
        rating: data.rating,
        qualityRating: data.qualityRating,
        deliveryRating: data.deliveryRating,
        serviceRating: data.serviceRating,
        communicationRating: data.communicationRating,
        comment: data.comment,
        wouldRecommend: data.wouldRecommend ?? true,
        isVerified: false,
      },
    });
  }

  async getVendorRatingById(id: string): Promise<VendorRating | null> {
    return this.prisma.vendorRating.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
        rater: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
          },
        },
      },
    });
  }

  async getVendorRatings(vendorId: string, filters?: {
    minRating?: number;
    maxRating?: number;
    verified?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<VendorRating[]> {
    return this.prisma.vendorRating.findMany({
      where: {
        vendorId,
        ...(filters?.minRating && { rating: { gte: filters.minRating } }),
        ...(filters?.maxRating && { rating: { lte: filters.maxRating } }),
        ...(filters?.verified !== undefined && { isVerified: filters.verified }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        rater: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            profileImageUrl: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderType: true,
          },
        },
      },
    });
  }

  async getVendorRatingStats(vendorId: string): Promise<{
    totalRatings: number;
    averageRating: number;
    ratingDistribution: { rating: number; count: number }[];
    averageQuality: number;
    averageDelivery: number;
    averageService: number;
    averageCommunication: number;
    recommendationRate: number;
  }> {
    const [ratings, distribution] = await Promise.all([
      this.prisma.vendorRating.aggregate({
        where: { vendorId },
        _count: { id: true },
        _avg: {
          rating: true,
          qualityRating: true,
          deliveryRating: true,
          serviceRating: true,
          communicationRating: true,
        },
      }),
      this.prisma.vendorRating.groupBy({
        by: ['rating'],
        where: { vendorId },
        _count: { rating: true },
        orderBy: { rating: 'desc' },
      }),
    ]);

    const recommendationCount = await this.prisma.vendorRating.count({
      where: { vendorId, wouldRecommend: true },
    });

    const recommendationRate = ratings._count.id > 0 
      ? (recommendationCount / ratings._count.id) * 100 
      : 0;

    return {
      totalRatings: ratings._count.id,
      averageRating: Number(ratings._avg.rating || 0),
      ratingDistribution: distribution.map(d => ({
        rating: d.rating,
        count: d._count.rating,
      })),
      averageQuality: Number(ratings._avg.qualityRating || 0),
      averageDelivery: Number(ratings._avg.deliveryRating || 0),
      averageService: Number(ratings._avg.serviceRating || 0),
      averageCommunication: Number(ratings._avg.communicationRating || 0),
      recommendationRate: Math.round(recommendationRate),
    };
  }

  async async updateVendorRating(orderId: string
    id: string,
    data: Partial<{
      rating: number;
      qualityRating: number;
      deliveryRating: number;
      serviceRating: number;
      communicationRating: number;
      comment: string;
      wouldRecommend: boolean;
    }>
  ): Promise<VendorRating> {
    return this.prisma.vendorRating.update({
      where: { id },
      data,
    });
  }

  async verifyVendorRating(id: string): Promise<VendorRating> {
    return this.prisma.vendorRating.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  async deleteVendorRating(id: string): Promise<VendorRating> {
    return this.prisma.vendorRating.delete({
      where: { id },
    });
  }

  async getTopRatedVendors(limit: number = 10): Promise<{
    vendorId: string;
    vendor: any;
    averageRating: number;
    totalRatings: number;
  }[]> {
    const topVendors = await this.prisma.vendorRating.groupBy({
      by: ['vendorId'],
      _avg: { rating: true },
      _count: { id: true },
      having: {
        id: { _count: { gte: 5 } }, // At least 5 ratings
      },
      orderBy: {
        _avg: { rating: 'desc' },
      },
      take: limit,
    });

    const vendorDetails = await this.prisma.user.findMany({
      where: {
        id: { in: topVendors.map(v => v.vendorId) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        profileImageUrl: true,
        verificationTier: true,
      },
    });

    return topVendors.map(vendor => ({
      vendorId: vendor.vendorId,
      vendor: vendorDetails.find(v => v.id === vendor.vendorId),
      averageRating: Number(vendor._avg.rating || 0),
      totalRatings: vendor._count.id,
    }));
  }
}

export const vendorRatingService = new VendorRatingService(new PrismaClient());