import type { User } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface CustomerFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'suspended';
  verificationTier?: string;
  userType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  verifiedCustomers: number;
  topCustomersByRevenue: Array<{
    id: string;
    businessName: string;
    firstName: string;
    lastName: string;
    totalRevenue: number;
    totalOrders: number;
  }>;
  customerRetentionRate: number;
  averageOrderValue: number;
  customerLifetimeValue: number;
}

export interface CustomerOrderHistory {
  customer: {
    id: string;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  }>;
  stats: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: string;
    firstOrderDate: string;
  };
}

export class CustomerService extends BaseService {
  async getCustomers(filters: CustomerFilters = {}): Promise<{
    customers: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        search,
        status = 'active',
        verificationTier,
        userType,
        dateFrom,
        dateTo,
        limit = 20,
        offset = 0,
      } = filters;

      const where: any = {
        userType: { in: ['buyer', 'business'] }, // Only buyers and businesses
      };

      // Status filter
      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      // Verification tier filter
      if (verificationTier) {
        where.verificationTier = verificationTier;
      }

      // User type filter
      if (userType) {
        where.userType = userType;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      // Search filter
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [customers, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          include: {
            buyerOrders: {
              select: {
                id: true,
                totalAmount: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            _count: {
              select: {
                buyerOrders: true,
                products: true,
                services: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const page = Math.floor(offset / limit) + 1;

      return {
        customers,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error('Error fetching customers:', error);
      throw error;
    }
  }

  async getCustomerById(customerId: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: customerId },
        include: {
          buyerOrders: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              status: true,
              createdAt: true,
              items: {
                select: {
                  quantity: true,
                  unitPrice: true,
                  totalPrice: true,
                  product: {
                    select: { title: true },
                  },
                  service: {
                    select: { title: true },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          wallet: {
            select: {
              availableBalance: true,
              lockedBalance: true,
            },
          },
          shippingAddresses: {
            take: 3,
            orderBy: { isDefault: 'desc' },
          },
          _count: {
            select: {
              buyerOrders: true,
              products: true,
              services: true,
              reviews: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching customer by ID:', error);
      throw error;
    }
  }

  async getCustomerStats(): Promise<CustomerStats> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const [
        totalCustomers,
        activeCustomers,
        newCustomersThisMonth,
        verifiedCustomers,
        topCustomersByRevenue,
        customerRetentionData,
      ] = await Promise.all([
        // Total customers
        this.prisma.user.count({
          where: { userType: { in: ['buyer', 'business'] } },
        }),

        // Active customers (have orders in last 90 days)
        this.prisma.user.count({
          where: {
            userType: { in: ['buyer', 'business'] },
            buyerOrders: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
        }),

        // New customers this month
        this.prisma.user.count({
          where: {
            userType: { in: ['buyer', 'business'] },
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        }),

        // Verified customers
        this.prisma.user.count({
          where: {
            userType: { in: ['buyer', 'business'] },
            isVerified: true,
          },
        }),

        // Top customers by revenue
        this.prisma.user.findMany({
          where: { userType: { in: ['buyer', 'business'] } },
          include: {
            buyerOrders: {
              select: { totalAmount: true },
            },
            _count: {
              select: { buyerOrders: true },
            },
          },
          take: 10,
        }),

        // Customer retention data (simplified)
        this.prisma.user.findMany({
          where: {
            userType: { in: ['buyer', 'business'] },
            buyerOrders: { some: {} },
          },
          include: {
            buyerOrders: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        }),
      ]);

      // Calculate top customers by revenue
      const topCustomers = topCustomersByRevenue
        .map(customer => ({
          id: customer.id,
          businessName: customer.businessName || '',
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          totalRevenue: customer.buyerOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
          totalOrders: customer._count.buyerOrders,
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);

      // Calculate customer retention rate (simplified - customers with orders in both current and previous month)
      const currentMonthCustomers = new Set(
        customerRetentionData
          .filter(customer =>
            customer.buyerOrders.some(order =>
              order.createdAt >= startOfMonth && order.createdAt <= endOfMonth
            )
          )
          .map(customer => customer.id)
      );

      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const previousMonthCustomers = new Set(
        customerRetentionData
          .filter(customer =>
            customer.buyerOrders.some(order =>
              order.createdAt >= previousMonthStart && order.createdAt <= previousMonthEnd
            )
          )
          .map(customer => customer.id)
      );

      const retainedCustomers = [...currentMonthCustomers].filter(id => previousMonthCustomers.has(id)).length;
      const customerRetentionRate = previousMonthCustomers.size > 0 ? (retainedCustomers / previousMonthCustomers.size) * 100 : 0;

      // Calculate average order value and customer lifetime value
      const allOrders = await this.prisma.order.findMany({
        select: { totalAmount: true, buyerId: true },
      });

      const totalRevenue = allOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const averageOrderValue = allOrders.length > 0 ? totalRevenue / allOrders.length : 0;
      const customerLifetimeValue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

      return {
        totalCustomers,
        activeCustomers,
        newCustomersThisMonth,
        verifiedCustomers,
        topCustomersByRevenue: topCustomers,
        customerRetentionRate,
        averageOrderValue,
        customerLifetimeValue,
      };
    } catch (error) {
      logger.error('Error fetching customer stats:', error);
      throw error;
    }
  }

  async getCustomerOrderHistory(customerId: string): Promise<CustomerOrderHistory> {
    try {
      const customer = await this.prisma.user.findUnique({
        where: { id: customerId },
        include: {
          buyerOrders: {
            include: {
              items: {
                include: {
                  product: { select: { title: true } },
                  service: { select: { title: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const orders = customer.buyerOrders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        createdAt: order.createdAt.toISOString(),
        items: order.items.map(item => ({
          productName: item.product?.title || item.service?.title || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
      }));

      const totalOrders = orders.length;
      const totalSpent = orders.reduce((sum, order) => sum + order.totalAmount, 0);
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      const orderDates = orders.map(order => new Date(order.createdAt));
      const lastOrderDate = orderDates.length > 0 ? new Date(Math.max(...orderDates.map(d => d.getTime()))).toISOString() : '';
      const firstOrderDate = orderDates.length > 0 ? new Date(Math.min(...orderDates.map(d => d.getTime()))).toISOString() : '';

      return {
        customer: {
          id: customer.id,
          businessName: customer.businessName || '',
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: customer.email || '',
          phone: customer.phone || '',
        },
        orders,
        stats: {
          totalOrders,
          totalSpent,
          averageOrderValue,
          lastOrderDate,
          firstOrderDate,
        },
      };
    } catch (error) {
      logger.error('Error fetching customer order history:', error);
      throw error;
    }
  }

  async updateCustomerStatus(customerId: string, isActive: boolean): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: customerId },
        data: { isActive },
      });
    } catch (error) {
      logger.error('Error updating customer status:', error);
      throw error;
    }
  }

  async updateCustomerVerification(customerId: string, verificationTier: string, isVerified: boolean): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: customerId },
        data: {
          verificationTier,
          isVerified,
        },
      });
    } catch (error) {
      logger.error('Error updating customer verification:', error);
      throw error;
    }
  }
}