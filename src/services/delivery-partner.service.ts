import { PrismaClient, DeliveryPartner } from '@prisma/client';

export class DeliveryPartnerService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createDeliveryPartner(data: {
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: any;
    serviceAreas?: any;
    capabilities?: any;
    pricing?: any;
    apiEndpoint?: string;
    apiKey?: string;
    isActive?: boolean;
  }): Promise<DeliveryPartner> {
    return this.prisma.deliveryPartner.create({
      data: {
        name: data.name,
        contactPerson: data.contactPerson,
        email: data.email,
        phone: data.phone,
        address: data.address,
        serviceAreas: data.serviceAreas,
        capabilities: data.capabilities,
        pricing: data.pricing,
        apiEndpoint: data.apiEndpoint,
        apiKey: data.apiKey,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getDeliveryPartnerById(id: string): Promise<DeliveryPartner | null> {
    return this.prisma.deliveryPartner.findUnique({
      where: { id },
      include: {
        sellerPreferences: {
          include: {
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
          },
        },
      },
    });
  }

  async getAllDeliveryPartners(filters?: {
    isActive?: boolean;
    serviceArea?: string;
  }): Promise<DeliveryPartner[]> {
    return this.prisma.deliveryPartner.findMany({
      where: {
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters?.serviceArea && {
          serviceAreas: {
            path: ['areas'],
            array_contains: filters.serviceArea,
          },
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async async updateDeliveryPartner(orderId: string
    id: string,
    data: Partial<{
      name: string;
      contactPerson: string;
      email: string;
      phone: string;
      address: any;
      serviceAreas: any;
      capabilities: any;
      pricing: any;
      apiEndpoint: string;
      apiKey: string;
      isActive: boolean;
    }>
  ): Promise<DeliveryPartner> {
    return this.prisma.deliveryPartner.update({
      where: { id },
      data,
    });
  }

  async deactivateDeliveryPartner(id: string): Promise<DeliveryPartner> {
    return this.prisma.deliveryPartner.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async async getDeliveryPartnersForLocation(orderId: string
    pincode: string,
    city?: string,
    state?: string
  ): Promise<DeliveryPartner[]> {
    return this.prisma.deliveryPartner.findMany({
      where: {
        isActive: true,
        OR: [
          {
            serviceAreas: {
              path: ['pincodes'],
              array_contains: pincode,
            },
          },
          {
            serviceAreas: {
              path: ['cities'],
              array_contains: city,
            },
          },
          {
            serviceAreas: {
              path: ['states'],
              array_contains: state,
            },
          },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  async async calculateShippingCost(orderId: string
    partnerId: string,
    data: {
      fromPincode: string;
      toPincode: string;
      weight: number;
      dimensions?: {
        length: number;
        width: number;
        height: number;
      };
      codAmount?: number;
    }
  ): Promise<{
    cost: number;
    estimatedDays: number;
    serviceType: string;
  } | null> {
    const partner = await this.getDeliveryPartnerById(partnerId);
    
    if (!partner || !partner.isActive) {
      return null;
    }

    // This is a simplified calculation - in reality, you'd call the partner's API
    const pricing = partner.pricing as any;
    
    if (!pricing) {
      return null;
    }

    // Basic calculation based on weight and distance
    const baseRate = pricing.baseRate || 50;
    const perKgRate = pricing.perKgRate || 20;
    const codCharges = data.codAmount ? (pricing.codRate || 0.02) * data.codAmount : 0;
    
    const cost = baseRate + (data.weight * perKgRate) + codCharges;
    
    return {
      cost: Math.round(cost),
      estimatedDays: pricing.estimatedDays || 3,
      serviceType: pricing.serviceType || 'standard',
    };
  }

  async getDeliveryPartnerStats(partnerId?: string): Promise<{
    totalPartners: number;
    activePartners: number;
    totalShipments: number;
    avgDeliveryTime: number;
    successRate: number;
  }> {
    const where = partnerId ? { id: partnerId } : {};

    const [totalCount, activeCount] = await Promise.all([
      this.prisma.deliveryPartner.count({ where }),
      this.prisma.deliveryPartner.count({ 
        where: { ...where, isActive: true } 
      }),
    ]);

    // These would need to be calculated from actual shipment data
    // For now, returning placeholder values
    return {
      totalPartners: totalCount,
      activePartners: activeCount,
      totalShipments: 0, // Would need shipment tracking
      avgDeliveryTime: 0, // Would need delivery time calculation
      successRate: 0, // Would need success/failure tracking
    };
  }

  async testPartnerConnection(partnerId: string): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const partner = await this.getDeliveryPartnerById(partnerId);
    
    if (!partner) {
      return {
        success: false,
        message: 'Delivery partner not found',
      };
    }

    if (!partner.apiEndpoint) {
      return {
        success: false,
        message: 'No API endpoint configured',
      };
    }

    try {
      const startTime = Date.now();
      
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
      // This would make an actual API call to test connectivity
      // For now, simulating a successful connection
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        message: 'Connection successful',
        responseTime,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error}`,
      };
    }
  }
}

export const deliveryPartnerService = new DeliveryPartnerService(new PrismaClient());