/**
 * Business Analytics Service for Vikareta B2B Platform
 * Handles business analytics data and reporting
 */

import { PrismaClient, BusinessAnalytics } from '@prisma/client';

export interface CreateBusinessAnalyticsData {
  userId: string;
  period: string;
  revenue: number;
  orders: number;
  customers: number;
  products: number;
  services?: number;
  conversionRate: number;
  averageOrderValue: number;
  customerAcquisitionCost: number;
  customerLifetimeValue: number;
  metadata?: any;
}

export interface UpdateBusinessAnalyticsData {
  revenue?: number;
  orders?: number;
  customers?: number;
  products?: number;
  services?: number;
  conversionRate?: number;
  averageOrderValue?: number;
  customerAcquisitionCost?: number;
  customerLifetimeValue?: number;
  metadata?: any;
}

export class BusinessAnalyticsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async createBusinessAnalytics(data: CreateBusinessAnalyticsData): Promise<BusinessAnalytics> {
    return await this.prisma.businessAnalytics.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
      },
    });
  }

  async updateBusinessAnalytics(id: string, data: UpdateBusinessAnalyticsData): Promise<BusinessAnalytics> {
    return await this.prisma.businessAnalytics.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
      },
    });
  }

  async getBusinessAnalytics(filters: {
    userId?: string;
    period?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, ...whereFilters } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (whereFilters.userId) where.userId = whereFilters.userId;
    if (whereFilters.period) where.period = whereFilters.period;
    
    if (whereFilters.startDate || whereFilters.endDate) {
      where.createdAt = {};
      if (whereFilters.startDate) where.createdAt.gte = whereFilters.startDate;
      if (whereFilters.endDate) where.createdAt.lte = whereFilters.endDate;
    }

    const [analytics, total] = await Promise.all([
      this.prisma.businessAnalytics.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.businessAnalytics.count({ where }),
    ]);

    return {
      analytics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getBusinessAnalyticsById(id: string): Promise<BusinessAnalytics | null> {
    return await this.prisma.businessAnalytics.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
      },
    });
  }

  async getBusinessAnalyticsByUser(userId: string, period?: string): Promise<BusinessAnalytics[]> {
    const where: any = { userId };
    if (period) where.period = period;

    return await this.prisma.businessAnalytics.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteBusinessAnalytics(id: string): Promise<BusinessAnalytics> {
    return await this.prisma.businessAnalytics.delete({
      where: { id },
    });
  }

  async generatePeriodAnalytics(userId: string, period: string): Promise<BusinessAnalytics> {
    // Calculate analytics for the given period
    const startDate = this.getPeriodStartDate(period);
    const endDate = new Date();

    const [orders, revenue, customers, products, services] = await Promise.all([
      this.prisma.order.count({
        where: {
          sellerId: userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          sellerId: userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.order.findMany({
        where: {
          sellerId: userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        distinct: ['userId'],
      }),
      this.prisma.product.count({
        where: {
          sellerId: userId,
          isActive: true,
        },
      }),
      this.prisma.service.count({
        where: {
          providerId: userId,
          isActive: true,
        },
      }),
    ]);

    const totalRevenue = revenue._sum.totalAmount || 0;
    const totalOrders = orders;
    const totalCustomers = customers.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const analyticsData: CreateBusinessAnalyticsData = {
      userId,
      period,
      revenue: totalRevenue,
      orders: totalOrders,
      customers: totalCustomers,
      products,
      services,
      conversionRate: 0, // Would need additional data to calculate
      averageOrderValue,
      customerAcquisitionCost: 0, // Would need marketing spend data
      customerLifetimeValue: 0, // Would need historical data
    };

    return await this.createBusinessAnalytics(analyticsData);
  }

  private getPeriodStartDate(period: string): Date {
    const now = new Date();
    switch (period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return weekStart;
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        return new Date(now.getFullYear(), quarter * 3, 1);
      case 'yearly':
        return new Date(now.getFullYear(), 0, 1);
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.businessAnalytics.count();
      return true;
    } catch (error) {
      console.error('BusinessAnalyticsService health check failed:', error);
      return false;
    }
  }

    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const businessAnalyticsService = new BusinessAnalyticsService();