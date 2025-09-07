import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { logisticsProviderService } from '@/services/logistics-provider.service';

export class LogisticsProviderController {
  async list(req: Request, res: Response): Promise<void> {
    try {
  const providers = await logisticsProviderService.listAll();
      res.json({ success: true, data: providers });
    } catch (error) {
      logger.error('LogisticsProviderController.list error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch providers' });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;
      const provider = await logisticsProviderService.create(data);
      res.status(201).json({ success: true, message: 'Provider created', data: provider });
    } catch (error: any) {
      logger.error('LogisticsProviderController.create error:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create provider' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;
      const provider = await logisticsProviderService.update(id, data);
      res.json({ success: true, message: 'Provider updated', data: provider });
    } catch (error) {
      logger.error('LogisticsProviderController.update error:', error);
      res.status(400).json({ success: false, error: 'Failed to update provider' });
    }
  }

  async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
  const provider = await logisticsProviderService.setActive(id, isActive);
      res.json({ success: true, message: 'Provider status updated', data: provider });
    } catch (error) {
      logger.error('LogisticsProviderController.toggleActive error:', error);
      res.status(400).json({ success: false, error: 'Failed to update status' });
    }
  }
}

export const logisticsProviderController = new LogisticsProviderController();
