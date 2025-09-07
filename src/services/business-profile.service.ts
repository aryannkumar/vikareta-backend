import { prisma } from '@/config/database';

export class BusinessProfileService {
  async get(userId: string) {
    return prisma.businessProfile.findUnique({ where: { userId } });
  }
  async upsert(userId: string, data: any) {
    return prisma.businessProfile.upsert({
      where: { userId },
      create: {
        userId,
        companyName: data.companyName || data.businessName || 'Business',
        businessType: data.businessType || null,
        industry: data.industry || null,
        description: data.description || null,
        logo: data.logo || null,
        website: data.website || null,
        email: data.email || data.userEmail || '',
        phone: data.phone || data.userPhone || '',
        address: data.address || {},
        taxInfo: data.taxInfo || {},
        bankDetails: data.bankDetails || {},
        verification: data.verification || { isVerified: false },
        settings: data.settings || {},
      },
      update: {
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        description: data.description,
        logo: data.logo,
        website: data.website,
        email: data.email,
        phone: data.phone,
        address: data.address,
        taxInfo: data.taxInfo,
        bankDetails: data.bankDetails,
        verification: data.verification,
        settings: data.settings,
      }
    });
  }
}
export const businessProfileService = new BusinessProfileService();
