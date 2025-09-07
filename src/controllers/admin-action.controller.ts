import { Request, Response } from 'express';
import { adminActionService } from '@/services/admin-action.service';
import { logger } from '@/utils/logger';

export class AdminActionController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', action, targetType, adminId, targetId } = req.query;
      const result = await adminActionService.list({ page: Number(page), limit: Number(limit), action: action as string | undefined, targetType: targetType as string | undefined, adminId: adminId as string | undefined, targetId: targetId as string | undefined });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('AdminActionController.list error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch admin actions' });
    }
  }
}
export const adminActionController = new AdminActionController();
