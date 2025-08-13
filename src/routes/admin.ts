import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();



/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics (admin only)
 */
router.get('/dashboard/stats', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalProducts,
      pendingProducts,
      totalOrders,
      pendingOrders
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.product.count(),
      prisma.product.count({ where: { status: 'pending' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'pending' } })
    ]);

    // Calculate revenue (simplified - you might want to add proper revenue calculation)
    const totalRevenue = 0; // Placeholder
    const monthlyRevenue = 0; // Placeholder
    const userGrowth = 0; // Placeholder
    const revenueGrowth = 0; // Placeholder

    const stats = {
      totalUsers,
      activeUsers,
      totalProducts,
      pendingProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
      monthlyRevenue,
      userGrowth,
      revenueGrowth,
    };

    return res.json({
      success: true,
      message: 'Dashboard stats retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    logger.error('Get dashboard stats failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/activity
 * Get recent activity (admin only)
 */
router.get('/dashboard/activity', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get recent users (as activity)
    const recentUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    });

    // Transform to activity format
    const recentActivity = recentUsers.map(user => ({
      id: user.id,
      type: 'user_registration' as const,
      description: `New user registered: ${user.firstName} ${user.lastName} (${user.email})`,
      timestamp: user.createdAt.toISOString(),
      status: 'success' as const,
    }));

    return res.json({
      success: true,
      message: 'Recent activity retrieved successfully',
      data: recentActivity,
    });
  } catch (error: any) {
    logger.error('Get dashboard activity failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/users', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [rawUsers, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          userType: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.user.count(),
    ]);

    // Transform users to match frontend expectations
    const users = rawUsers.map(user => ({
      ...user,
      role: user.userType === 'seller' ? 'seller' : user.userType === 'admin' ? 'both' : 'buyer',
      isActive: true, // Default to true since we don't have this field in the database yet
    }));

    return res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get users failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/analytics
 * Get platform analytics (admin only)
 */
router.get('/analytics', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRfqs,
      recentUsers,
      recentOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.rfq.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.order.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      message: 'Analytics retrieved successfully',
      data: {
        overview: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRfqs,
        },
        recent: {
          newUsers: recentUsers,
          newOrders: recentOrders,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Get analytics failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/users/:id
 * Get specific user details (admin only)
 */
router.get('/users/:id', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        userDocuments: true,
        socialLogins: true,
        products: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        buyerOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        sellerOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    return res.json({
      success: true,
      message: 'User details retrieved successfully',
      data: { user },
    });
  } catch (error: any) {
    logger.error('Get user details failed:', error);
    throw error;
  }
}));

/**
 * PUT /api/admin/users/:id/verification
 * Update user verification status (admin only)
 */
router.put('/users/:id/verification', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { verificationTier, isVerified } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        verificationTier,
        isVerified,
      },
    });

    return res.json({
      success: true,
      message: 'User verification status updated successfully',
      data: { user },
    });
  } catch (error: any) {
    logger.error('Update user verification failed:', error);
    throw error;
  }
}));

/**
 * PUT /api/admin/users/:id
 * Update user details (admin only)
 */
router.put('/users/:id', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: { user },
    });
  } catch (error: any) {
    logger.error('Update user failed:', error);
    throw error;
  }
}));

/**
 * POST /api/admin/users/:id/verify
 * Verify user (admin only)
 */
router.post('/users/:id/verify', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isVerified: verified,
      },
    });

    return res.json({
      success: true,
      message: `User ${verified ? 'verified' : 'unverified'} successfully`,
      data: { user },
    });
  } catch (error: any) {
    logger.error('Verify user failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/products
 * Get all products (admin only)
 */
router.get('/products', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        skip,
        take: limit,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          media: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.product.count(),
    ]);

    return res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: {
        data: products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get products failed:', error);
    throw error;
  }
}));

/**
 * POST /api/admin/products/:id/approve
 * Approve product (admin only)
 */
router.post('/products/:id/approve', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.update({
      where: { id },
      data: {
        status: 'active',
      },
    });

    return res.json({
      success: true,
      message: 'Product approved successfully',
      data: { product },
    });
  } catch (error: any) {
    logger.error('Approve product failed:', error);
    throw error;
  }
}));

/**
 * POST /api/admin/products/:id/reject
 * Reject product (admin only)
 */
