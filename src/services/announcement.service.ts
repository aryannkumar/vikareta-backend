import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { ValidationError, NotFoundError } from '@/middleware/error-handler';

interface ListParams { page?: number; limit?: number; status?: string; type?: string; }
interface CreateAnnouncementDto { title: string; content: string; type?: string; status?: string; targetAudience?: string; scheduledAt?: string | Date | null; expiresAt?: string | Date | null; authorId: string; }
interface UpdateAnnouncementDto extends Partial<CreateAnnouncementDto> {}

export class AnnouncementService extends BaseService {
  async list(params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    const [items, total] = await Promise.all([
      prisma.announcement.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.announcement.count({ where })
    ]);
    return this.createPaginatedResult(items, total, { page, limit, skip });
  }
  async create(data: CreateAnnouncementDto) {
    if (!data.title || !data.content) throw new ValidationError('Title and content required');
    return prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        type: data.type || 'info',
        status: data.status || 'draft',
        targetAudience: data.targetAudience || 'all',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        authorId: data.authorId,
      },
    });
  }
  async update(id: string, data: UpdateAnnouncementDto) {
    await this.ensureExists(id);
    return prisma.announcement.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.targetAudience !== undefined && { targetAudience: data.targetAudience }),
        ...(data.scheduledAt !== undefined && { scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
      },
    });
  }
  async publish(id: string) {
    await this.ensureExists(id);
    return prisma.announcement.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } });
  }
  private async ensureExists(id: string) {
    const ex = await prisma.announcement.findUnique({ where: { id } });
    if (!ex) throw new NotFoundError('Announcement not found');
  }
}
export const announcementService = new AnnouncementService();
