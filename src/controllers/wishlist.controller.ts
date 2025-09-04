import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

const prisma = new PrismaClient();

export class WishlistController {
    async getWishlist(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized - User not authenticated'
                });
                return;
            }

            const { page = 1, limit = 20, type } = req.query;
            const pageNum = parseInt(page as string);
            const limitNum = parseInt(limit as string);
            const skip = (pageNum - 1) * limitNum;

            // Build where clause based on type filter
            const where: any = { userId };
            if (type === 'products') {
                where.productId = { not: null };
            } else if (type === 'services') {
                where.serviceId = { not: null };
            } else if (type === 'businesses') {
                where.businessId = { not: null };
            }

            const [wishlistItems, total] = await Promise.all([
                prisma.wishlist.findMany({
                    where,
                    include: {
                        product: {
                            include: {
                                seller: {
                                    select: {
                                        id: true,
                                        businessName: true,
                                        firstName: true,
                                        lastName: true,
                                        avatar: true,
                                        verificationTier: true,
                                        isVerified: true,
                                    },
                                },
                                media: {
                                    take: 1,
                                    orderBy: { sortOrder: 'asc' },
                                },
                                category: {
                                    select: {
                                        id: true,
                                        name: true,
                                        slug: true,
                                    },
                                },
                                subcategory: {
                                    select: {
                                        id: true,
                                        name: true,
                                        slug: true,
                                    },
                                },
                            },
                        },
                        service: {
                            include: {
                                provider: {
                                    select: {
                                        id: true,
                                        businessName: true,
                                        firstName: true,
                                        lastName: true,
                                        avatar: true,
                                        verificationTier: true,
                                        isVerified: true,
                                    },
                                },
                                media: {
                                    take: 1,
                                    orderBy: { sortOrder: 'asc' },
                                },
                                category: {
                                    select: {
                                        id: true,
                                        name: true,
                                        slug: true,
                                    },
                                },
                                subcategory: {
                                    select: {
                                        id: true,
                                        name: true,
                                        slug: true,
                                    },
                                },
                            },
                        },
                        business: {
                            select: {
                                id: true,
                                businessName: true,
                                firstName: true,
                                lastName: true,
                                avatar: true,
                                verificationTier: true,
                                isVerified: true,
                                location: true,
                                city: true,
                                state: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limitNum,
                }),
                prisma.wishlist.count({ where }),
            ]);

            // Group items by type for better organization
            const groupedItems = {
                products: wishlistItems.filter((item: any) => item.product).map((item: any) => ({
                    id: item.id,
                    type: 'product',
                    addedAt: item.createdAt,
                    item: item.product,
                })),
                services: wishlistItems.filter((item: any) => item.service).map((item: any) => ({
                    id: item.id,
                    type: 'service',
                    addedAt: item.createdAt,
                    item: item.service,
                })),
                businesses: wishlistItems.filter((item: any) => item.business).map((item: any) => ({
                    id: item.id,
                    type: 'business',
                    addedAt: item.createdAt,
                    item: item.business,
                })),
            };

            res.status(200).json({
                success: true,
                message: 'Wishlist retrieved successfully',
                data: {
                    items: type ? wishlistItems : groupedItems,
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(total / limitNum),
                    hasNext: pageNum < Math.ceil(total / limitNum),
                    hasPrev: pageNum > 1,
                },
            });
        } catch (error) {
            logger.error('Error getting wishlist:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to retrieve wishlist'
            });
        }
    }

    async addProduct(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { productId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Check if product exists
            const product = await prisma.product.findUnique({
                where: { id: productId },
            });

            if (!product) {
                res.status(404).json({ error: 'Product not found' });
                return;
            }

            // Check if already in wishlist
            const existingItem = await prisma.wishlist.findUnique({
                where: {
                    userId_productId: {
                        userId,
                        productId,
                    },
                },
            });

            if (existingItem) {
                res.status(400).json({ error: 'Product already in wishlist' });
                return;
            }

            const wishlistItem = await prisma.wishlist.create({
                data: {
                    userId,
                    productId,
                },
                include: {
                    product: {
                        include: {
                            seller: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                            media: {
                                take: 1,
                                orderBy: { sortOrder: 'asc' },
                            },
                        },
                    },
                },
            });

            res.status(201).json({
                success: true,
                message: 'Product added to wishlist',
                data: wishlistItem,
            });
        } catch (error) {
            logger.error('Error adding product to wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async removeProduct(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { productId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const deleted = await prisma.wishlist.deleteMany({
                where: {
                    userId,
                    productId,
                },
            });

            if (deleted.count === 0) {
                res.status(404).json({ error: 'Product not found in wishlist' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Product removed from wishlist',
            });
        } catch (error) {
            logger.error('Error removing product from wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async addService(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { serviceId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Check if service exists
            const service = await prisma.service.findUnique({
                where: { id: serviceId },
            });

            if (!service) {
                res.status(404).json({ error: 'Service not found' });
                return;
            }

            // Check if already in wishlist
            const existingItem = await prisma.wishlist.findUnique({
                where: {
                    userId_serviceId: {
                        userId,
                        serviceId,
                    },
                },
            });

            if (existingItem) {
                res.status(400).json({ error: 'Service already in wishlist' });
                return;
            }

            const wishlistItem = await prisma.wishlist.create({
                data: {
                    userId,
                    serviceId,
                },
                include: {
                    service: {
                        include: {
                            provider: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                            media: {
                                take: 1,
                                orderBy: { sortOrder: 'asc' },
                            },
                        },
                    },
                },
            });

            res.status(201).json({
                success: true,
                message: 'Service added to wishlist',
                data: wishlistItem,
            });
        } catch (error) {
            logger.error('Error adding service to wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async removeService(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { serviceId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const deleted = await prisma.wishlist.deleteMany({
                where: {
                    userId,
                    serviceId,
                },
            });

            if (deleted.count === 0) {
                res.status(404).json({ error: 'Service not found in wishlist' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Service removed from wishlist',
            });
        } catch (error) {
            logger.error('Error removing service from wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async addBusiness(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { businessId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Check if business exists
            const business = await prisma.user.findUnique({
                where: { id: businessId },
            });

            if (!business) {
                res.status(404).json({ error: 'Business not found' });
                return;
            }

            // Check if already in wishlist
            const existingItem = await prisma.wishlist.findUnique({
                where: {
                    userId_businessId: {
                        userId,
                        businessId,
                    },
                },
            });

            if (existingItem) {
                res.status(400).json({ error: 'Business already in wishlist' });
                return;
            }

            const wishlistItem = await prisma.wishlist.create({
                data: {
                    userId,
                    businessId,
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            businessName: true,
                            firstName: true,
                            lastName: true,
                            avatar: true,
                            verificationTier: true,
                            isVerified: true,
                        },
                    },
                },
            });

            res.status(201).json({
                success: true,
                message: 'Business added to wishlist',
                data: wishlistItem,
            });
        } catch (error) {
            logger.error('Error adding business to wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async removeBusiness(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { businessId } = req.params;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const deleted = await prisma.wishlist.deleteMany({
                where: {
                    userId,
                    businessId,
                },
            });

            if (deleted.count === 0) {
                res.status(404).json({ error: 'Business not found in wishlist' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Business removed from wishlist',
            });
        } catch (error) {
            logger.error('Error removing business from wishlist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async addToWishlist(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { productId, serviceId, businessId } = req.body;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            if (!productId && !serviceId && !businessId) {
                res.status(400).json({
                    success: false,
                    error: 'Product ID, Service ID, or Business ID is required'
                });
                return;
            }

            // Validate that the item exists
            if (productId) {
                const product = await prisma.product.findFirst({
                    where: { id: productId, isActive: true },
                });
                if (!product) {
                    res.status(404).json({
                        success: false,
                        error: 'Product not found'
                    });
                    return;
                }
            }

            if (serviceId) {
                const service = await prisma.service.findFirst({
                    where: { id: serviceId, isActive: true },
                });
                if (!service) {
                    res.status(404).json({
                        success: false,
                        error: 'Service not found'
                    });
                    return;
                }
            }

            if (businessId) {
                const business = await prisma.user.findFirst({
                    where: {
                        id: businessId,
                        isActive: true,
                        role: { in: ['SELLER', 'SERVICE_PROVIDER'] }
                    },
                });
                if (!business) {
                    res.status(404).json({
                        success: false,
                        error: 'Business not found'
                    });
                    return;
                }
            }

            // Check if item already exists in wishlist
            const existingItem = await prisma.wishlist.findFirst({
                where: {
                    userId,
                    ...(productId && { productId }),
                    ...(serviceId && { serviceId }),
                    ...(businessId && { businessId }),
                },
            });

            if (existingItem) {
                res.status(409).json({
                    success: false,
                    error: 'Item already in wishlist'
                });
                return;
            }

            const wishlistItem = await prisma.wishlist.create({
                data: {
                    userId,
                    ...(productId && { productId }),
                    ...(serviceId && { serviceId }),
                    ...(businessId && { businessId }),
                },
                include: {
                    product: {
                        include: {
                            seller: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    firstName: true,
                                    lastName: true,
                                    avatar: true,
                                    verificationTier: true,
                                    isVerified: true,
                                },
                            },
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                            media: {
                                take: 1,
                                orderBy: { sortOrder: 'asc' },
                            },
                        },
                    },
                    service: {
                        include: {
                            provider: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    firstName: true,
                                    lastName: true,
                                    avatar: true,
                                    verificationTier: true,
                                    isVerified: true,
                                },
                            },
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                            media: {
                                take: 1,
                                orderBy: { sortOrder: 'asc' },
                            },
                        },
                    },
                    business: {
                        select: {
                            id: true,
                            businessName: true,
                            firstName: true,
                            lastName: true,
                            avatar: true,
                            verificationTier: true,
                            isVerified: true,
                            city: true,
                            state: true,
                            role: true,
                        },
                    },
                },
            });

            // Clear user's wishlist cache
            try {
                await redisClient.del(`wishlist:${userId}`);
            } catch (cacheError) {
                logger.warn('Failed to clear wishlist cache:', cacheError);
            }

            res.status(201).json({
                success: true,
                message: 'Item added to wishlist successfully',
                data: wishlistItem,
            });
        } catch (error) {
            logger.error('Error adding to wishlist:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to add item to wishlist'
            });
        }
    }

    async removeFromWishlist(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { itemId } = req.params;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            const deleted = await prisma.wishlist.deleteMany({
                where: {
                    id: itemId,
                    userId,
                },
            });

            if (deleted.count === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Item not found in wishlist'
                });
                return;
            }

            // Clear user's wishlist cache
            try {
                await redisClient.del(`wishlist:${userId}`);
            } catch (cacheError) {
                logger.warn('Failed to clear wishlist cache:', cacheError);
            }

            res.status(200).json({
                success: true,
                message: 'Item removed from wishlist successfully',
            });
        } catch (error) {
            logger.error('Error removing from wishlist:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to remove item from wishlist'
            });
        }
    }

    async clearWishlist(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            const deleted = await prisma.wishlist.deleteMany({
                where: { userId },
            });

            // Clear user's wishlist cache
            try {
                await redisClient.del(`wishlist:${userId}`);
            } catch (cacheError) {
                logger.warn('Failed to clear wishlist cache:', cacheError);
            }

            res.status(200).json({
                success: true,
                message: `Cleared ${deleted.count} items from wishlist`,
                data: {
                    deletedCount: deleted.count,
                },
            });
        } catch (error) {
            logger.error('Error clearing wishlist:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to clear wishlist'
            });
        }
    }

    async getWishlistStats(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            const [productCount, serviceCount, businessCount] = await Promise.all([
                prisma.wishlist.count({
                    where: { userId, productId: { not: null } },
                }),
                prisma.wishlist.count({
                    where: { userId, serviceId: { not: null } },
                }),
                prisma.wishlist.count({
                    where: { userId, businessId: { not: null } },
                }),
            ]);

            const totalCount = productCount + serviceCount + businessCount;

            res.status(200).json({
                success: true,
                message: 'Wishlist statistics retrieved successfully',
                data: {
                    total: totalCount,
                    products: productCount,
                    services: serviceCount,
                    businesses: businessCount,
                },
            });
        } catch (error) {
            logger.error('Error getting wishlist stats:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to get wishlist statistics'
            });
        }
    }

    async checkWishlistStatus(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { productId, serviceId, businessId } = req.query;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
                return;
            }

            if (!productId && !serviceId && !businessId) {
                res.status(400).json({
                    success: false,
                    error: 'Product ID, Service ID, or Business ID is required'
                });
                return;
            }

            const wishlistItem = await prisma.wishlist.findFirst({
                where: {
                    userId,
                    ...(productId && { productId: productId as string }),
                    ...(serviceId && { serviceId: serviceId as string }),
                    ...(businessId && { businessId: businessId as string }),
                },
            });

            res.status(200).json({
                success: true,
                message: 'Wishlist status checked successfully',
                data: {
                    inWishlist: !!wishlistItem,
                    wishlistItemId: wishlistItem?.id || null,
                    addedAt: wishlistItem?.createdAt || null,
                },
            });
        } catch (error) {
            logger.error('Error checking wishlist status:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'Failed to check wishlist status'
            });
        }
    }
}