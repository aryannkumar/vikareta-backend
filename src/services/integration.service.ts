import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { NotFoundError } from '@/middleware/error-handler';

interface ConnectIntegrationDto { userId: string; provider: string; config?: any; credentials?: any; }
interface UpdateIntegrationDto { config?: any; credentials?: any; isEnabled?: boolean; status?: string; }

export class IntegrationService extends BaseService {
  async list(userId: string) {
    return prisma.integration.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
  async connect(data: ConnectIntegrationDto) {
    return prisma.integration.upsert({
      where: { userId_provider: { userId: data.userId, provider: data.provider } },
      update: { status: 'connected', isEnabled: true, config: data.config || {}, credentials: data.credentials || {}, connectedAt: new Date() },
      create: { userId: data.userId, provider: data.provider, status: 'connected', isEnabled: true, config: data.config || {}, credentials: data.credentials || {}, connectedAt: new Date() },
    });
  }
  async update(userId: string, provider: string, data: UpdateIntegrationDto) {
    return prisma.integration.update({
      where: { userId_provider: { userId, provider } },
      data: {
        ...(data.config !== undefined && { config: data.config }),
        ...(data.credentials !== undefined && { credentials: data.credentials }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
  }
  async disconnect(userId: string, provider: string) {
    return prisma.integration.update({ where: { userId_provider: { userId, provider } }, data: { status: 'disconnected', isEnabled: false } });
  }
  async ensure(userId: string, provider: string) {
    const ex = await prisma.integration.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!ex) throw new NotFoundError('Integration not found');
  }
}
export const integrationService = new IntegrationService();
