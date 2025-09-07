import { Request, Response } from 'express';
import { digiLockerDocumentService } from '@/services/digilocker-document.service';
import { logger } from '@/utils/logger';

class DigiLockerDocumentController {
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.id; if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const docs = await digiLockerDocumentService.list(userId);
      res.json({ success: true, data: docs });
    } catch (e) { logger.error(e); res.status(500).json({ error: 'Internal server error' }); }
  }
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.id; if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const doc = await digiLockerDocumentService.create(userId, req.body);
      res.status(201).json({ success: true, data: doc });
    } catch (e: any) { logger.error(e); res.status(400).json({ error: e.message || 'Unable to create' }); }
  }
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.id; if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.params;
      const doc = await digiLockerDocumentService.update(userId, id, req.body);
      res.json({ success: true, data: doc });
    } catch (e: any) { logger.error(e); res.status(400).json({ error: e.message || 'Unable to update' }); }
  }
  async remove(req: Request, res: Response) {
    try {
      const userId = req.user?.id; if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.params;
      await digiLockerDocumentService.remove(userId, id);
      res.json({ success: true });
    } catch (e) { logger.error(e); res.status(500).json({ error: 'Internal server error' }); }
  }
}

export const digiLockerDocumentController = new DigiLockerDocumentController();