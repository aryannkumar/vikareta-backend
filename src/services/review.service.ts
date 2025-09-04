import { prisma } from '@/config/database';

export class ReviewService {
  async listReviews(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.review.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.review.count()
    ]);

    return { data, total };
  }

  async getReviewById(id: string) {
    return prisma.review.findUnique({ where: { id } });
  }

  async createReview(payload: any) {
    return prisma.review.create({ data: payload });
  }

  async updateReview(id: string, payload: any) {
    return prisma.review.update({ where: { id }, data: payload });
  }

  async deleteReview(id: string) {
    return prisma.review.delete({ where: { id } });
  }
}

export const reviewService = new ReviewService();
