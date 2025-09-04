import { PrismaClient } from '@prisma/client';
import { redisClient } from '../config/redis';
import { elasticsearchService } from './elasticsearch.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class AnalyticsService {
    // User Analytics
    async getUserAnalytics(userId: string, timeframe: 'day' | 'week' | 'month' | 'year' = 'month') {
        const cacheKey = `analytics:user:${userId}:${timeframe}`;
        
        try {
            // Try to get from cache first
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.warn('Redis error in getUserAnalytics:', error);
        }

        const dateRange = this.getDateRange(timeframe);
        
        const [
            totalOrders,
            totalSpent,
            totalProducts,
            totalServices,
            recentActivity,
            ordersByStatus,
            spendingTrend
        ] = await Promise.all([
            // Total orders
            prisma.order.count({
                where: {
                    buyerId: userId,
                    createdAt: { gte: dateRange.start }
                }
            }),
            
            // Total spent
            prisma.order.aggregate({
                where: {
                    buyerId: userId,
                    createdAt: { gte: dateRange.start },
                    status: { in: ['DELIVERED', 'COMPLETED'] }
                },
                _sum: { totalAmount: true }
            }),
            
            // Total products purchased
            prisma.orderItem.count({
                where: {
                    order: {
                        buyerId: userId,
                        createdAt: { gte: dateRange.start }
                    },
                    productId: { not: null }
                }
            }),
            
            // Total services booked
            prisma.orderItem.count({
                where: {
                    order: {
                        buyerId: userId,
                        createdAt: { gte: dateRange.start }
                    },
                    serviceId: { not: null }
                }
            }),
            
            // Recent activity
            prisma.order.findMany({
                where: {
                    buyerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                select: {
                    id: true,
                    orderNumber: true,
                    totalAmount: true,
                    status: true,
                    createdAt: true,
                    items: {
                        select: {
                            product: { select: { title: true } },
                            service: { select: { title: true } },
                            quantity: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            
            // Orders by status
            prisma.order.groupBy({
                by: ['status'],
                where: {
                    buyerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                _count: { id: true }
            }),
            
            // Spending trend
            this.getSpendingTrend(userId, timeframe)
        ]);

        const analytics = {
            summary: {
                totalOrders,
                totalSpent: totalSpent._sum.totalAmount || 0,
                totalProducts,
                totalServices,
                averageOrderValue: totalOrders > 0 ? Number(totalSpent._sum.totalAmount || 0) / totalOrders : 0
            },
            recentActivity,
            ordersByStatus: ordersByStatus.map(item => ({
                status: item.status,
                count: item._count.id
            })),
            spendingTrend,
            timeframe,
            generatedAt: new Date()
        };

        // Cache for 1 hour
        try {
            await redisClient.setex(cacheKey, 3600, JSON.stringify(analytics));
        } catch (error) {
            logger.warn('Redis error caching user analytics:', error);
        }

        return analytics;
    }

    // Business Analytics (for sellers/service providers)
    async getBusinessAnalytics(userId: string, timeframe: 'day' | 'week' | 'month' | 'year' = 'month') {
        const cacheKey = `analytics:business:${userId}:${timeframe}`;
        
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.warn('Redis error in getBusinessAnalytics:', error);
        }

        const dateRange = this.getDateRange(timeframe);
        
        const [
            totalRevenue,
            totalOrders,
            totalProducts,
            totalServices,
            topProducts,
            topServices,
            revenueByMonth,
            ordersByStatus,
            customerAnalytics
        ] = await Promise.all([
            // Total revenue
            prisma.order.aggregate({
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start },
                    status: { in: ['DELIVERED', 'COMPLETED'] }
                },
                _sum: { totalAmount: true }
            }),
            
            // Total orders
            prisma.order.count({
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start }
                }
            }),
            
            // Total products
            prisma.product.count({
                where: {
                    sellerId: userId,
                    isActive: true
                }
            }),
            
            // Total services
            prisma.service.count({
                where: {
                    providerId: userId,
                    isActive: true
                }
            }),
            
            // Top products
            prisma.orderItem.groupBy({
                by: ['productId'],
                where: {
                    order: {
                        sellerId: userId,
                        createdAt: { gte: dateRange.start }
                    },
                    productId: { not: null }
                },
                _sum: { quantity: true, totalPrice: true },
                _count: { id: true },
                orderBy: { _sum: { totalPrice: 'desc' } },
                take: 5
            }),
            
            // Top services
            prisma.orderItem.groupBy({
                by: ['serviceId'],
                where: {
                    order: {
                        sellerId: userId,
                        createdAt: { gte: dateRange.start }
                    },
                    serviceId: { not: null }
                },
                _sum: { quantity: true, totalPrice: true },
                _count: { id: true },
                orderBy: { _sum: { totalPrice: 'desc' } },
                take: 5
            }),
            
            // Revenue by month
            this.getRevenueByMonth(userId, timeframe),
            
            // Orders by status
            prisma.order.groupBy({
                by: ['status'],
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                _count: { id: true },
                _sum: { totalAmount: true }
            }),
            
            // Customer analytics
            this.getCustomerAnalytics(userId, dateRange)
        ]);

        // Get product/service details for top items
        const topProductDetails = await this.getProductDetails(topProducts);
        const topServiceDetails = await this.getServiceDetails(topServices);

        const analytics = {
            summary: {
                totalRevenue: totalRevenue._sum.totalAmount || 0,
                totalOrders,
                totalProducts,
                totalServices,
                averageOrderValue: totalOrders > 0 ? Number(totalRevenue._sum.totalAmount || 0) / totalOrders : 0
            },
            topProducts: topProductDetails,
            topServices: topServiceDetails,
            revenueByMonth,
            ordersByStatus: ordersByStatus.map(item => ({
                status: item.status,
                count: item._count.id,
                revenue: item._sum.totalAmount || 0
            })),
            customerAnalytics,
            timeframe,
            generatedAt: new Date()
        };

        // Cache for 1 hour
        try {
            await redisClient.setex(cacheKey, 3600, JSON.stringify(analytics));
        } catch (error) {
            logger.warn('Redis error caching business analytics:', error);
        }

        return analytics;
    }

    // Platform Analytics (admin only)
    async getPlatformAnalytics(timeframe: 'day' | 'week' | 'month' | 'year' = 'month') {
        const cacheKey = `analytics:platform:${timeframe}`;
        
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.warn('Redis error in getPlatformAnalytics:', error);
        }

        const dateRange = this.getDateRange(timeframe);
        
        const [
            totalUsers,
            newUsers,
            totalOrders,
            totalRevenue,
            totalProducts,
            totalServices,
            usersByType,
            ordersByStatus,
            revenueByCategory,
            topCategories,
            searchAnalytics
        ] = await Promise.all([
            // Total users
            prisma.user.count(),
            
            // New users
            prisma.user.count({
                where: { createdAt: { gte: dateRange.start } }
            }),
            
            // Total orders
            prisma.order.count({
                where: { createdAt: { gte: dateRange.start } }
            }),
            
            // Total revenue
            prisma.order.aggregate({
                where: {
                    createdAt: { gte: dateRange.start },
                    status: { in: ['DELIVERED', 'COMPLETED'] }
                },
                _sum: { totalAmount: true }
            }),
            
            // Total products
            prisma.product.count({
                where: { isActive: true }
            }),
            
            // Total services
            prisma.service.count({
                where: { isActive: true }
            }),
            
            // Users by type
            prisma.user.groupBy({
                by: ['userType'],
                _count: { id: true }
            }),
            
            // Orders by status
            prisma.order.groupBy({
                by: ['status'],
                where: { createdAt: { gte: dateRange.start } },
                _count: { id: true },
                _sum: { totalAmount: true }
            }),
            
            // Revenue by category
            this.getRevenueByCategory(dateRange),
            
            // Top categories
            this.getTopCategories(dateRange),
            
            // Search analytics
            this.getSearchAnalytics(dateRange)
        ]);

        const analytics = {
            summary: {
                totalUsers,
                newUsers,
                totalOrders,
                totalRevenue: totalRevenue._sum.totalAmount || 0,
                totalProducts,
                totalServices,
                averageOrderValue: totalOrders > 0 ? Number(totalRevenue._sum.totalAmount || 0) / totalOrders : 0
            },
            usersByType: usersByType.map(item => ({
                type: item.userType,
                count: item._count.id
            })),
            ordersByStatus: ordersByStatus.map(item => ({
                status: item.status,
                count: item._count.id,
                revenue: item._sum.totalAmount || 0
            })),
            revenueByCategory,
            topCategories,
            searchAnalytics,
            timeframe,
            generatedAt: new Date()
        };

        // Cache for 30 minutes
        try {
            await redisClient.setex(cacheKey, 1800, JSON.stringify(analytics));
        } catch (error) {
            logger.warn('Redis error caching platform analytics:', error);
        }

        return analytics;
    }

    // Search Analytics using Elasticsearch
    async getSearchAnalytics(dateRange: { start: Date; end: Date }) {
        try {
            // Get search analytics from database (mock data for now)
            const searchStats: any[] = [
                { query: 'electronics', searchCount: 150 },
                { query: 'machinery', searchCount: 120 },
                { query: 'textiles', searchCount: 90 },
            ];

            // Get search trends from Elasticsearch if available
            let searchTrends = [];
            try {
                const esResponse = await elasticsearchService.search('search_logs', {
                    query: {
                        range: {
                            timestamp: {
                                gte: dateRange.start.toISOString(),
                                lte: dateRange.end.toISOString()
                            }
                        }
                    },
                    aggs: {
                        popular_searches: {
                            terms: {
                                field: 'query.keyword',
                                size: 10
                            }
                        },
                        search_trends: {
                            date_histogram: {
                                field: 'timestamp',
                                calendar_interval: 'day'
                            }
                        }
                    }
                });

                if (esResponse.aggregations) {
                    searchTrends = esResponse.aggregations.search_trends.buckets;
                }
            } catch (esError) {
                logger.warn('Elasticsearch error in search analytics:', esError);
            }

            return {
                topSearches: searchStats,
                searchTrends,
                totalSearches: searchStats.reduce((sum, item) => sum + item.searchCount, 0)
            };
        } catch (error) {
            logger.error('Error getting search analytics:', error);
            return {
                topSearches: [],
                searchTrends: [],
                totalSearches: 0
            };
        }
    }

    // Helper methods
    private getDateRange(timeframe: string) {
        const now = new Date();
        const start = new Date();

        switch (timeframe) {
            case 'day':
                start.setDate(now.getDate() - 1);
                break;
            case 'week':
                start.setDate(now.getDate() - 7);
                break;
            case 'month':
                start.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                start.setFullYear(now.getFullYear() - 1);
                break;
        }

        return { start, end: now };
    }

    private async getSpendingTrend(userId: string, timeframe: string) {
        // Implementation for spending trend analysis
        const dateRange = this.getDateRange(timeframe);
        
        return prisma.$queryRaw`
            SELECT 
                DATE_TRUNC('day', created_at) as date,
                SUM(total_amount) as amount,
                COUNT(*) as orders
            FROM orders 
            WHERE buyer_id = ${userId} 
                AND created_at >= ${dateRange.start}
                AND status IN ('DELIVERED', 'COMPLETED')
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY date ASC
        `;
    }

    private async getRevenueByMonth(userId: string, timeframe: string) {
        const dateRange = this.getDateRange(timeframe);
        
        return prisma.$queryRaw`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                SUM(total_amount) as revenue,
                COUNT(*) as orders
            FROM orders 
            WHERE seller_id = ${userId} 
                AND created_at >= ${dateRange.start}
                AND status IN ('DELIVERED', 'COMPLETED')
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month ASC
        `;
    }

    private async getCustomerAnalytics(userId: string, dateRange: { start: Date; end: Date }) {
        const [totalCustomers, newCustomers, repeatCustomers] = await Promise.all([
            prisma.order.groupBy({
                by: ['buyerId'],
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                _count: { id: true }
            }),
            
            prisma.order.groupBy({
                by: ['buyerId'],
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                having: {
                    buyerId: {
                        _count: {
                            equals: 1
                        }
                    }
                },
                _count: { id: true }
            }),
            
            prisma.order.groupBy({
                by: ['buyerId'],
                where: {
                    sellerId: userId,
                    createdAt: { gte: dateRange.start }
                },
                having: {
                    buyerId: {
                        _count: {
                            gt: 1
                        }
                    }
                },
                _count: { id: true }
            })
        ]);

        return {
            totalCustomers: totalCustomers.length,
            newCustomers: newCustomers.length,
            repeatCustomers: repeatCustomers.length,
            repeatRate: totalCustomers.length > 0 ? (repeatCustomers.length / totalCustomers.length) * 100 : 0
        };
    }

    private async getProductDetails(topProducts: any[]) {
        if (topProducts.length === 0) return [];
        
        const productIds = topProducts.map(item => item.productId).filter(Boolean);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, title: true, price: true }
        });

        return topProducts.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
                ...item,
                product: product || null
            };
        });
    }

    private async getServiceDetails(topServices: any[]) {
        if (topServices.length === 0) return [];
        
        const serviceIds = topServices.map(item => item.serviceId).filter(Boolean);
        const services = await prisma.service.findMany({
            where: { id: { in: serviceIds } },
            select: { id: true, title: true, price: true }
        });

        return topServices.map(item => {
            const service = services.find(s => s.id === item.serviceId);
            return {
                ...item,
                service: service || null
            };
        });
    }

    private async getRevenueByCategory(dateRange: { start: Date; end: Date }) {
        return prisma.$queryRaw`
            SELECT 
                c.name as category_name,
                SUM(oi.total_price) as revenue,
                COUNT(oi.id) as items_sold
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            WHERE o.created_at >= ${dateRange.start}
                AND o.created_at <= ${dateRange.end}
                AND o.status IN ('DELIVERED', 'COMPLETED')
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
            LIMIT 10
        `;
    }

    private async getTopCategories(dateRange: { start: Date; end: Date }) {
        return prisma.category.findMany({
            include: {
                _count: {
                    select: {
                        products: {
                            where: {
                                orderItems: {
                                    some: {
                                        order: {
                                            createdAt: { gte: dateRange.start, lte: dateRange.end }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                products: {
                    _count: 'desc'
                }
            },
            take: 10
        });
    }

    // Real-time analytics tracking
    async trackEvent(eventType: string, userId: string, data: any) {
        try {
            // Store in Redis for real-time processing
            const event = {
                type: eventType,
                userId,
                data,
                timestamp: new Date().toISOString()
            };

            await redisClient.lpush('analytics:events', JSON.stringify(event));
            
            // Keep only last 1000 events
            await redisClient.ltrim('analytics:events', 0, 999);

            // Index in Elasticsearch for advanced analytics
            try {
                // await elasticsearchService.indexDocument('analytics_events', event);
                logger.info('Analytics event tracked:', event);
            } catch (esError) {
                logger.warn('Failed to index analytics event in Elasticsearch:', esError);
            }

        } catch (error) {
            logger.error('Error tracking analytics event:', error);
        }
    }

    // Get real-time metrics
    async getRealTimeMetrics() {
        try {
            const [
                activeUsers,
                recentOrders,
                recentEvents
            ] = await Promise.all([
                // Active users in last hour
                redisClient.scard('active_users'),
                
                // Recent orders
                prisma.order.count({
                    where: {
                        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
                    }
                }),
                
                // Recent events
                redisClient.lrange('analytics:events', 0, 9)
            ]);

            return {
                activeUsers,
                recentOrders,
                recentEvents: recentEvents.map(event => JSON.parse(event)),
                timestamp: new Date()
            };
        } catch (error) {
            logger.error('Error getting real-time metrics:', error);
            return {
                activeUsers: 0,
                recentOrders: 0,
                recentEvents: [],
                timestamp: new Date()
            };
        }
    }
}

export const analyticsService = new AnalyticsService();