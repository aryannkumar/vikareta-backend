import { Request, Response } from 'express';
import { apiKeyService } from '@/services/api-key.service';
import { logger } from '@/utils/logger';

export class ApiKeyController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.query.userId as string;
      const keys = await apiKeyService.list(userId);
      res.json({ success: true, data: keys });
    } catch (error) {
      logger.error('ApiKeyController.list error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch API keys' });
    }
  }
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { name, permissions, expiresAt } = req.body;
      const apiKey = await apiKeyService.create({ userId, name, permissions, expiresAt });
      res.status(201).json({ success: true, message: 'API key created', data: apiKey });
    } catch (error) {
      logger.error('ApiKeyController.create error', error);
      res.status(400).json({ success: false, error: 'Failed to create API key' });
    }
  }
  async revoke(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const apiKey = await apiKeyService.revoke(id);
      res.json({ success: true, message: 'API key revoked', data: apiKey });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to revoke API key' });
    }
  }
  async rotate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const apiKey = await apiKeyService.rotate(id);
      res.json({ success: true, message: 'API key rotated', data: apiKey });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to rotate API key' });
    }
  }
}
export const apiKeyController = new ApiKeyController();
