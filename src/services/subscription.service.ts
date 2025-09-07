import { BaseService } from './base.service';
import { prisma } from '@/config/database';
// Prisma namespace not needed explicitly here
import { ValidationError, NotFoundError } from '@/middleware/error-handler';

export interface CreateSubscriptionParams {
  userId: string;
  type: string; // matches schema 'type'
  planName: string; // schema plan_name
  durationMonths?: number; // used to set endDate
  trialDays?: number;
}

export class SubscriptionService extends BaseService {
  async getCurrent(userId: string) { return prisma.subscription.findFirst({ where: { userId, status: 'active' }, orderBy: { createdAt: 'desc' } }); }

  async listByUser(userId: string) {
    return prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(params: CreateSubscriptionParams) {
    if (!params.userId || !params.type) throw new ValidationError('userId and type required');
    const now = new Date();
    const duration = params.durationMonths && params.durationMonths > 0 ? params.durationMonths : 1;
    const endDate = new Date(now.getTime()); endDate.setMonth(endDate.getMonth() + duration);
    return prisma.subscription.create({
      data: {
        userId: params.userId,
        type: params.type,
        planName: params.planName,
        status: 'active',
        startDate: now,
        endDate,
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        // cashfreeSubscriptionId left null until external provisioning
      }
    });
  }

  async upgrade(userId: string, subscriptionId: string, data: { planName?: string; type?: string; extendMonths?: number; }) {
    const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
    if (!sub) throw new NotFoundError('Subscription not found');
    let endDate = sub.endDate;
    if (data.extendMonths && data.extendMonths > 0) {
      endDate = new Date(endDate); endDate.setMonth(endDate.getMonth() + data.extendMonths);
    }
    return prisma.subscription.update({ where: { id: subscriptionId }, data: { ...(data.planName && { planName: data.planName }), ...(data.type && { type: data.type }), ...(endDate && { endDate, currentPeriodEnd: endDate }) } });
  }

  async cancel(userId: string, subscriptionId: string, atPeriodEnd = true) {
    const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
    if (!sub) throw new NotFoundError('Subscription not found');
    if (atPeriodEnd) return sub; // no schema flag; client just remembers planned cancellation
    return prisma.subscription.update({ where: { id: subscriptionId }, data: { status: 'cancelled' } });
  }

  async reactivate(userId: string, subscriptionId: string) {
    const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
    if (!sub) throw new NotFoundError('Subscription not found');
    if (sub.status === 'cancelled' && sub.currentPeriodEnd < new Date()) {
      const now = new Date();
      const endDate = new Date(now); endDate.setMonth(endDate.getMonth() + 1);
      return prisma.subscription.update({ where: { id: subscriptionId }, data: { status: 'active', startDate: now, endDate, currentPeriodStart: now, currentPeriodEnd: endDate } });
    }
    return prisma.subscription.update({ where: { id: subscriptionId }, data: { status: 'active' } });
  }

  // Placeholder for usage tracking (no features JSON in schema currently)
  async recordUsage() { return; }
}

export const subscriptionService = new SubscriptionService();
