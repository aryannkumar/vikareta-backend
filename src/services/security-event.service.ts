import { BaseService } from './base.service';
import { prisma } from '@/config/database';

export interface SecurityEventFilters { userId?: string; type?: string; severity?: string; from?: Date; to?: Date; }

class SecurityEventService extends BaseService {
  async listEvents(page = 1, limit = 20, filters: SecurityEventFilters = {}) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;
    if (filters.severity) where.severity = filters.severity;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    const [items, total] = await Promise.all([
      prisma.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
      prisma.securityEvent.count({ where })
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listSessions(userId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    return prisma.loginSession.findMany({ where, orderBy: { lastActivity: 'desc' } });
  }

  async revokeSession(id: string) {
    return prisma.loginSession.delete({ where: { id } });
  }
}

export const securityEventService = new SecurityEventService();
