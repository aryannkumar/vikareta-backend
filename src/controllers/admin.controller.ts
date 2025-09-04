import { Request, Response } from 'express';

export class AdminController {
  async getDashboard(req: Request, res: Response): Promise<void> {
    res.json({ 
      success: true, 
      data: {
        totalUsers: 0,
        totalOrders: 0,
        totalRevenue: 0,
        activeRfqs: 0
      }
    });
  }

  async getUsers(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { data: [], pagination: {} } });
  }

  async getOrders(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { data: [], pagination: {} } });
  }

  async getProducts(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { data: [], pagination: {} } });
  }

  async getRfqs(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { data: [], pagination: {} } });
  }
}