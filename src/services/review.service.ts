import { PrismaClient, Review } from '@prisma/client';

export class ReviewService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createReview(data: {
    userId: string;
    orderId?: string;
    productId?: string;
    serviceId?: string;
    rating: number;
    title?: string;
    comment?: string;
  }): Promise<Review> {
    return this.prisma.review.create({
      data: {
        userId: data.userId,
        // Field removed
        productId: data.productId,
        serviceId: data.serviceId,
        rating: data.rating,
        title: data.title,
        comment: data.comment,
        isVerified: false,
        isPublished: true,
      },
    });
  }

  async getReviewById(id: string): Promise<Review | null> {
    return this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
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
    });
  }

  async getReviewsByProduct(productId: string, page = 1, limit = 10): Promise<{
    reviews: Review[];
    total: number;
    averageRating: number;
  }> {
    const skip = (page - 1) * limit;

    const [reviews, total, avgResult] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          productId,
          isPublished: true,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: {
          productId,
          isPublished: true,
        },
      }),
      this.prisma.review.aggregate({
        where: {
          productId,
          isPublished: true,
        },
        _avg: {
          rating: true,
        },
      }),
    ]);

    return {
      reviews,
      total,
      averageRating: avgResult._avg.rating || 0,
    };
  }

  async getReviewsByService(serviceId: string, page = 1, limit = 10): Promise<{
    reviews: Review[];
    total: number;
    averageRating: number;
  }> {
    const skip = (page - 1) * limit;

    const [reviews, total, avgResult] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          serviceId,
          isPublished: true,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: {
          serviceId,
          isPublished: true,
        },
      }),
      this.prisma.review.aggregate({
        where: {
          serviceId,
          isPublished: true,
        },
        _avg: {
          rating: true,
        },
      }),
    ]);

    return {
      reviews,
      total,
      averageRating: avgResult._avg.rating || 0,
    };
  }

  async getReviewsByUser(userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { userId },
      include: {
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReview(id: string, data: {
    rating?: number;
    title?: string;
    comment?: string;
  }): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data,
    });
  }

  async verifyReview(id: string): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  async publishReview(id: string, isPublished: boolean): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { isPublished },
    });
  }

  async deleteReview(id: string): Promise<void> {
    await this.prisma.review.delete({
      where: { id },
    });
  }

  async getReviewStats(productId?: string, serviceId?: string): Promise<{
    totalReviews: number;
    averageRating: number;
    ratingDistribution: { [key: number]: number };
  }> {
    const where: any = { isPublished: true };
    if (productId) where.productId = productId;
    if (serviceId) where.serviceId = serviceId;

    const [total, avgResult, reviews] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
      }),
      this.prisma.review.findMany({
        where,
        select: { rating: true },
      }),
    ]);

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      ratingDistribution[review.rating]++;
    });

    return {
      totalReviews: total,
      averageRating: avgResult._avg.rating || 0,
      ratingDistribution,
    };
  }
}

export const reviewService = new ReviewService();