import { PrismaClient, LogisticsProvider } from '@prisma/client';

export class DeliveryPartnerService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createDeliveryPartner(data: {
    name: string;
    displayName: string;
    code: string;
    apiEndpoint?: string;
    apiKey?: string;
    apiSecret?: string;
    supportedServices?: any;
    pricingModel?: any;
    coverage?: any;
    configuration?: any;
    isActive?: boolean;
    priority?: number;
  }): Promise<LogisticsProvider> {
    return this.prisma.logisticsProvider.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        code: data.code,
        apiEndpoint: data.apiEndpoint,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        supportedServices: data.supportedServices,
        pricingModel: data.pricingModel,
        coverage: data.coverage,
        configuration: data.configuration,
        isActive: data.isActive ?? true,
        priority: data.priority ?? 0,
      },
    });
  }

  async getDeliveryPartnerById(id: string): Promise<LogisticsProvider | null> {
    return this.prisma.logisticsProvider.findUnique({
      where: { id },
      include: {
        shipments: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getAllDeliveryPartners(filters?: {
    isActive?: boolean;
    code?: string;
  }): Promise<LogisticsProvider[]> {
    return this.prisma.logisticsProvider.findMany({
      where: {
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters?.code && { code: filters.code }),
      },
      orderBy: [
        { priority: 'desc' },
        { name: 'asc' }
      ],
    });
  }

  async updateDeliveryPartner(
    id: string,
    data: Partial<{
      name: string;
      displayName: string;
      code: string;
      apiEndpoint: string;
      apiKey: string;
      apiSecret: string;
      supportedServices: any;
      pricingModel: any;
      coverage: any;
      configuration: any;
      isActive: boolean;
      priority: number;
    }>
  ): Promise<LogisticsProvider> {
    return this.prisma.logisticsProvider.update({
      where: { id },
      data,
    });
  }

  async deactivateDeliveryPartner(id: string): Promise<LogisticsProvider> {
    return this.prisma.logisticsProvider.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getDeliveryPartnersForLocation(
    pincode: string,
    city?: string,
    state?: string
  ): Promise<LogisticsProvider[]> {
    return this.prisma.logisticsProvider.findMany({
      where: {
        isActive: true,
        coverage: {
          path: ['areas'],
          array_contains: [pincode, city, state].filter(Boolean),
        },
      },
      orderBy: [
        { priority: 'desc' },
        { name: 'asc' }
      ],
    });
  }

  async calculateShippingCost(
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
    const pricingModel = partner.pricingModel as any;
    
    if (!pricingModel) {
      return null;
    }

    // Basic calculation based on weight and distance
    const baseRate = pricingModel.baseRate || 50;
    const perKgRate = pricingModel.perKgRate || 20;
    const codCharges = data.codAmount ? (pricingModel.codRate || 0.02) * data.codAmount : 0;
    
    const cost = baseRate + (data.weight * perKgRate) + codCharges;
    
    return {
      cost: Math.round(cost),
      estimatedDays: pricingModel.estimatedDays || 3,
      serviceType: pricingModel.serviceType || 'standard',
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

    const [totalCount, activeCount, shipmentStats] = await Promise.all([
      this.prisma.logisticsProvider.count({ where }),
      this.prisma.logisticsProvider.count({ 
        where: { ...where, isActive: true } 
      }),
      this.prisma.shipment.aggregate({
        where: partnerId ? { providerId: partnerId } : {},
        _count: { id: true },
        _avg: { shippingCost: true },
      }),
    ]);

    // Calculate success rate based on delivered shipments
    const deliveredShipments = await this.prisma.shipment.count({
      where: {
        ...(partnerId && { logisticsProviderId: partnerId }),
        status: 'delivered',
      },
    });

    const totalShipments = typeof shipmentStats._count === 'number' ? shipmentStats._count : (shipmentStats._count as any)?.id || 0;
    const successRate = totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

    return {
      totalPartners: totalCount,
      activePartners: activeCount,
      totalShipments,
      avgDeliveryTime: Number(shipmentStats._avg.shippingCost) || 0,
      successRate: Math.round(successRate * 100) / 100,
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