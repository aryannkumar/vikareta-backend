import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Helper function to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  return {
    now,
    startOfThisMonth,
    startOfLastMonth,
    endOfLastMonth,
    startOfYear,
    thirtyDaysAgo
  };
};

// Generate real analytics data from database
const generateAnalytics = async (userId: string) => {
  const dates = getDateRanges();
  
  try {
    // Get overview metrics
    const [
      totalRevenueResult,
      thisMonthRevenueResult,
      lastMonthRevenueResult,
      totalOrdersResult,
      thisMonthOrdersResult,
      lastMonthOrdersResult,
      totalCustomersResult,
      thisMonthCustomersResult,
      lastMonthCustomersResult
    ] = await Promise.all([
      // Total revenue (all time)
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      
      // This month revenue
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] },
          createdAt: { gte: dates.startOfThisMonth }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      
      // Last month revenue
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] },
          createdAt: { 
            gte: dates.startOfLastMonth,
            lte: dates.endOfLastMonth
          }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      
      // Total orders
      prisma.order.count({
        where: { sellerId: userId }
      }),
      
      // This month orders
      prisma.order.count({
        where: {
          sellerId: userId,
          createdAt: { gte: dates.startOfThisMonth }
        }
      }),
      
      // Last month orders
      prisma.order.count({
        where: {
          sellerId: userId,
          createdAt: { 
            gte: dates.startOfLastMonth,
            lte: dates.endOfLastMonth
          }
        }
      }),
      
      // Total unique customers
      prisma.user.count({
        where: {
          buyerOrders: {
            some: { sellerId: userId }
          }
        }
      }),
      
      // New customers this month
      prisma.user.count({
        where: {
          buyerOrders: {
            some: {
              sellerId: userId,
              createdAt: { gte: dates.startOfThisMonth }
            }
          },
          createdAt: { gte: dates.startOfThisMonth }
        }
      }),
      
      // New customers last month
      prisma.user.count({
        where: {
          buyerOrders: {
            some: {
              sellerId: userId,
              createdAt: { 
                gte: dates.startOfLastMonth,
                lte: dates.endOfLastMonth
              }
            }
          },
          createdAt: { 
            gte: dates.startOfLastMonth,
            lte: dates.endOfLastMonth
          }
        }
      })
    ]);
    
    // Calculate metrics
    const totalRevenue = Number(totalRevenueResult._sum.totalAmount || 0);
    const thisMonthRevenue = Number(thisMonthRevenueResult._sum.totalAmount || 0);
    const lastMonthRevenue = Number(lastMonthRevenueResult._sum.totalAmount || 0);
    
    const totalOrders = totalOrdersResult;
    const thisMonthOrders = thisMonthOrdersResult;
    const lastMonthOrders = lastMonthOrdersResult;
    
    const totalCustomers = totalCustomersResult;
    const thisMonthCustomers = thisMonthCustomersResult;
    const lastMonthCustomers = lastMonthCustomersResult;
    
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Calculate growth rates
    const revenueGrowth = lastMonthRevenue > 0 ? 
      ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    const orderGrowth = lastMonthOrders > 0 ? 
      ((thisMonthOrders - lastMonthOrders) / lastMonthOrders) * 100 : 0;
    const customerGrowth = lastMonthCustomers > 0 ? 
      ((thisMonthCustomers - lastMonthCustomers) / lastMonthCustomers) * 100 : 0;
    
    return {
      overview: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        totalCustomers,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        conversionRate: 2.4, // This would need more complex calculation
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        orderGrowth: Math.round(orderGrowth * 100) / 100,
        customerGrowth: Math.round(customerGrowth * 100) / 100
      },
      sales: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        conversionRate: 2.4, // Would need more complex calculation
        topProducts: await getTopProducts(userId),
        revenueByMonth: await getRevenueByMonth(userId)
      },
      customers: {
        totalCustomers,
        newCustomers: thisMonthCustomers,
        activeCustomers: await getActiveCustomers(userId),
        customerRetentionRate: 85.5, // Would need more complex calculation
        averageLifetimeValue: Math.round((totalRevenue / Math.max(totalCustomers, 1)) * 100) / 100,
        topCustomers: await getTopCustomers(userId),
        customersBySegment: await getCustomersBySegment(userId)
      },
      products: {
        totalProducts: await getTotalProducts(userId),
        activeProducts: await getActiveProducts(userId),
        outOfStockProducts: await getOutOfStockProducts(userId),
        lowStockProducts: await getLowStockProducts(userId),
        topPerformingProducts: await getTopProducts(userId),
        categoryPerformance: await getCategoryPerformance(userId)
      }
    };
  } catch (error) {
    console.error('Error generating analytics:', error);
    throw error;
  }
};

