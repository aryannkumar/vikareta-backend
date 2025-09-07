import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { wishlistService } from '@/services/wishlist.service';

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
            const result = await wishlistService.getWishlist(userId, { page: Number(page), limit: Number(limit), type: type as string | undefined });
            res.status(200).json({
                success: true,
                message: 'Wishlist retrieved successfully',
                data: result,
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

            const wishlistItem = await wishlistService.add(userId, { productId });

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

            await wishlistService.removeByReference(userId, { productId });

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

            const wishlistItem = await wishlistService.add(userId, { serviceId });

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

            await wishlistService.removeByReference(userId, { serviceId });

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

            const wishlistItem = await wishlistService.add(userId, { businessId });

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

            await wishlistService.removeByReference(userId, { businessId });

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

            const wishlistItem = await wishlistService.add(userId, { productId, serviceId, businessId });

            // Cache invalidation handled inside service

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

            await wishlistService.remove(userId, itemId);

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

            const deletedCount = await wishlistService.clear(userId);

            res.status(200).json({
                success: true,
                message: `Cleared ${deletedCount} items from wishlist`,
                data: { deletedCount },
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

            const stats = await wishlistService.stats(userId);

            res.status(200).json({
                success: true,
                message: 'Wishlist statistics retrieved successfully',
                data: stats,
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

            const wishlistItem = await wishlistService.status(userId, { productId: productId as string | undefined, serviceId: serviceId as string | undefined, businessId: businessId as string | undefined });
            res.status(200).json({
                success: true,
                message: 'Wishlist status checked successfully',
                data: wishlistItem,
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