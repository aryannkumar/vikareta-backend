import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { PersonalizationService } from '../services/personalization.service';

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
}