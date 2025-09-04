import { Request, Response } from 'express';
import { analyticsService } from '@/services/analytics.service';
import { logger } from '@/utils/logger';

export class AnalyticsController {
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const timeframe = (req.query.timeframe as any) || 'month';

      // Platform analytics summary
      const platformAnalytics = await analyticsService.getPlatformAnalytics(timeframe);

      // Real-time metrics (active users, recent orders, recent events)
      const realTime = await analyticsService.getRealTimeMetrics();

      res.status(200).json({
        success: true,
        message: 'Dashboard analytics retrieved successfully',
        data: {
          platform: platformAnalytics,
          realTime
        }
      });
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getUserAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.query.userId as string) || (req.params.userId as string);
      const timeframe = (req.query.timeframe as any) || 'month';

      if (!userId) {
        res.status(400).json({ success: false, error: 'Missing userId' });
        return;
      }

      const analytics = await analyticsService.getUserAnalytics(userId, timeframe);

      res.status(200).json({ success: true, message: 'User analytics retrieved', data: analytics });
    } catch (error) {
      logger.error('Error getting user analytics:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getOrderAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const timeframe = (req.query.timeframe as any) || 'month';

      const platformAnalytics = await analyticsService.getPlatformAnalytics(timeframe);

      res.status(200).json({
        success: true,
        message: 'Order analytics retrieved',
        data: {
          summary: platformAnalytics.summary,
          ordersByStatus: platformAnalytics.ordersByStatus
        }
      });
    } catch (error) {
      logger.error('Error getting order analytics:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getRevenueAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const timeframe = (req.query.timeframe as any) || 'month';

      const platformAnalytics = await analyticsService.getPlatformAnalytics(timeframe);

      res.status(200).json({
        success: true,
        message: 'Revenue analytics retrieved',
        data: {
          summary: platformAnalytics.summary,
          revenueByCategory: platformAnalytics.revenueByCategory,
          topCategories: platformAnalytics.topCategories
        }
      });
    } catch (error) {
      logger.error('Error getting revenue analytics:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}