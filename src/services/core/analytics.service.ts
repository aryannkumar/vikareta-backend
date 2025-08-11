import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface AnalyticsFilters {
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  businessId?: string;
}

export class AnalyticsService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get platform overview analytics
   */
  async getPlatformOverview(filters: AnalyticsFilters = {}): Promise<{
    totalUsers: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    activeUsers: number;
    newUsersThisMonth: number;
    ordersThisMonth: number;
    revenueThisMonth: number;
  }> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const where: any = {};
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const [
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        activeUsers,
        newUsersThisMonth,
        ordersThisMonth,
        revenueThisMonth,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.product.count({ where: { status: 'active' } }),
        this.prisma.order.count(),
        this.prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { status: 'completed' },
        }),
        this.prisma.user.count({
          where: {
            updatedAt: { gte: startOfDay },
          },
        }),
        this.prisma.user.count({
          where: {
            createdAt: { gte: startOfMonth },
          },
        }),
        this.prisma.order.count({
          where: {
            createdAt: { gte: startOfMonth },
          },
        }),
        this.prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: {
            status: 'completed',
            createdAt: { gte: startOfMonth },
          },
        }),
      ]);

      return {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
        activeUsers,
        newUsersThisMonth,
        ordersThisMonth,
        revenueThisMonth: Number(revenueThisMonth._sum.totalAmount || 0),
      };
    } catch (error) {
      logger.error('Error getting platform overview:', error);
      throw error;
    }
  }

  /**
   * Get sales analytics
   */
  async getSalesAnalytics(filters: AnalyticsFilters = {}): Promise<{
    totalSales: number;
    totalRevenue: number;
    averageOrderValue: number;
    salesByStatus: Record<string, number>;
    salesByMonth: Array<{ month: string; sales: number; revenue: number }>;
    topProducts: Array<{ product: any; totalSold: number; revenue: number }>;
  }> {
    try {
      const where: any = {};
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      if (filters.businessId) {
        where.sellerId = filters.businessId;
      }

      const [orders, salesByStatus] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    price: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where,
          _count: { id: true },
          _sum: { totalAmount: true },
        }),
      ]);

      const totalSales = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

      const statusStats: Record<string, number> = {};
      salesByStatus.forEach(group => {
        statusStats[group.status] = group._count.id;
      });

      // Calculate sales by month
      const salesByMonth = this.calculateSalesByMonth(orders);

      // Calculate top products
      const productSales: Record<string, { product: any; totalSold: number; revenue: number }> = {};
      orders.forEach(order => {
        order.items.forEach(item => {
          const productId = item.productId;
          if (!productSales[productId]) {
            productSales[productId] = {
              product: item.product,
              totalSold: 0,
              revenue: 0,
            };
          }
          productSales[productId].totalSold += item.quantity;
          productSales[productId].revenue += Number(item.totalPrice);
        });
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 10);

      return {
        totalSales,
        totalRevenue,
        averageOrderValue,
        salesByStatus: statusStats,
        salesByMonth,
        topProducts,
      };
    } catch (error) {
      logger.error('Error getting sales analytics:', error);
      throw error;
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(filters: AnalyticsFilters = {}): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    usersByType: Record<string, number>;
    userGrowth: Array<{ month: string; newUsers: number; totalUsers: number }>;
    topBuyers: Array<{ user: any; totalOrders: number; totalSpent: number }>;
  }> {
    try {
      const where: any = {};
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const [
        totalUsers,
        activeUsers,
        newUsers,
        usersByType,
        users,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.user.count({ where }),
        this.prisma.user.groupBy({
          by: ['userType'],
          _count: { id: true },
        }),
        this.prisma.user.findMany({
          include: {
            buyerOrders: {
              select: {
                id: true,
                totalAmount: true,
              },
            },
          },
        }),
      ]);

      const typeStats: Record<string, number> = {};
      usersByType.forEach(group => {
        typeStats[group.userType] = group._count.id;
      });

      // Calculate user growth (simplified)
      const userGrowth = this.calculateUserGrowth(users);

      // Calculate top buyers
      const topBuyers = users
        .map(user => ({
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            businessName: user.businessName,
          },
          totalOrders: user.buyerOrders.length,
          totalSpent: user.buyerOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      return {
        totalUsers,
        activeUsers,
        newUsers,
        usersByType: typeStats,
        userGrowth,
        topBuyers,
      };
    } catch (error) {
      logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  /**
   * Get product analytics
   */
  async getProductAnalytics(filters: AnalyticsFilters = {}): Promise<{
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    productsByCategory: Record<string, number>;
    topSellingProducts: Array<{ product: any; totalSold: number; revenue: number }>;
    recentProducts: any[];
  }> {
    try {
      const where: any = {};
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }
      if (filters.businessId) {
        where.sellerId = filters.businessId;
      }

      const [
        totalProducts,
        activeProducts,
        lowStockProducts,
        productsByCategory,
        products,
        recentProducts,
      ] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.count({ where: { ...where, status: 'active' } }),
        this.prisma.product.count({ where: { ...where, stockQuantity: { lte: 10 } } }),
        this.prisma.product.groupBy({
          by: ['categoryId'],
          where,
          _count: { id: true },
        }),
        this.prisma.product.findMany({
          where,
          include: {
            orderItems: {
              select: {
                quantity: true,
                totalPrice: true,
              },
            },
            category: {
              select: {
                name: true,
              },
            },
          },
        }),
        this.prisma.product.findMany({
          where,
          include: {
            seller: {
              select: {
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
            category: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const categoryStats: Record<string, number> = {};
      productsByCategory.forEach(group => {
        categoryStats[group.categoryId] = group._count.id;
      });

      // Calculate top selling products
      const topSellingProducts = products
        .map(product => ({
          product: {
            id: product.id,
            title: product.title,
            price: product.price,
            category: product.category?.name,
          },
          totalSold: product.orderItems.reduce((sum, item) => sum + item.quantity, 0),
          revenue: product.orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0),
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 10);

      return {
        totalProducts,
        activeProducts,
        lowStockProducts,
        productsByCategory: categoryStats,
        topSellingProducts,
        recentProducts,
      };
    } catch (error) {
      logger.error('Error getting product analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate sales by month
   */
  private calculateSalesByMonth(orders: any[]): Array<{ month: string; sales: number; revenue: number }> {
    const monthlyData: Record<string, { sales: number; revenue: number }> = {};

    orders.forEach(order => {
      const month = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { sales: 0, revenue: 0 };
      }
      monthlyData[month].sales++;
      monthlyData[month].revenue += Number(order.totalAmount);
    });

    return Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Calculate user growth
   */
  private calculateUserGrowth(users: any[]): Array<{ month: string; newUsers: number; totalUsers: number }> {
    const monthlyData: Record<string, { newUsers: number; totalUsers: number }> = {};

    users.forEach(user => {
      const month = user.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { newUsers: 0, totalUsers: 0 };
      }
      monthlyData[month].newUsers++;
    });

    // Calculate cumulative totals
    let cumulativeTotal = 0;
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        cumulativeTotal += data.newUsers;
        return {
          month,
          newUsers: data.newUsers,
          totalUsers: cumulativeTotal,
        };
      });
  }

  /**
   * Export analytics data
   */
  async exportAnalyticsData(type: 'sales' | 'users' | 'products', filters: AnalyticsFilters = {}): Promise<any[]> {
    try {
      switch (type) {
        case 'sales':
          const salesData = await this.getSalesAnalytics(filters);
          return [salesData];
        case 'users':
          const userData = await this.getUserAnalytics(filters);
          return [userData];
        case 'products':
          const productData = await this.getProductAnalytics(filters);
          return [productData];
        default:
          throw new Error('Invalid export type');
      }
    } catch (error) {
      logger.error('Error exporting analytics data:', error);
      throw error;
    }
  }
}

export default AnalyticsService;