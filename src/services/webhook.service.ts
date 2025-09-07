import crypto from 'crypto';
import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { webhookDeliveryService } from './webhook-delivery.service';

interface CreateWebhookInput { userId: string; name: string; url: string; events: string[]; }
interface UpdateWebhookInput { name?: string; url?: string; events?: string[]; isActive?: boolean; }

export class WebhookService extends BaseService {
  async list(userId: string) {
    return prisma.webhook.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(data: CreateWebhookInput) {
    const secret = crypto.randomBytes(24).toString('hex');
    return prisma.webhook.create({ data: { ...data, secret } });
  }

  async update(id: string, data: UpdateWebhookInput) {
    return prisma.webhook.update({ where: { id }, data });
  }

  async regenerateSecret(id: string) {
    const secret = crypto.randomBytes(24).toString('hex');
    return prisma.webhook.update({ where: { id }, data: { secret } });
  }

  async testFire(id: string, event: string, extra?: Record<string, any>): Promise<any> {
    return webhookDeliveryService.testFire(id, event, extra);
  }

  async retryLast(id: string, event: string): Promise<any> {
    return webhookDeliveryService.retryLast(id, event);
  }

  async getAttempts(id: string): Promise<any> {
    return webhookDeliveryService.getAttempts(id);
  }
}

export const webhookService = new WebhookService();