// Helper functions for analytics data
const getTopProducts = async (userId: string) => {
  const topProducts = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: {
        sellerId: userId,
        status: { in: ['delivered', 'completed'] }
      }
    },
    _sum: {
      totalPrice: true,
      quantity: true
    },
    _count: {
      id: true
    },
    orderBy: {
      _sum: {
        totalPrice: 'desc'
      }
    },
    take: 5
  });

  const productsWithDetails = await Promise.all(
    topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, title: true }
      });
      
      return {
        id: item.productId,
        name: product?.title || 'Unknown Product',
        revenue: Number(item._sum.totalPrice || 0),
        orders: item._count.id,
        quantity: item._sum.quantity || 0
      };
    })
  );

  return productsWithDetails;
};

const getRevenueByMonth = async (userId: string) => {
  const currentYear = new Date().getFullYear();
  const months = [];
  
  for (let i = 0; i < 12; i++) {
    const startOfMonth = new Date(currentYear, i, 1);
    const endOfMonth = new Date(currentYear, i + 1, 0);
    
    const monthData = await prisma.order.aggregate({
      where: {
        sellerId: userId,
        status: { in: ['delivered', 'completed'] },
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      _sum: { totalAmount: true },
      _count: { id: true }
    });
    
    months.push({
      month: startOfMonth.toISOString().slice(0, 7),
      revenue: Number(monthData._sum.totalAmount || 0),
      orders: monthData._count
    });
  }
  
  return months;
};

const getActiveCustomers = async (userId: string) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  return await prisma.user.count({
    where: {
      buyerOrders: {
        some: {
          sellerId: userId,
          createdAt: { gte: thirtyDaysAgo }
        }
      }
    }
  });
};

