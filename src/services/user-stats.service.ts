import { prisma } from '@/config/database';

export interface UserStats {
  products: number; rfqs: number; quotes: number; ordersBuyer: number; ordersSeller: number; following: number; followers: number;
  recentProducts: any[]; recentQuotes: any[]; recentOrders: any[];
}

class UserStatsService {
  async get(userId: string): Promise<UserStats> {
    const [products, rfqs, quotes, ordersBuyer, ordersSeller, following, followers] = await Promise.all([
      prisma.product.count({ where: { sellerId: userId } }),
      prisma.rfq.count({ where: { buyerId: userId } }),
      prisma.quote.count({ where: { sellerId: userId } }),
      prisma.order.count({ where: { buyerId: userId } }),
      prisma.order.count({ where: { sellerId: userId } }),
      prisma.userFollow.count({ where: { followingId: userId } }),
      prisma.userFollow.count({ where: { followerId: userId } }),
    ]);
    const [recentProducts, recentQuotes, recentOrders] = await Promise.all([
      prisma.product.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } }),
      prisma.quote.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, totalPrice: true, createdAt: true, status: true } }),
      prisma.order.findMany({ where: { OR: [{ buyerId: userId }, { sellerId: userId }] }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, orderNumber: true, status: true, createdAt: true } })
    ]);
    return { products, rfqs, quotes, ordersBuyer, ordersSeller, following, followers, recentProducts, recentQuotes, recentOrders };
  }
}

export const userStatsService = new UserStatsService();
