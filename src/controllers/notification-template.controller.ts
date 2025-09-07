import { Request, Response } from 'express';
import { notificationTemplateService } from '@/services/notification-template.service';
import { logger } from '@/utils/logger';

export class NotificationTemplateController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const template = await notificationTemplateService.create(req.body);
      res.status(201).json({ success: true, message: 'Template created', data: template });
    } catch (error: any) {
      logger.error('NotificationTemplateController.create error:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create template' });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', channel, type, activeOnly, search } = req.query;
      const result = await notificationTemplateService.list({
        channel: channel as string,
        type: type as string,
        activeOnly: activeOnly === 'true',
        search: search as string,
      }, parseInt(page as string), parseInt(limit as string));
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('NotificationTemplateController.list error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch templates' });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const template = await notificationTemplateService.getById(req.params.id);
      if (!template) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }
      res.json({ success: true, data: template });
    } catch (error) {
      logger.error('NotificationTemplateController.getById error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch template' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const template = await notificationTemplateService.update(req.params.id, req.body);
      res.json({ success: true, message: 'Template updated', data: template });
    } catch (error: any) {
      logger.error('NotificationTemplateController.update error:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to update template' });
    }
  }

  async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      if (isActive == null) {
        res.status(400).json({ success: false, error: 'isActive required' });
        return;
      }
      const template = await notificationTemplateService.toggleActive(id, Boolean(isActive));
      res.json({ success: true, message: 'Template status updated', data: template });
    } catch (error) {
      logger.error('NotificationTemplateController.toggleActive error:', error);
      res.status(500).json({ success: false, error: 'Failed to update template status' });
    }
  }
}

export const notificationTemplateController = new NotificationTemplateController();
