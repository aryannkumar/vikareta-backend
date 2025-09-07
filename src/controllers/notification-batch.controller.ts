import { Request, Response } from 'express';
import { notificationBatchService } from '@/services/notification-batch.service';
import { notificationBatchCreateSchema, notificationBatchIdParamsSchema, notificationBatchListQuerySchema } from '@/validation/schemas';
import { logger } from '@/utils/logger';

export class NotificationBatchController {
  async create(req: Request, res: Response) {
    const parsed = notificationBatchCreateSchema.parse(req.body);
    const batch = await notificationBatchService.createBatch({
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      channel: parsed.channel,
      templateId: parsed.templateId,
      variables: parsed.variables,
      userIds: parsed.userIds,
      segment: parsed.segment,
      title: parsed.title,
      message: parsed.message,
      scheduleAt: parsed.scheduleAt ? new Date(parsed.scheduleAt) : undefined,
    });
    res.status(201).json(batch);
  }

  async list(req: Request, res: Response) {
    const q = notificationBatchListQuerySchema.parse(req.query);
    const result = await notificationBatchService.listBatches(q);
    res.json(result);
  }

  async get(req: Request, res: Response) {
    const { id } = notificationBatchIdParamsSchema.parse(req.params);
    const batch = await notificationBatchService.getBatch(id);
    if (!batch) return res.status(404).json({ message: 'Not found' });
    res.json(batch);
  }

  async progress(req: Request, res: Response) {
    const { id } = notificationBatchIdParamsSchema.parse(req.params);
    try {
      const progress = await notificationBatchService.getProgress(id);
      res.json(progress);
    } catch (err) {
      res.status(404).json({ message: 'Not found' });
    }
  }

  async processQueue(req: Request, res: Response) {
    try {
      await notificationBatchService.processQueue();
      res.json({ message: 'Processing triggered' });
    } catch (err) {
      logger.error('Manual batch processing failed', err);
      res.status(500).json({ message: 'Failed' });
    }
  }

  async cancel(req: Request, res: Response) {
    const { id } = notificationBatchIdParamsSchema.parse(req.params);
    try {
      const batch = await notificationBatchService.cancelBatch(id);
      res.json(batch);
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'Cancel failed' });
    }
  }

  async retryFailed(req: Request, res: Response) {
    const { id } = notificationBatchIdParamsSchema.parse(req.params);
    try {
      const batch = await notificationBatchService.retryFailed(id);
      res.json(batch);
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'Retry failed' });
    }
  }
}

export const notificationBatchController = new NotificationBatchController();
