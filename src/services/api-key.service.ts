import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import crypto from 'crypto';
import { NotFoundError } from '@/middleware/error-handler';

interface CreateApiKeyDto { userId: string; name: string; permissions?: string[]; expiresAt?: string | Date | null; }

export class ApiKeyService extends BaseService {
  private generateKey(prefix = 'vk'): string {
    return `${prefix}_${crypto.randomBytes(30).toString('base64url')}`;
  }
  async list(userId: string) {
    return prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
  async create(data: CreateApiKeyDto) {
    const key = this.generateKey();
    return prisma.apiKey.create({ data: { userId: data.userId, name: data.name, key, permissions: data.permissions || [], expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } });
  }
  async revoke(id: string) {
    await this.ensureExists(id);
    return prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }
  async rotate(id: string) {
    await this.ensureExists(id);
    const key = this.generateKey();
    return prisma.apiKey.update({ where: { id }, data: { key, isActive: true, lastUsed: null } });
  }
  private async ensureExists(id: string) {
    const ex = await prisma.apiKey.findUnique({ where: { id } });
    if (!ex) throw new NotFoundError('API key not found');
  }
}
export const apiKeyService = new ApiKeyService();
