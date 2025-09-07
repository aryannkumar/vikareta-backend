import { Request, Response } from 'express';
import { serviceOrderService } from '@/services/service-order.service';
import { logger } from '@/utils/logger';

class ServiceOrderController {
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { status, scheduledDate, providerNotes, customerNotes } = req.body;
      const updated = await serviceOrderService.updateStatus(id, { status, scheduledDate, providerNotes, customerNotes, userId });
      res.json({ success: true, data: updated });
    } catch (e: any) {
      logger.error('ServiceOrder updateStatus error', e);
      res.status(400).json({ error: e.message || 'Unable to update service order' });
    }
  }
}

export const serviceOrderController = new ServiceOrderController();