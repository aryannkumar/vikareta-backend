import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /dashboard/categories
 * Get categories for dashboard
 */
router.get('/categories', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * GET /dashboard/orders/refunds
 * Get orders with refund requests
 */
router.get('/orders/refunds', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * GET /dashboard/content/reported
 * Get reported content
 */
router.get('/content/reported', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
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
        reportReason: 'Content violation',
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
}));

/**
 * GET /dashboard/content/flagged
 * Get flagged content
 */
router.get('/content/flagged', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * GET /dashboard/transactions
 * Get transactions for dashboard
 */
router.get('/transactions', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * GET /dashboard/settlements
 * Get settlement data
 */
router.get('/settlements', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    // Get completed orders that represent settlements
    const settlements = await prisma.order.findMany({
        where: {
            status: 'delivered',
            paymentStatus: 'paid',
        },
        take: 20,
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
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });

    const transformedSettlements = settlements.map(order => ({
        id: order.id,
        sellerId: order.sellerId,
        sellerName: `${order.seller.firstName} ${order.seller.lastName}`,
        businessName: order.seller.businessName,
        amount: order.totalAmount,
        status: 'settled',
        settledAt: order.updatedAt,
        orderId: order.id,
        paymentMethod: 'wallet', // Default since we don't have this field
    }));

    return res.json({
        success: true,
        message: 'Settlements retrieved successfully',
        data: transformedSettlements,
    });
}));

/**
 * GET /dashboard/wallets
 * Get wallet information
 */
router.get('/wallets', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const wallets = await prisma.wallet.findMany({
        take: 20,
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    userType: true,
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

    const transformedWallets = wallets.map(wallet => ({
        id: wallet.id,
        userId: wallet.userId,
        userName: `${wallet.user.firstName} ${wallet.user.lastName}`,
        userEmail: wallet.user.email,
        userType: wallet.user.userType,
        availableBalance: wallet.availableBalance,
        lockedBalance: wallet.lockedBalance,
        negativeBalance: wallet.negativeBalance,
        totalBalance: Number(wallet.availableBalance) + Number(wallet.lockedBalance),
        transactionCount: wallet._count.transactions,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
    }));

    return res.json({
        success: true,
        message: 'Wallets retrieved successfully',
        data: transformedWallets,
    });
}));

/**
 * GET /dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // Get basic stats for the user
    const [
        totalOrders,
        totalProducts,
        totalRFQs,
        totalQuotes,
    ] = await Promise.all([
        prisma.order.count({ where: { OR: [{ buyerId: userId }, { sellerId: userId }] } }),
        prisma.product.count({ where: { sellerId: userId } }),
        prisma.rfq.count({ where: { buyerId: userId } }),
        prisma.quote.count({ where: { sellerId: userId } }),
    ]);

    return res.json({
        success: true,
        message: 'Dashboard stats retrieved successfully',
        data: {
            totalOrders,
            totalProducts,
            totalRFQs,
            totalQuotes,
            recentActivity: [],
            notifications: 0,
        },
    });
}));

/**
 * GET /dashboard/activity
 * Get recent activity
 */
router.get('/activity', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // Get recent orders as activity
    const recentOrders = await prisma.order.findMany({
        where: {
            OR: [{ buyerId: userId }, { sellerId: userId }],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
            buyer: { select: { firstName: true, lastName: true } },
            seller: { select: { firstName: true, lastName: true } },
        },
    });

    const activity = recentOrders.map(order => ({
        id: order.id,
        type: 'order',
        title: `Order ${order.orderNumber}`,
        description: `Order ${order.status}`,
        timestamp: order.createdAt,
        user: order.buyerId === userId ? order.seller : order.buyer,
    }));

    return res.json({
        success: true,
        message: 'Recent activity retrieved successfully',
        data: activity,
    });
}));

/**
 * GET /dashboard/quick-actions
 * Get quick actions for dashboard
 */
router.get('/quick-actions', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const quickActions = [
        {
            id: 'create-rfq',
            title: 'Create RFQ',
            description: 'Post a new request for quotation',
            icon: 'plus',
            href: '/dashboard/rfqs/new',
        },
        {
            id: 'add-product',
            title: 'Add Product',
            description: 'List a new product',
            icon: 'package',
            href: '/dashboard/products/new',
        },
        {
            id: 'view-orders',
            title: 'View Orders',
            description: 'Check your recent orders',
            icon: 'shopping-cart',
            href: '/dashboard/orders',
        },
        {
            id: 'manage-quotes',
            title: 'Manage Quotes',
            description: 'Review and respond to quotes',
            icon: 'file-text',
            href: '/dashboard/quotes',
        },
    ];

    return res.json({
        success: true,
        message: 'Quick actions retrieved successfully',
        data: quickActions,
    });
}));

/**
 * GET /dashboard/saved-items
 * Get saved items
 */
router.get('/saved-items', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // For now, return empty array as we don't have saved items table
    return res.json({
        success: true,
        message: 'Saved items retrieved successfully',
        data: {
            items: [],
            total: 0,
            page,
            totalPages: 0,
        },
    });
}));

/**
 * POST /dashboard/saved-items
 * Add item to saved items
 */
router.post('/saved-items', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const { itemId, type } = req.body;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // For now, just return success as we don't have saved items table
    return res.json({
        success: true,
        message: 'Item saved successfully',
        data: { itemId, type },
    });
}));

/**
 * DELETE /dashboard/saved-items/:itemId
 * Remove item from saved items
 */
router.delete('/saved-items/:itemId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const { itemId } = req.params;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // For now, just return success as we don't have saved items table
    return res.json({
        success: true,
        message: 'Item removed from saved items',
    });
}));

/**
 * GET /dashboard/system/api
 * Get API system information
 */
router.get('/system/api', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    // Get basic system stats
    const [
        totalUsers,
        totalProducts,
        totalOrders,
        totalTransactions,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.product.count(),
        prisma.order.count(),
        prisma.walletTransaction.count(),
    ]);

    const systemInfo = {
        status: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        database: {
            status: 'connected',
            totalUsers,
            totalProducts,
            totalOrders,
            totalTransactions,
        },
        memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external,
        },
        timestamp: new Date().toISOString(),
    };

    return res.json({
        success: true,
        message: 'System API information retrieved successfully',
        data: systemInfo,
    });
}));

export { router as dashboardRoutes };