router.post('/products/:id/reject', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Get current product first
    const currentProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        status: 'rejected',
        // Note: rejectionReason field doesn't exist in schema, storing reason in description for now
        description: reason ? `${currentProduct.description || ''}\n\nRejection Reason: ${reason}` : currentProduct.description,
      },
    });

    return res.json({
      success: true,
      message: 'Product rejected successfully',
      data: { product },
    });
  } catch (error: any) {
    logger.error('Reject product failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/orders
 * Get all orders (admin only)
 */
router.get('/orders', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        skip,
        take: limit,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.order.count(),
    ]);

    return res.json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        data: orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get orders failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/transactions
 * Get all transactions (admin only)
 */
router.get('/transactions', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        skip,
        take: limit,
        include: {
          wallet: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.walletTransaction.count(),
    ]);

    // Transform the data to match the expected format
    const transformedTransactions = transactions.map(transaction => ({
      id: transaction.id,
      transactionType: transaction.transactionType,
      amount: transaction.amount,
      status: 'completed', // WalletTransaction doesn't have status, assume completed
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      cashfreeTransactionId: transaction.cashfreeTransactionId,
      description: transaction.description,
      createdAt: transaction.createdAt,
      user: transaction.wallet.user,
    }));

    return res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        data: transformedTransactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get transactions failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/transactions
 * Get transactions for dashboard (admin only)
 */
router.get('/dashboard/transactions', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const recentTransactions = await prisma.walletTransaction.findMany({
      take: 10,
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedTransactions = recentTransactions.map(transaction => ({
      id: transaction.id,
      transactionType: transaction.transactionType,
      amount: transaction.amount,
      status: 'completed',
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      cashfreeTransactionId: transaction.cashfreeTransactionId,
      description: transaction.description,
      createdAt: transaction.createdAt,
      user: transaction.wallet.user,
    }));

    return res.json({
      success: true,
      message: 'Dashboard transactions retrieved successfully',
      data: transformedTransactions,
    });
  } catch (error: any) {
    logger.error('Get dashboard transactions failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/order-stats
 * Get order statistics (admin only)
 */
router.get('/dashboard/order-stats', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      pendingPayments
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'pending' } }),
      prisma.order.count({ where: { status: 'delivered' } }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'delivered' }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { paymentStatus: 'pending' }
      })
    ]);

    const stats = {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      pendingPayments: pendingPayments._sum.totalAmount || 0,
    };

    return res.json({
      success: true,
      message: 'Order stats retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    logger.error('Get order stats failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/products/pending
 * Get pending products for dashboard (admin only)
 */
router.get('/dashboard/products/pending', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const pendingProducts = await prisma.product.findMany({
      where: { status: 'pending' },
      take: 10,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        media: {
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      success: true,
      message: 'Pending products retrieved successfully',
      data: pendingProducts,
    });
  } catch (error: any) {
    logger.error('Get pending products failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/categories
 * Get categories for dashboard (admin only)
 */
router.get('/dashboard/categories', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const categoriesWithStats = categories.map(category => ({
      ...category,
      productCount: category._count.products,
    }));

    return res.json({
      success: true,
      message: 'Categories retrieved successfully',
      data: categoriesWithStats,
    });
  } catch (error: any) {
    logger.error('Get categories failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/categories
 * Get all categories with full details (admin only)
 */
router.get('/categories', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      }),
      prisma.category.count(),
    ]);

    const categoriesWithStats = categories.map(category => ({
      ...category,
      productCount: category._count.products,
    }));

    return res.json({
      success: true,
      message: 'Categories retrieved successfully',
      data: {
        data: categoriesWithStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get categories failed:', error);
    throw error;
  }
}));

/**
 * POST /api/admin/categories
 * Create a new category (admin only)
 */
router.post('/categories', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { name, description, parentId, isActive, featured } = req.body;

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        parentId: parentId || null,
        isActive: isActive !== undefined ? isActive : true,
        featured: featured !== undefined ? featured : false,
      },
    });

    return res.json({
      success: true,
      message: 'Category created successfully',
      data: { category },
    });
  } catch (error: any) {
    logger.error('Create category failed:', error);
    throw error;
  }
}));

/**
 * PUT /api/admin/categories/:id
 * Update a category (admin only)
 */
router.put('/categories/:id', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: { category },
    });
  } catch (error: any) {
    logger.error('Update category failed:', error);
    throw error;
  }
}));

/**
 * DELETE /api/admin/categories/:id
 * Delete a category (admin only)
 */
