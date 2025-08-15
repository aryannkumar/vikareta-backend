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
 * GET /dashboard/orders/:id
 * Get specific order by ID
 */
router.get('/orders/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.authUser?.userId;

    const order = await prisma.order.findFirst({
        where: {
            id,
            OR: [
                { buyerId: userId },
                { sellerId: userId },
            ],
        },
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
    });

    if (!order) {
        return res.status(404).json({
            success: false,
            error: {
                code: 'ORDER_NOT_FOUND',
                message: 'Order not found or access denied',
            },
        });
    }

    return res.json({
        success: true,
        message: 'Order retrieved successfully',
        data: order,
    });
}));

/**
 * GET /dashboard/orders/completed
 * Get completed orders
 */
router.get('/orders/completed', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const { page = 1, limit = 20 } = req.query;

    const completedOrders = await prisma.order.findMany({
        where: {
            status: 'delivered', // Use 'delivered' as the completed status
            OR: [
                { buyerId: userId },
                { sellerId: userId },
            ],
        },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
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
        orderBy: {
            updatedAt: 'desc',
        },
    });

    const totalCount = await prisma.order.count({
        where: {
            status: 'delivered', // Use 'delivered' as the completed status
            OR: [
                { buyerId: userId },
                { sellerId: userId },
            ],
        },
    });

    return res.json({
        success: true,
        message: 'Completed orders retrieved successfully',
        data: completedOrders,
        pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: totalCount,
            totalPages: Math.ceil(totalCount / parseInt(limit as string)),
        },
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

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get comprehensive stats for the user
    const [
        totalOrders,
        totalProducts,
        totalRFQs,
        totalQuotes,
        recentOrders,
        pendingOrders,
        totalRevenue,
        recentRevenue,
        activeProducts,
        pendingRFQs,
        unreadNotifications,
    ] = await Promise.all([
        // Total counts
        prisma.order.count({
            where: {
                OR: [{ buyerId: userId }, { sellerId: userId }]
            }
        }),
        prisma.product.count({
            where: {
                sellerId: userId
            }
        }),
        prisma.rfq.count({
            where: {
                buyerId: userId
            }
        }),
        prisma.quote.count({
            where: {
                sellerId: userId
            }
        }),

        // Recent activity (last 30 days)
        prisma.order.count({
            where: {
                OR: [{ buyerId: userId }, { sellerId: userId }],
                createdAt: { gte: thirtyDaysAgo }
            }
        }),

        // Pending orders
        prisma.order.count({
            where: {
                OR: [{ buyerId: userId }, { sellerId: userId }],
                status: { in: ['pending', 'confirmed', 'processing'] }
            }
        }),

        // Total revenue (as seller)
        prisma.order.aggregate({
            where: {
                sellerId: userId,
                status: { in: ['completed', 'delivered'] }
            },
            _sum: { totalAmount: true }
        }),

        // Recent revenue (last 30 days)
        prisma.order.aggregate({
            where: {
                sellerId: userId,
                status: { in: ['completed', 'delivered'] },
                createdAt: { gte: thirtyDaysAgo }
            },
            _sum: { totalAmount: true }
        }),

        // Active products
        prisma.product.count({
            where: {
                sellerId: userId,
                status: 'active'
            }
        }),

        // Pending RFQs (as buyer)
        prisma.rfq.count({
            where: {
                buyerId: userId,
                status: 'active'
            }
        }),

        // Unread notifications (mock for now)
        Promise.resolve(0)
    ]);

    // Calculate growth rates
    const previousPeriodStart = new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previousRevenue = await prisma.order.aggregate({
        where: {
            sellerId: userId,
            status: { in: ['completed', 'delivered'] },
            createdAt: {
                gte: previousPeriodStart,
                lt: thirtyDaysAgo
            }
        },
        _sum: { totalAmount: true }
    });

    const currentRevenue = Number(recentRevenue._sum.totalAmount || 0);
    const prevRevenue = Number(previousRevenue._sum.totalAmount || 0);
    const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    return res.json({
        success: true,
        message: 'Dashboard stats retrieved successfully',
        data: {
            // Core metrics
            totalOrders,
            totalProducts,
            totalRFQs,
            totalQuotes,

            // Recent activity
            recentOrders,
            pendingOrders,

            // Revenue metrics
            totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
            recentRevenue: currentRevenue,
            revenueGrowth: Math.round(revenueGrowth * 100) / 100,

            // Product metrics
            activeProducts,

            // RFQ metrics
            pendingRFQs,

            // Notifications
            notifications: unreadNotifications,

            // Period info
            period: '30 days',
            lastUpdated: now.toISOString(),
        },
    });
}));

/**
 * GET /dashboard/activity
 * Get recent activity
 */
