import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { StatsService } from '../services/stats.service';

const statsService = new StatsService();

export class StatsController {
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await statsService.getPlatformStats();

      res.status(200).json({
        success: true,
        message: 'Platform statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting platform stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}