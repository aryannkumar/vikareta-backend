import { prisma } from '@/config/database';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

export class NotificationPreferenceService {
  async list(userId: string, filters: { channel?: string; type?: string; enabled?: boolean }, page = 1, limit = 20) {
    const where: any = { userId };
    if (filters.channel) where.channel = filters.channel;
    if (filters.type) where.type = { contains: filters.type, mode: 'insensitive' };
    if (filters.enabled !== undefined) where.enabled = filters.enabled;
    const [rows, total] = await Promise.all([
      prisma.notificationPreference.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.notificationPreference.count({ where })
    ]);
    return { data: rows, total, page, totalPages: Math.ceil(total / limit) };
  }
  async create(userId: string, payload: { channel: string; type: string; enabled?: boolean }) {
    // Upsert uniqueness on (userId, channel, type)
    const existing = await prisma.notificationPreference.findFirst({ where: { userId, channel: payload.channel, type: payload.type } });
    if (existing) {
      const updated = await prisma.notificationPreference.update({ where: { id: existing.id }, data: { enabled: payload.enabled ?? true } });
      await this.invalidateCache(userId, payload.channel, payload.type);
      return updated;
    }
    const created = await prisma.notificationPreference.create({ data: { userId, channel: payload.channel, type: payload.type, enabled: payload.enabled ?? true } });
    await this.invalidateCache(userId, payload.channel, payload.type);
    return created;
  }
  async update(userId: string, id: string, data: { channel?: string; type?: string; enabled?: boolean }) {
    const record = await prisma.notificationPreference.findFirst({ where: { id, userId } });
    if (!record) throw new Error('Preference not found');
    const updated = await prisma.notificationPreference.update({ where: { id }, data });
    await this.invalidateCache(userId, data.channel || record.channel, data.type || record.type);
    return updated;
  }
  async remove(userId: string, id: string) {
    const record = await prisma.notificationPreference.findFirst({ where: { id, userId } });
    if (!record) throw new Error('Preference not found');
    await prisma.notificationPreference.delete({ where: { id } });
    await this.invalidateCache(userId, record.channel, record.type);
    return true;
  }
  private async invalidateCache(userId: string, channel: string, type: string) {
    try {
      await redisClient.del(`notif_pref:${userId}:${channel}:${type}`);
    } catch (err) {
      logger.warn('Failed to invalidate notification preference cache', { userId, channel, type, error: (err as Error).message });
    }
  }
}
export const notificationPreferenceService = new NotificationPreferenceService();
