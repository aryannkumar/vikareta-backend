import { Request, Response } from 'express';
import { notificationPreferenceService } from '@/services/notification-preference.service';

export class NotificationPreferenceController {
  async list(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { page = '1', limit = '20', channel, type, enabled } = req.query;
    const result = await notificationPreferenceService.list(userId, { channel: channel as string, type: type as string, enabled: enabled !== undefined ? enabled === 'true' : undefined }, parseInt(page as string), parseInt(limit as string));
    res.json({ success: true, data: result });
  }
  async create(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const saved = await notificationPreferenceService.create(userId, req.body);
    res.status(201).json({ success: true, message: 'Preference saved', data: saved });
  }
  async update(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    const updated = await notificationPreferenceService.update(userId, id, req.body);
    res.json({ success: true, message: 'Preference updated', data: updated });
  }
  async remove(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    await notificationPreferenceService.remove(userId, id);
    res.json({ success: true, message: 'Preference removed' });
  }
}
export const notificationPreferenceController = new NotificationPreferenceController();
