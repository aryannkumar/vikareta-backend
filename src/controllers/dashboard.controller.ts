import { Request, Response } from 'express';

export class DashboardController {
  async getStats(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: {} });
  }

  async getRecentActivity(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  async getNotifications(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  async getOrders(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  async getRfqs(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }
}