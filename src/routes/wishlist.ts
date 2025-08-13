import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get user's wishlist
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        // Get wishlist items with product/service details
        const wishlistItems = await prisma.wishlist.findMany({
            where: { userId },
            include: {
                product: {
                    include: {
                        seller: {
                            select: {
                                id: true,
                                businessName: true,
                                location: true,
                            },
                        },
                        category: {
                            select: {
                                name: true,
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
                                location: true,
                            },
                        },
                        category: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        }).catch((error) => {
            logger.error('Wishlist query error:', error);
            // Return empty array if query fails
            return [];
        });

        // Transform the data with better error handling
        const transformedItems = wishlistItems.map((item) => {
            try {
                const isProduct = item.productId !== null;
                const itemData = isProduct ? item.product : item.service;

                if (!itemData) return null;

                return {
                    id: item.id,
                    type: isProduct ? 'product' : 'service',
                    itemId: isProduct ? item.productId : item.serviceId,
                    name: (itemData as any).title || (itemData as any).name || 'Unnamed Item',
                    price: (itemData as any).price ? parseFloat((itemData as any).price.toString()) : 0,
                    originalPrice: (itemData as any).originalPrice ? parseFloat((itemData as any).originalPrice.toString()) : null,
                    image: (itemData as any).images?.[0] || '/api/placeholder/300/200',
                    provider: isProduct
                        ? (itemData as any).seller?.businessName || 'Unknown Provider'
                        : (itemData as any).provider?.businessName || 'Unknown Provider',
                    providerId: isProduct
                        ? (itemData as any).seller?.id || ''
                        : (itemData as any).provider?.id || '',
                    category: (itemData as any).category?.name || 'Uncategorized',
                    rating: (itemData as any).rating || 0,
                    reviewCount: (itemData as any).reviewCount || 0,
                    available: (itemData as any).status === 'active' && ((itemData as any).stockQuantity || 0) > 0,
                    addedAt: item.createdAt ? item.createdAt.toISOString() : new Date().toISOString(),
                };
            } catch (transformError) {
                logger.error('Error transforming wishlist item:', transformError, item);
                return null;
            }
        }).filter(Boolean);

        return res.json({
            success: true,
            data: transformedItems,
        });
    } catch (error) {
        logger.error('Error fetching wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch wishlist',
        });
    }
});

// Add item to wishlist
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        const { itemId, type } = req.body;

        if (!itemId || !type || !['product', 'service'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid item ID or type',
            });
        }

        // Check if item already exists in wishlist
        const existingItem = await prisma.wishlist.findFirst({
            where: {
                userId,
                ...(type === 'product' ? { productId: itemId } : { serviceId: itemId }),
            },
        });

        if (existingItem) {
            return res.status(409).json({
                success: false,
                error: 'Item already in wishlist',
            });
        }

        // Verify the item exists
        if (type === 'product') {
            const product = await prisma.product.findUnique({
                where: { id: itemId },
            });
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found',
                });
            }
        } else {
            const service = await prisma.service.findUnique({
                where: { id: itemId },
            });
            if (!service) {
                return res.status(404).json({
                    success: false,
                    error: 'Service not found',
                });
            }
        }

        // Add to wishlist
        const wishlistItem = await prisma.wishlist.create({
            data: {
                userId,
                ...(type === 'product' ? { productId: itemId } : { serviceId: itemId }),
            },
        });

        return res.status(201).json({
            success: true,
            data: wishlistItem,
            message: 'Item added to wishlist',
        });
    } catch (error) {
        logger.error('Error adding to wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add item to wishlist',
        });
    }
});

// Remove item from wishlist
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        const { id } = req.params;

        // Check if item exists and belongs to user
        const wishlistItem = await prisma.wishlist.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!wishlistItem) {
            return res.status(404).json({
                success: false,
                error: 'Wishlist item not found',
            });
        }

        // Remove from wishlist
        await prisma.wishlist.delete({
            where: { id },
        });

        return res.json({
            success: true,
            message: 'Item removed from wishlist',
        });
    } catch (error) {
        logger.error('Error removing from wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to remove item from wishlist',
        });
    }
});

// Remove item by product/service ID
router.delete('/item/:type/:itemId', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        const { type, itemId } = req.params;

        if (!['product', 'service'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid type',
            });
        }

        // Find and remove the item
        const wishlistItem = await prisma.wishlist.findFirst({
            where: {
                userId,
                ...(type === 'product' ? { productId: itemId } : { serviceId: itemId }),
            },
        });

        if (!wishlistItem) {
            return res.status(404).json({
                success: false,
                error: 'Item not found in wishlist',
            });
        }

        await prisma.wishlist.delete({
            where: { id: wishlistItem.id },
        });

        return res.json({
            success: true,
            message: 'Item removed from wishlist',
        });
    } catch (error) {
        logger.error('Error removing item from wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to remove item from wishlist',
        });
    }
});

// Check if item is in wishlist
router.get('/check/:type/:itemId', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        const { type, itemId } = req.params;

        if (!['product', 'service'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid type',
            });
        }

        const wishlistItem = await prisma.wishlist.findFirst({
            where: {
                userId,
                ...(type === 'product' ? { productId: itemId } : { serviceId: itemId }),
            },
        });

        return res.json({
            success: true,
            data: {
                inWishlist: !!wishlistItem,
                wishlistId: wishlistItem?.id || null,
            },
        });
    } catch (error) {
        logger.error('Error checking wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to check wishlist',
        });
    }
});

// Clear entire wishlist
router.delete('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        }

        await prisma.wishlist.deleteMany({
            where: { userId },
        });

        return res.json({
            success: true,
            message: 'Wishlist cleared',
        });
    } catch (error) {
        logger.error('Error clearing wishlist:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to clear wishlist',
        });
    }
});

export default router;