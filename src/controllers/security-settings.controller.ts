import { Request, Response } from 'express';
import { securitySettingsService } from '@/services/security-settings.service';

export class SecuritySettingsController {
  async get(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await securitySettingsService.get(userId);
    res.json({ success: true, data });
  }
  async upsert(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const saved = await securitySettingsService.upsert(userId, req.body);
    res.json({ success: true, message: 'Security settings saved', data: saved });
  }
}
export const securitySettingsController = new SecuritySettingsController();
