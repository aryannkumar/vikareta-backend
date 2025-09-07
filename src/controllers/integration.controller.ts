import { Request, Response } from 'express';
import { integrationService } from '@/services/integration.service';
import { logger } from '@/utils/logger';

export class IntegrationController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
  const items = await integrationService.list(userId);
      res.json({ success: true, data: items });
    } catch (error) {
      logger.error('IntegrationController.list error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch integrations' });
    }
  }
  async connect(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { provider, config, credentials } = req.body;
      const integration = await integrationService.connect({ userId, provider, config, credentials });
      res.status(201).json({ success: true, message: 'Integration connected', data: integration });
    } catch (error) {
      logger.error('IntegrationController.connect error', error);
      res.status(400).json({ success: false, error: 'Failed to connect integration' });
    }
  }
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { provider } = req.params;
      const data = req.body;
      const integration = await integrationService.update(userId, provider, data);
      res.json({ success: true, message: 'Integration updated', data: integration });
    } catch (error) {
      logger.error('IntegrationController.update error', error);
      res.status(400).json({ success: false, error: 'Failed to update integration' });
    }
  }
  async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { provider } = req.params;
  const integration = await integrationService.disconnect(userId, provider);
      res.json({ success: true, message: 'Integration disconnected', data: integration });
    } catch (error) {
      res.status(400).json({ success: false, error: 'Failed to disconnect integration' });
    }
  }
}
export const integrationController = new IntegrationController();
