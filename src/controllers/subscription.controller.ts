import { Request, Response } from 'express';
import { subscriptionService } from '@/services/subscription.service';
import { logger } from '@/utils/logger';

export class SubscriptionController {
  async current(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const sub = await subscriptionService.getCurrent(userId);
      res.json({ success: true, data: sub || null });
    } catch (error) {
      logger.error('SubscriptionController.current error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
    }
  }

  async history(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const list = await subscriptionService.listByUser(userId);
      res.json({ success: true, data: list });
    } catch (error) {
      logger.error('SubscriptionController.history error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { type, planName, durationMonths, trialDays } = req.body;
      const created = await subscriptionService.create({ userId, type, planName, durationMonths, trialDays });
      res.status(201).json({ success: true, message: 'Subscription created', data: created });
    } catch (error: any) {
      logger.error('SubscriptionController.create error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create subscription' });
    }
  }

  async upgrade(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { planName, type, extendMonths } = req.body;
      const updated = await subscriptionService.upgrade(userId, id, { planName, type, extendMonths });
      res.json({ success: true, message: 'Subscription updated', data: updated });
    } catch (error: any) {
      logger.error('SubscriptionController.upgrade error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to upgrade subscription' });
    }
  }

  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id; const { id } = req.params; const { atPeriodEnd = true } = req.body;
      const result = await subscriptionService.cancel(userId, id, atPeriodEnd);
      res.json({ success: true, message: atPeriodEnd ? 'Cancellation scheduled' : 'Subscription cancelled', data: result });
    } catch (error: any) {
      logger.error('SubscriptionController.cancel error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to cancel subscription' });
    }
  }

  async reactivate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id; const { id } = req.params;
      const result = await subscriptionService.reactivate(userId, id);
      res.json({ success: true, message: 'Subscription reactivated', data: result });
    } catch (error: any) {
      logger.error('SubscriptionController.reactivate error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to reactivate subscription' });
    }
  }
}

export const subscriptionController = new SubscriptionController();
