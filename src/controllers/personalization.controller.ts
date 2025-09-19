import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { PersonalizationService } from '../services/personalization.service';
import { ValidationError, AuthenticationError } from '../middleware/error-handler';

const personalizationService = new PersonalizationService();

export class PersonalizationController {
  async getTrendingCategories(req: Request, res: Response): Promise<void> {
    try {
      const { period = 'weekly', limit = 10 } = req.query;
      const categories = await personalizationService.getTrendingCategories(
        period as 'daily' | 'weekly' | 'monthly',
        parseInt(limit as string, 10)
      );

      res.status(200).json({
        success: true,
        message: 'Trending categories retrieved successfully',
        data: categories,
      });
    } catch (error) {
      logger.error('Error getting trending categories:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to retrieve trending categories'
      });
    }
  }

  async getPersonalizedCategories(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 12 } = req.query;
      const userId = req.user?.id || null; // Get from auth middleware if available

      const categories = await personalizationService.getPersonalizedCategories(
        userId,
        parseInt(limit as string, 10)
      );

      res.status(200).json({
        success: true,
        message: 'Personalized categories retrieved successfully',
        data: categories,
      });
    } catch (error) {
      logger.error('Error getting personalized categories:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to retrieve personalized categories'
      });
    }
  }

  async trackCategoryInteraction(req: Request, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const { action } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User must be authenticated to track interactions'
        });
        return;
      }

      if (!categoryId || !action) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Category ID and action are required'
        });
        return;
      }

      if (!['view', 'click', 'purchase', 'search'].includes(action)) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid action. Must be one of: view, click, purchase, search'
        });
        return;
      }

      await personalizationService.trackCategoryInteraction(
        userId,
        categoryId,
        action as 'view' | 'click' | 'purchase' | 'search'
      );

      res.status(200).json({
        success: true,
        message: 'Category interaction tracked successfully',
      });
    } catch (error) {
      logger.error('Error tracking category interaction:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to track category interaction'
      });
    }
  }

  // ===== GUEST USER PERSONALIZATION METHODS =====

  /**
   * Get guest personalization data
   */
  async getGuestPersonalization(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const personalizationData = await personalizationService.getGuestPersonalization(guestId);

      if (!personalizationData) {
        // Create new personalization data if it doesn't exist
        const newData = await personalizationService.createGuestPersonalization(guestId);
        res.json({
          success: true,
          data: newData,
        });
        return;
      }

      res.json({
        success: true,
        data: personalizationData,
      });
    } catch (error) {
      logger.error('Get guest personalization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get guest personalization'
      });
    }
  }

  /**
   * Update guest personalization preferences
   */
  async updateGuestPreferences(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { language, currency, theme, location, notifications } = req.body;

      const updatedData = await personalizationService.updateGuestPersonalization(guestId, {
        preferences: {
          language,
          currency,
          theme,
          location,
          notifications,
        },
      });

      if (!updatedData) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Failed to update preferences'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Preferences updated successfully',
        data: updatedData.preferences,
      });
    } catch (error) {
      logger.error('Update guest preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update preferences'
      });
    }
  }

  /**
   * Add product to recently viewed
   */
  async addToRecentlyViewed(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { productId } = req.body;
      if (!productId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Product ID is required'
        });
        return;
      }

      await personalizationService.addToRecentlyViewed(guestId, productId);

      res.json({
        success: true,
        message: 'Product added to recently viewed',
      });
    } catch (error) {
      logger.error('Add to recently viewed error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to add to recently viewed'
      });
    }
  }

  /**
   * Add search term to history
   */
  async addToSearchHistory(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { searchTerm } = req.body;
      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Valid search term is required'
        });
        return;
      }

      await personalizationService.addToSearchHistory(guestId, searchTerm.trim());

      res.json({
        success: true,
        message: 'Search term added to history',
      });
    } catch (error) {
      logger.error('Add to search history error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to add to search history'
      });
    }
  }

  /**
   * Update category view count
   */
  async updateCategoryView(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { categoryId } = req.body;
      if (!categoryId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Category ID is required'
        });
        return;
      }

      await personalizationService.updateCategoryView(guestId, categoryId);

      res.json({
        success: true,
        message: 'Category view updated',
      });
    } catch (error) {
      logger.error('Update category view error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update category view'
      });
    }
  }

  /**
   * Add item to guest cart
   */
  async addToCart(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { productId, quantity = 1, variant } = req.body;
      if (!productId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Product ID is required'
        });
        return;
      }

      if (quantity < 1) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Quantity must be at least 1'
        });
        return;
      }

      await personalizationService.addToCart(guestId, productId, quantity, variant);

      res.json({
        success: true,
        message: 'Item added to cart',
      });
    } catch (error) {
      logger.error('Add to cart error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to add to cart'
      });
    }
  }

  /**
   * Remove item from guest cart
   */
  async removeFromCart(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { productId } = req.body;
      if (!productId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Product ID is required'
        });
        return;
      }

      await personalizationService.removeFromCart(guestId, productId);

      res.json({
        success: true,
        message: 'Item removed from cart',
      });
    } catch (error) {
      logger.error('Remove from cart error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to remove from cart'
      });
    }
  }

  /**
   * Update cart item quantity
   */
  async updateCartItemQuantity(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { productId, quantity } = req.body;
      if (!productId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Product ID is required'
        });
        return;
      }

      if (quantity < 0) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Quantity cannot be negative'
        });
        return;
      }

      await personalizationService.updateCartItemQuantity(guestId, productId, quantity);

      res.json({
        success: true,
        message: 'Cart item quantity updated',
      });
    } catch (error) {
      logger.error('Update cart item quantity error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update cart item quantity'
      });
    }
  }

  /**
   * Toggle product in wishlist
   */
  async toggleWishlist(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { productId } = req.body;
      if (!productId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Product ID is required'
        });
        return;
      }

      const wasAdded = await personalizationService.toggleWishlist(guestId, productId);

      res.json({
        success: true,
        message: wasAdded ? 'Product added to wishlist' : 'Product removed from wishlist',
        data: { wasAdded },
      });
    } catch (error) {
      logger.error('Toggle wishlist error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to toggle wishlist'
      });
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const { pageViews, timeSpent, deviceInfo } = req.body;

      await personalizationService.updateSessionActivity(guestId, {
        pageViews,
        timeSpent,
        deviceInfo,
      });

      res.json({
        success: true,
        message: 'Session activity updated',
      });
    } catch (error) {
      logger.error('Update session activity error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to update session activity'
      });
    }
  }

  /**
   * Get personalized recommendations
   */
  async getPersonalizedRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      const recommendations = await personalizationService.getPersonalizedRecommendations(guestId);

      res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      logger.error('Get personalized recommendations error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get personalized recommendations'
      });
    }
  }

  /**
   * Clear guest personalization data
   */
  async clearGuestPersonalization(req: Request, res: Response): Promise<void> {
    try {
      const guestId = req.user?.id;
      if (!guestId || !guestId.startsWith('guest_')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid guest session required'
        });
        return;
      }

      await personalizationService.clearGuestPersonalization(guestId);

      res.json({
        success: true,
        message: 'Personalization data cleared',
      });
    } catch (error) {
      logger.error('Clear guest personalization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to clear personalization data'
      });
    }
  }
}