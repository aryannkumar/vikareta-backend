import { PrismaClient, BusinessProfile } from '@prisma/client';

export class BusinessProfileService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createBusinessProfile(data: {
    userId: string;
    companyName: string;
    businessType?: string;
    industry?: string;
    description?: string;
    logo?: string;
    website?: string;
    email: string;
    phone: string;
    address: any;
    taxInfo?: any;
    bankDetails?: any;
    verification?: any;
    settings?: any;
  }): Promise<BusinessProfile> {
    return this.prisma.businessProfile.create({
      data: {
        userId: data.userId,
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        description: data.description,
        logo: data.logo,
        website: data.website,
        email: data.email,
        phone: data.phone,
        address: data.address,
        taxInfo: data.taxInfo || {},
        bankDetails: data.bankDetails || {},
        verification: data.verification || { isVerified: false },
        settings: data.settings || {},
      },
    });
  }

  async getBusinessProfileByUserId(userId: string): Promise<BusinessProfile | null> {
    return this.prisma.businessProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            businessName: true,
            gstNumber: true,
            verificationTier: true,
            isVerified: true,
            location: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });
  }

  async async updateBusinessProfile(orderId: string
    userId: string,
    data: Partial<{
      companyName: string;
      businessType: string;
      industry: string;
      description: string;
      logo: string;
      website: string;
      email: string;
      phone: string;
      address: any;
      taxInfo: any;
      bankDetails: any;
      verification: any;
      settings: any;
    }>
  ): Promise<BusinessProfile> {
    return this.prisma.businessProfile.update({
      where: { userId },
      data,
    });
  }

  async verifyBusinessProfile(userId: string): Promise<BusinessProfile> {
    return this.prisma.businessProfile.update({
      where: { userId },
      data: { 
        verification: { 
          isVerified: true, 
          verificationLevel: 'verified',
          verifiedAt: new Date()
        } 
      },
    });
  }

  async searchBusinessProfiles(filters: {
    industry?: string;
    businessType?: string;
    location?: string;
    isVerified?: boolean;
    query?: string;
  }): Promise<BusinessProfile[]> {
    return this.prisma.businessProfile.findMany({
      where: {
        ...(filters.industry && { industry: filters.industry }),
        ...(filters.businessType && { businessType: filters.businessType }),
        ...(filters.query && {
          OR: [
            { companyName: { contains: filters.query, mode: 'insensitive' } },
            { description: { contains: filters.query, mode: 'insensitive' } },
            { industry: { contains: filters.query, mode: 'insensitive' } },
          ],
        }),
        ...(filters.location && {
          user: {
            OR: [
              { city: { contains: filters.location, mode: 'insensitive' } },
              { state: { contains: filters.location, mode: 'insensitive' } },
              { country: { contains: filters.location, mode: 'insensitive' } },
            ],
          },
        }),
      },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });
  }

  async getBusinessProfileStats(userId: string): Promise<{
    profileCompleteness: number;
    verificationStatus: string;
    missingFields: string[];
  }> {
    const profile = await this.prisma.businessProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return {
        profileCompleteness: 0,
        verificationStatus: 'not_created',
        missingFields: ['All fields'],
      };
    }

    const requiredFields = [
      'companyName',
      'industry',
      'businessType',
      'website',
      'description',
      'email',
      'phone',
    ];

    const completedFields = requiredFields.filter(field => 
      profile[field as keyof BusinessProfile] !== null && 
      profile[field as keyof BusinessProfile] !== undefined &&
      profile[field as keyof BusinessProfile] !== ''
    );

    const missingFields = requiredFields.filter(field => 
      !completedFields.includes(field)
    );

    const completeness = Math.round((completedFields.length / requiredFields.length) * 100);

    const verification = profile.verification as any;
    const isVerified = verification?.isVerified || false;

    return {
      profileCompleteness: completeness,
      verificationStatus: isVerified ? 'verified' : 'pending',
      missingFields,
    };
  }

  async getIndustryStats(): Promise<{ industry: string; count: number }[]> {
    const stats = await this.prisma.businessProfile.groupBy({
      by: ['industry'],
      _count: {
        industry: true,
      },
      where: {
        industry: { not: null },
      },
      orderBy: {
        _count: {
          industry: 'desc',
        },
      },
    });

    return stats.map(stat => ({
      industry: stat.industry || 'Unknown',
      count: stat._count.industry,
    }));
  }
}

export const businessProfileService = new BusinessProfileService(new PrismaClient());