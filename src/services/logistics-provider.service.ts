import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { NotFoundError } from '@/middleware/error-handler';

export interface CreateLogisticsProviderDto {
  name: string;
  displayName?: string;
  code: string;
  apiEndpoint?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  supportedServices?: any;
  pricingModel?: any;
  coverage?: any;
  configuration?: any;
  isActive?: boolean;
  priority?: number;
}

export interface UpdateLogisticsProviderDto extends Partial<CreateLogisticsProviderDto> {}

export class LogisticsProviderService extends BaseService {
  async listActive() {
    return prisma.logisticsProvider.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } });
  }

  async listAll() {
    return prisma.logisticsProvider.findMany({ orderBy: { priority: 'asc' } });
  }

  async create(data: CreateLogisticsProviderDto) {
    return prisma.logisticsProvider.create({
      data: {
        name: data.name,
        displayName: data.displayName || data.name,
        code: data.code,
        apiEndpoint: data.apiEndpoint ?? null,
        apiKey: data.apiKey ?? null,
        apiSecret: data.apiSecret ?? null,
        supportedServices: data.supportedServices || undefined,
        pricingModel: data.pricingModel || undefined,
        coverage: data.coverage || undefined,
        configuration: data.configuration || undefined,
        isActive: data.isActive ?? true,
        priority: data.priority ?? 0,
      },
    });
  }

  async update(id: string, data: UpdateLogisticsProviderDto) {
    await this.ensureExists(id);
    return prisma.logisticsProvider.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.apiEndpoint !== undefined && { apiEndpoint: data.apiEndpoint }),
        ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
        ...(data.apiSecret !== undefined && { apiSecret: data.apiSecret }),
        ...(data.supportedServices !== undefined && { supportedServices: data.supportedServices }),
        ...(data.pricingModel !== undefined && { pricingModel: data.pricingModel }),
        ...(data.coverage !== undefined && { coverage: data.coverage }),
        ...(data.configuration !== undefined && { configuration: data.configuration }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.priority !== undefined && { priority: data.priority }),
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.ensureExists(id);
    return prisma.logisticsProvider.update({ where: { id }, data: { isActive } });
  }

  private async ensureExists(id: string) {
    const exists = await prisma.logisticsProvider.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Logistics provider not found');
  }
}

export const logisticsProviderService = new LogisticsProviderService();
