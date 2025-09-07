import { BaseService } from './base.service';
import { prisma } from '@/config/database';

interface ListParams { page?: number; limit?: number; action?: string; targetType?: string; adminId?: string; targetId?: string; }

export class AdminActionService extends BaseService {
  async list(params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.action) where.action = params.action;
    if (params.targetType) where.targetType = params.targetType;
    if (params.adminId) where.adminId = params.adminId;
    if (params.targetId) where.targetId = params.targetId;
    const [items, total] = await Promise.all([
      prisma.adminAction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, include: { admin: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
      prisma.adminAction.count({ where })
    ]);
    return this.createPaginatedResult(items, total, { page, limit, skip });
  }

  async log(action: string, targetType: string, targetId: string, adminId: string, details: Record<string, any> = {}) {
    return prisma.adminAction.create({ data: { action, targetType, targetId, adminId, details } });
  }
}
export const adminActionService = new AdminActionService();