router.get('/activity', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get multiple types of recent activity
    const [recentOrders, recentRFQs, recentQuotes, recentProducts] = await Promise.all([
        // Recent orders
        prisma.order.findMany({
            where: {
                OR: [{ buyerId: userId }, { sellerId: userId }],
                createdAt: { gte: sevenDaysAgo }
            },
            take: Math.floor(limit / 2),
            orderBy: { createdAt: 'desc' },
            include: {
                buyer: { select: { firstName: true, lastName: true, email: true } },
                seller: { select: { firstName: true, lastName: true, email: true } },
                items: {
                    take: 1,
                    include: {
                        product: { select: { title: true } }
                    }
                }
            },
        }),

        // Recent RFQs (as buyer)
        prisma.rfq.findMany({
            where: {
                buyerId: userId,
                createdAt: { gte: sevenDaysAgo }
            },
            take: Math.floor(limit / 4),
            orderBy: { createdAt: 'desc' },
            include: {
                category: { select: { name: true } }
            }
        }),

        // Recent quotes (as seller)
        prisma.quote.findMany({
            where: {
                sellerId: userId,
                createdAt: { gte: sevenDaysAgo }
            },
            take: Math.floor(limit / 4),
            orderBy: { createdAt: 'desc' },
            include: {
                rfq: {
                    include: {
                        buyer: { select: { firstName: true, lastName: true } },
                        category: { select: { name: true } }
                    }
                }
            }
        }),

        // Recent products (as seller)
        prisma.product.findMany({
            where: {
                sellerId: userId,
                createdAt: { gte: sevenDaysAgo }
            },
            take: Math.floor(limit / 4),
            orderBy: { createdAt: 'desc' },
            include: {
                category: { select: { name: true } }
            }
        })
    ]);

    // Combine and format all activities
    const activities: any[] = [];

    // Add order activities
    recentOrders.forEach(order => {
        const isSellerView = order.sellerId === userId;
        const otherParty = isSellerView ? order.buyer : order.seller;
        const productName = order.items[0]?.product?.title || 'Unknown Product';

        activities.push({
            id: `order-${order.id}`,
            type: 'order',
            title: `${isSellerView ? 'Received' : 'Placed'} Order #${order.orderNumber}`,
            description: `Order for ${productName} - Status: ${order.status}`,
            timestamp: order.createdAt,
            status: order.status,
            amount: Number(order.totalAmount),
            user: {
                name: `${otherParty.firstName} ${otherParty.lastName}`,
                email: otherParty.email
            },
            metadata: {
                orderNumber: order.orderNumber,
                itemCount: order.items.length
            }
        });
    });

    // Add RFQ activities
    recentRFQs.forEach(rfq => {
        activities.push({
            id: `rfq-${rfq.id}`,
            type: 'rfq',
            title: `Created RFQ: ${rfq.title}`,
            description: `Request for ${rfq.category?.name || 'Unknown Category'} - Quantity: ${rfq.quantity}`,
            timestamp: rfq.createdAt,
            status: rfq.status,
            metadata: {
                quantity: rfq.quantity,
                category: rfq.category?.name,
                budgetMin: rfq.budgetMin ? Number(rfq.budgetMin) : null,
                budgetMax: rfq.budgetMax ? Number(rfq.budgetMax) : null
            }
        });
    });

    // Add quote activities
    recentQuotes.forEach(quote => {
        activities.push({
            id: `quote-${quote.id}`,
            type: 'quote',
            title: `Sent Quote for ${quote.rfq.title}`,
            description: `Quote to ${quote.rfq.buyer.firstName} ${quote.rfq.buyer.lastName} - Amount: ₹${Number(quote.totalPrice)}`,
            timestamp: quote.createdAt,
            status: quote.status,
            amount: Number(quote.totalPrice),
            user: {
                name: `${quote.rfq.buyer.firstName} ${quote.rfq.buyer.lastName}`
            },
            metadata: {
                rfqTitle: quote.rfq.title,
                category: quote.rfq.category?.name
            }
        });
    });

    // Add product activities
    recentProducts.forEach(product => {
        activities.push({
            id: `product-${product.id}`,
            type: 'product',
            title: `Listed Product: ${product.title}`,
            description: `Added ${product.title} in ${product.category?.name || 'Unknown Category'}`,
            timestamp: product.createdAt,
            status: product.status,
            amount: Number(product.price),
            metadata: {
                category: product.category?.name,
                stock: product.stockQuantity
            }
        });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit to requested number
    const limitedActivities = activities.slice(0, limit);

    return res.json({
        success: true,
        message: 'Recent activity retrieved successfully',
        data: {
            activities: limitedActivities,
            total: limitedActivities.length,
            period: '7 days',
            lastUpdated: new Date().toISOString()
        },
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
/**

 * GET /dashboard/products/performance
 * Get product performance analytics for seller
 */
router.get('/products/performance', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const limit = parseInt(req.query.limit as string) || 10;
    const period = req.query.period as string || '30d';

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch (period) {
        case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
        default:
            startDate.setDate(now.getDate() - 30);
    }

    // Get seller's products with order data
    const products = await prisma.product.findMany({
        where: {
            sellerId: userId,
            status: 'active'
        },
        include: {
            category: {
                select: { name: true }
            },
            orderItems: {
                where: {
                    order: {
                        createdAt: {
                            gte: startDate,
                            lte: now
                        },
                        status: { in: ['completed', 'delivered'] }
                    }
                },
                include: {
                    order: {
                        select: {
                            createdAt: true,
                            status: true
                        }
                    }
                }
            }
        }
    });

    // Calculate performance metrics for each product
    const productPerformance = products.map(product => {
        const orderItems = product.orderItems;
        const totalRevenue = orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
        const totalOrders = orderItems.length;
        const totalQuantitySold = orderItems.reduce((sum, item) => sum + item.quantity, 0);

        return {
            id: product.id,
            title: product.title,
            category: product.category?.name || 'Uncategorized',
            price: Number(product.price),
            stock: product.stockQuantity,
            revenue: totalRevenue,
            orderCount: totalOrders,
            quantitySold: totalQuantitySold,
            conversionRate: product.stockQuantity > 0 ? (totalQuantitySold / product.stockQuantity) * 100 : 0,
            createdAt: product.createdAt
        };
    });

    // Sort by revenue and limit results
    productPerformance.sort((a, b) => b.revenue - a.revenue);
    const topProducts = productPerformance.slice(0, limit);

    // Calculate summary metrics
    const summary = {
        totalProducts: products.length,
        totalRevenue: productPerformance.reduce((sum, p) => sum + p.revenue, 0),
        totalOrders: productPerformance.reduce((sum, p) => sum + p.orderCount, 0),
        averageRevenue: products.length > 0 ? productPerformance.reduce((sum, p) => sum + p.revenue, 0) / products.length : 0
    };

    return res.json({
        success: true,
        message: 'Product performance retrieved successfully',
        data: {
            products: topProducts,
            summary,
            period,
            lastUpdated: now.toISOString()
        }
    });
}));

/**
 * GET /dashboard/revenue/trends
 * Get revenue trends over time
 */
router.get('/revenue/trends', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.authUser?.userId;
    const period = req.query.period as string || '30d';
    const groupBy = req.query.groupBy as string || 'day';

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User not authenticated',
        });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch (period) {
        case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
        case '1y':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        default:
            startDate.setDate(now.getDate() - 30);
    }

    // Get orders for the period
    const orders = await prisma.order.findMany({
        where: {
            sellerId: userId,
            status: { in: ['completed', 'delivered'] },
            createdAt: {
                gte: startDate,
                lte: now
            }
        },
        select: {
            totalAmount: true,
            createdAt: true
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    // Group orders by time period
    const revenueMap = new Map<string, { revenue: number; orderCount: number }>();

    orders.forEach(order => {
        const orderDate = new Date(order.createdAt);
        let periodKey: string;

        switch (groupBy) {
            case 'day':
                periodKey = orderDate.toISOString().split('T')[0];
                break;
            case 'week':
                const weekStart = new Date(orderDate);
                weekStart.setDate(orderDate.getDate() - orderDate.getDay());
                periodKey = weekStart.toISOString().split('T')[0];
                break;
            case 'month':
                periodKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
                break;
            default:
                periodKey = orderDate.toISOString().split('T')[0];
        }

        const revenue = Number(order.totalAmount);
        if (revenueMap.has(periodKey)) {
            const existing = revenueMap.get(periodKey)!;
            existing.revenue += revenue;
            existing.orderCount += 1;
        } else {
            revenueMap.set(periodKey, { revenue, orderCount: 1 });
        }
    });

    // Convert to array and sort
    const trends = Array.from(revenueMap.entries())
        .map(([period, data]) => ({
            period,
            revenue: data.revenue,
            orderCount: data.orderCount,
            averageOrderValue: data.orderCount > 0 ? data.revenue / data.orderCount : 0
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate totals and growth
    const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);
    const totalOrders = trends.reduce((sum, t) => sum + t.orderCount, 0);

    // Calculate growth rate (compare first and last periods)
    const growthRate = trends.length >= 2
        ? ((trends[trends.length - 1].revenue - trends[0].revenue) / (trends[0].revenue || 1)) * 100
        : 0;

    return res.json({
        success: true,
        message: 'Revenue trends retrieved successfully',
        data: {
            trends,
            summary: {
                totalRevenue,
                totalOrders,
                averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                growthRate: Math.round(growthRate * 100) / 100
            },
            period,
            groupBy,
            lastUpdated: now.toISOString()
        }
    });
}));