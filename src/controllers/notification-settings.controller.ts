import { Request, Response } from 'express';
import { notificationSettingsService } from '@/services/notification-settings.service';

export class NotificationSettingsController {
  async get(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await notificationSettingsService.get(userId);
    res.json({ success: true, data });
  }
  async upsert(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const saved = await notificationSettingsService.upsert(userId, req.body);
    res.json({ success: true, message: 'Notification settings saved', data: saved });
  }
}
export const notificationSettingsController = new NotificationSettingsController();
