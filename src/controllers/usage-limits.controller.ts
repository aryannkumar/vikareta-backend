import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { usageLimitsService } from '../services/usage-limits.service';

export class UsageLimitsController {
  /**
   * Get usage summary for current user
   */
  async getUsageSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const summary = await usageLimitsService.getUsageSummary(userId);
      
      res.status(200).json({
        success: true,
        message: 'Usage summary retrieved successfully',
        data: summary,
      });
    } catch (error) {
      logger.error('Error getting usage summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Check if user can post an RFQ
   */
  async canPostRfq(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await usageLimitsService.canPostRfq(userId);
      
      res.status(200).json({
        success: true,
        message: 'RFQ posting eligibility checked',
        data: result,
      });
    } catch (error) {
      logger.error('Error checking RFQ posting eligibility:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Check if user can respond to an RFQ
   */
  async canRespondToRfq(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await usageLimitsService.canRespondToRfq(userId);
      
      res.status(200).json({
        success: true,
        message: 'RFQ response eligibility checked',
        data: result,
      });
    } catch (error) {
      logger.error('Error checking RFQ response eligibility:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get user's usage history
   */
  async getUsageHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { months = 12 } = req.query;
      const history = await usageLimitsService.getUserUsageHistory(userId, parseInt(months as string));
      
      res.status(200).json({
        success: true,
        message: 'Usage history retrieved successfully',
        data: history,
      });
    } catch (error) {
      logger.error('Error getting usage history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}