const getTopCustomers = async (userId: string) => {
  const topCustomers = await prisma.order.groupBy({
    by: ['buyerId'],
    where: {
      sellerId: userId,
      status: { in: ['delivered', 'completed'] }
    },
    _sum: { totalAmount: true },
    _count: { id: true },
    orderBy: {
      _sum: { totalAmount: 'desc' }
    },
    take: 5
  });

  const customersWithDetails = await Promise.all(
    topCustomers.map(async (item) => {
      const customer = await prisma.user.findUnique({
        where: { id: item.buyerId },
        select: { 
          id: true, 
          firstName: true, 
          lastName: true, 
          businessName: true 
        }
      });
      
      return {
        id: item.buyerId,
        name: customer?.businessName || 
              `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 
              'Unknown Customer',
        revenue: Number(item._sum.totalAmount || 0),
        orders: item._count.id
      };
    })
  );

  return customersWithDetails;
};

const getCustomersBySegment = async (userId: string) => {
  // Simple segmentation based on order value
  const segments = await prisma.$queryRaw`
    SELECT 
      CASE 
        WHEN total_spent >= 100000 THEN 'Enterprise'
        WHEN total_spent >= 25000 THEN 'SMB'
        ELSE 'Startup'
      END as segment,
      COUNT(*) as count,
      SUM(total_spent) as revenue
    FROM (
      SELECT 
        buyer_id,
        SUM(total_amount) as total_spent
      FROM orders 
      WHERE seller_id = ${userId}::uuid 
        AND status IN ('delivered', 'completed')
      GROUP BY buyer_id
    ) customer_totals
    GROUP BY segment
  ` as Array<{ segment: string; count: bigint; revenue: number }>;

  return segments.map(s => ({
    segment: s.segment,
    count: Number(s.count),
    revenue: Number(s.revenue)
  }));
};

const getTotalProducts = async (userId: string) => {
  return await prisma.product.count({
    where: { sellerId: userId }
  });
};

const getActiveProducts = async (userId: string) => {
  return await prisma.product.count({
    where: { 
      sellerId: userId,
      status: 'active'
    }
  });
};

const getOutOfStockProducts = async (userId: string) => {
  return await prisma.product.count({
    where: { 
      sellerId: userId,
      stockQuantity: 0,
      isService: false
    }
  });
};

const getLowStockProducts = async (userId: string) => {
  return await prisma.product.count({
    where: { 
      sellerId: userId,
      stockQuantity: { gt: 0, lte: 10 },
      isService: false
    }
  });
};

const getCategoryPerformance = async (userId: string) => {
  const categoryData = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: {
        sellerId: userId,
        status: { in: ['delivered', 'completed'] }
      }
    },
    _sum: { totalPrice: true },
    _count: { id: true }
  });

  // Get category information for each product
  const categoryPerformance = new Map();
  
  for (const item of categoryData) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { category: true }
    });
    
    if (product?.category) {
      const categoryName = product.category.name;
      const existing = categoryPerformance.get(categoryName) || {
        category: categoryName,
        products: 0,
        revenue: 0,
        orders: 0
      };
      
      existing.products += 1;
      existing.revenue += Number(item._sum.totalPrice || 0);
      existing.orders += item._count.id;
      
      categoryPerformance.set(categoryName, existing);
    }
  }
  
  return Array.from(categoryPerformance.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
};

// GET /api/analytics/overview - Get overview analytics
router.get('/overview', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const analytics = await generateAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics.overview
    });
  } catch (error) {
    console.error('Error fetching overview analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch overview analytics'
      }
    });
  }
});

// GET /api/analytics/sales - Get sales analytics
router.get('/sales', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { period = '30d', startDate, endDate } = req.query;
    
    const analytics = await generateAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics.sales
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch sales analytics'
      }
    });
  }
});

// GET /api/analytics/customers - Get customer analytics
router.get('/customers', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const analytics = await generateAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics.customers
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer analytics'
      }
    });
  }
});

// GET /api/analytics/products - Get product analytics
router.get('/products', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const analytics = await generateAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics.products
    });
  } catch (error) {
    console.error('Error fetching product analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch product analytics'
      }
    });
  }
});

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const analytics = await generateAnalytics(userId);
    
    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      where: { sellerId: userId },
      include: {
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            businessName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    // Get alerts
    const [outOfStockCount, lowStockCount] = await Promise.all([
      prisma.product.count({
        where: { 
          sellerId: userId,
          stockQuantity: 0,
          isService: false
        }
      }),
      prisma.product.count({
        where: { 
          sellerId: userId,
          stockQuantity: { gt: 0, lte: 10 },
          isService: false
        }
      })
    ]);
    
    const alerts = [];
    if (outOfStockCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${outOfStockCount} products are out of stock`,
        action: 'View Inventory'
      });
    }
    if (lowStockCount > 0) {
      alerts.push({
        type: 'info',
        message: `${lowStockCount} products have low stock`,
        action: 'Reorder'
      });
    }
    if (analytics.customers.newCustomers > 0) {
      alerts.push({
        type: 'success',
        message: `${analytics.customers.newCustomers} new customers this month`,
        action: 'View Customers'
      });
    }
    
    const dashboardData = {
      metrics: analytics.overview,
      recentOrders: recentOrders.map(order => ({
        id: order.id,
        customer: order.buyer.businessName || 
                 `${order.buyer.firstName || ''} ${order.buyer.lastName || ''}`.trim() || 
                 'Unknown Customer',
        amount: Number(order.totalAmount),
        status: order.status,
        date: order.createdAt
      })),
      topProducts: analytics.products.topPerformingProducts.slice(0, 5),
      revenueChart: analytics.sales.revenueByMonth.slice(-6),
      alerts
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch dashboard analytics'
      }
    });
  }
});

