import { prisma } from '@/config/database';

export class DeliveryPartnerService {
  async list(active?: boolean) {
    const where: any = {};
    if (active !== undefined) where.isActive = active;
    return prisma.deliveryPartner.findMany({ where, orderBy: [{ priority: 'desc' }, { name: 'asc' }] });
  }
  async create(data: any) {
    return prisma.deliveryPartner.create({ data: { name: data.name, code: data.code, apiEndpoint: data.apiEndpoint, apiKey: data.apiKey, supportedServices: data.supportedServices, serviceAreas: data.serviceAreas, rateCard: data.rateCard, contactInfo: data.contactInfo, priority: data.priority ?? 0 } });
  }
  async update(id: string, data: any) { return prisma.deliveryPartner.update({ where: { id }, data }); }
  async toggle(id: string, isActive: boolean) { return prisma.deliveryPartner.update({ where: { id }, data: { isActive } }); }
}

export const deliveryPartnerService = new DeliveryPartnerService();
