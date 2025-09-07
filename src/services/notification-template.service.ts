import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export interface NotificationTemplateCreateInput {
  name: string;
  subject?: string | null;
  content: string;
  type: string;
  channel: string; // email | sms | push | in_app | whatsapp
  variables?: Record<string, any> | null;
  isActive?: boolean;
}

export interface NotificationTemplateFilters {
  channel?: string;
  type?: string;
  activeOnly?: boolean;
  search?: string;
}

export class NotificationTemplateService {
  async create(data: NotificationTemplateCreateInput) {
    try {
      const existing = await prisma.notificationTemplate.findUnique({ where: { name: data.name } });
      if (existing) throw new Error('Template name already exists');
      return await prisma.notificationTemplate.create({
        data: {
          name: data.name.trim(),
          subject: data.subject ?? null,
          content: data.content,
          type: data.type,
          channel: data.channel,
          variables: data.variables ?? undefined,
          isActive: data.isActive ?? true,
        },
      });
    } catch (error) {
      logger.error('NotificationTemplateService.create error:', error);
      throw error;
    }
  }

  async list(filters: NotificationTemplateFilters, page = 1, limit = 20) {
    const where: any = {};
    if (filters.channel) where.channel = filters.channel;
    if (filters.type) where.type = filters.type;
    if (filters.activeOnly) where.isActive = true;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.notificationTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notificationTemplate.count({ where }),
    ]);

    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async getById(id: string) {
    return prisma.notificationTemplate.findUnique({ where: { id } });
  }

  async getByName(name: string) {
    return prisma.notificationTemplate.findUnique({ where: { name } });
  }

  async update(id: string, data: Partial<NotificationTemplateCreateInput>) {
    try {
      if (data.name) {
        const existing = await prisma.notificationTemplate.findUnique({ where: { name: data.name } });
        if (existing && existing.id !== id) throw new Error('Template name already in use');
      }
      const variablesValue = data.variables === null ? undefined : data.variables;
      return await prisma.notificationTemplate.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.content ? { content: data.content } : {}),
          ...(data.type ? { type: data.type } : {}),
          ...(data.channel ? { channel: data.channel } : {}),
          ...(data.variables !== undefined ? { variables: variablesValue as any } : {}),
          ...(data.isActive != null ? { isActive: data.isActive } : {}),
        },
      });
    } catch (error) {
      logger.error('NotificationTemplateService.update error:', error);
      throw error;
    }
  }

  async toggleActive(id: string, isActive: boolean) {
    return prisma.notificationTemplate.update({ where: { id }, data: { isActive } });
  }
}

export const notificationTemplateService = new NotificationTemplateService();
