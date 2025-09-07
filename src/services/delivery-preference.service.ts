import { prisma } from '@/config/database';

export class DeliveryPreferenceService {
  async listForSeller(sellerId: string) {
    return prisma.sellerDeliveryPreference.findMany({ where: { sellerId }, include: { deliveryPartner: true }, orderBy: [{ priority: 'desc' }] });
  }
  async setPreference(sellerId: string, partnerId: string, data: any) {
    return prisma.sellerDeliveryPreference.upsert({
      where: { sellerId_deliveryPartnerId: { sellerId, deliveryPartnerId: partnerId } as any },
      create: { sellerId, deliveryPartnerId: partnerId, priority: data.priority ?? 0, isActive: data.isActive ?? true, serviceTypes: data.serviceTypes },
      update: { priority: data.priority, isActive: data.isActive, serviceTypes: data.serviceTypes },
    });
  }
  async remove(sellerId: string, partnerId: string) {
    return prisma.sellerDeliveryPreference.delete({ where: { sellerId_deliveryPartnerId: { sellerId, deliveryPartnerId: partnerId } as any } });
  }
}

export const deliveryPreferenceService = new DeliveryPreferenceService();