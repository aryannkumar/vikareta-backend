import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { UserPreferenceService } from '../services/user-preference.service';

const userPreferenceService = new UserPreferenceService();

export class UserPreferenceController {
  async getUserPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const preferences = await userPreferenceService.getUserPreferences(userId);

      res.status(200).json({
        success: true,
        message: 'User preferences retrieved successfully',
        data: preferences,
      });
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateUserPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const preferences = await userPreferenceService.updateUserPreferences(userId, req.body);

      res.status(200).json({
        success: true,
        message: 'User preferences updated successfully',
        data: preferences,
      });
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCategoryPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const preferences = await userPreferenceService.getCategoryPreferences(userId);

      res.status(200).json({
        success: true,
        message: 'Category preferences retrieved successfully',
        data: preferences,
      });
    } catch (error) {
      logger.error('Error getting category preferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getUserInterests(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const interests = await userPreferenceService.getUserInterests(userId);

      res.status(200).json({
        success: true,
        message: 'User interests retrieved successfully',
        data: interests,
      });
    } catch (error) {
      logger.error('Error getting user interests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async trackCategoryView(req: Request, res: Response): Promise<void> {
    try {
      const { userId, categoryId } = req.params;
      const { type = 'view' } = req.body;

      await userPreferenceService.updateCategoryPreference(userId, categoryId, type);

      res.status(200).json({
        success: true,
        message: 'Category interaction tracked successfully',
      });
    } catch (error) {
      logger.error('Error tracking category view:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}