import { Request, Response } from 'express';
import { announcementService } from '@/services/announcement.service';
import { logger } from '@/utils/logger';

export class AnnouncementController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', status, type } = req.query;
      const result = await announcementService.list({ page: Number(page), limit: Number(limit), status: status as string | undefined, type: type as string | undefined });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('AnnouncementController.list error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';
      const data = req.body;
      const ann = await announcementService.create({ ...data, authorId: userId });
      res.status(201).json({ success: true, message: 'Announcement created', data: ann });
    } catch (error) {
      logger.error('AnnouncementController.create error:', error);
      res.status(400).json({ success: false, error: 'Failed to create announcement' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;
      const ann = await announcementService.update(id, data);
      res.json({ success: true, message: 'Announcement updated', data: ann });
    } catch (error) {
      logger.error('AnnouncementController.update error:', error);
      res.status(400).json({ success: false, error: 'Failed to update announcement' });
    }
  }

  async publish(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
  const ann = await announcementService.publish(id);
      res.json({ success: true, message: 'Announcement published', data: ann });
    } catch (error) {
      logger.error('AnnouncementController.publish error:', error);
      res.status(400).json({ success: false, error: 'Failed to publish announcement' });
    }
  }
}

export const announcementController = new AnnouncementController();