// GET /api/analytics/reports - Get available reports
router.get('/reports', authenticate, async (req: Request, res: Response) => {
  try {
    const reports = [
      {
        id: 'sales-summary',
        name: 'Sales Summary',
        description: 'Comprehensive sales performance report',
        category: 'sales',
        frequency: 'monthly',
        lastGenerated: new Date().toISOString()
      },
      {
        id: 'customer-analysis',
        name: 'Customer Analysis',
        description: 'Customer behavior and segmentation report',
        category: 'customers',
        frequency: 'weekly',
        lastGenerated: new Date().toISOString()
      },
      {
        id: 'product-performance',
        name: 'Product Performance',
        description: 'Product sales and inventory analysis',
        category: 'products',
        frequency: 'daily',
        lastGenerated: new Date().toISOString()
      },
      {
        id: 'financial-overview',
        name: 'Financial Overview',
        description: 'Revenue, expenses, and profit analysis',
        category: 'financial',
        frequency: 'monthly',
        lastGenerated: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch reports'
      }
    });
  }
});

// POST /api/analytics/reports/:id/generate - Generate report
router.post('/reports/:id/generate', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'pdf', period = '30d' } = req.body;
    
    // Mock report generation
    const reportUrl = `/reports/${id}-${Date.now()}.${format}`;
    
    res.json({
      success: true,
      data: {
        reportId: `${id}-${Date.now()}`,
        downloadUrl: reportUrl,
        format,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      },
      message: 'Report generated successfully'
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GENERATION_ERROR',
        message: 'Failed to generate report'
      }
    });
  }
});

// GET /api/analytics/audience-insights - Get audience insights
router.get('/audience-insights', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { dateRange = '30d' } = req.query;

    // Calculate date range
    const days = parseInt(dateRange.toString().replace('d', '')) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get audience insights from orders and user data
    const [
      ageGroups,
      genderDistribution,
      locationData,
      deviceTypes,
      trafficSources
    ] = await Promise.all([
      // Age groups (mock data since we don't have age in user model)
      Promise.resolve([
        { ageGroup: '18-24', count: 45, percentage: 22.5 },
        { ageGroup: '25-34', count: 78, percentage: 39.0 },
        { ageGroup: '35-44', count: 52, percentage: 26.0 },
        { ageGroup: '45-54', count: 18, percentage: 9.0 },
        { ageGroup: '55+', count: 7, percentage: 3.5 }
      ]),

      // Gender distribution (mock data)
      Promise.resolve([
        { gender: 'Male', count: 120, percentage: 60.0 },
        { gender: 'Female', count: 75, percentage: 37.5 },
        { gender: 'Other', count: 5, percentage: 2.5 }
      ]),

      // Location data from orders
      prisma.order.groupBy({
        by: ['deliveryAddress'],
        where: {
          sellerId: userId,
          createdAt: { gte: startDate }
        },
        _count: { id: true }
      }).then(results => 
        results.slice(0, 10).map((item, index) => ({
          location: `City ${index + 1}`,
          count: item._count.id,
          percentage: (item._count.id / results.length) * 100
        }))
      ),

      // Device types (mock data)
      Promise.resolve([
        { device: 'Mobile', count: 140, percentage: 70.0 },
        { device: 'Desktop', count: 50, percentage: 25.0 },
        { device: 'Tablet', count: 10, percentage: 5.0 }
      ]),

      // Traffic sources (mock data)
      Promise.resolve([
        { source: 'Direct', count: 80, percentage: 40.0 },
        { source: 'Search', count: 60, percentage: 30.0 },
        { source: 'Social', count: 40, percentage: 20.0 },
        { source: 'Referral', count: 20, percentage: 10.0 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        ageGroups,
        genderDistribution,
        locationData,
        deviceTypes,
        trafficSources,
        totalAudience: 200,
        dateRange: `${days}d`,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching audience insights:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch audience insights'
      }
    });
  }
});

export default router;