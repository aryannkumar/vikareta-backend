import { Request, Response } from 'express';
import { NotificationService } from '@/services/notification.service';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  async getNotifications(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const pagination = (req as any).pagination;
    
    const result = await this.notificationService.getUserNotifications(userId, {
      page: pagination.page,
      limit: pagination.limit,
    });
    
    res.json({ success: true, data: result });
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await this.notificationService.markAsRead(id, userId);
    
    res.json({ success: true, message: 'Notification marked as read' });
  }

  async markAllAsRead(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'All notifications marked as read' });
  }

  async getStats(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const stats = await this.notificationService.getNotificationStats(userId);
    
    res.json({ success: true, data: stats });
  }
}