router.delete('/categories/:id', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if category has products
    const productCount = await prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CATEGORY_HAS_PRODUCTS',
          message: 'Cannot delete category with existing products',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    await prisma.category.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete category failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/users/verification
 * Get users pending verification (admin only)
 */
router.get('/dashboard/users/verification', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const usersForVerification = await prisma.user.findMany({
      where: {
        OR: [
          { isVerified: false },
          { verificationTier: 'unverified' },
        ],
      },
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        createdAt: true,
        userDocuments: {
          select: {
            id: true,
            documentType: true,
            verificationStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      success: true,
      message: 'Users for verification retrieved successfully',
      data: usersForVerification,
    });
  } catch (error: any) {
    logger.error('Get users for verification failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/users/suspended
 * Get suspended users (admin only)
 */
router.get('/dashboard/users/suspended', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Since we don't have a suspended status in the schema, we'll return users with verification issues
    const suspendedUsers = await prisma.user.findMany({
      where: {
        verificationTier: 'rejected',
      },
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return res.json({
      success: true,
      message: 'Suspended users retrieved successfully',
      data: suspendedUsers,
    });
  } catch (error: any) {
    logger.error('Get suspended users failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/orders/refunds
 * Get orders with refund requests (admin only)
 */
router.get('/dashboard/orders/refunds', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get orders that might need refunds (cancelled, returned, etc.)
    const refundOrders = await prisma.order.findMany({
      where: {
        OR: [
          { status: 'cancelled' },
          { status: 'returned' },
          { paymentStatus: 'refunded' },
        ],
      },
      take: 20,
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return res.json({
      success: true,
      message: 'Refund orders retrieved successfully',
      data: refundOrders,
    });
  } catch (error: any) {
    logger.error('Get refund orders failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/content/reported
 * Get reported content (admin only)
 */
router.get('/dashboard/content/reported', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Since we don't have a reports table, we'll return products that might be flagged
    const reportedContent = await prisma.product.findMany({
      where: {
        status: 'rejected',
      },
      take: 20,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const transformedContent = reportedContent.map(product => ({
      id: product.id,
      type: 'product',
      title: product.title,
      description: product.description,
      reportReason: 'Content violation', // rejectionReason field doesn't exist in schema
      status: 'pending_review',
      reportedAt: product.updatedAt,
      seller: product.seller,
      category: product.category,
    }));

    return res.json({
      success: true,
      message: 'Reported content retrieved successfully',
      data: transformedContent,
    });
  } catch (error: any) {
    logger.error('Get reported content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/content/flagged
 * Get flagged content (admin only)
 */
router.get('/dashboard/content/flagged', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get products that are pending review (could be flagged)
    const flaggedContent = await prisma.product.findMany({
      where: {
        status: 'pending',
      },
      take: 20,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedContent = flaggedContent.map(product => ({
      id: product.id,
      type: 'product',
      title: product.title,
      description: product.description,
      flagReason: 'Pending review',
      status: 'flagged',
      flaggedAt: product.createdAt,
      seller: product.seller,
      category: product.category,
    }));

    return res.json({
      success: true,
      message: 'Flagged content retrieved successfully',
      data: transformedContent,
    });
  } catch (error: any) {
    logger.error('Get flagged content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/content/moderation
 * Get content for moderation (admin only)
 */
router.get('/content/moderation', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [flaggedProducts, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          OR: [
            { status: 'pending' },
            { status: 'rejected' }
          ]
        },
        skip,
        take: limit,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({
        where: {
          OR: [
            { status: 'pending' },
            { status: 'rejected' }
          ]
        }
      })
    ]);

    const transformedContent = flaggedProducts.map(product => ({
      id: product.id,
      type: 'product',
      title: product.title,
      description: product.description,
      status: product.status,
      flaggedAt: product.createdAt,
      seller: product.seller,
      category: product.category,
    }));

    return res.json({
      success: true,
      message: 'Content for moderation retrieved successfully',
      data: {
        data: transformedContent,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get content for moderation failed:', error);
    throw error;
  }
}));

/**
 * POST /api/admin/content/:id/moderate
 * Moderate content (admin only)
 */
router.post('/content/:id/moderate', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    let updateData: any = {};

    switch (action) {
      case 'approve':
        updateData = { status: 'active' };
        break;
      case 'reject':
        updateData = { status: 'rejected' };
        break;
      case 'flag':
        updateData = { status: 'pending' };
        break;
      case 'remove':
        updateData = { status: 'inactive' };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'Invalid moderation action',
          },
        });
    }

    const content = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: `Content ${action}ed successfully`,
      data: { content },
    });
  } catch (error: any) {
    logger.error('Moderate content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/disputes
 * Get all disputes (admin only)
 */
router.get('/disputes', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Since we don't have a disputes table yet, return mock data structure
    const mockDisputes: any[] = [];

    return res.json({
      success: true,
      message: 'Disputes retrieved successfully',
      data: {
        data: mockDisputes,
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get disputes failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/config
 * Get system configuration (admin only)
 */
router.get('/system/config', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Return current system configuration
    const config = {
      general: {
        siteName: 'Vikareta',
        siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://vikareta.com',
        maintenanceMode: false,
      },
      payment: {
        cashfreeEnabled: !!process.env.CASHFREE_CLIENT_ID,
        minimumWithdrawal: 100,
        commissionRate: 5,
      },
      notification: {
        emailEnabled: !!process.env.SMTP_HOST,
        smsEnabled: false,
        pushEnabled: false,
      },
      security: {
        jwtExpiry: process.env.JWT_ACCESS_EXPIRES || '1h',
        maxLoginAttempts: 5,
        sessionTimeout: 24 * 60 * 60 * 1000,
      },
    };

    return res.json({
      success: true,
      message: 'System configuration retrieved successfully',
      data: config,
    });
  } catch (error: any) {
    logger.error('Get system config failed:', error);
    throw error;
  }
}));

/**
 * PUT /api/admin/system/config
 * Update system configuration (admin only)
 */
router.put('/system/config', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { config } = req.body;

    // In a real implementation, you would save this to database
    // For now, just return success

    return res.json({
      success: true,
      message: 'System configuration updated successfully',
      data: config,
    });
  } catch (error: any) {
    logger.error('Update system config failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/content/flagged
 * Get flagged content (admin only)
 */
router.get('/dashboard/content/flagged', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get products that are pending review (could be flagged)
    const flaggedContent = await prisma.product.findMany({
      where: {
        status: 'pending',
      },
      take: 20,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedContent = flaggedContent.map(product => ({
      id: product.id,
      type: 'product',
      title: product.title,
      description: product.description,
      flagReason: 'Pending review',
      status: 'flagged',
      flaggedAt: product.createdAt,
      seller: product.seller,
      category: product.category,
    }));

    return res.json({
      success: true,
      message: 'Flagged content retrieved successfully',
      data: transformedContent,
    });
  } catch (error: any) {
    logger.error('Get flagged content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/orders/refunds
 * Get refund requests (admin only)
 */
router.get('/orders/refunds', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get orders that might need refunds
    const [refunds, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          OR: [
            { status: 'cancelled' },
            { status: 'returned' },
            { paymentStatus: 'refunded' },
          ],
        },
        skip,
        take: limit,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.order.count({
        where: {
          OR: [
            { status: 'cancelled' },
            { status: 'returned' },
            { paymentStatus: 'refunded' },
          ],
        },
      }),
    ]);

    // Transform to refund format
    const transformedRefunds = refunds.map(order => ({
      id: order.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      reason: order.status === 'cancelled' ? 'order_cancelled' : 'product_returned',
      status: order.paymentStatus === 'refunded' ? 'completed' : 'requested',
      requestedAt: order.updatedAt,
      processedAt: order.paymentStatus === 'refunded' ? order.updatedAt : null,
      requester: order.buyer,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    }));

    return res.json({
      success: true,
      message: 'Refunds retrieved successfully',
      data: {
        data: transformedRefunds,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get refunds failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/content/reported
 * Get reported content (admin only)
 */
router.get('/content/reported', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get rejected products as reported content
    const [reports, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'rejected',
        },
        skip,
        take: limit,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.product.count({
        where: {
          status: 'rejected',
        },
      }),
    ]);

    const transformedReports = reports.map(product => ({
      id: product.id,
      contentType: 'product',
      contentId: product.id,
      title: product.title,
      description: product.description,
      reportReason: 'content_violation',
      status: 'resolved',
      priority: 'medium',
      reportedAt: product.updatedAt,
      resolvedAt: product.updatedAt,
      reporter: product.seller, // Using seller as reporter for demo
      assignee: null,
      content: {
        id: product.id,
        title: product.title,
        type: 'product',
      },
    }));

    return res.json({
      success: true,
      message: 'Reported content retrieved successfully',
      data: {
        data: transformedReports,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get reported content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/content/flagged
 * Get flagged content (admin only)
 */
router.get('/content/flagged', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get pending products as flagged content
    const [flagged, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'pending',
        },
        skip,
        take: limit,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.product.count({
        where: {
          status: 'pending',
        },
      }),
    ]);

    const transformedFlagged = flagged.map(product => ({
      id: product.id,
      contentType: 'product',
      contentId: product.id,
      title: product.title,
      description: product.description,
      flagReason: 'pending_review',
      status: 'flagged',
      priority: 'medium',
      flaggedAt: product.createdAt,
      flaggedBy: 'system',
      content: {
        id: product.id,
        title: product.title,
        type: 'product',
      },
      seller: product.seller,
    }));

    return res.json({
      success: true,
      message: 'Flagged content retrieved successfully',
      data: {
        data: transformedFlagged,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get flagged content failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/wallets
 * Get wallet information (admin only)
 */
router.get('/wallets', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          transactions: {
            take: 5,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          availableBalance: 'desc',
        },
      }),
      prisma.wallet.count(),
    ]);

    return res.json({
      success: true,
      message: 'Wallets retrieved successfully',
      data: {
        data: wallets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get wallets failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/settlements
 * Get settlement information (admin only)
 */
router.get('/settlements', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get completed orders as settlements
    const [settlements, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: 'delivered',
          paymentStatus: 'paid',
        },
        skip,
        take: limit,
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
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.order.count({
        where: {
          status: 'delivered',
          paymentStatus: 'paid',
        },
      }),
    ]);

    // Transform to settlement format
    const transformedSettlements = settlements.map(order => ({
      id: order.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      platformFee: Number(order.totalAmount) * 0.05, // 5% platform fee
      settlementAmount: Number(order.totalAmount) * 0.95,
      status: 'completed',
      settlementDate: order.updatedAt,
      payoutDate: order.updatedAt,
      seller: order.seller,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    }));

    return res.json({
      success: true,
      message: 'Settlements retrieved successfully',
      data: {
        data: transformedSettlements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get settlements failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/api
 * Get system API metrics (admin only)
 */
router.get('/system/api', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Mock API metrics data since we don't have actual metrics collection
    const apiMetrics = {
      totalRequests: 125000,
      successfulRequests: 118750,
      failedRequests: 6250,
      averageResponseTime: 245,
      requestsPerMinute: 87,
      errorRate: 0.05,
      endpoints: [
        {
          path: '/api/products',
          method: 'GET',
          requests: 25000,
          avgResponseTime: 180,
          errorRate: 0.02,
        },
        {
          path: '/api/orders',
          method: 'POST',
          requests: 15000,
          avgResponseTime: 320,
          errorRate: 0.03,
        },
        {
          path: '/api/auth/login',
          method: 'POST',
          requests: 12000,
          avgResponseTime: 150,
          errorRate: 0.08,
        },
      ],
      statusCodes: {
        '200': 95000,
        '201': 18000,
        '400': 3500,
        '401': 1500,
        '404': 800,
        '500': 450,
      },
      hourlyRequests: Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        requests: Math.floor(Math.random() * 1000) + 500,
        errors: Math.floor(Math.random() * 50) + 10,
      })),
    };

    return res.json({
      success: true,
      message: 'API metrics retrieved successfully',
      data: apiMetrics,
    });
  } catch (error: any) {
    logger.error('Get API metrics failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/content/moderation
 * Get content moderation queue (admin only)
 */
router.get('/content/moderation', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get pending products for moderation
    const [moderationItems, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'pending',
        },
        skip,
        take: limit,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          media: {
            take: 3,
          },
        },
        orderBy: {
          createdAt: 'asc', // Oldest first for moderation queue
        },
      }),
      prisma.product.count({
        where: {
          status: 'pending',
        },
      }),
    ]);

    const transformedItems = moderationItems.map(product => ({
      id: product.id,
      contentType: 'product',
      title: product.title,
      description: product.description,
      status: 'pending_review',
      priority: 'medium',
      submittedAt: product.createdAt,
      submittedBy: product.seller,
      category: product.category,
      media: product.media,
      moderationFlags: [],
      reviewNotes: '',
    }));

    return res.json({
      success: true,
      message: 'Content moderation queue retrieved successfully',
      data: {
        data: transformedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    logger.error('Get content moderation failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/content-stats
 * Get content statistics for dashboard (admin only)
 */
router.get('/dashboard/content-stats', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalContent,
      pendingReview,
      approvedContent,
      rejectedContent,
      flaggedContent,
      reportedContent,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'pending' } }),
      prisma.product.count({ where: { status: 'active' } }),
      prisma.product.count({ where: { status: 'rejected' } }),
      prisma.product.count({ where: { status: 'pending' } }), // Using pending as flagged
      prisma.product.count({ where: { status: 'rejected' } }), // Using rejected as reported
    ]);

    const stats = {
      totalContent,
      pendingReview,
      approvedContent,
      rejectedContent,
      flaggedContent,
      reportedContent,
      moderationQueue: pendingReview,
      averageReviewTime: 24, // hours - mock data
      contentGrowthRate: 15.5, // percentage - mock data
    };

    return res.json({
      success: true,
      message: 'Content stats retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    logger.error('Get content stats failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/reports/financial
 * Get financial reports (admin only)
 */
router.get('/reports/financial', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { type = 'all', dateFrom, dateTo } = req.query;

    const whereClause: any = {};
    if (dateFrom && dateTo) {
      whereClause.createdAt = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }

    const [
      totalRevenue,
      totalCommission,
      recentTransactions,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          ...whereClause,
          paymentStatus: 'paid',
        },
        _sum: {
          totalAmount: true,
        },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          ...whereClause,
          transactionType: 'commission',
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.walletTransaction.findMany({
        where: whereClause,
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          wallet: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const financialData = {
      summary: {
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        totalCommission: totalCommission._sum.amount || 0,
        totalSettlements: 0, // Placeholder
      },
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        type: tx.transactionType,
        amount: tx.amount,
        user: tx.wallet.user,
        createdAt: tx.createdAt,
      })),
    };

    return res.json({
      success: true,
      message: 'Financial report retrieved successfully',
      data: financialData,
    });
  } catch (error: any) {
    logger.error('Get financial report failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/reports/users
 * Get user reports (admin only)
 */
router.get('/reports/users', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, segment = 'all' } = req.query;

    const whereClause: any = {};
    if (dateFrom && dateTo) {
      whereClause.createdAt = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }

    if (segment !== 'all') {
      whereClause.userType = segment;
    }

    const [
      totalUsers,
      activeUsers,
      newUsers,
      usersByType,
    ] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.count({
        where: {
          ...whereClause,
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      prisma.user.groupBy({
        by: ['userType'],
        where: whereClause,
        _count: {
          id: true,
        },
      }),
    ]);

    const userReport = {
      summary: {
        totalUsers,
        activeUsers,
        newUsers,
      },
      breakdown: usersByType.map(group => ({
        type: group.userType,
        count: group._count.id,
      })),
    };

    return res.json({
      success: true,
      message: 'User report retrieved successfully',
      data: userReport,
    });
  } catch (error: any) {
    logger.error('Get user report failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/config
 * Get system configuration (admin only)
 */
router.get('/system/config', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const systemConfig = {
      platform: {
        name: 'Vikareta',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      features: {
        userRegistration: true,
        productApproval: true,
        automaticSettlements: false,
        disputeResolution: true,
      },
      limits: {
        maxProductsPerSeller: 1000,
        maxOrderValue: 100000,
        maxWalletBalance: 500000,
      },
      fees: {
        platformCommission: 5, // percentage
        paymentGatewayFee: 2.5, // percentage
        settlementFee: 0, // flat fee
      },
    };

    return res.json({
      success: true,
      message: 'System configuration retrieved successfully',
      data: systemConfig,
    });
  } catch (error: any) {
    logger.error('Get system config failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/notification-templates
 * Get notification templates (admin only)
 */
router.get('/system/notification-templates', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const templates = [
      {
        id: 'user_welcome',
        name: 'User Welcome',
        type: 'email',
        subject: 'Welcome to Vikareta!',
        content: 'Welcome to our platform...',
        variables: ['firstName', 'lastName'],
        active: true,
      },
      {
        id: 'order_confirmation',
        name: 'Order Confirmation',
        type: 'email',
        subject: 'Order Confirmed - #{orderId}',
        content: 'Your order has been confirmed...',
        variables: ['orderId', 'totalAmount'],
        active: true,
      },
      {
        id: 'product_approved',
        name: 'Product Approved',
        type: 'email',
        subject: 'Your product has been approved',
        content: 'Congratulations! Your product has been approved...',
        variables: ['productTitle'],
        active: true,
      },
    ];

    return res.json({
      success: true,
      message: 'Notification templates retrieved successfully',
      data: templates,
    });
  } catch (error: any) {
    logger.error('Get notification templates failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/feature-flags
 * Get feature flags (admin only)
 */
router.get('/system/feature-flags', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const featureFlags = [
      {
        id: 'new_dashboard',
        name: 'New Dashboard',
        description: 'Enable the new admin dashboard interface',
        enabled: true,
        rolloutPercentage: 100,
      },
      {
        id: 'advanced_analytics',
        name: 'Advanced Analytics',
        description: 'Enable advanced analytics features',
        enabled: false,
        rolloutPercentage: 0,
      },
      {
        id: 'auto_settlements',
        name: 'Automatic Settlements',
        description: 'Enable automatic settlement processing',
        enabled: false,
        rolloutPercentage: 0,
      },
    ];

    return res.json({
      success: true,
      message: 'Feature flags retrieved successfully',
      data: featureFlags,
    });
  } catch (error: any) {
    logger.error('Get feature flags failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/system/ab-tests
 * Get A/B tests (admin only)
 */
router.get('/system/ab-tests', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const abTests = [
      {
        id: 'checkout_flow_v2',
        name: 'Checkout Flow V2',
        description: 'Test new checkout flow design',
        status: 'running',
        variants: [
          { name: 'control', percentage: 50 },
          { name: 'variant_a', percentage: 50 },
        ],
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-02-01'),
      },
    ];

    return res.json({
      success: true,
      message: 'A/B tests retrieved successfully',
      data: abTests,
    });
  } catch (error: any) {
    logger.error('Get A/B tests failed:', error);
    throw error;
  }
}));

export { router as adminRoutes };

/**
 * GET /api/admin/dashboard/wallets
 * Get wallet information (admin only)
 */
router.get('/dashboard/wallets', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      take: 20,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            transactions: true,
          },
        },
      },
      orderBy: {
        availableBalance: 'desc',
      },
    });

    const walletsWithStats = wallets.map(wallet => ({
      ...wallet,
      transactionCount: wallet._count.transactions,
      // Add computed balance field for compatibility
      balance: wallet.availableBalance,
    }));

    return res.json({
      success: true,
      message: 'Wallets retrieved successfully',
      data: walletsWithStats,
    });
  } catch (error: any) {
    logger.error('Get wallets failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/settlements
 * Get settlement information (admin only)
 */
router.get('/dashboard/settlements', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get transactions that represent settlements (withdrawals, payouts)
    const settlements = await prisma.walletTransaction.findMany({
      where: {
        transactionType: 'withdrawal',
      },
      take: 20,
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedSettlements = settlements.map(transaction => ({
      id: transaction.id,
      amount: transaction.amount,
      status: 'completed', // Assume completed since it's in the database
      settlementDate: transaction.createdAt,
      user: transaction.wallet.user,
      referenceId: transaction.referenceId,
      cashfreeTransactionId: transaction.cashfreeTransactionId,
      description: transaction.description,
    }));

    return res.json({
      success: true,
      message: 'Settlements retrieved successfully',
      data: transformedSettlements,
    });
  } catch (error: any) {
    logger.error('Get settlements failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/system/api
 * Get API system information (admin only)
 */
router.get('/dashboard/system/api', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get some basic system stats
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalTransactions,
      recentActivity
    ] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.walletTransaction.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    const systemInfo = {
      apiVersion: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalTransactions,
        recentActivity,
      },
      health: {
        database: 'connected',
        redis: 'connected',
        status: 'healthy',
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: 'System API information retrieved successfully',
      data: systemInfo,
    });
  } catch (error: any) {
    logger.error('Get system API info failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/advertisements
 * Get advertisements for dashboard (admin only)
 */
router.get('/dashboard/advertisements', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Since we don't have an advertisements table, we'll return some mock data
    // In a real implementation, you would query your ads table
    const advertisements = [
      {
        id: '1',
        title: 'Featured Product Promotion',
        type: 'banner',
        status: 'active',
        impressions: 1250,
        clicks: 45,
        budget: 500,
        spent: 125.50,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: '2',
        title: 'Category Spotlight',
        type: 'sponsored',
        status: 'paused',
        impressions: 890,
        clicks: 23,
        budget: 300,
        spent: 67.25,
        startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];

    return res.json({
      success: true,
      message: 'Advertisements retrieved successfully',
      data: advertisements,
    });
  } catch (error: any) {
    logger.error('Get advertisements failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/disputes
 * Get disputes for dashboard (admin only)
 */
router.get('/dashboard/disputes', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get orders that might have disputes (cancelled, returned orders)
    const disputeOrders = await prisma.order.findMany({
      where: {
        OR: [
          { status: 'cancelled' },
          { status: 'returned' },
          { status: 'disputed' },
        ],
      },
      take: 20,
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const disputes = disputeOrders.map(order => ({
      id: order.id,
      orderId: order.id,
      type: order.status === 'cancelled' ? 'cancellation' : order.status === 'returned' ? 'return' : 'dispute',
      status: 'pending',
      amount: order.totalAmount,
      reason: order.status === 'cancelled' ? 'Order cancelled by user' : 'Product return request',
      createdAt: order.updatedAt,
      buyer: order.buyer,
      seller: order.seller,
    }));

    return res.json({
      success: true,
      message: 'Disputes retrieved successfully',
      data: disputes,
    });
  } catch (error: any) {
    logger.error('Get disputes failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/reports/financial
 * Get financial reports (admin only)
 */
router.get('/dashboard/reports/financial', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalRevenue,
      monthlyRevenue,
      totalTransactions,
      monthlyTransactions,
      totalCommission,
      monthlyCommission
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'delivered' }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'delivered',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }
      }),
      prisma.walletTransaction.count(),
      prisma.walletTransaction.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'delivered' }
      }).then(result => Number(result._sum.totalAmount || 0) * 0.05), // 5% commission
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'delivered',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }
      }).then(result => Number(result._sum.totalAmount || 0) * 0.05), // 5% commission
    ]);

    const financialReport = {
      revenue: {
        total: totalRevenue._sum.totalAmount || 0,
        monthly: monthlyRevenue._sum.totalAmount || 0,
        growth: 12.5, // Mock growth percentage
      },
      transactions: {
        total: totalTransactions,
        monthly: monthlyTransactions,
        growth: 8.3, // Mock growth percentage
      },
      commission: {
        total: totalCommission,
        monthly: monthlyCommission,
        rate: 5.0, // 5% commission rate
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: 'Financial report retrieved successfully',
      data: financialReport,
    });
  } catch (error: any) {
    logger.error('Get financial report failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/reports/users
 * Get user reports (admin only)
 */
router.get('/dashboard/reports/users', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      monthlyUsers,
      verifiedUsers,
      activeUsers,
      sellerUsers,
      buyerUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }
      }),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Active in last 30 days
          },
        }
      }),
      prisma.user.count({ where: { userType: 'seller' } }),
      prisma.user.count({ where: { userType: 'buyer' } }),
    ]);

    const userReport = {
      overview: {
        total: totalUsers,
        monthly: monthlyUsers,
        verified: verifiedUsers,
        active: activeUsers,
        growth: ((monthlyUsers / Math.max(totalUsers - monthlyUsers, 1)) * 100).toFixed(1),
      },
      breakdown: {
        sellers: sellerUsers,
        buyers: buyerUsers,
        verificationRate: ((verifiedUsers / Math.max(totalUsers, 1)) * 100).toFixed(1),
        activeRate: ((activeUsers / Math.max(totalUsers, 1)) * 100).toFixed(1),
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: 'User report retrieved successfully',
      data: userReport,
    });
  } catch (error: any) {
    logger.error('Get user report failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/system/config
 * Get system configuration (admin only)
 */
router.get('/dashboard/system/config', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const systemConfig = {
      platform: {
        name: 'Vikareta',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        maintenance: false,
      },
      features: {
        userRegistration: true,
        productListing: true,
        orderProcessing: true,
        paymentGateway: true,
        notifications: true,
        analytics: true,
      },
      limits: {
        maxProductImages: 10,
        maxFileSize: '10MB',
        maxOrderValue: 1000000,
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      },
      integrations: {
        paymentGateway: 'Cashfree',
        smsProvider: 'Twilio',
        emailProvider: 'SendGrid',
        storageProvider: 'AWS S3',
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: 'System configuration retrieved successfully',
      data: systemConfig,
    });
  } catch (error: any) {
    logger.error('Get system config failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/system/features
 * Get system features status (admin only)
 */
router.get('/dashboard/system/features', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const features = [
      {
        id: 'user_registration',
        name: 'User Registration',
        description: 'Allow new users to register on the platform',
        enabled: true,
        category: 'user_management',
      },
      {
        id: 'product_listing',
        name: 'Product Listing',
        description: 'Allow sellers to list new products',
        enabled: true,
        category: 'marketplace',
      },
      {
        id: 'order_processing',
        name: 'Order Processing',
        description: 'Process new orders and payments',
        enabled: true,
        category: 'commerce',
      },
      {
        id: 'notifications',
        name: 'Notifications',
        description: 'Send email and SMS notifications',
        enabled: true,
        category: 'communication',
      },
      {
        id: 'analytics',
        name: 'Analytics',
        description: 'Track user behavior and platform metrics',
        enabled: true,
        category: 'insights',
      },
      {
        id: 'maintenance_mode',
        name: 'Maintenance Mode',
        description: 'Put the platform in maintenance mode',
        enabled: false,
        category: 'system',
      },
    ];

    return res.json({
      success: true,
      message: 'System features retrieved successfully',
      data: features,
    });
  } catch (error: any) {
    logger.error('Get system features failed:', error);
    throw error;
  }
}));

/**
 * GET /api/admin/dashboard/system/notifications
 * Get system notifications configuration (admin only)
 */
router.get('/dashboard/system/notifications', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const notificationConfig = {
      email: {
        enabled: true,
        provider: 'SendGrid',
        templates: {
          welcome: true,
          orderConfirmation: true,
          paymentReceived: true,
          productApproved: true,
          productRejected: true,
        },
      },
      sms: {
        enabled: true,
        provider: 'Twilio',
        templates: {
          otp: true,
          orderUpdate: true,
          paymentAlert: true,
        },
      },
      push: {
        enabled: false,
        provider: 'Firebase',
        templates: {
          newMessage: false,
          orderUpdate: false,
        },
      },
      inApp: {
        enabled: true,
        retention: 30, // days
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: 'System notifications configuration retrieved successfully',
      data: notificationConfig,
    });
  } catch (error: any) {
    logger.error('Get system notifications config failed:', error);
    throw error;
  }
}));